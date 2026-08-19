# 0040. Capture-mechanism relocation, property-based prescription, and the self-reversing point-in-time marker

- **Status:** accepted
- **Date:** 2026-08-19
- **Issue:** #317 (canonical), #332, #328

## Context

`plan-task` commits one task at a time under the staged-but-uncommitted
protocol, so a re-execution capture that wants a "before" snapshot cannot get
one from the working tree — it's clean by construction. `designer.md` and
`planner.md` shipped guidance that nonetheless prescribed working-tree git
commands as the capture mechanism; under that execution model those commands
read an empty corpus, so any criterion built on them graded green without
checking anything. `designer.md:98` was worse than a silent gap: it shipped
the broken mechanism as the *worked example* for the `[point-in-time]`
marker, so a designer following the example produced a vacuous criterion by
design, not by accident.

Two commits on this branch fixed the guidance: `f0b70f4` (`designer.md`
lines 97 and 98) and `9c396f4` (`planner.md` line 67). This record is the
durable home for the decisions behind those commits — the plan that produced
them is transient (gitignored, local-only), per development principle #7.

## Decision

**(1) Placement — Option A, chosen over Option B.** The capture mechanism now
lives at `designer.md:97`, the corpus bullet; `:98` is command-free and keeps
only the `[point-in-time]`/`[not-yet-due]` marking guidance. This is a
category-error fix, not a rewording: `:98` is the *marking* bullet, so a
mechanism parked there read as incidental colour and went unaudited across
four releases before this issue caught it. Option B — leave the mechanism at
`:98`, improve its adjacency to the marking text instead — was weighed and
rejected: it would replace this one broken instance without removing the
structural condition (mechanism prose living inside the marking bullet) that
produced it, leaving the same trap for the next mechanism someone adds there.

**(2) The mechanism is stated as a property set, not a command.**
`designer.md:97` now states what any capture mechanism must achieve rather
than prescribing one: (a) reconstruct the pre-change state of every path the
capture reads, including paths the branch added — a pathspec restore adds
and updates files but never deletes ones absent from the source tree (see
`plugin/skills/split-branch/SKILL.md:136`), so it reconstructs the tree only
where the capture is insensitive to their presence; (b) leave the index and
working tree the staged-but-uncommitted protocol depends on untouched; (c)
anchor the "before" to a commit, so it is reconstructible rather than
consumed. One demonstrated form — a detached worktree checked out at the base
commit, capture run there and in the main tree, outputs diffed — is marked
explicitly as an example, not the required command. The rationale is #317's
own failure mode: a command form in guidance gets copied verbatim, so a
prescribed command is the next mechanism to go stale. A property set survives
whatever the next execution model turns out to be; a command doesn't.

**(3) The marking verdict for #227 T2, and it reverses itself.** The repaired
T2 row is **not** `[point-in-time]`. Under the old, broken mechanism the
"before" was consumed by the act of restoring it — genuinely one-shot, so the
marker was *correct for that mechanism*. Anchored to a commit instead (the
new mechanism's property (c)), the "before" survives the branch and the row
is re-runnable after merge, so per `designer.md:104`'s governing criterion
("the anchor decides, not the row's shape") the marker no longer applies.
**Repairing a vacuous mechanism invalidated the very marking the vacuous
mechanism had justified.** This is worth recording explicitly, with its
consequence: the single most likely future edit to this text is someone
"restoring" `[point-in-time]` to the T2 example on the reasoning that it once
carried the marker, which would reintroduce exactly the mismarking
`planner.md:68` exists to catch (a `[point-in-time]` row whose transition no
task actually performs, or — the mirror case here — a row wrongly marked
one-shot when its anchor makes it re-runnable). A diff of the two commits
does not surface this; it has to be stated.

**(4) The pathspec-restore wording is conditional, not blanket — because a
blanket claim is refutable by measurement.** Whether `git checkout <base> --
.` corrupts a capture depends on whether the capture is sensitive to file
*presence*, not just content, and that varies by what changed:

- Against `ba28150` (#227's own diff), two detached worktrees were checked
  out at `ba28150^` and `ba28150`, `node
  plugin/skills/audit-conventions/scripts/audit.mjs` was run in each, and the
  outputs diffed: **10 diff lines, 9 added lines**, all under `### Practice
  Coverage`, matching the byte-identical capture the true pre-change tree
  produces. The main tree was left at **0** porcelain lines throughout; both
  worktrees were removed after. This held because the observable output
  flowed through the modified entrypoint, which the checkout restored, and
  the leftover branch-added file was inert to it.
- Against a purely component-additive change (a new skill/agent file, no
  entrypoint edit), the same pathspec-restore form produces a **0-line
  diff — fully vacuous** — because the branch-added file simply persists
  through the checkout and the capture reads it either way.

So "a pathspec restore doesn't work for additive changes" is not a safe
generalization — it's true for some captures and false for others, and the
guidance says so conditionally rather than asserting a blanket rule the tree
itself contradicts. ADR-0038 Decision (7) is the precedent for writing up a
finding with its measurement attached rather than as an unqualified rule.

**(5) `planner.md:67` gets the sub-bullet, folded in from #328.** #328's
planner-side ask — that the planner, holding the task list the designer
never sees, is positioned to answer whether a task's own deliverable
collides with a row's capture assumptions — was folded into this change
because `planner.md:67` was already being rewritten to cite the corrected
`designer.md:97` mechanism. #328 stays open for its remaining, broader
content; only the capture-mechanism-adjacent slice landed here.

**(6) Owner vs. citer.** The one genuinely new statement this change makes is
*a re-execution capture needs a reconstructed pre-change tree, and here are
the properties it must satisfy*. Everything else is cited rather than
restated, per ADR-0036's one-owner rule: `plan-task`'s Execution section
(`SKILL.md:194`) for the structural-emptiness rule ("a bare `git diff` … is a
check that cannot fail") and (`SKILL.md:181`) for the gate-where-its-moment-
falls rule; `designer.md:104` for the anchor-decides-not-shape criterion;
`split-branch/SKILL.md:136` for the pathspec add-but-never-delete mechanic.
`plugin/agents/validator.md` and `code-reviewer.md` were deliberately **not**
touched — ADR-0035 Decision (2) already records that their corpus defaults
differ from the designer/planner pair on purpose, and this change has no
reason to disturb that.

## Compromise

Alternatives considered and rejected:

1. **`git clean` alongside the checkout**, the remedy #332's own body first
   proposed. **Refuted by measurement, not merely weighed against.** Branch-
   added files are *tracked* (they're staged/committed on the branch), so
   `git clean` — which only removes untracked files — cannot remove them.
   What it *does* remove is the capture's own `before.txt`/`after.txt`
   working files if they aren't yet committed. Adopting this would have
   shipped a third broken mechanism in place of the second.
2. **`git restore --source=<base> --staged --worktree`.** Correct at
   reconstructing the pre-change tree, but it rewrites the **index** —
   fatal under the staged-but-uncommitted protocol, which depends on the
   index holding only the current task's staged work (property (b) above
   exists specifically to rule this out).
3. **A new bolded lead in `designer.md` item 8's group 3**, rather than
   folding the fix into the existing zero-hit-evaluability bullet at `:97`.
   Rejected: a new bulleted line shifts every anchor from `:100` downward,
   invalidating the line-number anchors ADR-0033 and ADR-0038 already record
   against this file. Also, ADR-0037's regroup tripwire does not fire here —
   its trigger is a new axis no existing group name covers, and "which
   corpus does this row's mechanism read" is squarely group 3's own axis
   ("Can it be evaluated, and when?"), not a new one.
4. **A line in `plan-task` Phase 2**, per #332's suggestion. Declined: Phase
   2 has no task list, so it structurally cannot answer "is this mechanism
   executable under the execution model" — that question needs the task
   list, which only Phase 3 (the planner) has. Phase 3's existing obligation
   to re-run a row's control over the corpus it names already surfaces the
   defect at the phase that can actually check it.
5. **Marking the repaired T2 row `[point-in-time]` unchanged**, on the
   reasoning that it carried the marker before this fix and nothing about
   the *row's text* changed. Rejected per decision (3): the marker follows
   the anchor, not the row's shape, and the anchor changed even though the
   row's prose didn't — carrying the old marker forward would ship a
   mismarked row as this very change's own worked example.
6. **A blanket "pathspec restore is unsafe for additive changes" rule**,
   asserted without measurement. Rejected per decision (4): it's disprovable
   against `ba28150` itself, where the same form produced a byte-identical
   capture; a blanket rule would have been wrong exactly where a designer
   would reach for the historical worked example to check it.

## Consequences

A future editor extending the capture-mechanism properties adds a fourth
property at `designer.md:97` alongside (a)–(c), not as a new bullet at `:98`
— decision (1)'s category-error fix means `:98` is reserved for marking
guidance only, and a mechanism detail landing there again reproduces the
exact defect this record exists to close.

A future editor touching the `[point-in-time]`/`[not-yet-due]` marking near
the #227 T2 example re-derives the marker from the anchor (`designer.md:104`)
rather than copying whatever marker a prior version of the text carried —
decision (3) is explicit that this example's own marker reversed once its
mechanism was repaired, so the example is the one place in this cluster where
"what it said last time" is not a safe default.

A future editor prescribing a pathspec-restore-based capture checks which
regime the change under test falls into (entrypoint-mediated vs. purely
additive) before writing the criterion's wording, rather than reusing either
the `ba28150`-style pass or the additive-case failure as a universal claim —
decision (4)'s measured figures are two data points, not a proof that
pathspec restore always works or always fails.

## Documentation coverage

Per development principle #7, this change's coverage across all five
dimensions:

| Dimension | Where it lands |
|---|---|
| Implementation | the agent bodies themselves (`designer.md:97`/`:98`, `planner.md:67`) — these *are* the runtime artifact |
| Design | this record — decision (1), Option A vs. Option B |
| Architecture | this record — decision (6), the owner-vs-citer table |
| Compromise | this record — Compromise items 1–6 (`git clean` refuted by measurement, the index-rewrite rejection, the group-3 line-shift hazard, `plan-task` Phase 2 declined, the marker-carryover trap, the blanket-rule trap) |
| Purpose | `plugin/CHANGELOG.md` `[Unreleased]` entry + the issue back-links above (#317, #332, #328) |

No dimension is N/A.
