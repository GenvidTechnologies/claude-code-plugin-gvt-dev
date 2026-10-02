# 0046. `plan-task`'s `## Execution (Post-Approval)` section regrouped into four named labels, on density rather than an axis trigger

- **Status:** accepted
- **Date:** 2026-08-22
- **Issue:** #267 (canonical, cluster umbrella); companion record to this cluster's content-binding ADR
  (`docs/decisions/0044-*.md`), which owns the ownership decisions for #392, #391, and #299 this record does
  not restate

## Context

`## Execution (Post-Approval)` had grown into a flat chain of unlabelled trailing paragraphs — roughly 26 lines
and ~13KB of continuous prose — read *mid-execution* by an orchestrator hunting for one specific rule among the
chain. Three more paragraphs were arriving in this same cluster: #392 ("an implementer can pass a gate by
narrowing what the check can see"), #391 ("no execution-side backstop for a criteria row a later task in the
same plan falsifies"), and #299 ("no discipline for amending a pre-committed criterion found defective during
execution"). Landing three more paragraphs onto an already-dense flat chain was the trigger for regrouping it,
the same density problem `designer.md` item 8 had already solved via ADR-0037's five named groups.

## Decision

**Four named labels shipped in `9622ffd`, inserted between the section's existing paragraphs with every
paragraph left byte-identical:**

1. *The index is shared — a co-staged task's work is entangled with its siblings'*
2. *What an implementer authored does not certify itself*
3. *A later step can falsify an earlier claim*
4. *The pledged target itself can be defective*

Each of the three arriving rules maps onto one of these labels rather than minting new ones: #392 extends
label 2's chain (a self-authored verification tool narrowing its own field of view is a variant of "what an
implementer authored does not certify itself"), #391 extends label 3's chain (a later task falsifying a pledged
criteria row, not just a comment, is the same later-step-falsifies-an-earlier-claim shape one level up), and
#299 is the first paragraph under label 4, which the regroup deliberately shipped empty in anticipation of it.
Both extensions and the new paragraph landed in the following commit, `b71957f`, on the same branch.

**The technique, and why it is safe.** Insertion-only: `git show --numstat 9622ffd` → **8 insertions, 0
deletions**, one file. No existing paragraph was edited, no heading was added, and the numbered steps 1–6 were
untouched. `grep -c '^## \|^### '` against `plan-task/SKILL.md` stayed at **12**, unchanged. This mirrors
`c27fb5c`, the commit that regrouped `designer.md` item 8 into ADR-0037's five named groups — `git show --numstat
c27fb5c -- plugin/agents/designer.md` → **13 insertions, 0 deletions for 5 labels**.

**The label-to-line ratio is not 1:1.** Four labels cost 8 lines, not 4, because each label needs a blank-line
separator on both sides to render as its own Markdown block. `c27fb5c`'s 13-for-5 ratio already carried this
same 2-lines-per-label-plus-one-extra shape and was available as the confirming precedent before this change
shipped. Recorded here because a future editor planning a regroup by counting labels, not lines, will
under-budget the diff — the dispatch brief for this very change originally pledged "4 insertions, 0 deletions"
for four labels and had to withdraw that figure as unsatisfiable once measured (see Consequences).

**Contiguity was verified before inserting.** The four labels map onto the existing paragraph order without
reordering anything — the property that keeps this a 0-deletion change. A regroup requiring reordering would be
a different and more dangerous change: reordering is deletion-and-reinsertion, not insertion, and loses the
byte-identical-paragraph guarantee this decision leans on.

**Label 4 shipped empty, deliberately, not as an oversight.** Its own paragraph (#299) was known to be arriving
in a later commit on the same branch (`b71957f`) before `9622ffd` was authored. Shipping the label ahead of its
first paragraph let the intervening extensions (#392, #391) and the new paragraph (#299) land against a
structure already in place, rather than each landing commit re-deciding where its own text belongs.

**Runs after the P0 re-anchor, per ADR-0037 decision (4)'s ordering.** `9622ffd` lands after `c17bbec` (the P0
citation re-anchor from `file:line` to quoted-text form) rather than before it, so no commit in this branch's
history carries a citation this insertion decayed — the same "re-anchor first, insert second" discipline ADR-
0037 recorded for `designer.md`'s own regroup, applied here to whatever prior record cited `plan-task/SKILL.md`
by line number into this section.

## Compromise

**The honest counter-argument, not papered over.** ADR-0037 decision (1) is emphatic that the regroup trigger
for `designer.md` item 8 is an *axis* trigger, not a *count* trigger — a sixth bolded lead sharing an existing
group's shape does not fire it; a genuinely new question the existing groups cannot ask does. `## Execution` had
no recorded tripwire and no issue asking for a regroup at all. Of the three rules arriving here, only #299 opens
a genuinely new axis (the pledged target's own correctness can be defective, not merely decayed or unmet) —
#392 and #391 are siblings of already-shipped paragraphs under labels 2 and 3, extending existing chains rather
than opening new ones. Read against ADR-0037's own test, two of the three arrivals would not, on their own,
justify a new label.

So this regroup's case rests on **density and on the labels being free** (0 deletions, contiguous insertion,
no paragraph edited) — not on an axis argument. That is a real difference from `c27fb5c`, whose regroup (ADR-
0037) had an explicit tripwire pre-recorded in ADR-0033 and evaluated against a named fire condition in ADR-0034
before it fired. This regroup has no equivalent standing authorization.

**This was therefore escalated to the user as an explicit fork rather than decided by the designer**, and the
user chose to regroup. That provenance is recorded here deliberately: a future reader should see that the
weaker-precedent path — density alone, no recorded tripwire — was taken knowingly, with the decision made by the
person who owns the trade-off rather than inferred by the agent doing the work.

Alternatives considered and rejected:

1. **Keep the flat chain and append #392 and #391 as two more unlabelled paragraphs, giving #299 its own `###`
   sub-heading.** Cheaper, and it avoids the "regroup with no recorded trigger" objection entirely. Rejected:
   it would leave nine unlabelled trailing paragraphs in the section — worse density than the six that prompted
   this decision — and a `###` sub-heading inside `## Execution` would break the section's uniform paragraph
   shape, setting a structural precedent for one issue (#299) rather than for the section as a whole.
2. **Wait for an axis-shaped arrival before regrouping**, honouring ADR-0037's test literally and leaving the
   flat chain in place until then. Rejected by the user's explicit choice at the escalated fork: the density
   argument was judged sufficient on its own merits for this section, even without a recorded tripwire.
3. **Regroup now but reuse `designer.md`'s five label names**, on the reasoning that both sections serve the
   same acceptance-criteria-integrity cluster. Rejected: the two sections answer different questions at
   different points in the pipeline — `designer.md` item 8 grades a Test Criteria table's rows before they are
   pledged; `## Execution` governs what an orchestrator does *after* approval, mid-run, across co-staged tasks
   and later-falsifying steps. None of the four labels that shipped here map onto any of the five that shipped
   there.

## Consequences

`## Execution` now has a named-group structure, so a future addition is classified against these four labels
the way a `designer.md` addition is classified against its five (ADR-0037's own Consequences section states that
test): extend an existing label's chain, or justify a fifth. Unlike `designer.md`, this section's next classifier
does not have a recorded axis tripwire to check against — the precedent this decision sets is density-based, so
a future editor weighing a fifth label should expect the same escalate-to-the-user step this one took, not a
mechanical axis test.

Two corrections surfaced while executing this change, both recorded on the executing task's plan (`#267`) rather
than left implicit: the branch's own survival-floor baseline for one of the five pre-existing paragraph leads was
wrong (stated as 1, measured as 2 — the same paragraph is quoted a second time elsewhere in the file) and was
raised to the measured floor rather than left at the weaker figure; and the dispatch brief's "4 insertions, 0
deletions" constraint for four labels was unsatisfiable by construction (see Decision) and was withdrawn — no
pledged acceptance-criteria row depended on it, and the property that row does grade, 0 deletions, held.

This repo dogfoods `plan-task` from the installed plugin cache. The version this change ships will not take
effect here until a release and a `/plugin update` — the run that authored this regroup could not exercise it,
the same limitation ADR-0037 recorded for its own change to the sibling section.
