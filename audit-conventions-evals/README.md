# audit-conventions eval harness

Skill-level evals for the `gvt-dev:audit-conventions` skill. Unlike the script
unit tests under `plugin/skills/audit-conventions/scripts/test/` (which
test `audit.mjs` directly), these test **Claude's behavior wielding the skill**:
does it run the validator instead of hand-rolling checks, identify repo state
correctly, preview `--fix` as a dry-run, surface findings with their reasons,
and — critically — **stop after the dry-run for approval rather than auto-applying**.

## What's committed (reusable infra)

- `evals.json` — the 3 eval prompts + objective assertions, one per repo state.
- `fixtures/` — three consuming-repo fixtures, each a git repo with a clean tree
  that triggers a specific `detectState` branch:
  - `greenfield/` — no convention files (→ scaffold path)
  - `legacy/` — `claude-config.json` + `.gitmodules` (→ migration path)
  - `migrated-gap/` — `.gvt-agent.json` etc. but **no `CLAUDE.md`** (→ drift findings)
- `_grade.mjs` / `_grade2.mjs` — turn the human-graded assertion results into
  `grading.json` + `benchmark.json` for the skill-creator viewer.

## What's gitignored (regenerable run artifacts)

`iteration-*/` (sandboxes, `outputs/`, `grading.json`, `benchmark.json`) and the
generated `review.html` viewers.

## How a run works

1. Per eval+config, copy the fixture into a **sandbox outside this repo** (so a
   no-skill baseline can't trivially find the in-repo plugin) and an `outputs/` dir.
2. Spawn two subagents per eval — one pointed at the skill (with the plugin root
   substituted for `${CLAUDE_PLUGIN_ROOT}`), one with no skill (baseline). Each
   saves `answer.md` + `commands.md`.
3. Grade each run's assertions from `commands.md` + `answer.md`, write `grading.json`.
4. `node _grade.mjs` (or `_grade2.mjs`) → `benchmark.json`.
5. Launch the skill-creator viewer:
   `python <skill-creator>/eval-viewer/generate_review.py iteration-N --skill-name audit-conventions --benchmark iteration-N/benchmark.json --static iteration-N/review.html`

## Known limitation

A true no-skill baseline is **not isolatable** for this skill: the prompts name
the genvid plugin, which is installed at `~/.claude/plugins`, so capable baseline
agents locate the installed `audit.mjs` and run it regardless. The meaningful
signal is therefore *behavioral* (does the skill enforce the safe dry-run →
approval → apply gate?), not a with-vs-without outcome delta. Iteration-2
confirmed the gate fix: greenfield + legacy stopped at the dry-run instead of
auto-applying.
