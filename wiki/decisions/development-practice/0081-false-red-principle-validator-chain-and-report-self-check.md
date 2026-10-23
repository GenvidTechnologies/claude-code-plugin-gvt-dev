---
type: decision-record
title: 'A new principle (#15) guards against a false red; the validator names chain steps that never ran (`NOT RUN`) and self-checks its report'
description: 'Principle #15 owns the false-red rule with restatements where a red is acted on; the validator gains a NOT RUN status, a run-order rule and a report self-check.'
tags: [decisions, development-practice]
status: stable
---
# 0081. A new principle (#15) guards against a false red; the validator names chain steps that never ran (`NOT RUN`) and self-checks its report

- **Status:** accepted
- **Date:** 2026-10-23
- **Issue:** #408, #409, #724

## Context

Three issues share one gap: nothing stopped a result that looked like evidence from being acted on when the check behind it had not run as intended.

- #409: the rules guarded against a false green, a check that passes because it checks nothing. No rule guarded a false red, a check that fails because the check itself is broken. A loop whose per-item command errored reported the same shape as a loop whose items genuinely failed, and the response to a false red is to "fix" an artifact that was already correct.
- #408: the validator returned a self-contradictory report, and its suite interleaved with acceptance rows that write into the tree (a build, a pack, a generate), so a later step read a tree an earlier step had changed.
- #724: when `commands.validate` is an `&&` chain and one step fails, the steps after it never start. The report named the failure but not the steps that never ran, so a reader could take the unnamed remainder as passed.

## Decision

### F1 — a new principle (#15) owns the rule, with short restatements where a red is acted on

**Chosen, Option A:** "new principle #15 as owner, short restatements at each place that acts on a red."

Principle #15 in `plugin/docs/development-principles.md` states the rule: a failing result is a hypothesis until the check is confirmed to have run as intended. Before acting on a red, confirm the exit status and stderr were read, the denominator was populated, and, for a red over a set, that one item known to be fine passes. It adds that a control offered as proof a check can fail is held to the same test, and it points to `build-probe` for the failure-count tell.

The restatements, each short and each citing the principle:

- `plugin/agents/validator.md` and `plugin/agents/code-reviewer.md` carry one block of identical text ("A red is graded only after its check is confirmed to have run"), so the two graders cannot drift from each other (the ADR-0079 practice). A command that errored is not a measurement; if the error is in the row's own command, the row is unverifiable-as-written; a report whose own figures disagree is re-measured, not shipped with a caveat.
- `plugin/skills/plan-task/SKILL.md` adds an orchestrator-side paragraph on a red the orchestrator measures or a critic reports, placed beside the rule on false greens it complements.
- `plugin/skills/build-probe/SKILL.md` adds "A control's red must be the assertion's red": the tell is a failure count that does not match the assertions the control exercises, such as one anonymous failure from a test file that holds many tests, which means the file failed to load.
- `plugin/agents/designer.md` adds one sentence to the mutation-control row guidance: the red observed when the forbidden state is constructed must be the assertion's red, not a load error or a crash.

### Why a principle this time, and a restatement in each body

ADR-0030 and ADR-0031 declined new principles and kept their rules in skill bodies, because each rule had one home. This rule does not: it applies to the orchestrator, both graders, `build-probe` controls and the designer's mutation rows. That is the shape of principle #14 (ADR-0061): a cross-role rule gets a principle as the single owner. Agents are routinely dispatched without `development-principles.md` loaded (the #167 precedent, restated in ADR-0061), so the principle alone would not reach them; each agent or skill body that acts on a red carries its own short restatement and cites the principle.

### F2 — the validator names unreached chain steps by default and runs them only when asked

**Chosen, Option A:** "name by default, run the rest only when asked."

When `commands.validate` is a chain and a step fails, `validator.md` has the validator name every step that never ran. The step map is the top-level `&&` split of the command string, read and not executed. If the string uses `;` or `||` or is a single wrapper, the validator reads `package.json` once to expand an `npm run` script; otherwise it says the step map is not visible and never writes "the rest passed". Only when the dispatch asks for a full result does it run the unreached steps, one at a time after the chain stopped, and leave Overall at FAIL. Each such step keeps its `NOT RUN` label and adds the individual result with its exit code, never a bare PASS. The first metered full-result runs wrote lines such as "schema: PASS (not reached by the chain; run individually)", which a reader skimming the label reads as a chain pass, the misreading this decision exists to prevent; the rule was tightened to keep the label.

`validate-changes` now opens the surfaced report with a tally of step statuses and never presents a run with a `NOT RUN` step as "everything passed"; it offers a full-result re-dispatch. `plan-task`'s inline-gate bullet says the same for an orchestrator running `commands.validate` itself: later steps are `NOT RUN`, not passed, so run each remaining step before treating the gate as "known red only" or green.

The existing "Exit early" rule is split, not repealed. A step failure among independent checks is not catastrophic. Catastrophic is a failed step whose output later steps consume (install, build, codegen, a load or syntax error), and later steps then stay `NOT RUN (depends on <step>)` even on a full-result dispatch.

**Rejected, Option B:** "always run the remaining steps" — doubles cost on every red, conflicts harder with "Exit early", and #724 makes it opt-in.

**Rejected, Option C:** "name only, never run" — drops #724's full-result request; plan-task's known-red gate would then need the orchestrator to run the steps every time.

### F3 — a distinct `NOT RUN` status

**Chosen, Option A:** "a distinct `NOT RUN` status."

`NOT RUN` (upper-case, case-sensitive) joins the status family `PASS / FAIL / SKIPPED` that the validator reports for project-specific checks, alongside the verdict vocabulary of ADR-0034 and ADR-0043. It is defined against SKIPPED: SKIPPED means the tool ran and reported skipping itself; `NOT RUN` means it never started because the chain stopped. A step with no evidence in the output that it ran is never PASS, and a run with any `NOT RUN` step is never reported as everything passed.

**Rejected, Option B:** "reuse SKIPPED with a reason clause" — collides with "Don't skip checks"; a skipped tool and an unreached tool read the same.

### F4 — order the work and observe the tree

**Chosen, Option A:** "order the work and observe the tree, still graded by the validator."

`validator.md` now runs its work in a fixed order: `commands.validate` verbatim and on its own (never in a parallel batch, never in the background); on a failure, a single re-run of only the failing step, where a pass is reported as "did not reproduce on re-run" with no diagnosed cause; then any `NOT RUN` steps the dispatch asked for; and only then the acceptance rows whose own command builds, packs or generates into the tree. Those rows run one at a time, with `git status --porcelain` read before and after each, and a row that left the tree changed is reported so the orchestrator restores it. No step runs more than twice and the whole chain is never re-run. Before returning, the validator self-checks its report: summary totals agree with every figure in the prose, emitted rows equal the denominator and subtotals sum to it, and PASS + FAIL + SKIPPED + NOT RUN equals the number of chain steps. A contradiction that survives one re-derivation is stated at the top of the report and Overall is not PASS.

**Rejected, Option B:** "tree-writing rows out of scope, discharged by the orchestrator" — contradicts #408's "Not proposed".

**Rejected, Option C:** "no re-run, report the raw failure" — #408 asks for one re-run.

### The read-only exemption, amended

The validator's rule against changing repository state previously exempted only running `commands.validate` verbatim. It now also exempts running each `&&` step verbatim when a dispatch asks for a full result, and a pledged acceptance row's own command. Everything else in the rule, including principle #14's list of forbidden git commands, is unchanged.

### #408's "Restore the tree between phases" is superseded

#408 proposed that the validator restore the tree between phases. That cannot be done within the validator's contract: restoring a tree that a row has changed needs `git restore`, `checkout` or `clean`, which the validator's own rule forbids and which the `git-state-guard` hook (`plugin/hooks/lib/git-state-guard.mjs`) denies for `gvt-dev:*` agents (ADR-0061). The validator instead observes (`git status --porcelain` before and after) and reports a row that left the tree changed, and the orchestrator, which owns the index and the commit (ADR-0008), restores it.

### F5 — the harness drives the real validator headlessly

**Chosen, Option A:** drive the harness with `claude -p --plugin-dir plugin --agent gvt-dev:validator`.

`validator-evals/` is a metered harness that runs the real validator agent against fixture repos with a failing chain, and a grader that checks the returned report for step naming, status vocabulary and self-consistency. Its grader has a unit test, and that test is part of `commands.test` and `commands.validate`.

**Fallback, Option B:** "main session dispatches via the Agent tool and returns the report verbatim" — adds a paraphrase layer.

**Rejected, Option C:** "go through `/gvt-dev:validate-changes`" — the grader would read the skill's summary, not the validator's report.

## Compromise

The F1, F2, F3, F4 and F5 alternatives above were rejected for the reasons given with each.

**Principle #15 applied to the harness itself.** The first metered runs showed the grader's token-matching checks flagging correct validator prose: statements such as "no step is NOT RUN", "4 ran, 0 NOT RUN" and "once `types` passes" matched a pattern meant for a step reported as not run or passed. That was a false red from the harness, the failure the principle describes. The checks that matched on a bare status token were made structural, matching a step label, a separator and then the status, and were pinned against real validator output in the grader's unit test, so a check that flags a correct report now fails that test.

**Longer validator prose has a cost.** The validator runs on a small model, and the added rules (run order, the step-map rule, the self-check, the exemption) compete for its attention with the rest of the body. The harness is how that cost is measured, not a guarantee it stays small.

## Consequences

Every `gvt-dev` agent that grades or acts on a red now has the rule in its own body, and `validate-changes` and `plan-task` no longer let an unreached step read as passed. A consumer whose `commands.validate` is a chain sees `NOT RUN` rows after a mid-chain failure where it previously saw the failure alone.

The metered harness is not in CI: it spends model calls and needs a local `claude`. Only its grader unit test runs there, so a regression in the validator's behaviour is caught when someone runs the harness, not on every change. Review of the harness also found grader false greens (a per-line exit check, an Overall check that matched any FAIL word, and a case-insensitive status match), fixed with pinned tests.

Five other sites also run `commands.validate`: `rebase-branch`, `rebase-stack`, `split-branch`, `release-npm-package` and `create-adr`. They are out of scope here and left to #611 and #718.

**Related records:** ADR-0061 (principle #14 and the `git-state-guard` backstop, the model for a cross-role principle with per-agent restatements, and the reason the tree cannot be restored by the validator); ADR-0030 and ADR-0031 (rules kept in skill bodies, and why this one is not); ADR-0034 and ADR-0043 (verdict and status vocabulary that `NOT RUN` joins); ADR-0079 (the shared block, identical text in both files); ADR-0008 (the orchestrator owns the index and the commit).
