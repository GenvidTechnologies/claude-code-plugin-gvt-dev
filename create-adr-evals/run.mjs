#!/usr/bin/env node
// create-adr-evals/run.mjs
//
// Spawns `claude -p` against freshly-built fixture repos (fixtures.mjs) to
// exercise the gvt-dev:create-adr / gvt-dev:tech-writer themed-wiki ADR
// authoring behavior (#582), grades each run with grade.mjs, and applies the
// per-variant pass rule from the #582 design hand-off. See README.md before
// running a batch — every run here is a REAL, metered model session; this
// script is never invoked from `commands.test`/`commands.validate`.
//
// Usage:
//   node create-adr-evals/run.mjs --variant A,A-infer,C,B --runs 3 [--keep]
//
// Exit code 0 iff every requested variant's pass rule holds.

import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { buildFixture, VARIANTS } from './fixtures.mjs';
import { gradeRun } from './grade.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..', 'plugin');

const DEFAULT_RUNS = 3;
const RUN_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes per run

// Scoped to exactly what create-adr/tech-writer need (read the plan before
// widening this): file I/O, routing into a skill or dispatching an agent
// directly, and the git/node/ls invocations the skill body documents. "Task"
// is included defensively alongside "Agent" — this repo's own CLAUDE.md and
// every shipped skill name the subagent-dispatch permission "Agent", but
// nothing here depends on which literal name the CLI enforces, so granting
// both costs nothing if one of them never matches anything.
//
// `Bash(cd *)` was added after the one permitted smoke run (variant B,
// 2026-10-01): the CLI denies a compound command segment-by-segment, and the
// model habitually runs `cd "<fixture root>" && git ...` even though cwd is
// already the fixture root — without this, every such call was denied until
// the model found a cd-free phrasing. `cd` only changes directory, so
// granting it bare carries no broader risk than the commands it's chained
// with. Not re-verified by a second real run (the task caps this harness at
// one smoke run); revisit if a batch run still shows `cd`-chained denials.
const ALLOWED_TOOLS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'Skill', 'Agent', 'Task',
  'Bash(cd *)', 'Bash(git *)', 'Bash(node *)', 'Bash(ls *)',
];

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      variant: { type: 'string', default: VARIANTS.join(',') },
      runs: { type: 'string', default: String(DEFAULT_RUNS) },
      keep: { type: 'boolean', default: false },
    },
  });

  const variants = values.variant.split(',').map((v) => v.trim()).filter(Boolean);
  for (const v of variants) {
    if (!VARIANTS.includes(v)) {
      console.error(`Error: unknown variant "${v}" — expected one of ${VARIANTS.join(', ')}`);
      process.exit(1);
    }
  }

  const runs = parseInt(values.runs, 10);
  if (!Number.isInteger(runs) || runs < 1) {
    console.error(`Error: --runs must be a positive integer, got: ${values.runs}`);
    process.exit(1);
  }

  return { variants, runs, keep: values.keep };
}

function spawnClaude({ cwd, prompt, logPath }) {
  const args = [
    '-p', prompt,
    '--plugin-dir', PLUGIN_DIR,
    '--permission-mode', 'acceptEdits',
    '--permission-prompts', 'none',
    '--output-format', 'json',
    '--allowedTools', ...ALLOWED_TOOLS,
  ];

  const result = spawnSync('claude', args, {
    cwd,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });

  writeFileSync(logPath, [
    `# command: claude ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`,
    `# cwd: ${cwd}`,
    `# exit status: ${result.status}`,
    `# signal: ${result.signal}`,
    result.error ? `# spawn error: ${result.error.message}` : '',
    '--- stdout ---',
    result.stdout ?? '',
    '--- stderr ---',
    result.stderr ?? '',
  ].filter((l) => l !== undefined).join('\n'), 'utf8');

  return result;
}

function parseClaudeJson(stdout) {
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function runOne(variant, index, { keep, logsDir }) {
  const { root, before, meta, prompt } = buildFixture(variant);
  const logPath = join(logsDir, `${variant}-${index}.log`);

  const result = spawnClaude({ cwd: root, prompt, logPath });
  const timedOut = result.error?.code === 'ETIMEDOUT' || (result.signal === 'SIGTERM' && result.status === null);
  const parsed = parseClaudeJson(result.stdout);
  const completed = result.status === 0 && Boolean(parsed) && parsed.is_error === false;

  let grade;
  try {
    grade = await gradeRun({ variant, root, before, meta });
  } catch (err) {
    grade = {
      variant,
      theme: null,
      themeIsExisting: null,
      newThemeCreated: false,
      newNumber: null,
      newPath: null,
      assertions: {},
      allDeterministicPass: false,
      reasons: [`grading threw: ${err.message}`],
    };
  }

  const row = {
    ...grade,
    index,
    completed,
    exitStatus: result.status,
    timedOut,
    logPath,
  };

  if (keep) {
    row.root = root;
  } else {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup — a leftover temp dir is not fatal
    }
  }

  return row;
}

function formatRow(row) {
  const status = row.completed ? (row.allDeterministicPass ? 'PASS' : 'FAIL') : (row.timedOut ? 'TIMEOUT' : 'INCOMPLETE');
  const detail = row.completed
    ? (row.allDeterministicPass ? `${row.newPath ?? '(no new file)'}` : row.reasons.join(' | '))
    : `exit=${row.exitStatus} log=${row.logPath}`;
  return `  ${row.variant.padEnd(8)} run ${row.index}  ${status.padEnd(10)} ${detail}`;
}

function evaluateVariant(variant, rows) {
  const n = rows.length;
  const completeThreshold = Math.ceil((2 * n) / 3);
  const completedRows = rows.filter((r) => r.completed);
  const completeOk = completedRows.length >= completeThreshold;
  const allCompletedPass = completedRows.every((r) => r.allDeterministicPass);
  const newThemeCount = rows.filter((r) => r.newThemeCreated).length;
  const newThemeOk = newThemeCount === 0;

  let inferOk = true;
  let inferDetail = '';
  if (variant === 'A-infer') {
    const existingThemeThreshold = Math.ceil((2 * n) / 3);
    const existingThemeCount = rows.filter((r) => r.themeIsExisting === true).length;
    inferOk = existingThemeCount >= existingThemeThreshold;
    inferDetail = ` (landed in an existing theme: ${existingThemeCount}/${n}, need >= ${existingThemeThreshold})`;
  }

  const pass = completeOk && allCompletedPass && newThemeOk && inferOk;
  const reasons = [];
  if (!completeOk) reasons.push(`only ${completedRows.length}/${n} runs completed (need >= ${completeThreshold})`);
  if (!allCompletedPass) reasons.push('a completed run failed a deterministic assertion');
  if (!newThemeOk) reasons.push(`${newThemeCount} run(s) created a new theme directory (must be 0)`);
  if (!inferOk) reasons.push(`A-infer theme inference below threshold${inferDetail}`);

  return { variant, pass, reasons };
}

async function main() {
  const { variants, runs, keep } = parseCliArgs(process.argv.slice(2));
  const logsDir = mkdtempSync(join(tmpdir(), 'create-adr-evals-logs-'));

  console.log(`create-adr-evals: variants=${variants.join(',')} runs=${runs} keep=${keep}`);
  console.log(`Logs: ${logsDir}\n`);

  const allRows = [];
  for (const variant of variants) {
    for (let i = 1; i <= runs; i++) {
      const row = await runOne(variant, i, { keep, logsDir });
      allRows.push(row);
      console.log(formatRow(row));
    }
  }

  console.log('\n--- Variant verdicts ---');
  let overallPass = true;
  for (const variant of variants) {
    const rows = allRows.filter((r) => r.variant === variant);
    const verdict = evaluateVariant(variant, rows);
    if (!verdict.pass) overallPass = false;
    console.log(`  ${variant.padEnd(8)} ${verdict.pass ? 'PASS' : 'FAIL'}${verdict.reasons.length ? ` — ${verdict.reasons.join('; ')}` : ''}`);
  }

  console.log(`\nLogs retained at: ${logsDir}`);
  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error('create-adr-evals: run.mjs crashed:', err);
  process.exit(1);
});
