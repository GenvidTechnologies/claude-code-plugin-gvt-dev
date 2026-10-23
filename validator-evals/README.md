# validator-evals

A behavioral eval harness for `gvt-dev:validator` (`plugin/agents/validator.md`).
It drives a **real Claude Code session** through the agent against a fixture
repo whose `commands.validate` is an `&&` chain, and grades the report the
agent returns plus the state it leaves behind.

## What it measures

When `commands.validate` is a chain that stops at a failing step:

1. Does the validator name the steps the chain never reached `NOT RUN`, rather
   than reporting them as passing or leaving them out?
2. Does it avoid mislabelling steps in a chain that failed only at its *last*
   step (nothing was unreached, so nothing may be `NOT RUN`)?
3. When the dispatch asks for a full result, does it run the remaining steps
   individually and report their exit codes?

## What's here

- `fixtures.mjs` — builds a throwaway fixture repo per run (`git init`, one
  seed commit). The fixture's `.gvt-agent.json` carries
  `commands.validate` = `node checks/lint.mjs && node checks/types.mjs &&
  node checks/schema.mjs && node checks/unit.mjs`. Each step prints
  `<name>: ok` and writes `.trace/<name>` (`.trace/` is gitignored), so
  whether a step ran is a filesystem fact. No acceptance file exists (criteria:
  "none found"). Variants:
  - **F** — step 2 (`types`) exits 1; steps 3 and 4 are never reached. Plain
    "validate the pending changes and report" prompt.
  - **C** — negative control: step 4 (`unit`) exits 1, the rest pass. Same
    prompt as F. F is the positive control for C's zero-hit G4 (same
    rendering path).
  - **R** — F's fixture, but the prompt asks for a full result: every chain
    step's outcome, running any step the chain did not reach.
- `grade.mjs` — pure grading (`gradeRun`): inputs are the report text, the
  `.trace/` file names, and `git status --porcelain` output.
- `run.mjs` — spawns `claude -p` per fixture, grades, prints a per-run table
  and applies the pass rule below.
- `test/grade.test.mjs` — unit tests for the grader and the fixture shape. No
  model calls; this is the only validator-evals file that runs under
  `commands.test`/`commands.validate`.

## Checks

| Check | Variants | Passes when |
|---|---|---|
| G1 | F, R | Lines naming `schema` and `unit` match `NOT RUN` (a `do not run` phrase is not a label) |
| G2 | F | No non-`NOT RUN` line pairs `schema` or `unit` with PASS |
| G3 | F | Traces exist for lint and types only |
| G4 | C | No step line is labelled `NOT RUN` |
| G5 | all | The failing step is named FAIL |
| G6 | R | Traces exist for schema and unit, both lines show exit 0, and Overall is FAIL |
| G7 | all | `git status --porcelain` is empty |

G3 applies to F only: R is expected to run schema and unit individually, so
G6 covers R's traces instead.

## Running it

```bash
node validator-evals/run.mjs --variant F,C,R --runs 3
```

- `--variant` — comma-separated subset of `F,C,R` (default: all three).
- `--runs` — runs per variant (default 3).
- `--keep` — keep the fixture temp dirs after grading.
- `--budget` — per-run `--max-budget-usd` cap (default 1).

The claude binary is resolved to an absolute path: `CLAUDE_BIN` if set,
otherwise the first `claude.exe` (Windows) or `claude` found on `PATH`. The
model is read from `plugin/agents/validator.md`'s frontmatter, not hard-coded.
The agent is allowed `Read`, `Grep`, `Glob` and plain `Bash` (a narrower Bash
list denied the `for` loops and `echo "exit=$?"` suffixes variant R relies on);
the fixture is disposable and G7 fails any run that leaves it dirty.

Each run's prompt, arguments and raw stdout/stderr are written to a per-run
log under a fresh temp directory, printed at the end.

**Cost note: every invocation is a real, metered Claude Code session.** Cost
per run (`total_cost_usd`), `num_turns` and `is_error` are recorded and
printed per run, with a summed total; the per-run cost has not been measured
yet. `run.mjs` is never wired into `commands.test`/`commands.validate`; only
`test/grade.test.mjs` is.

## Pass rule (per variant, N = `--runs`)

- At least ⌈2N/3⌉ runs must **complete** (exit 0 with `is_error: false`; an
  error or timeout is "not complete").
- **Every** completed run must pass **every** check applicable to its variant.

`run.mjs` exits 0 iff every requested variant passes.

## Windows note

Fixtures and logs are built under `realpathSync.native(os.tmpdir())`, never raw
`os.tmpdir()`. On Windows the raw value is the 8.3 short form, and a headless
`claude -p` session denies writes under such a path, so a run would fail with
no file written and the cause would be easy to misread as model behaviour.
