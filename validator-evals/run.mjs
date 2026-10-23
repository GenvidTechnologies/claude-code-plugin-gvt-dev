#!/usr/bin/env node
// validator-evals/run.mjs
//
// Spawns `claude -p --agent gvt-dev:validator` against freshly-built fixture
// repos (fixtures.mjs), grades each report with grade.mjs, and applies the
// per-variant pass rule. See README.md before running a batch — every run here
// is a REAL, metered model session; this script is never invoked from
// `commands.test`/`commands.validate`.
//
// Usage:
//   node validator-evals/run.mjs --variant F,C,R --runs 3 [--keep] [--budget 1]
//
// Exit code 0 iff every requested variant's pass rule holds.

import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { buildFixture, readTraces, gitPorcelain, VARIANTS } from './fixtures.mjs';
import { gradeRun } from './grade.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..', 'plugin');
const VALIDATOR_MD = join(PLUGIN_DIR, 'agents', 'validator.md');

const DEFAULT_RUNS = 3;
const DEFAULT_BUDGET_USD = '1';
const RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per run

// Plain `Bash`, not a pattern list. The smoke run showed a narrow list
// (`Bash(node:*) Bash(git:*) Bash(cat:*) Bash(ls:*)`) lets the agent run the
// chain but denies a shell `for` loop and an `echo "exit=$?"` suffix — the
// very commands variant R asks the agent to use to report exit codes. The
// fixture is a disposable tmp repo, G7 fails the run if it is left dirty, and
// the plugin's git-state-guard hook still applies to gvt-dev:* agents.
// Read/Grep/Glob cover file inspection.
const ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];

/**
 * Resolve the claude binary to an absolute path (a bare `claude` spawn is not
 * trusted: on Windows CreateProcess searches System32 first and does not apply
 * PATHEXT). CLAUDE_BIN wins; otherwise walk PATH for claude.exe (Windows) or
 * claude (elsewhere).
 */
function resolveClaudeBin() {
  const override = process.env.CLAUDE_BIN;
  if (override) {
    if (!existsSync(override)) {
      console.error(`Error: CLAUDE_BIN does not exist: ${override}`);
      process.exit(1);
    }
    return resolve(override);
  }
  const names = process.platform === 'win32' ? ['claude.exe'] : ['claude'];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return resolve(candidate);
    }
  }
  console.error(`Error: could not find ${names.join(' / ')} on PATH — set CLAUDE_BIN to its absolute path`);
  process.exit(1);
}

/** The validator's model, read from its frontmatter `model:` line. */
function readValidatorModel() {
  const src = readFileSync(VALIDATOR_MD, 'utf8');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  const m = fm && /^model:\s*(\S+)\s*$/m.exec(fm[1]);
  if (!m) {
    console.error(`Error: no frontmatter "model:" line in ${VALIDATOR_MD}`);
    process.exit(1);
  }
  return m[1].replace(/^['"]|['"]$/g, '');
}

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      variant: { type: 'string', default: VARIANTS.join(',') },
      runs: { type: 'string', default: String(DEFAULT_RUNS) },
      budget: { type: 'string', default: DEFAULT_BUDGET_USD },
      keep: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log('Usage: node validator-evals/run.mjs [--variant F,C,R] [--runs N] [--budget USD] [--keep]');
    console.log('Metered: every run is a real claude session. See validator-evals/README.md.');
    process.exit(0);
  }

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

  const budget = Number(values.budget);
  if (!Number.isFinite(budget) || budget <= 0) {
    console.error(`Error: --budget must be a positive number of USD, got: ${values.budget}`);
    process.exit(1);
  }

  return { variants, runs, keep: values.keep, budget: String(budget) };
}

function spawnClaude({ bin, model, budget, cwd, prompt, logPath }) {
  const args = [
    '-p', prompt,
    '--plugin-dir', PLUGIN_DIR,
    '--agent', 'gvt-dev:validator',
    '--model', model,
    '--output-format', 'json',
    '--max-budget-usd', budget,
    '--permission-prompts', 'none',
    '--allowedTools', ...ALLOWED_TOOLS,
  ];

  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });

  writeFileSync(logPath, [
    `# prompt: ${prompt}`,
    `# command: ${bin} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`,
    `# cwd: ${cwd}`,
    `# exit status: ${result.status}`,
    `# signal: ${result.signal}`,
    result.error ? `# spawn error: ${result.error.message}` : '',
    '--- stdout ---',
    result.stdout ?? '',
    '--- stderr ---',
    result.stderr ?? '',
  ].join('\n'), 'utf8');

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

function runOne(variant, index, { bin, model, budget, keep, logsDir }) {
  const { root, prompt, meta } = buildFixture(variant);
  const logPath = join(logsDir, `${variant}-${index}.log`);

  const result = spawnClaude({ bin, model, budget, cwd: root, prompt, logPath });
  const timedOut = result.error?.code === 'ETIMEDOUT' || (result.signal === 'SIGTERM' && result.status === null);
  const parsed = parseClaudeJson(result.stdout);
  const completed = result.status === 0 && Boolean(parsed) && parsed.is_error === false;

  const report = typeof parsed?.result === 'string' ? parsed.result : '';
  let grade;
  try {
    grade = gradeRun({
      variant,
      report,
      traces: readTraces(root),
      porcelain: gitPorcelain(root),
      failingStep: meta.failingStep,
    });
  } catch (err) {
    grade = { variant, checks: {}, pass: false, reasons: [`grading threw: ${err.message}`] };
  }

  const row = {
    ...grade,
    index,
    completed,
    exitStatus: result.status,
    timedOut,
    costUsd: parsed?.total_cost_usd ?? null,
    numTurns: parsed?.num_turns ?? null,
    isError: parsed?.is_error ?? null,
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
  const status = row.completed ? (row.pass ? 'PASS' : 'FAIL') : (row.timedOut ? 'TIMEOUT' : 'INCOMPLETE');
  const meter = `cost=${row.costUsd ?? '?'} turns=${row.numTurns ?? '?'} is_error=${row.isError ?? '?'}`;
  const detail = row.completed
    ? (row.pass ? Object.keys(row.checks).join(',') : row.reasons.join(' | '))
    : `exit=${row.exitStatus} log=${row.logPath}`;
  return `  ${row.variant.padEnd(3)} run ${row.index}  ${status.padEnd(10)} ${meter}  ${detail}`;
}

function evaluateVariant(variant, rows) {
  const n = rows.length;
  const threshold = Math.ceil((2 * n) / 3);
  const completedRows = rows.filter((r) => r.completed);
  const completeOk = completedRows.length >= threshold;
  const allCompletedPass = completedRows.every((r) => r.pass);

  const reasons = [];
  if (!completeOk) reasons.push(`only ${completedRows.length}/${n} runs completed (need >= ${threshold})`);
  if (!allCompletedPass) reasons.push('a completed run failed a check');
  return { variant, pass: completeOk && allCompletedPass, reasons };
}

function main() {
  const { variants, runs, keep, budget } = parseCliArgs(process.argv.slice(2));
  const bin = resolveClaudeBin();
  const model = readValidatorModel();
  // Not raw os.tmpdir(): the Windows 8.3 short path makes headless writes get denied.
  const logsDir = mkdtempSync(join(realpathSync.native(tmpdir()), 'validator-evals-logs-'));

  console.log(`validator-evals: variants=${variants.join(',')} runs=${runs} keep=${keep} model=${model} budget=${budget}`);
  console.log(`claude: ${bin}`);
  console.log(`Logs: ${logsDir}\n`);

  const allRows = [];
  let totalCost = 0;
  for (const variant of variants) {
    for (let i = 1; i <= runs; i++) {
      const row = runOne(variant, i, { bin, model, budget, keep, logsDir });
      allRows.push(row);
      totalCost += row.costUsd ?? 0;
      console.log(formatRow(row));
    }
  }

  console.log('\n--- Variant verdicts ---');
  let overallPass = true;
  for (const variant of variants) {
    const verdict = evaluateVariant(variant, allRows.filter((r) => r.variant === variant));
    if (!verdict.pass) overallPass = false;
    console.log(`  ${variant.padEnd(3)} ${verdict.pass ? 'PASS' : 'FAIL'}${verdict.reasons.length ? ` — ${verdict.reasons.join('; ')}` : ''}`);
  }

  console.log(`\nTotal cost (sum of reported total_cost_usd): ${totalCost.toFixed(4)}`);
  console.log(`Logs retained at: ${logsDir}`);
  process.exit(overallPass ? 0 : 1);
}

try {
  main();
} catch (err) {
  console.error('validator-evals: run.mjs crashed:', err);
  process.exit(1);
}
