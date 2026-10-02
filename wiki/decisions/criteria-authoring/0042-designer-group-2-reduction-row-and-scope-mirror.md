# 0042. `designer.md` item 8 group 2 gains a fourth lead (#367) and three extensions (#328/#340/#371); ADR-0037's tripwire holds

- **Status:** accepted
- **Date:** 2026-08-22
- **Issue:** #328, #340, #367, #371 (designer half)

## Context

Four issues converged on the same cluster — `designer.md` item 8, group 2, *Is the expected value right?* — and shipped together in
commit `a6441ea`. Three extend existing bolded-lead text in place; the fourth (#367) is a new rule with no existing owner. This record
is the group-2 half of that commit; the sibling group-5 addition (#370, the whole-table prose screen) has its own companion record.

- **#328** asked whether the satisfiable-alongside tell (the "new decision record citing a now-closed issue," "rationale sentence naming
  the rule," pattern) already covered a criterion anchored to an absolute line number or an `NR==N`-scoped range. It does not: a
  positional anchor fails a *different* way than the count/zero shapes the tell already named.
- **#340** asked whether the pinned-total sub-bullet's floor remedy (`≥` the measured baseline) carries to the byte-exact-sentence
  alternative that same sub-bullet offers for individually pinned sites. ADR-0038 decision (7) found it did not, named the gap a
  "seam," and filed the one-clause fix separately rather than folding it into that record's own change.
- **#371 (designer half)** asked whether the narrower-corpus baseline defect (a figure measured on one file, asserted across a directory)
  had a mirror on the *grading* side — a row graded over a corpus wider than it asserts over, which passes for the wrong reason.
- **#367**, filed from a consuming-repo retro (`c3source` #81), found a reduction row (`grep -c X` `N` → `0`, or → `M < N`) whose pattern
  spans occurrences with different truth values — some stale, some a correct historical mention of the same token. Such a row is
  satisfiable by deleting whichever occurrences are cheapest, and nothing in it says which were meant. `c3source` #81 shipped exactly
  this: an implementing agent reworded an accurate version-history entry to make a `grep -c` land on the target count, destroying a
  true statement while grading green.

## Decision

**Three of the four extend existing text in place; #367 adds a new peer lead at the end of the chain.**

- **#328** extends the satisfiable-alongside bullet's tell with a third shape: alongside a total-occurrence count and a repo-wide zero,
  an absolute line number or an `NR==N`-scoped range is also the wrong shape when the deliverable inserts or removes a line above the
  region measured. This is a limiting case of the same tell, not a new rule — the tell already asks "does the deliverable itself move
  what the criterion measures," and a positional anchor answers yes the same way a count or a zero does, only **silently**: the row
  still evaluates, against the wrong line, so it measures the wrong thing rather than erroring. Its remedy differs accordingly — not a
  floor over a baseline, but re-expression against a **content anchor** the row re-derives (`grep -n <markup-free span>`). The planner
  side of this rule shipped earlier and independently: `planner.md`'s task-list cross-check already asks *"Will this task's own
  deliverable … shift a line number a row anchors to?"* — so before this commit only the designer half was unshipped; #328 closes that
  half, not a symmetric pair.
- **#340** extends the pinned-total sub-bullet: a `grep -c` on a byte-exact sentence is still a count, and citing an individual site
  still moves it — the byte-exact form is chosen precisely when individual sites matter, which is exactly what makes it move. Surviving
  sentences now pin as **`≥1`, not `=1`**, so the floor the whole-file-count case already had extends to its individually-pinned
  alternative. This directly closes the seam ADR-0038 decision (7) left open (see Amendments below).
- **#371 (designer half)** extends the narrower-corpus bullet with its mirror: a row *graded* over a corpus wider than it asserts over
  passes without establishing anything. The narrow case fails loudly — the count comes back low and someone looks. The wide case fails
  in the **safe-looking direction** — more hits, comfortably over the threshold, no reason to look twice — so a world where the work
  landed is indistinguishable from one where it did not. A row naming a scope now states that scope in terms a grader can act on.
- **#367** is a **new bolded lead**, appended as the last bullet of group 2's chain (the peer immediately before the *Can it be
  evaluated, and when?* group header): a reduction row is only a criterion once every matched occurrence is one the change is supposed
  to remove. It states explicitly why the existing zero-over-a-corpus bullet doesn't already reach it — that bullet is scoped to a zero
  over references to what the change itself retires, and its pair-it-with-a-structural-check clause narrows the criterion but does not
  say *which* hits were meant, which is a different failure than a reduction whose target was never zero. The operative step: run the
  row's own command with `-n` and read every hit; if they do not all describe the same defect, scope the pattern to the site that must
  change, or pair the reduction with an explicit survival assertion.

**The ADR-0037 fire test was applied to #367 and does not fire — no sixth named group.** ADR-0037 decision (1) established the test is
an axis trigger, not a count trigger: a new bullet fires the tripwire only if it opens a question none of the five group names can
honestly house. #367's question — is the expected value right for a row whose target count must move for some occurrences and not
others — is squarely group 2's own axis, *Is the expected value right?* It extends that axis rather than opening a new one, the same
way the scope-trap and comparison-control rules ADR-0038 recorded did not fire the tripwire either. This record is that same finding
for #367, restated for the reader who reaches this record before ADR-0037 or ADR-0038.

**#367's placement, and why the issue body's own proposed slot was wrong.** #367's `## Proposed change` section said to insert the new
bullet "after `:92`" — the pinned-total sub-bullet. That slot is inside `:90`'s nested sub-list (`:91` and `:92` sit at indent 5,
sub-bullets of the count-baseline-vs-corpus-scope lead at indent 3); inserting there would have **reparented the new rule under an
existing lead**, making it read as a further shape of the pinned-total case rather than a peer question about reduction rows. The
issue's own `## Triage corrections` section identifies this directly, with a measured `awk` indentation table, and names the corrected
slot: the next indent-3 sibling, at the end of the chain — "adjacent to the count-baseline rule it complements" was offered as the
alternative, and the end-of-chain slot (after the corpus-scope mirror #371 adds) is where it landed. The body is internally
self-contradicting on this point; the triage correction, not the `## Proposed change` section, is the authority a future reader should
follow. **Do not "restore" the `## Proposed change` section's stated placement** — it is the corrected error, not the intended design.

**Architecture — how this fits ADR-0036/0037/0038.** No new phase, gate, schema, or scanner: this is the same `designer.md` item 8 /
`planner.md` item 12 Test Criteria cluster ADR-0036 and ADR-0037 established and ADR-0038 already extended once. Three of the four
issues are citer-side refinements of rules ADR-0038 and earlier records already own; only #367 mints new text, and it does so as
ADR-0037's own regroup anticipated a future lead would — extending an existing group's chain, tested against the fire condition, and
confirmed not to trip it.

**Lead distribution.** Before this commit, item 8 carried **2/3/2/2/1 = 10** bolded leads (ADR-0038's figure, itself a correction of
ADR-0037's original 9). #367 is this commit's only new top-level lead in group 2, bringing it to **2/4/2/2/1 = 11**. The same commit
also lands #370, group 5's second lead (the whole-table prose screen against planned new text), which is this record's sibling — see
its companion record for that addition. Combined, the commit brings the cluster to **2/4/2/2/2 = 12**; this record's own contribution
is the move from 10 to 11.

## Compromise

Alternatives considered and rejected:

- **Folding #367 into the pinned-total sub-bullet as a further shape**, per the issue body's literal "after `:92`" instruction. Rejected:
  it would reparent a peer question about *which* occurrences are correct as a sub-case of a rule about *whether* a total should move
  at all — the issue's own triage correction identifies this as a structural error, not a stylistic preference, since `:91`/`:92` are
  indent-5 sub-bullets of `:90` and the new rule shares neither parent's premise.
- **Widening the existing zero-over-a-corpus bullet to also cover reductions**, rather than a new lead. Rejected, per the reasoning #367
  itself states and this record repeats: that bullet's scope is references to what the change retires, with a
  pair-it-with-a-structural-check remedy that narrows the criterion but never says which hits were meant — a genuinely different
  failure shape (a target count that must move only in part) that the existing remedy does not reach even after widening its prose.
- **Firing ADR-0037's sixth-group tripwire for #367.** Rejected: the axis test is squarely group 2's own question, so the tripwire's fire
  condition — a question no existing group name can honestly house — is not met, the same verdict ADR-0038 reached for its own two
  additions.
- **Treating #328 as opening a symmetric designer/planner pair.** Rejected: `planner.md`'s task-list cross-check already carried the
  line-shift question independently of this commit, so #328 is a one-sided closure (designer catching up to planner), not a new pair
  minted together.

## Consequences

A future editor adding a rule to group 2 checks this record's four entries first for what is already owned: the satisfiable-alongside
tell now covers positional anchors (#328) as well as counts and zeros; the pinned-total floor now carries to the byte-exact-sentence
form (#340, closing ADR-0038 decision (7)'s seam); the corpus-scope rule now states both the narrow-baseline and wide-grading failures
(#371); and a reduction row is not yet a criterion until every matched occurrence is confirmed to share the same defect (#367).

Group 2's lead distribution is **11** after this record, **12** after the sibling group-5 record for #370 — see that companion record
and the forward corrections this record adds to ADR-0037 and ADR-0038 for the earlier figures they each stated.

`planner.md` item 12 is unchanged by this commit; all four issues land as designer-side text only. A planner-side mirror, if any of the
four turns out to need one beyond what #328 already found shipped, is out of scope here.
