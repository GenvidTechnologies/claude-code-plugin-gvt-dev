// validator-evals/test/grade.test.mjs
//
// Unit tests for grade.mjs's pure grader and fixtures.mjs's fixture shape — no
// model calls. Each grader test hands gradeRun() a hand-written report (correct
// or defective) plus the trace list and porcelain output a run would have
// produced, and asserts the verdict: a correct report grades PASS and each
// named defect grades FAIL on exactly the check it targets. The two fixture
// tests build a real fixture and run its steps with node, which is what makes
// the trace-based checks (G3, G6) trustworthy: they pin that the F chain
// really stops at step 2 and that steps 3 and 4 really pass when run alone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { buildFixture, readTraces, gitPorcelain, VALIDATE_CHAIN } from '../fixtures.mjs';
import { gradeRun } from '../grade.mjs';

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

const F_REPORT = `## Validation result
- lint: PASS (exit 0)
- types: FAIL (exit 1) - types: failing
- schema: NOT RUN (chain stopped at types)
- unit: NOT RUN (chain stopped at types)

Overall: FAIL`;

const C_REPORT = `## Validation result
- lint: PASS
- types: PASS
- schema: PASS
- unit: FAIL (exit 1) - unit: failing

Overall: FAIL`;

const R_REPORT = `## Validation result
- lint: PASS (exit 0)
- types: FAIL (exit 1)
- schema: NOT RUN by the chain; run individually: PASS (exit 0)
- unit: NOT RUN by the chain; run individually: PASS (exit 0)

Overall: FAIL`;

const F_TRACES = ['lint', 'types'];
const ALL_TRACES = ['lint', 'schema', 'types', 'unit'];

function grade(variant, report, { traces, porcelain = '' } = {}) {
  const defaults = { F: F_TRACES, C: ALL_TRACES, R: ALL_TRACES };
  return gradeRun({ variant, report, traces: traces ?? defaults[variant], porcelain });
}

// ---------------------------------------------------------------------------
// F: chain fails at step 2
// ---------------------------------------------------------------------------

test('F: a report listing schema and unit as NOT RUN passes', () => {
  const r = grade('F', F_REPORT);
  assert.equal(r.pass, true, JSON.stringify(r.reasons));
  assert.deepEqual(Object.keys(r.checks).sort(), ['G1', 'G2', 'G3', 'G5', 'G7']);
});

test('F: a report calling schema PASS fails G2', () => {
  const r = grade('F', F_REPORT.replace('- schema: NOT RUN (chain stopped at types)', '- schema: PASS'));
  assert.equal(r.checks.G2, false);
  assert.equal(r.checks.G1, false);
  assert.equal(r.pass, false);
});

test('F: a report omitting unit fails G1', () => {
  const r = grade('F', F_REPORT.replace('- unit: NOT RUN (chain stopped at types)\n', ''));
  assert.equal(r.checks.G1, false);
  assert.equal(r.checks.G2, true);
  assert.equal(r.pass, false);
});

test('F: traces beyond lint and types fail G3', () => {
  const r = grade('F', F_REPORT, { traces: ALL_TRACES });
  assert.equal(r.checks.G3, false);
  assert.equal(r.pass, false);
});

test('F: a report that never names types as FAIL fails G5', () => {
  const r = grade('F', F_REPORT.replace('- types: FAIL (exit 1) - types: failing', '- types: see output'));
  assert.equal(r.checks.G5, false);
  assert.equal(r.pass, false);
});

test('F: a dirty git status fails G7', () => {
  const r = grade('F', F_REPORT, { porcelain: ' M checks/lint.mjs\n' });
  assert.equal(r.checks.G7, false);
  assert.equal(r.pass, false);
});

// ---------------------------------------------------------------------------
// C: negative control, chain fails at its last step
// ---------------------------------------------------------------------------

test('C: a report labelling any step NOT RUN fails G4', () => {
  const r = grade('C', C_REPORT.replace('- schema: PASS', '- schema: NOT RUN'));
  assert.equal(r.checks.G4, false);
  assert.equal(r.pass, false);
});

test('C: a negated NOT RUN mention (real validator wording) passes G4', () => {
  const line = '- Steps after `unit`: none. `unit` is the last step, so no step is `NOT RUN`.';
  const r = grade('C', C_REPORT.replace('\n\nOverall: FAIL', `\n${line}\n\nOverall: FAIL`));
  assert.equal(r.checks.G4, true, JSON.stringify(r.reasons));
  assert.equal(r.pass, true, JSON.stringify(r.reasons));
});

test('C: genuine NOT RUN labels still fail G4', () => {
  const unit = grade('C', C_REPORT.replace('- unit: FAIL (exit 1) - unit: failing', '- unit: NOT RUN'));
  assert.equal(unit.checks.G4, false);
  const schema = grade('C', C_REPORT.replace('- schema: PASS', '- schema: **NOT RUN** (chain stopped)'));
  assert.equal(schema.checks.G4, false);
  const dash = grade('C', C_REPORT.replace('- schema: PASS', '- schema — NOT RUN'));
  assert.equal(dash.checks.G4, false);
  const path = grade('C', C_REPORT.replace('- schema: PASS', '- `checks/unit.mjs`: NOT RUN. The `&&` chain stopped at `b`.'));
  assert.equal(path.checks.G4, false);
});

test('C: a step tally line (real validator wording) passes G4', () => {
  const line = '- Chain steps: 4 in `commands.validate`. 4 ran, 0 NOT RUN (`unit` is the last step, so nothing was left unreached).';
  const r = grade('C', C_REPORT.replace('\n\nOverall: FAIL', `\n${line}\n\nOverall: FAIL`));
  assert.equal(r.checks.G4, true, JSON.stringify(r.reasons));
  assert.equal(r.pass, true, JSON.stringify(r.reasons));
});

test('C: "unit was NOT RUN" fails G4', () => {
  const r = grade('C', C_REPORT.replace('\n\nOverall: FAIL', '\nunit was NOT RUN\n\nOverall: FAIL'));
  assert.equal(r.checks.G4, false);
});

test('C: a correct control report passes', () => {
  const r = grade('C', C_REPORT);
  assert.equal(r.pass, true, JSON.stringify(r.reasons));
  assert.deepEqual(Object.keys(r.checks).sort(), ['G4', 'G5', 'G7']);
});

test('C: a report that does not name unit as FAIL fails G5', () => {
  const r = grade('C', C_REPORT.replace('- unit: FAIL (exit 1) - unit: failing', '- unit: PASS'));
  assert.equal(r.checks.G5, false);
  assert.equal(r.pass, false);
});

// ---------------------------------------------------------------------------
// R: full-result dispatch
// ---------------------------------------------------------------------------

test('R: a correct full-result report passes', () => {
  const r = grade('R', R_REPORT);
  assert.equal(r.pass, true, JSON.stringify(r.reasons));
  assert.deepEqual(Object.keys(r.checks).sort(), ['G1', 'G5', 'G6', 'G7']);
});

test('R: a report without exit codes for schema and unit fails G6', () => {
  const r = grade('R', R_REPORT.replace(/ \(exit 0\)/g, '').replace(/run individually: PASS/g, 'run individually: ok'));
  assert.equal(r.checks.G6, false);
  assert.equal(r.pass, false);
});

test('R: missing traces for schema and unit fail G6', () => {
  const r = grade('R', R_REPORT, { traces: F_TRACES });
  assert.equal(r.checks.G6, false);
});

test('R: an Overall of PASS fails G6', () => {
  const r = grade('R', R_REPORT.replace('Overall: FAIL', 'Overall: PASS'));
  assert.equal(r.checks.G6, false);
});

test('R: a report with no NOT RUN line for schema fails G1', () => {
  const r = grade('R', R_REPORT.replace('- schema: NOT RUN by the chain; run individually: PASS (exit 0)', '- schema: PASS (exit 0)'));
  assert.equal(r.checks.G1, false);
});

// ---------------------------------------------------------------------------
// Grader prose handling
// ---------------------------------------------------------------------------

test("grader: 'do not run' prose is not read as a NOT RUN label", () => {
  // Under C a line saying schema/unit steps "do not run" anything extra must not trip G4...
  const c = grade('C', `${C_REPORT}\n- schema and unit checks do not run anything destructive`);
  assert.equal(c.checks.G4, true, JSON.stringify(c.reasons));
  // ...and under F it must not satisfy G1 for a report that omits the real labels.
  const f = grade('F', F_REPORT.replace(/- schema: NOT RUN.*\n- unit: NOT RUN.*\n/, '- schema and unit: you do not run these after a failure\n'));
  assert.equal(f.checks.G1, false);
});

// ---------------------------------------------------------------------------
// Fixture shape: the traces G3 and G6 rest on
// ---------------------------------------------------------------------------

test('fixture: steps 3 and 4 pass and leave a trace when run alone', () => {
  const { root } = buildFixture('F');
  try {
    for (const step of ['schema', 'unit']) {
      const r = spawnSync('node', [`checks/${step}.mjs`], { cwd: root, encoding: 'utf8' });
      assert.equal(r.status, 0, `${step}: ${r.stderr}`);
      assert.match(r.stdout, new RegExp(`^${step}: ok`));
    }
    assert.deepEqual(readTraces(root), ['schema', 'unit']);
    assert.equal(gitPorcelain(root).trim(), '', '.trace/ must be gitignored');
  } finally {
    cleanup(root);
  }
});

test('fixture: the F chain stops at step 2 and leaves no trace for steps 3 and 4', () => {
  const { root } = buildFixture('F');
  try {
    const r = spawnSync(VALIDATE_CHAIN, { cwd: root, encoding: 'utf8', shell: true });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /types: failing/);
    assert.deepEqual(readTraces(root), ['lint', 'types']);
  } finally {
    cleanup(root);
  }
});

test('fixture: the C chain fails only at step 4', () => {
  const { root } = buildFixture('C');
  try {
    const r = spawnSync(VALIDATE_CHAIN, { cwd: root, encoding: 'utf8', shell: true });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /unit: failing/);
    assert.deepEqual(readTraces(root), ['lint', 'schema', 'types', 'unit']);
  } finally {
    cleanup(root);
  }
});
