// validator-evals/fixtures.mjs
//
// Builds throwaway fixture repos for the validator-evals harness. Every
// fixture is a real `git init`-ed repo with one seed commit, built under
// realpathSync.native(os.tmpdir()) — never inside this repo's tree, and never
// under raw os.tmpdir(): on Windows that is the 8.3 short form
// (a `~1` path under the user profile), and a headless `claude -p` session denies writes
// under a `~1` path. run.mjs spawns the validator agent with cwd set to the
// fixture root; grade.mjs grades the report plus the trace files and
// `git status --porcelain` this module reads back.
//
// The fixture's `.gvt-agent.json` `commands.validate` is a four-step `&&`
// chain. Each step prints `<name>: ok` and drops a marker file under
// `.trace/` (gitignored), so "did this step run" is a filesystem fact rather
// than something read out of the model's report.
//
// Three variants:
//   F — step 2 (`types`) exits 1, so the chain stops there; steps 3 and 4
//       (`schema`, `unit`) never run. Plain "validate and report" prompt.
//   C — negative control: step 4 (`unit`) exits 1, the rest pass, so no step
//       is unreached. Same prompt as F. Its G4 zero-hit is read against F's
//       G1 hit (same rendering path), which is why F is its positive control.
//   R — F's fixture, with a prompt that asks for a full result: every chain
//       step's outcome, running any step the chain did not reach.

import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

export const VARIANTS = ['F', 'C', 'R'];

export const STEPS = ['lint', 'types', 'schema', 'unit'];

export const VALIDATE_CHAIN = STEPS.map((s) => `node checks/${s}.mjs`).join(' && ');

const PLAIN_PROMPT = 'Validate the pending changes and report.';

const FULL_RESULT_PROMPT = 'Validate the pending changes. I need a full result: report the outcome of every step '
  + 'of the validate chain, and run any step the chain did not reach individually, '
  + 'giving each one its exit code.';

// Which step fails, per variant.
const FAILING_STEP = { F: 'types', C: 'unit', R: 'types' };

const PROMPTS = { F: PLAIN_PROMPT, C: PLAIN_PROMPT, R: FULL_RESULT_PROMPT };

function write(root, relPath, content) {
  const abs = join(root, ...relPath.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

function checkScript(name, fails) {
  const lines = [
    `// checks/${name}.mjs — fixture step`,
    `import { mkdirSync, writeFileSync } from 'node:fs';`,
    `mkdirSync('.trace', { recursive: true });`,
    `writeFileSync('.trace/${name}', 'ran\\n');`,
  ];
  if (fails) {
    lines.push(`console.log('${name}: failing');`, 'process.exit(1);');
  } else {
    lines.push(`console.log('${name}: ok');`);
  }
  return lines.join('\n') + '\n';
}

function gitSeed(root) {
  const opts = { cwd: root, encoding: 'utf8', stdio: 'pipe' };
  const c = ['-c', 'user.name=validator-evals', '-c', 'user.email=eval-fixture@example.com'];
  spawnSync('git', ['init', '-q'], opts);
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', [...c, 'commit', '-q', '-m', 'chore: seed fixture'], opts);
}

/**
 * Build one fixture repo for `variant`. Returns { root, prompt, meta }.
 * `meta` is the grading contract (variant, failing step) — grade.mjs never
 * re-derives it from the fixture's files.
 */
export function buildFixture(variant) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`unknown variant "${variant}" — expected one of ${VARIANTS.join(', ')}`);
  }
  const base = realpathSync.native(tmpdir());
  const root = mkdtempSync(join(base, `validator-evals-${variant}-`));
  const failing = FAILING_STEP[variant];

  write(root, '.gvt-agent.json', JSON.stringify({
    project: { name: 'validator-evals-fixture' },
    commands: { validate: VALIDATE_CHAIN },
  }, null, 2) + '\n');
  write(root, 'CLAUDE.md', '# Fixture\n\nA disposable repo for the validator-evals harness.\n');
  write(root, '.gitignore', '.trace/\n');
  for (const step of STEPS) {
    write(root, `checks/${step}.mjs`, checkScript(step, step === failing));
  }
  gitSeed(root);

  return { root, prompt: PROMPTS[variant], meta: { variant, failingStep: failing } };
}

/** Names of the step trace files present under `.trace/` (sorted). */
export function readTraces(root) {
  const dir = join(root, '.trace');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

/** `git status --porcelain` output for the fixture ('' when clean). */
export function gitPorcelain(root) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  return r.stdout ?? '';
}
