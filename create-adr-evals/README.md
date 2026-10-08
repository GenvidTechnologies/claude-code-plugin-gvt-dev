# create-adr-evals

A behavioral eval harness for `gvt-dev:create-adr` and `gvt-dev:tech-writer`'s
themed, wiki-hosted ADR authoring (#582). Unlike
`plugin/skills/create-adr/scripts/test/renumber-adrs.test.mjs` (which tests
the `renumber-adrs.mjs` script directly), this harness drives a **real Claude
Code session** through the skill/agent and grades the resulting repo state —
does the model resolve `.gvt-agent.json`'s `paths['docs/decisions/']`
override, place the new record in the right theme, write OKF frontmatter
inside the wiki, register it in the theme index, and leave everything else
(the default-location decoy, `docs/TOC.md`, `wiki/log.md`) untouched?

## What's here

- `fixtures.mjs` — builds throwaway fixture repos under `os.tmpdir()` at
  runtime (never committed — see the module header for why). Four variants:
  - **A** — `/gvt-dev:create-adr`, explicit theme `beta`
  - **A-infer** — same fixture, no theme given; the requested topic clearly
    fits the `beta` theme, so a capable model should land there (or in
    `alpha`) without being told
  - **C** — dispatch `gvt-dev:tech-writer` directly (bypassing the skill),
    explicit dir/number/theme/wiki parameters, mirroring how `plan-task`
    dispatches it
  - **B** — negative control: no `paths` override, `docs/decisions/` absent
    (the first-use scaffold path), plus a decoy `wiki/decisions/` bundle the
    agent must leave untouched
- `grade.mjs` — pure, deterministic grading (`gradeRun`). Diffs the working
  tree against a pre-run snapshot and checks D1-D7 from the #582 design
  hand-off: new file path + number, no writes to the wrong location, OKF
  frontmatter (or its absence, for B), registration in the theme index via a
  **real** `lintWiki` run (not a hand-rolled proxy for it), `docs/TOC.md`
  unchanged (A/A-infer/C only — B's correct behavior *is* a new TOC row),
  `wiki/log.md` unchanged, and `--next` agreeing post-run via
  `describeAdrDir`.
- `run.mjs` — spawns `claude -p --plugin-dir plugin` per fixture, grades the
  result, prints a per-run table, and applies the pass rule below.
- `test/grade.test.mjs` — unit tests for `grade.mjs` against hand-built
  trees. No model calls; these are the only create-adr-evals tests that run
  under `commands.test`/`commands.validate`.

## Running it

```bash
npm ci --prefix plugin --ignore-scripts --no-audit --no-fund   # audit-core, read by grade.mjs
node create-adr-evals/run.mjs --variant A,A-infer,C,B --runs 3
```

- `--variant` — comma-separated subset of `A,A-infer,C,B` (default: all four).
- `--runs` — runs per variant (default: 3, per the #582 design hand-off).
- `--keep` — don't delete the fixture temp dirs after grading (useful when a
  run fails and you want to inspect the tree by hand).

Each run's full `claude -p` transcript (stdout/stderr, JSON output included)
is written to a per-run log file under a fresh `os.tmpdir()` directory;
`run.mjs` prints that directory's path at the end.

**Cost note: every invocation here is a real, metered Claude Code session**
(`claude -p`), not a mock. A single run in testing cost roughly $0.97 and
took about a minute. A full `--runs 3` sweep across all four variants is
~12 real sessions — budget and schedule accordingly. This is why `run.mjs` is
never wired into `commands.test`/`commands.validate`; only `grade.mjs`'s own
unit tests (`test/grade.test.mjs`) run there.

## Pass rule (per variant, N = `--runs`)

- At least ⌈2N/3⌉ runs must **complete** (the `claude -p` session exits 0
  with `is_error: false` in its JSON result).
- **Every** completed run must pass **every** deterministic assertion
  (D1-D7, as applicable to that variant — see `grade.mjs`).
- For **A-infer** only: at least ⌈2N/3⌉ runs must land the new record in an
  existing theme (`alpha` or `beta`), not a newly-created one.
- Across **all** runs of a variant (completed or not): **zero** runs may
  create a new theme directory.

`run.mjs` exits 0 iff every requested variant's pass rule holds.

## Known environment note (Windows)

The one smoke run performed while building this harness (variant B) showed
the model habitually prefixing Bash calls with `cd "<fixture root>" && …`
even though the session's cwd is already the fixture root — Claude Code
denies a compound command segment-by-segment, so a bare `Bash(git *)` grant
doesn't cover `cd ... && git ...`. `run.mjs` grants `Bash(cd *)` alongside
the git/node/ls patterns the design calls for, to avoid denial churn in a
real batch run. See `run.mjs`'s `ALLOWED_TOOLS` comment for the full
rationale; it wasn't re-verified by a second real run (the task that built
this harness capped it at one smoke run).

## Status as of #582 T2

T2 lands the harness ahead of T4 (the create-adr/tech-writer SKILL.md changes
that make `paths['docs/decisions/']` resolution, themed authoring, and the
wiki frontmatter regime real). Until T4 lands, variants A/A-infer/C are
expected to fail or behave inconsistently — the current SKILL.md only
consults a CLAUDE.md-declared location, not `.gvt-agent.json`'s `paths`
override — while variant B (the default-location path) already exercises
shipped behavior. A pre-F baseline run is informational, not a pledged red;
the orchestrator posts the post-F run (once T4/T5 land) to #582.
