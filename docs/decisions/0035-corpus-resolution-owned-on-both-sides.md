# 0035. Grader-default and orchestrator-dispatch both own corpus resolution

- **Status:** accepted
- **Date:** 2026-08-15
- **Issue:** #306 (canonical, carries the combined checklist), with #312 as the
  co-planned sibling; #299 named for the criterion-amendment discipline applied
  to this run's own pre-committed checklist

## Context

Two issues reported the same defect shape at different layers of `plan-task`'s
staged-but-uncommitted commit protocol (ADR-0008): a prescribed read of the
git index that the protocol makes vacuous. #306 found it orchestrator-side —
`plan-task`'s co-dispatched-criteria guidance recommended a bare `git diff`,
which under the protocol reads the clean worktree, not the staged index, so
the check reports "no removed lines" or "path untouched" unconditionally,
whatever actually happened. #312 found the mirror defect grader-side: both
`gvt-dev:validator` and `gvt-dev:code-reviewer` graded the pre-committed
Acceptance Criteria checklist (ADR-0017) against "the staged diff" with no
hedge, but `code-reviewer` is dispatched once, at the end of execution, after
every task is already committed — so `git diff --staged` resolves empty there,
and a full sheet of `satisfied` verdicts renders identically to a genuine
clean pass. In both cases a check that cannot fail is worse than no check: it
is a false pass wearing the shape of a real one.

## Decision

**(1) Corpus resolution is owned on both sides — the grader's own default and
the orchestrator's dispatch instruction — not on one alone.** Each grader
agent (`validator`, `code-reviewer`) now resolves which corpus to grade
against before checking a single row, rather than assuming staged: try the
staged diff, fall back to the appropriate committed range, and state which
comparison was actually used. Independently, `plan-task`'s own Execution
section states the general form for any orchestrator-run verification
command — it must read the index, not the worktree, and a "nothing wrong"
result from an empty corpus is not a pass — and the end-of-run
`code-reviewer` dispatch now names the corpus explicitly (the branch diff
against its base) rather than leaving the comparison to the agent's default.
An explicit dispatch instruction is honored over the agent's own default when
the two disagree.

Neither side alone was sufficient, and working out why was the actual design
fork:

- **Grader-side only is insufficient.** `validator` is also dispatched
  standalone by the `validate-changes` skill, with no orchestrator present to
  name a corpus at all. A grader that can only follow an instruction it was
  never given is defenseless there — it has to have a sound default of its
  own.
- **Orchestrator-side only is insufficient.** It fixes the one dispatch site
  that exists in `plan-task` today and leaves the agents defenseless the
  moment a future dispatcher forgets to name the corpus, or a new skill
  dispatches either grader without adopting the convention. It also does
  nothing for the standalone `validate-changes` path above.

**(2) The two graders' defaults deliberately differ, and that is not
inconsistency to harmonize away.** `validator` is normally dispatched by
`plan-task`'s per-task Execution step, before that task's commit — staged is
exactly what's there, so defaulting to `git diff --staged` is correct for it.
`code-reviewer` runs once, at the end of a run, after every task is already
committed — staged is empty there, so it does not share that default and
instead falls back to a committed range (e.g. `git diff HEAD~1` or the
diff's actual span). Both files now say this explicitly, specifically to
block a future edit that "simplifies" the two onto one shared default —
whichever default such a merge picked would silently reintroduce the bug in
the file where it's wrong.

**(3) An empty corpus is reported, not graded — the corpus-level counterpart
to a rule already shipped one level down.** ADR-0034 already
required each grader to report an Acceptance Criteria **section** it could
only partly fetch or read as incomplete, rather than grading the readable
rows and silently dropping the rest. This decision adds the same discipline
one layer earlier: a resolved **diff** with nothing in it is reported as such,
never rendered as a pass. Both files state the two rules must stay
distinguishable — a missing checklist section and an empty diff are different
failures with different fixes, and conflating them (both end in "report,
don't grade") would erase that distinction rather than reinforcing it.

This fits the existing architecture as a refinement of two already-shipped
read-before-grade steps (ADR-0017's fixed-checklist read, ADR-0034's
row-level completeness rule) rather than a new phase, gate, or schema — both
grader files gain a corpus-resolution paragraph ahead of their existing
per-row grading loop, and `plan-task` gains one general-form paragraph in its
Execution section plus a corpus-naming clause on its one dispatch site that
needed it.

**Criterion amendment.** #306's pre-committed checklist (this run's own
ADR-0017 artifact) carried a row asserting `validator.md` and
`code-reviewer.md` stay unchanged — accurate while #306 was planned alone,
unsatisfiable once combined with #312, whose entire subject is changing both
files. The row was amended in the open on the issue body — from "these files
are unchanged" to "the correct `git diff --staged` form survives in both,"
a floor rather than a pin — preserving what the original row actually
protected while letting #312 land. Not silently dropped: the issue body
carries an explicit supersession map naming the amendment, following the
discipline #299 proposes for correcting a pre-committed criterion found
defective mid-run.

## Compromise

Alternatives considered and rejected:

1. **Fix only the grader defaults (#312's scope), leave `plan-task`'s
   prescription bare.** Rejected: it does nothing for the false-pass
   already demonstrated at the orchestrator's own co-dispatched-criteria
   check (#306's observed case), and leaves a skill actively recommending the
   form the graders themselves had to work around.
2. **Fix only the orchestrator dispatch (#306's scope), leave the grader
   defaults unhedged.** Rejected: `validate-changes` dispatches `validator`
   with no orchestrator in the loop to name a corpus, so the agent still
   needs a correct default of its own; and nothing would stop a future skill
   from dispatching either grader without adopting the naming convention.
3. **One shared default for both graders**, rather than deliberately
   different per-dispatch-timing defaults. Rejected per decision (2): the two
   graders run at different points relative to the commit — `validator`
   before, `code-reviewer` after — so one shared default is wrong for
   whichever one it wasn't tuned to, and a future "harmonization" edit would
   silently reintroduce the bug this record exists to prevent.
4. **Folding the empty-corpus report into the existing row-level "report
   incomplete" rule**, rather than stating it as a second, parallel rule.
   Rejected: a missing checklist section and an empty diff are different
   failures with different fixes — the first means the *target* can't be
   read, the second means the *evidence* can't be read — and collapsing them
   into one sentence would erase a distinction a future reader needs to act
   on correctly.
5. **Silently dropping the original "files unchanged" row** rather than
   amending it in the open. Rejected: ADR-0017's whole premise is that a
   pre-committed checklist can't be quietly re-aimed at whatever the work
   happened to achieve; dropping the row without a trace would be exactly
   that. Amending it with a stated supersession map, per #299's discipline,
   keeps the correction auditable instead of invisible.

## Consequences

An empty corpus does not error — it renders identically to a clean pass, a
full sheet of `satisfied` verdicts with nothing behind any of them. That is
what makes this a soundness bug in the grading mechanism itself, not an
ergonomics gap: ADR-0017's two-independent-critic design depends on both
critics actually reading something before they render a verdict, and neither
critic's own output shows the difference between "nothing was wrong" and
"nothing was checked."

The two graders' documented defaults now diverge by design (decision (2)),
so a future editor touching either file should re-read both before changing
either's corpus-resolution paragraph — matching them would be the recurrence
this record was written to head off, not a cleanup.

`plan-task`'s Execution section carries the general index-vs-worktree rule
once, rather than restating it at every numeric-criterion callout in the
file; the co-dispatched-criteria prescription and the end-of-run
`code-reviewer` dispatch each get a short pointer clause instead of a
repeated explanation.
