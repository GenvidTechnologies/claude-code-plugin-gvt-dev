---
type: decision-record
title: 'A count row accounts for every writer of the counted population: one group-2 lead in `designer.md`, mirrored in `planner.md`, both graders and `plan-task`; ADR-0037''s tripwire holds'
description: 'designer.md item 8 group 2 gains an eighth lead for count-pinning rows, mirrored in the planner, the validator, the code-reviewer and plan-task, plus a named decayed sub-case.'
tags: [decisions, criteria-authoring]
status: stable
---
# 0079. A count row accounts for every writer of the counted population: one group-2 lead in `designer.md`, mirrored in `planner.md`, both graders and `plan-task`; ADR-0037's tripwire holds

- **Status:** accepted
- **Date:** 2026-10-16
- **Issue:** #711 (canonical), with #708, #622, #715, #464 as spanned siblings

## Context

Rows that pin a count were repeatedly found defective during execution and amended in the open under
ADR-0017. Each failure had the same root: the row's expected value counted the population the *action* touches,
and missed another writer of that same population. Four shapes had been filed separately:

- **#711** -- a plan's own later gates (the end-of-run review, a task that adds tests) grew a test population
  that the row had pinned as an exact total, and a source-text count (`grep -c "^  it("`) stood in for what the
  runner would actually run.
- **#708** -- a new test carried a platform or privilege guard, so the pledged absolute pass count was
  unreachable on a platform where the guard skips it.
- **#622**, two halves. (a) A count of tests made by grepping the source text, which misses generated tests.
  (b) An absence assertion whose fixture seeded the very key the row said was absent.
- **#715** -- an exact literal count that ignored a place the design's own mechanism writes the literal (a gate
  beside each toggle), so the number was wrong the moment it was written.

A fifth gap sat in `plan-task`. #464 found that the later-task sweep, which re-runs absence rows after each
task, did not re-run rows that pin a count, so a count row could be green at a per-task gate and red at the
final gate. #556 carried two extras on top of #464: a class for a row made false by an approved scope change,
and a count-row re-check when a decision record is authored. #556 is closed with reason "not planned" and
carries the comment "Duplicate of #464"; its two extras were folded into this change rather than lost.

`designer.md` item 8 group 2 -- *Is the expected value right?* -- held seven leads when this was found. Several
of them already touch part of the problem (the satisfiable-alongside-the-deliverable bullet, the
own-literal-command bullet that says to sum the whole deliverable, the zero-hit bullet), but none states the
question once: who else writes this population?

## Decision

**Option A (recommended): one group-2 lead, 'every writer of the counted population', with five sub-bullets, mirrored in the planner, both graders and SKILL.md :253.** In the shipped text the lead opens "A count pins the size of a population, so its expected value must account for every writer of that population". An absence is treated as the zero case of a count. The lead cites the three neighbouring bullets by name instead of restating them, and adds no fourth "Prefer the count".

The five sub-bullets are one per writer:

1. **Gates the plan schedules after the pledge (#711).** Test populations are open. Pledge each named new test
   present, `fail 0`, and a floor of baseline plus the sum of new tests, with a title-survival check. An exact
   total only where the row's own text says **closed set**.
2. **Generators (#622a).** Count tests, and show presence, through the runner (`--grep` or
   `--test-name-pattern`), or state the naming constraint the row relies on.
3. **Skip guards (#708).** Read each new test for a platform or privilege guard; give the count per platform, or
   pledge `fail 0` with every new id present and passing or skipped by its guard. A floor counts passing plus
   skipped.
4. **The design's own mechanism (#715).** An exact literal count comes from the spec, counting every place it
   writes the literal, gates included, with the derivation stated in the row. Where the literal recurs inside
   the construct, scope to it.
5. **The test's own setup (#622b).** An absence assertion checks the fixture first; if the fixture seeds the
   key, assert deep-equals the seed plus absence of a key only the code under test writes.

**Mirrors.** `planner.md` item 12 gains a sub-bullet citing the lead by its opening phrase, with five named
defects, each corrected under `## Premise corrections` as **defective**: the planner holds the task list, the
test files and the plan's gates, and counts the end-of-run code-reviewer as a gate that may add tests. The
validator and code-reviewer carry a byte-identical paragraph, "Grade a count row by the bound it states, not
only by the number you measured." It makes a floor satisfied by any measurement at or above its bound, a
declared closed set exact, and a test skipped by a guard the row itself names present; an unnamed skip is
`not satisfied`. The two critics must not split on a floor, a declared closed set or a guard-skipped test, which
is why the paragraph is identical and not paraphrased. The code-reviewer also gains one sentence: a test its own
findings recommend that would flip a declared-closed-set row is surfaced as the conflict, "and never withhold
the recommendation to keep the row true."

**`plan-task`.** The later-task sweep in the Phase 3 correction rule now re-runs every row pinning a count or
tally, not only absence rows (#464), says that the remedy of scoping to the construct or restating as a
**direction** is not specific to co-dispatch, and says that in a pledged row a direction is a floor because the
final review can still add tests. Two add-ons from #556 follow.

- **Add-on 2(a), a named sub-case.** **Option a1 (recommended): a named sub-case of decayed, added as a new paragraph right after :257. :257 itself is byte-unchanged.** The label is "decayed -- falsified by scope change": a row true when pledged and made false by a scope change approved after the pledge. If the falsifying task was in the plan at pledge time the row is defective on arrival instead. This tightens ADR-0017's pre-commitment, because the evidence must cite a recorded scope decision; a scope change with no recorded decision does not qualify, and moving a criterion for an unrecorded reason is the silent move ADR-0017 forbids.
- **Add-on 2(b), the Phase 4 step 6 re-check.** Step 4 pledges the criteria before step 6 authors the decision record, so the record is a later writer for every pledged count row whose corpus could include the resolved decisions directory or its index. Step 6 re-runs those rows before the record is committed and classifies any it falsifies: defective if the record was in the plan at pledge time, "decayed -- falsified by scope change" if it was folded in later. The record's own criterion is no substitute.
- **Add-on 1, a stale pointer.** `designer.md` carried a prose pointer to "line 97's property (c)" that this insertion would have made wrong. It now cites the bullet by content ("property (c) in the bullet above: anchor the 'before' to a commit"). It changes no tracked pointer. The design weighed no alternative for either 2(b) or add-on 1.

## ADR-0037 axis result

ADR-0037's Consequences give the test in two steps: *"first, does the new rule fit an existing group's axis --
extend that group's bolded-lead chain ... second, if it opens a genuinely new axis no existing group name
covers, that is this record's own fire condition restated one level up -- a sixth named group, not an appended
bolded lead inside one of the five that already exist."* Every one of the five rules answers group 2's own
question, *Is the expected value right?* -- a count whose number is wrong is the plainest case of it. Step one
resolves, step two never fires. **Group 2 is extended by one lead and there is no sixth group.** Measured shape:
group 2 went from 7 leads to 8, and the group count stayed at five.

## Compromise

**Rejected: Option B (alternative): in-place extensions only, no new lead.** Reason: one population question is spread across four leads and two groups, the test-vs-literal boundary has no single home, the planner and graders must cite 4–5 owners, :91 and :93 grow further, and ADR-0050 rejected exactly this kind of merge.

**Rejected: Option C (alternative): a sixth group, *'Does the counted population hold still?'*** Reason: under ADR-0037's own test, every one of the five rules answers group 2's question, *Is the expected value right?*

**Boundary between the test rule and the literal rule.** Chosen: **B1, by who can grow the population (recommended)**,
with the question "would a test the plan's own review gate might recommend move this number?". If yes, the
population is open and the row takes a floor; if only the design's own mechanism writes it, the count is an
exact literal derived from the spec.

- **Rejected: B2, by command (runner → test rule, grep → literal rule).** Reason: `grep -c "^  it("` becomes an exact literal count, reproducing #711's C2 failure.
- **Rejected: B3, declaration only (every count row declares open or closed, with no default).** Reason: boilerplate on every non-test count, and the planner can check only that a declaration exists; its "state what closes the set" part is kept inside B1.

**Rejected for add-on 2(a):**

- **Option a2: a fourth top-level class inside :257's list.** Reason: it rewrites (4)'s list and its "the three read alike" framing, unsettles every "defective rather than decayed" instruction in planner.md item 10/12 and SKILL.md Phase 3, and adds a class whose fix is the same as decayed's.
- **Option a3: routing only, with no name.** Reason: it gives no named class.

**Accepted cost: group 2 now carries eight leads.** ADR-0050 already recorded the group at five and warned that it
was closer to a bucket than an axis. Eight is a real increase, and the catch-all argument is stronger than it was.
It is accepted because the new lead consolidates a question that was previously scattered, and it adds one lead
where Option B would have grown four.

## Consequences

- **Future count-row rules extend this lead's writer list.** A new way for a counted population to change
  (a writer not yet named) is a sixth sub-bullet here, not a new lead; a reviewer checks the five before adding.
  `planner.md` item 12 and the two graders' paragraph change in step.
- **Tension with the "Prefer the count" steer, which is unchanged.** A count is still the preferred evidence
  because it fails loudly at zero. A floor keeps that property -- a floor is still a count that fails loudly at
  0 -- but it no longer fails when the population grows, which is the point. A reader should not take the lead as
  a retreat from counts, only from exact totals over an open population.
- **Placement is a ratchet decision.** Every insertion in this change sits below the lines other documents cite
  by line number (the digest pointers in the designer, planner, validator, code-reviewer and `plan-task`
  skills, and the ambiguous ones in ADR-0022). The pointer-anchor ratchet therefore stayed unchanged: 98 findings,
  98 kept, 0 added, 0 pruned, with no `--rename`, no `--accept-new` and no hand edit. The `plan-task` sweep edit
  is made in-line so no lines shift. If a later edit lands above a cited line, move the edit; do not re-take the
  ratchet (ADR-0050).
- This repo dogfoods the designer, planner and graders from the installed plugin cache, so the rules take
  effect here only after a release and a `/plugin update`; the run that authored them could not exercise them.
  The same limitation ADR-0037 recorded.

## Regression worksheet

Each original row from the four shapes, the shipped rule that fires on it, and the amended form on which none
fires. Each original is the positive control for its rule and its amended form the negative control. Graders
apply the shipped agent text, not this table.

| Row | Original | Fires (designer sub-bullet / planner defect) | Amended form | Fires |
|---|---|---|---|---|
| #622 T7 | ``grep -c 'it("#293'`` ≥6 | generators / source-text count (it is a floor, so the gates rule does not fire) | `npm run test -- --grep "#293"` → ≥6 passing, `fail 0` | none |
| #622 T2 | "`story:scene1` is undefined" (fixture seeds it) | setup / seeded-key absence | deep-equals the seed, plus a key the code writes is undefined | none |
| #711 C1 | `mocha … → 63 passing` | gates / exact test total | `fail 0`, ≥63 passing (baseline + Σ new), named tests present via `--grep` | none |
| #711 C2 | `grep -c "^  it(" … → 58` | gates and generators / exact total and source-text count | runner: `fail 0`, ≥58 passing, named titles present via `--grep`, pre-change titles survive | none |
| #708 R14 | `≥356 passing, 0 failing (341+12+3)`, with O65 guarded | skip guards / platform-unreachable | `fail 0`; passing + pending ≥356 (341+12+3); 15 ids present, O65 passing or skipped by its win32/root guard | none |
| #715 R16 | `grep -cF 'layer="OptionDBase"'` → 2 | mechanism / underived literal | `grep -B1 -F 'set-layer-interactive(layer="OptionDBase"' f \| grep -cF 'layer-name-exists(layer="OptionDBase")'` → 2 (one gate above each of 2 toggle sites) | none |
| #715 R32 | `grep -cF 'instance-variable=numOptions, comparison=5 (≥), value=4'` → 1 | mechanism / underived literal | → 2 (2 = one per site, c4 + c5) | none |
