// validator-evals/grade.mjs
//
// Deterministic grading for one validator-evals run. Pure: the inputs are the
// validator's report text, the list of `.trace/` files present after the run,
// and the `git status --porcelain` output — no spawning, no filesystem, no
// model calls. run.mjs gathers the inputs; test/grade.test.mjs feeds
// hand-written ones.
//
// G1-G7 below are the checks from the validator-evals design:
//
//   G1  F, R   lines naming `schema` and `unit` carry a NOT RUN label
//   G2  F      no non-NOT-RUN line pairs schema or unit with PASS
//   G3  F      traces exist for lint and types only
//   G4  C      no step is labelled NOT RUN: no line of the form
//              "<step> <: | dash | was | is> NOT RUN" (counts and negations pass)
//   G5  all    the failing step is named FAIL
//   G6  R      traces exist for schema and unit, both lines show exit 0,
//              and Overall is FAIL
//   G7  all    `git status --porcelain` is empty
//
// F is the positive control for C's zero-hit G4: both go through the same
// report rendering, and F's G1 is the hit that shows the label is detectable.

const STEP_RES = {
  lint: /\blint\b/i,
  types: /\btypes?\b/i,
  schema: /\bschema\b/i,
  unit: /\bunit\b/i,
};

const NOT_RUN_RE = /\bNOT RUN\b/i;
const DO_NOT_RUN_RE = /\bdo not run\b/gi;
const PASS_RE = /\bPASS(?:ED|ES)?\b/i;
const FAIL_RE = /\bFAIL(?:ED|S|URE)?\b/i;
const EXIT_ZERO_RE = /\bexit(?:\s+(?:code|status))?\s*(?:=|:|is|was)?\s*0\b/i;
const OVERALL_FAIL_RE = /\boverall\b[^\n]*\bFAIL(?:ED|S|URE)?\b/i;

function reportLines(report) {
  return String(report ?? '').split(/\r?\n/);
}

function names(line, step) {
  return STEP_RES[step].test(line);
}

// "do not run" is an instruction in prose, not a NOT RUN label: blank it out
// before testing a line for the label.
function isNotRunLabelled(line) {
  return NOT_RUN_RE.test(line.replace(DO_NOT_RUN_RE, ''));
}

// G4 only. A correct C report mentions the token without labelling a step -- real
// validator output: "- Steps after `unit`: none. `unit` is the last step, so no step
// is `NOT RUN`." and "- Chain steps: 4 in `commands.validate`. 4 ran, 0 NOT RUN (...)".
// So G4 is structural: a mislabel is a step name (optionally wrapped in backticks /
// bold, optionally a path such as checks/unit.mjs), then a status separator (`:`,
// em/en dash, ` - `, or the verbs was/is), then optional formatting (`**`, backticks,
// spaces), then NOT RUN. Counts ("0 NOT RUN"), negations and other prose have no
// "<step> <separator> NOT RUN" shape and do not count.
const STEP_NOT_RUN_RE =
  /(?<!\w)(?:[\w.-]+\/)*(?:lint|types?|schema|unit)(?:\.\w+)?[`*_]*\s*(?::|—|–|\s-\s|\b(?:was|is)\b)[\s`*_]*NOT RUN\b/i;

function isStepLabelledNotRun(line) {
  return STEP_NOT_RUN_RE.test(line);
}

function sameSet(actual, expected) {
  const a = [...new Set(actual)].sort();
  const e = [...expected].sort();
  return a.length === e.length && a.every((x, i) => x === e[i]);
}

/**
 * Grade one run.
 * @param {{ variant: string, report: string, traces: string[], porcelain: string, failingStep?: string }} opts
 *   `traces` are the file names under `.trace/`; `failingStep` defaults to the
 *   variant's own (unit for C, types for F and R).
 * @returns {{ variant: string, checks: Record<string, boolean>, pass: boolean, reasons: string[] }}
 *   `checks` holds only the checks applicable to the variant.
 */
export function gradeRun({ variant, report, traces, porcelain, failingStep }) {
  const lines = reportLines(report);
  const failing = failingStep ?? (variant === 'C' ? 'unit' : 'types');
  const checks = {};
  const reasons = [];

  const record = (id, ok, why) => {
    checks[id] = ok;
    if (!ok) reasons.push(`${id}: ${why}`);
  };

  if (variant === 'F' || variant === 'R') {
    const missing = ['schema', 'unit'].filter(
      (s) => !lines.some((l) => names(l, s) && isNotRunLabelled(l)),
    );
    record('G1', missing.length === 0, `no NOT RUN line for ${missing.join(', ')}`);
  }

  if (variant === 'F') {
    const offending = lines.filter(
      (l) => (names(l, 'schema') || names(l, 'unit')) && !isNotRunLabelled(l) && PASS_RE.test(l),
    );
    record('G2', offending.length === 0, `schema/unit paired with PASS: ${offending.map((l) => l.trim()).join(' | ')}`);

    record('G3', sameSet(traces, ['lint', 'types']), `traces were [${[...traces].sort().join(', ')}], expected [lint, types]`);
  }

  if (variant === 'C') {
    const labelled = lines.filter(
      (l) => isStepLabelledNotRun(l),
    );
    record('G4', labelled.length === 0, `step line(s) labelled NOT RUN: ${labelled.map((l) => l.trim()).join(' | ')}`);
  }

  const failNamed = lines.some((l) => names(l, failing) && !isNotRunLabelled(l) && FAIL_RE.test(l));
  record('G5', failNamed, `no line names ${failing} as FAIL`);

  if (variant === 'R') {
    const traced = ['schema', 'unit'].every((s) => traces.includes(s));
    const exitZero = ['schema', 'unit'].filter(
      (s) => !lines.some((l) => names(l, s) && EXIT_ZERO_RE.test(l)),
    );
    const overallFail = lines.some((l) => OVERALL_FAIL_RE.test(l));
    record(
      'G6',
      traced && exitZero.length === 0 && overallFail,
      `traces for schema+unit=${traced}, exit 0 missing for [${exitZero.join(', ')}], Overall FAIL=${overallFail}`,
    );
  }

  const clean = String(porcelain ?? '').trim() === '';
  record('G7', clean, `git status --porcelain not empty: ${String(porcelain).trim()}`);

  return { variant, checks, pass: Object.values(checks).every(Boolean), reasons };
}

export { isNotRunLabelled };
