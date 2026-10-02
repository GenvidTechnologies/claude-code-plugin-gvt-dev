# 0034. Test-criteria timing markers and matched grader verdicts, split onto two orthogonal axes

- **Status:** accepted
- **Date:** 2026-08-14
- **Issue:** #237 (canonical), with #241, #268, #280, #292, #310 as spanned siblings

## Context

ADR-0033's chain settled whether a Test Criteria row is checkable at all — can
it fail (#259), can it pass (#272/#298), can it be evaluated (#270) — but not
*when* checking it is legitimate, nor what a grader is entitled to conclude
when it can't fully read the row set it was handed. Six issues surfaced two
further, orthogonal gaps: **timing** (#237, #292 — a row asserting a
transition becomes permanently unverifiable after merge, and a row naming an
action outside the branch grades as a false failure at review time — both
authoring-side, decided by the designer/planner) and **outcome** (#241, #268,
#280, #310 — a grader had only two verdicts, so a defective row graded green
and a legitimately-deferred row graded red, and a partial enumeration
rendered in the complete format was indistinguishable from a complete pass —
grading-side, decided by the validator/code-reviewer). Conflating the two
axes into one vocabulary or one gate was the main over-unification hazard
this record resolves.

The guardrails landed in `51e5b3d` (designer), `71f92c6` (planner), `b46f389`
(validator), `91ef48d` (code-reviewer), and `ac10b85` (plan-task), with the
version bumped to 4.13.0 in `35261fe`. This record is the durable home for
the four decisions a future editor would otherwise have to re-derive from the
diff: the verdict vocabulary, where the timing markers live, whether the
commit gate changes, and whether ADR-0033's item-8 restructure tripwire
fires.

## Decision

**(1) Two verdict words, not one and not three.** `unverifiable-as-written`
means the row's own text names evidence that cannot discriminate a pass from
a fail here — a control-less zero-hit condition, or a `[point-in-time]` row
whose moment has already passed. It is a **defect in the criterion**, and at
`code-reviewer` it additionally files a 🟡 Warning naming the defect. `out of
scope` means a `[not-yet-due]` row is sound and correctly unmet at this gate
— a **scoping statement**, not a defect — and it files nothing at any
severity. The two verdicts are steering signals for different actors: one
says *fix your criterion*, the other says *nothing to do here, ask again
later*, and a caller needs to tell them apart mechanically, not by reading a
prose reason.

**(2) The timing markers are inline in the row's own text, never a fourth
table column.** `[point-in-time]` and `[not-yet-due]`, hyphenated. The
planner transcribes each Test Criteria row into a flat one-line `- [ ] ...`
checklist item with no column structure, and `plan-task` Phase 4 splices that
checklist verbatim into the issue body — a column would be dropped at exactly
the transcription boundary the marking has to survive. Hyphenation means no
emphasis marker can land inside a token with no internal space and no line
rewrap can split it — the same markup hazard `designer.md`'s zero-hit bullet
already names for greps run against this design's own prose (the unhyphenated
form `point in time` already has a live unrelated hit in `code-reviewer.md`'s
historical-prose bullet, so the collision risk is not hypothetical).

**(3) The commit gate stays binary.** Neither `unverifiable-as-written` nor
`out of scope` flips `Overall: PASS / FAIL` in `validator.md`, so
`plugin/CONVENTIONS.md` needed no amendment, and the "commits only on pass"
restatements in `plugin/skills/plan-task/SKILL.md` (×2), `ts-implementer.md`,
and `development-principles.md` are untouched. Both new states leave the
checkbox unticked, so nothing about either state reads as satisfied.

**(4) ADR-0033's item-8 restructure tripwire was evaluated and deliberately
not fired.** ADR-0033 recorded restructuring `designer.md` item 8 into three
named groups ("Is the pattern right? / Is the expected value right? / Can it
be evaluated?") as *"the tripwire: if a sixth member arrives for this
cluster, regroup into named sections rather than appending a seventh bolded
lead."* This change adds that sixth bolded-lead bullet (the timing-marker
definition). Not fired, because the new bullet **extends the existing chain**
— can it fail, can it pass, can it be evaluated, and now **when** can it be
evaluated — rather than opening a parallel one, and restructuring would
rewrite text four ADR-0033 issues explicitly asked to leave intact while
putting the byte-exact "Prefer the count" steer at churn risk for no
behavioral gain. **#305** is named as the correct future trigger: it
introduces a genuinely different axis (cross-row satisfiability — whether a
*set* of rows can jointly be satisfied — rather than per-row soundness),
which is what a named-group structure would actually be organizing, and
which this change's chain-extension does not attempt.

This fits the existing architecture as a further extension of `designer.md`
item 8 / `planner.md` item 12's pattern-plus-evaluability cluster on the
authoring side, and as two new Output Format sections plus a shared vocabulary
on the grading side (`validator.md`, `code-reviewer.md`), read by the existing
pipeline on every dispatch — not a new phase, gate, schema, or scanner.
`plan-task` Phase 4 steps 3 and 5 scope both grader dispatches to the markers
and add a closing-summary requirement (rows pledged and graded, verified,
unverifiable-as-written, and out-of-scope-and-still-owed-after-merge), per
principle #12 applied to the pointer `plan-task` makes at what the graders can
report — written after both grader files, not alongside them, so the claim
could be verified against what had actually shipped.

## Compromise

Alternatives considered and rejected:

1. **One verdict word with a reason field**, rather than two. Smaller
   published surface, and both #280 AC 5 and #292 AC 4 pledged to "reuse
   whatever this mints," which one word satisfies most literally. Rejected: a
   single word loses the steering a caller needs — an orchestrator could not
   tell *fix your criterion* from *finish the release* without parsing free
   text, and one case must generate a finding (a Warning) while the other
   must not, a branch nothing would reliably enforce inside a reason field.
2. **Three verdict words**, splitting the expired-moment case (#237's
   `[point-in-time]` past its window) from the control-less case (#241's
   zero-hit-without-control). Rejected: at the grader, both are "the evidence
   this row's text names cannot be produced here" — the same unverifiability,
   just two different reasons for it — so a third term would duplicate a
   distinction the *reason clause* already carries, not add a new one.
3. **Unifying the shipped author-side `unevaluable`** (`designer.md`,
   `planner.md`) with the new grading-side `unverifiable-as-written` into one
   term across both roles. Rejected: it would contradict #241 AC 2 and #280
   AC 5 verbatim, and it would erase a real distinction — `unevaluable` is
   the author's problem, fixable before the row ships; `unverifiable-as-
   written` is a grading-time finding the grader reports but cannot fix. Kept
   as two terms, with one disambiguating sentence in each grader body instead
   of a unifying rewrite — the plugin would otherwise have minted the exact
   parallel term #241 and #280 warned against.
4. **A fourth table column for the timing markers**, rather than inline
   tokens. Rejected per decision (2): the planner's transcription step and
   `plan-task`'s splice step both flatten the row to one line with no column
   structure, so a column is lost at exactly the boundary the marking has to
   survive.
5. **`unverifiable-as-written` flips the commit gate to FAIL.** Rejected: it
   would hard-block every commit for the exact population #241 exists for —
   pre-#218 checklists, already-open issues, consuming repos on a lagging
   cache — and per ADR-0017 the orchestrator cannot rewrite a pre-committed
   pledge to work around that.
6. **Fail-by-default with an explicit override**, rather than leaving the
   gate untouched. Rejected: it is a policy surface the plugin has no
   precedent for, minted for a verdict that has no durable recording home —
   #238 would be that home and is not part of this change. The recommended
   option (decision 3) is the do-nothing option done legibly: an unverifiable
   row can still ship, but it is now named, counted, and filed as a Warning
   rather than passing silently.
7. **Firing ADR-0033's restructure tripwire now**, regrouping `designer.md`
   item 8 into three named sections since a sixth member had in fact
   arrived. Rejected per decision (4): the new bullet extends the existing
   chain rather than opening a parallel axis, so the tripwire's own stated
   condition — a member that doesn't fit the chain — was not met. #305 is
   recorded as the actual trigger, since it introduces the cross-row axis a
   restructure would be organizing.

## Consequences

The rule is duplicated across five files by the repo's cite-and-repeat
default (per `SKILL.md`'s "an agent dispatched standalone may never load the
shared doc, so each inline copy is load-bearing" clause, per ADR-0033's same
convention) rather than centralized in a shared `plugin/docs/` reference: a
shared home was unavailable, not merely unattractive. `grep -c
CLAUDE_PLUGIN_ROOT plugin/agents/validator.md` returns **0**, so a shared
`${CLAUDE_PLUGIN_ROOT}/docs/…` principle would be unreachable text for one of
the two grading-side consumers, and `plugin/agents/*.md` are flat files, so a
validator-local sub-doc is structurally impossible per `CLAUDE.md`. The
accepted cost: a future edit to the underlying rule touches five sites
(`designer.md`, `planner.md`, `validator.md`, `code-reviewer.md`,
`plan-task/SKILL.md`). It is bounded by keeping the **definition** of each
half in only two of those files — the timing markers in `designer.md`, the
verdict outcomes in `validator.md`/`code-reviewer.md` — with the other files
carrying only the literal token and a pointer, not a restated definition.

No scanner enforces any of this — the same premise ADR-0033 recorded for its
own guardrails: whether a row is checkable, when, and what a grader can
conclude are judgment calls no lint rule makes, so this stays documentation
for whoever (human or agent) authors or grades a row.

The vocabulary's whole footprint, for a future editor renaming a token:

```bash
grep -rnoE 'point-in-time|not-yet-due|unverifiable-as-written|fetched section' plugin/
```

Measured audit movement from the three new `bugTracker.readOne`
declarations (`validator.md`, `code-reviewer.md`, `plan-task/SKILL.md`, all
`required: false`): `optional` moved **69 of 81 → 72 of 84**; `required`
stayed **35 of 35**, so the aggregated contract did not widen.

`code-reviewer.md` gains a fifth Output Format section, placed **first**,
before Critical, since the checklist is the pledged target and everything
below it is discretionary review. Its four bucket names (`satisfied`, `not
satisfied`, `unverifiable-as-written`, `out of scope`) are referenced nowhere
outside that file — zero external footprint from that structural choice.

A future editor extending this cluster again should check #305 before adding
a seventh bolded lead to `designer.md` item 8: if the new member shares
decision (4)'s chain shape, extend; if it shares #305's cross-row shape,
that is the tripwire's fire condition.
