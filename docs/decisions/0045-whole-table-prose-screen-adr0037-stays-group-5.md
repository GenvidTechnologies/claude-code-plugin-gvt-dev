# 0045. The whole-table prose screen extends group 5, not a sixth group — and the planner mirror was folded in by decision, not declined

- **Status:** accepted
- **Date:** 2026-08-22
- **Issue:** #370 (canonical), with #391 as the execution-side backstop and the planner mirror
  folded in on the same issue by user decision

## Context

`designer.md` item 8's Test Criteria cluster already carried a set-level check (ADR-0037's
group 5, *Do the rows cohere as a set?*) that reads the assembled table's rows against each
other. #370 asked for a second, related check: read the assembled table against the same
change's own **planned prose**, not just against its other rows — the case a banned-literals
list cannot reach, because a row can pin a span (a grep-support clause on a manual-read row,
not only a must-not-touch survival row) that a later bullet in the same plan then quotes,
making the row unsatisfiable by construction. ADR-0038 decision (7) already documented this
exact failure firing once, on T12c, and named the gap in its own `## Consequences` as a
directive for the change that would close it. #391 is the execution-side backstop: the same
collision can also arrive from a *later task in the same plan*, after the designer's
authoring-time screen has already run. `planner.md` item 12 gained a tenth sub-bullet
covering the mirror case at transcription time — a scope the issue's own acceptance criteria
did not ask for.

The decisions landed in three commits on this branch: `a6441ea` (`designer.md`, the new
group-5 lead), `d396e22` (`planner.md`, the named-subject widening plus the item-12 mirror
sub-bullet), and `b71957f` (`plan-task/SKILL.md`, the execution-side backstop paragraph under
"A later step can falsify an earlier claim"). This record is the durable home for two
decisions a future editor of this cluster would otherwise have to re-derive: whether ADR-0037's
sixth-group tripwire fires here, and why the planner mirror shipped despite being outside
#370's own asked-for scope.

## Decision

**(1) ADR-0037's sixth-group tripwire does NOT fire. This is an explicit verdict, not a
default — ADR-0037's own Consequences require the test be applied, not skipped.** ADR-0037
states the test as two ordered steps: does the new rule fit an existing group's axis (extend
that group's bolded-lead chain), or does it open a genuinely new axis no group name covers
(mint a sixth group, with its own record). Applying it here: **extend group 5.** Four reasons:

- **The precedent's fire condition was a granularity jump, not this one.** #305 fired the
  tripwire in ADR-0037 because it moved from *per-row* to *cross-row* — every group name
  recorded at that time (ADR-0033's original three) asked a per-row question, and none could
  honestly house a check that reads the whole table as a set. Group 5 now exists precisely to
  answer that whole-table question. #370's counterparty differs from #305's — the change's own
  planned prose, rather than another row in the same table — but the *granularity* that made
  #305 unhouseable in 2026-08-16's cluster is exactly the granularity group 5 was built for.
  #370 does not repeat #305's jump; it lands inside the group #305's jump already created.
- **A one-member group gaining a second member is the ordinary extend case**, named first in
  ADR-0037's own `## Consequences`: *"does the new rule fit an existing group's axis — extend
  that group's bolded-lead chain."* Group 5 held exactly one lead before this change; adding a
  second peer lead under the same group name is the unremarkable branch of the test, not the
  one that needs a new record to justify.
- **A sixth group would fragment rather than organize.** Two adjacent single-member groups,
  both asking a whole-table-level question and differing only in *what* the table is compared
  against (itself vs. the plan's own prose), is the opposite of what five named groups exist to
  achieve — the whole point of the regroup in ADR-0037 was to stop a flat chain of bolded leads
  from reading as an undifferentiated list.
- **Group 2 was weighed and rejected as the alternative home.** The nearest-sounding existing
  rule by subject is group 2's *"A criterion's expected value must be satisfiable alongside the
  change's own deliverable"* bullet — also about a row colliding with the change's own planned
  prose. But that bullet is a **per-row expected-value shape** rule: it asks whether one row's
  count-or-zero shape survives the deliverable, and its own two named remedies (a floor over a
  baseline, a zero scoped to a carve-out) are both about a single row's pass condition. #370's
  observed failure (T12c) was a **manual-read row** whose grep-*support* clause pinned a span —
  a shape group 2's per-row expected-value test does not reach at all, since a manual-read row
  has no count or zero to be defeated. Housing #370 there would have required narrowing it back
  down to the counts-and-zeros shape group 2 already owns, discarding the case that motivated
  it.

**(2) Authoring technique: the new lead carries its own reconciliation, so the existing lead
stays byte-identical.** Group 5's existing lead opens *"Every other check in this section is
per-row; this one reads the assembled table as a set"* — a sentence quoted verbatim inside
ADR-0037 itself. Adding a peer lead would ordinarily make that opening false (there are now two
non-per-row checks, not one) and force an edit to a shipped, ADR-quoted clause — decaying a
durable record's own citation the moment the citing text moved. Instead the shipped diff has the
**new** lead carry the reconciliation: *"The bullet above reads the rows against each other;
this one reads them against the prose this same change plans to write — a second whole-table
check, and one the opening clause above does not anticipate."* The existing lead is untouched.
Record this as a reusable technique for this cluster: when a shipped, ADR-quoted clause would be
falsified by an addition, put the reconciliation in the addition, not in the clause being cited.

**(3) #370 discharges a directive ADR-0038 addressed to a future change, and the hazard the
directive names was not hypothetical — it had already fired on this cluster.** ADR-0038's
`## Consequences` states: *"A future change adding a criteria-table coherence check of its own
should screen new prose against the criteria table's own pinned spans, not only against a fixed
list of banned literals, or it can reproduce the same unsatisfiable-row defect this record
documents."* #370 is that change. ADR-0038 decision (7) documents the defect directly: row T12c
pinned `grep -c` at exactly **1** over a sentence the same plan's own new bullet went on to quote
in full — unsatisfiable by construction, the record's own words, *"the mirror of a vacuous row —
a criterion that cannot pass rather than one that cannot fail"* — caught during execution and
amended in the open to **2**.

The screen was executed, not merely cited, against this change's own table. The
byte-identical-preservation technique in decision (2) above is exactly what running the new
group-5 screen against this plan's own prose produces. And every survival row in this plan's
54-row checklist is written as a **floor** (`≥`) rather than an exact pin, precisely because this
change's own prose cites the spans those rows pin — two of the sentences it must cite already
carried a tree-wide count of 2 before any task in this plan started, so an exact-pin row would
have been unsatisfiable on arrival the same way T12c was.

**(4) #391 is the execution-side backstop for the same hazard, arriving after the designer's
authoring-time screen has already run, and it cites rather than re-authors.** #370's group-5
screen runs once, before the table is emitted — it cannot see a collision introduced by a
*later task in the same plan*, since that task's prose doesn't exist yet at screening time.
#391 adds the paragraph plan-task's execution phase needs for exactly that later-arriving case,
under "A later step can falsify an earlier claim." The shipped paragraph **attributes** the
designer's rule by describing it rather than quoting its sentence: quoting the group-2 sentence
directly would have moved its tree-wide count from 2 to 3 and made this plan's own pinned row for
that span unsatisfiable — the same defect ADR-0038 decision (7) documents, this time avoided
rather than reproduced. The commit message states this explicitly: *"That sentence occurs exactly
twice tree-wide and a pledged row pins it at a floor of 2; reproducing it here would have moved
the count and made the row unsatisfiable by construction."* This is #370's own rule, obeyed by
#370's own change, as a worked example rather than a claim.

#391 also carried a premise correction. The issue as filed claimed `plan-task/SKILL.md`
"enumerates exactly two ways a row can be wrong" and that neither existing enumeration reached
the later-task case — true of `SKILL.md`, but not true of the plugin as a whole: `designer.md`
already stated the authoring-side failure mode (group 5's original lead). The sharper finding,
recorded here rather than left implicit, is that **a rule that already existed on the authoring
side did not fire on the execution side** — the subject of separate issue #328, not of #391.
#391 was re-scoped during planning to the execution side only: the new backstop paragraph, not a
restatement of the authoring-side rule.

**(5) The planner mirror (`planner.md` item 12's tenth sub-bullet) was folded in by deliberate
user decision, widening scope beyond what #370 itself asked for — record this honestly rather
than as a natural consequence of #370.** #370's own acceptance criteria named no planner-side
work. The design phase considered the planner-side mirror and recommended **declining** it and
filing a separate follow-up issue, following ADR-0036 decision (4)'s precedent of recording a
deliberate carve-out for a future issue rather than pre-empting scope no issue asked for. The
user chose instead to fold the mirror into this change. The shipped sub-bullet states the
rationale for why the mirror is not redundant with the designer's own screen: *"the designer's
whole-table screen runs before the table is emitted and cannot see a correction that does not
exist yet"* — a planner's own Phase-3 premise correction (`## Premise corrections`) can introduce
the same collision the designer's screen exists to catch, and only the planner is positioned to
catch that instance, for the same capability-cut reason ADR-0037's placement fork gave for
shipping the designer's and planner's set-coherence checks as a pair rather than a single site.
The sub-bullet cites `designer.md` group 5's second bullet rather than re-authoring its
reasoning, consistent with the cite-and-repeat convention this cluster has followed since
ADR-0033.

This fits the existing architecture as a further extension of `designer.md` item 8 /
`planner.md` item 12's five-named-group Test Criteria cluster (ADR-0037) and of the plan-task
execution-phase cross-checks that cluster already feeds (ADR-0021, ADR-0030, ADR-0038) — no new
phase, gate, schema, or scanner, and no sixth question-group.

## Compromise

Alternatives considered and rejected:

1. **Firing ADR-0037's sixth-group tripwire** and adding a new named group for the
   prose-vs-table screen. Rejected per decision (1): the granularity that made #305
   unhouseable in the original three-group cluster is exactly the granularity group 5 already
   answers; #370's check differs from group 5's existing lead only in what the table is read
   against, and a sixth group here would fragment two whole-table checks apart rather than
   keep them organized together.
2. **Housing the new check in group 2** (*Is the expected value right?*), as an extension of
   the "satisfiable alongside the deliverable" bullet. Rejected per decision (1): that bullet is
   scoped to a single row's count/zero pass condition, and #370's motivating failure (T12c) was
   a manual-read row with no count or zero to defeat — housing it there would have required
   narrowing the check back to the shape that had already failed to catch the defect.
3. **Editing the existing group-5 lead in place** to acknowledge the second check, rather than
   having the new lead carry the reconciliation. Rejected per decision (2): the existing
   opening sentence is quoted verbatim inside ADR-0037; editing it decays a durable record's own
   citation the moment this change ships, where the alternative (reconciling in the new text)
   costs nothing and preserves the citation.
4. **Quoting `designer.md`'s group-2 sentence directly in the #391 backstop paragraph**, rather
   than attributing it by description. Rejected per decision (4): the sentence is pinned at a
   tree-wide floor of 2 by this same plan's own criteria table; quoting it would have moved the
   count to 3 and made that row unsatisfiable by construction — reproducing the exact defect
   ADR-0038 decision (7) already documents and this change exists to prevent.
5. **Restating the authoring-side rule in `#391`'s paragraph** on the theory that the issue's
   own "exactly two ways a row can be wrong" framing needed a full third enumeration written out.
   Rejected per decision (4): the rule already exists on the authoring side (`designer.md`
   group 5); the gap #391 needed to close was the missing execution-side backstop, not a missing
   statement of the rule — restating it would have duplicated group 5 rather than extending the
   cluster's cite-and-repeat convention.
6. **Declining the planner mirror and filing a follow-up issue**, per the design's own
   recommendation and ADR-0036 decision (4)'s carve-out precedent. This was the design's proposed
   path. The user chose to fold the mirror into this change instead — recorded per decision (5)
   as a deliberate widening, not a default, so a future reader sees it was chosen rather than
   drifted into.

## Consequences

A future editor extending group 5 checks decision (1)'s test first: does a new rule share group
5's whole-table granularity (extend the chain, as this change did) or does it open a genuinely
new axis no group name covers (the sixth-group tripwire, still unfired as of this record).
Group 5 now carries two leads — the original set-level read (rows against each other) and #370's
addition (rows against the change's own planned prose) — and the byte-identical-preservation
technique from decision (2) is the pattern to reuse the next time an addition would otherwise
falsify a clause an ADR quotes verbatim.

`planner.md` item 12's tenth sub-bullet means the planner-side mirror ADR-0036 decision (4)'s
precedent would have deferred is now shipped rather than open. A future editor does not need to
track a separate follow-up issue for it; the design's declined recommendation is superseded by
the user's decision recorded here.

The T12c-shaped hazard ADR-0038 decision (7) first documented is now covered on three sides:
authoring time (`designer.md` group 5, this change), transcription time (`planner.md` item 12,
this change), and execution time (`plan-task/SKILL.md`'s later-step backstop, #391). A future
criteria-coherence gap in this cluster is more likely to be a genuinely new axis than a fourth
instance of this same shape.
