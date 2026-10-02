# 0037. `designer.md` item 8 regrouped into five named question-groups, and #305's placement fork resolved to the designer/planner pair

- **Status:** accepted
- **Date:** 2026-08-16
- **Issue:** #305 (canonical); companion record to ADR-0036, which owns the
  three-new-rules ownership table this record does not restate

## Context

ADR-0036 resolved *which rule owns what* for three new general rules added to
`designer.md` item 8's Test Criteria cluster, and named its own decision (3) —
firing ADR-0033's deferred restructure tripwire — as a companion decision with
its own alternatives, deliberately left to a separate record. This is that
record. It owns *where the regrouped cluster lives* and *where #305's
cross-row rule lives*, not the three-rule ownership table ADR-0036 already
settled.

The shipped result: `designer.md` item 8's Test Criteria cluster now reads as
five italic group labels — *Is the pattern right?*, *Is the expected value
right?*, *Can it be evaluated, and when?*, *Can it be settled by reading at
all — or must it be executed?*, and *Do the rows cohere as a set?* — with nine
bolded-lead bullets distributed across them (2, 2, 2, 2, 1). `planner.md`
item 12 mirrors the cluster with eight sub-bullets, the last two added for the
mutation-backing check (#311) and the set-level premise-correction check
(#305). The regroup landed in `c27fb5c` (designer, five group labels inserted,
two left empty); the two counterfactual/empty-collection/set-level rules and
the new step 9 landed in `4183fdb`. Both are on this branch, `main..HEAD`.

## Decision

**(1) It is an axis trigger, not a count trigger.** ADR-0033's tripwire read,
verbatim: *"Recorded as the tripwire: if a sixth member arrives for this
cluster, regroup into named sections rather than appending a seventh bolded
lead."* Its proposed grouping was three named groups — *"Is the pattern
right? / Is the expected value right? / Can it be evaluated?"* ADR-0034 then
added a literal sixth bolded lead (the timing-marker bullet) and declined to
fire the tripwire, reasoning the new bullet *"extends the existing chain …
rather than opening a parallel one."* A pure count reading would have fired
there; it did not, so count was never the operative test. What actually fires
it, per ADR-0034's own restatement in its Consequences section — *"if the new
member shares decision (4)'s chain shape, extend; if it shares #305's
cross-row shape, that is the tripwire's fire condition"* — is an axis test.
This change brings two new axes into the cluster: *execute-vs-read* (#316,
#311 — can the row be settled by reading the tree at all, or must it be
executed once and reverted) and *cross-row coherence* (#305 — do the rows
cohere as a set, not just individually). #305 is in scope in this change, so
the fire condition is met.

**(2) Firing it is a new decision, not a discharge of the recorded one.**
ADR-0033's three recorded group names cannot house what arrived here: #316
and #311 open a fourth question — *can it be settled by reading at all, or
must it be executed?* — that none of the three original names asks, and #305
opens a fifth — *do the rows cohere as a set?* — that is likewise absent from
the original three. The third recorded group, "Can it be evaluated?", was
also widened beyond its recorded name: the timing-marker bullet ADR-0034
added (*"can it be evaluated, and **when**"*) does not fit the bare "Can it be
evaluated?" label without that widening. So this record **supersedes
ADR-0033's §Compromise item 3 grouping while honouring its trigger** — the
trigger fires exactly as recorded, but the grouping it fires into is a new
five-way decision, not ADR-0033's original three-way one.

**(3) ADR-0033's recorded cost estimate no longer applied, and the
re-derivation that found this is the finding that flipped the decision.**
ADR-0033 deferred the restructure partly on cost, stating verbatim that it
*"rewrites shipped text all four issues explicitly ask to leave intact"* and
*"puts the byte-exact 'Prefer the count' steer at churn risk for no
behavioral gain today."* Re-derived against the actual item-8 corpus at the
time this change was authored, that premise did not hold: the three recorded
group names map **contiguously** onto the existing bullet order, so the
labels insert *between* bullets rather than requiring any bullet to be
reordered or reworded. `git show --stat c27fb5c` confirms this directly — 13
insertions, 0 deletions, one file. All six bolded leads shipped before this
change and all three occurrences of "Prefer the count" (confirmed present
verbatim, `grep -c "Prefer the count" plugin/agents/designer.md` → 3) are
byte-identical across the regroup. This is the finding, not an assumption
carried over from ADR-0033 — the cost that justified deferring the restructure
was measured, not merely re-asserted, and it turned out to be zero for the
insertion itself.

**(4) The citation cost was paid up front, in the preceding commit, not
absorbed by this one.** Nine references in ADR-0021, ADR-0033, and ADR-0034
pointed into this text by line number before this change began. They were
converted to quoted-text anchors in `554f0c8`, the commit immediately
preceding `c27fb5c` — re-anchor first, insert second — so no commit in this
branch's history ever carries a citation decayed by the regroup. This ordering
was deliberate, not incidental: had the regroup landed first, every one of
those nine references would have gone stale for at least one commit, exactly
the hazard development principle #12 (*"a pointer is a claim about its target
— verify the target before writing the pointer"*) exists to catch before it
ships, not after.

### #305's placement fork

#305 stated its own fork verbatim: *"Treat 'Phase 4 step 4 vs. `planner.md`
item 12 vs. `designer.md` item 8' as a fork for the design phase to resolve,
not as prescribed here."* Three candidates, three verdicts:

- **`designer.md` — chosen, as the definition side.** The Test Criteria table
  *is* the set the rule reasons about. The designer authors the rows, so it is
  both the earliest point in the pipeline the conflict can be caught and the
  cheapest — a design-time correction costs one edit to a table not yet
  transcribed anywhere else. This is the fifth question-group's rule (decision
  1 above): *"Every other check in this section is per-row; this one reads
  the assembled table as a set, because two rows can each be individually
  satisfiable and jointly unsatisfiable."*

- **`planner.md` item 12 — chosen, as the receiving side, and not a
  redundant mirror.** It is a genuine **capability cut**: a Phase-3 premise
  correction (per `planner.md` item 10's re-derive-and-correct rule) can
  *introduce* a conflict the designer's authoring-time read could not have
  seen, because the correction did not exist when that read happened. Only
  the planner sees the post-correction set — its own text states this
  directly: *"A premise correction you make during transcription can itself
  introduce a set-level conflict the design's authoring-time read could not
  have seen … re-read the assembled set for pairs that cannot both hold, and
  resolve before emitting — the transcription-side counterpart to the
  design's set-level rule, checking what only the corrections could have
  broken."* Both checks ship because each catches a conflict the other
  structurally cannot: the designer's, because it exists before any
  correction; the planner's, because it exists only after one.

- **Phase 4 step 4 — rejected, on the merits of that step's own job, not
  on ADR-0032's grounds.** Three reasons: (a) by the time execution reaches
  Phase 4, a set-level conflict is already transcribed into the pledged
  `## Acceptance Criteria` checklist and one edit away from being committed
  to the issue body — catching it there is strictly later and strictly more
  expensive than catching it at either upstream site; (b) step 4 already owns
  matching, splicing, supersession mapping, and the multi-issue canonical-issue
  rules (per ADR-0029/ADR-0032) — it is a full plate of its own kind of work,
  not a natural home for a *new* kind of check; (c) neither Phase-4 reader
  authored the Test Criteria rows, so neither the orchestrator nor either
  grader dispatched from Phase 4 can say which of two conflicting rows
  *should* win — that judgment call belongs to whoever wrote the rows (the
  designer) or whoever transcribed and corrected them (the planner), not to a
  step that only splices already-decided text.

This fits the existing architecture as a further structural refinement of
`designer.md` item 8 / `planner.md` item 12's already-established Test
Criteria cluster — five named groups now organizing what was a flat chain of
bolded leads, and one new cross-row check on each side of the
design/transcription boundary — not a new phase, gate, schema, or scanner.

## Compromise

Alternatives considered and rejected:

1. **Leaving the tripwire unfired and appending a tenth bolded lead** for
   #305 (and an eleventh/twelfth for #316/#311) to the existing flat chain.
   Rejected per decision (1): the axis test, not a count test, is what ADR-
   0034 named as the fire condition, and #305's cross-row shape is exactly
   that axis arriving.
2. **Reusing ADR-0033's three recorded group names as-is** for the wider
   cluster, folding the new axes into the closest existing name rather than
   naming them. Rejected per decision (2): "Can it be evaluated?" cannot
   honestly house the execute-vs-read question or the cross-row question
   without being stretched past what the name says, which is the same
   conflation hazard the five-group split exists to avoid.
3. **Housing #305's rule at `planner.md` item 12 only**, on the reasoning
   that the planner is the last checkpoint before the checklist is pledged
   and therefore the safer single gate. Rejected: it discards the designer-
   side check entirely, and a set-level conflict already present at
   authoring time — the case ADR-0036's own worked example describes — would
   ship into a design review with no rule catching it until transcription,
   one full phase later than necessary.
4. **Housing #305's rule at `designer.md` item 8 only**, on the reasoning
   that one definition-side check should be sufficient. Rejected per the
   placement fork above: it structurally cannot catch a conflict a premise
   correction introduces after the design was authored, because the design's
   own read happened before that correction existed.
5. **Placing the check (or #305's rule) at Phase 4 step 4.** Rejected on the
   three merits stated in the placement fork above — timing, existing scope,
   and authorship — not on ADR-0032's grounds. ADR-0032's constraint is about
   shipping an *executable recipe* into Phase 4's splice/supersession
   machinery; a prose cross-row read is a different kind of check and is not
   bound by that record.

## Consequences

This repo dogfoods `designer` and `planner` from the installed plugin cache,
currently at 4.14.0. The version this change ships will not take effect here
until a release and a `/plugin update` — the run that authored the five-group
regroup and the #305 placement could not exercise either. This is the same
limitation ADR-0033 and ADR-0034 each recorded for their own changes to this
same cluster, not a defect specific to this one.

A future editor adding a rule to this cluster checks two things in order, now
that it is five named groups rather than a flat chain: first, does the new
rule fit an existing group's axis — extend that group's bolded-lead chain, the
way #316's timing-marker predecessor did in ADR-0034; second, if it opens a
genuinely new axis no existing group name covers, that is this record's own
fire condition restated one level up — a sixth named group, not an appended
bolded lead inside one of the five that already exist. `planner.md` item 12
mirrors the same test on the receiving side: does the new rule extend an
existing sub-bullet's capability-cut reasoning, or does it need a new
sub-bullet of its own the way #305's did.

`designer.md` item 8 and `planner.md` item 12 remain two sites for a future
editor to update together, per the cite-and-repeat convention ADR-0033 and
ADR-0036 both already record for this cluster — this record adds no new site
and removes none.

**Forward correction:** the nine-bolded-lead distribution stated in Context
above (2, 2, 2, 2, 1) is superseded. ADR-0038 first corrected it to
2/3/2/2/1 = 10; ADR-0042 and its companion record for #370 carry it further,
to 2/4/2/2/2 = 12 — see those records for the current figure.
