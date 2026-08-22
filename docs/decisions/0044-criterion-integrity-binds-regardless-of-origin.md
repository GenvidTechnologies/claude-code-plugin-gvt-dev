# 0044. A criterion's integrity obligations bind regardless of who authored it or when

- **Status:** accepted
- **Date:** 2026-08-22
- **Issue:** #378, #398, #299, #269, #359, #392 (siblings under #267)

## Context

The criteria-integrity cluster's obligations — re-derive against the live tree, verify a named subject by reading it, run a positive
control, mark a row's timing correctly — had all been written assuming one path: a criterion is authored by the designer, transcribed
by the planner, and cross-checked by `plan-task`'s Phase-3 gate before the checklist ships. Six issues asked what happens when that
assumption breaks. A row can be authored by the orchestrator itself, mid-run, with no designer's draft behind it to cross-check against
(#378, #398). A row can cite a governing document — an ADR, a documented convention, a `CLAUDE.md` rule — rather than a function or a
file, which none of the four existing named-subject sites covered by name (#359). A task can author its own verification tool and grade
its own done-when by that same tool's report, with nothing forcing the tool's scope to stay honest (#392). A checklist can reach the
self-audit gate having been reconstructed from the design's prose rather than transcribed from its table, with nothing in the checklist
naming that failure (#269). And a pre-committed criterion, once pledged, can turn out to have been wrong the moment it was written —
not decayed, not merely unmet — with no stated procedure for fixing it in the open rather than either leaving it broken or quietly
moving it (#299).

Shipped in `b71957f` (`plan-task/SKILL.md`), `f7a036d` (`approval-and-audit.md`), `d396e22` (`planner.md`), `85b7436` (`analyst.md`),
`a6441ea` (`designer.md`, the owner site), `9681544` (`validator.md`), and `f0ac604` (`code-reviewer.md`) — Refs #267.

## Decision

**The obligations attach to the criterion, not to the path that produced it, the actor who wrote it, or the moment it was written.**
Every decision below is an instance of that one sentence, resolved on its own facts rather than as a blanket restatement.

**(1) #299 — a pre-committed criterion found defective during execution is amended in the open, never quietly.** ADR-0017's
pre-commitment means the target cannot move *silently*, not that it cannot move at all. `plan-task/SKILL.md`'s "The pledged target
itself can be defective" paragraph states four properties that must hold together: **(a)** the **protected requirement** — the thing
the row exists to establish — is verified by a check **independent of the row's own literal**, so the fix corrects the measurement
rather than loosening the target; **(b)** the amendment is recorded in the **durable acceptance-criteria artifact** (the issue body,
not only the session transcript) — the original expectation, the defect found, and the evidence that established it; **(c)** the
amendment is **surfaced to the reviewing gate** explicitly, so it is itself graded rather than silently absorbed into an
otherwise-passing run; **(d)** **defective** (wrong the moment it was written) is named as distinct from **decayed** (right once, the
tree moved under it) and from **unmet** (the row is fine, the work just isn't done).

This discipline was independently reinvented three times before #299 gave it one written home. ADR-0035's "Criterion amendment"
paragraph amended a row asserting two files "unchanged" to a floor once a co-planned issue needed one of them changed, recorded the
supersession explicitly on the issue body, and named the move as following "the discipline #299 proposes" — written before #299's own
paragraph existed. ADR-0038 decision (7) caught a row pinned at an exact count of 1 that its own change's new prose had already moved
to 2, corrected it in the open on #324, and distinguished the fix as *defective* (the row was unsatisfiable by construction, not merely
stale) rather than *decayed*. #245's section-writeback rule (ADR-0032) — when a new acceptance-criteria checklist supersedes an
existing one on an issue body, open the replacement with a mapping from old items to new, naming any criterion the original couldn't
have contained — is the same discipline applied to the artifact-writeback mechanics rather than to the row's content. Three ad-hoc
reinventions, each solving the same problem from its own angle, is the argument for writing the rule down once rather than leaving a
fourth editor to reinvent it again.

**(2) #378's two secondary asks.** First: a Phase-2 scope change large enough to need a genuinely *new* criterion — not a correction to
an existing one — **re-enters design** rather than being hand-authored at the checkpoint, per `plan-task/SKILL.md`'s "Every integrity
rule above hangs off the same moment" paragraph. A criterion minted at the checkpoint with no design behind it skips the authoring-time
rules `designer.md` item 8 exists to enforce (corpus match, positive control, evaluability), so the checkpoint is the wrong place to
mint one — only to correct or measure one.

Second: `MUST BE MEASURED` does **not** become a marker token. It was considered and rejected. `[point-in-time]` and `[not-yet-due]`
mark rows the **graders** must treat differently at grading time — a row whose moment has passed, or whose truth is anchored to a
single commit. An owed baseline is a different shape: it is discharged **before** the pledge is written, at the checkpoint itself, so
no grader downstream ever sees an unmeasured row at all. Naming it would mint grader-side vocabulary no issue asked for, and would
misdescribe a checkpoint-time discipline as a grading-time one. Recording the verdict and the reasoning here is deliberate — a future
reader hitting the same "why not just mark it" instinct should find the answer already settled rather than re-open the question.

**(3) #359 — the fifth site, `plugin/agents/analyst.md`, was added against the issue's own instruction, deliberately.** #359 names
`analyst.md` and says it "should not be swept into this change." It was widened anyway, at analyst.md's "Verify what you name before
you emit it" bullet, because that file already carried the same named-subject rule with a **variant enumeration** — "a function,
handler, module, command, or flag" — module in place of tool, differing from the other four sites' wording before this change touched
any of them. Excluding it would have shipped a fifth copy that disagreed with the four being widened, which is a worse outcome than the
scope creep the issue was trying to avoid: a find-and-replace across the other four sites (SKILL.md's "A behavioural claim has no value
to re-derive" paragraph, approval-and-audit.md's "Premises cross-checked against the artifacts they modify" item, designer.md's "A
claim about what a named subject does" bullet — the owner site — and planner.md's "Transcribe the wording; do not transcribe a claim
that has gone stale" bullet) would have missed `analyst.md` entirely, since it never matched the string being replaced. The variant
enumeration was **preserved, not harmonized** — `analyst.md` still reads "module" where the other four now read "tool" — because
harmonizing it was never asked for by any of the six issues in this cluster.

A consequence worth flagging for a future search: the exact shared span **"a function, tool, handler, command, or flag"** no longer
occurs at any of the five sites — widening a list necessarily breaks its own exact span, at every site it widens. A future criterion or
grep keying on that literal string will find nothing at any of them; the five sites are now identified by **"governing document"**
instead, which each site's widened text does carry.

**(4) The `approval-and-audit.md` premise carve-out — its "Premises cross-checked against the artifacts they modify" item — was crossed
deliberately, its premise having expired.** ADR-0036 decision (4) and ADR-0038 decision (4) both reserved this file's behavioural-claim
sentence byte-exact "for #239," and ADR-0038's Compromise 2 declined an in-place widening partly because it would have been that
sentence's **third** widening. `f7a036d` widens it anyway, for #359. This is not a lapse in either prior record: **#239 is now closed**
(verified before this widening landed), so the reservation's own premise — an open issue with an unresolved axis reserving the sentence
— no longer holds. And #359's axis is not #239's: #359 widens the sentence's *subject* (which named things a behavioural claim can be
about — now including a governing document), while #239 asks whether a **prescribed verification command** can ever pass at all, an
axis about the neighboring "Measured figures re-derived by executing them" item, not this sentence. Crossing the carve-out for a
different axis than the one it was reserved against does not consume #239's reservation; #239, still open at the time of this record,
still owns its own eventual widening of the same sentence along the executable-command axis. This record is the durable pointer so a
future reader of ADR-0036 or ADR-0038 does not find a live carve-out that reads as silently violated.

**(5) #392 — a task that authors its own verification tool can pass by shrinking the tool's field of view.** `plan-task/SKILL.md`'s
"What an implementer authored does not certify itself" section states the rule: never let a done-when be graded **solely** by the tool
the same task authored — pair it with a **red→green transition on a pre-existing, independently-known defect**, or with a **corpus the
agent does not choose**. The motivating case: a link-checker reported `checked=44` against a file that in fact contains 9 links — the
tool's walk had been narrowed to a scope that excluded a known-dead link, so the gate went green while the defect it existed to catch
sat outside the tool's own field of view. The cheap smell named in the rule is exactly that mismatch: a reported item count that does
not match the corpus the row names, which is visible without re-running anything.

This is the **scope** sibling of a blind spot the same section already records for **timing**: *"a check that is green from the start
never enters the recorded expected-red set."* Both gaps share the same shape — a task controls a property of its own gate (when it
turns red, or how wide it looks) that the gate's own report cannot reveal was narrowed. Neither is caught by the gate passing; both are
caught only by an independent probe the task did not construct.

**(6) #269 and #398 — the same headline applied to provenance rather than to timing or authorship.** #269 adds a sixteenth item to
`approval-and-audit.md`'s self-audit checklist — "Acceptance criteria are transcribed, not reconstructed." Nothing in the prior fifteen
items caught a checklist that traced to a paraphrase of the design's prose rather than to the designer's own `## Test Criteria` table —
the two provenance-adjacent items already there (premises cross-checked, acceptance criteria recorded) govern a row's *truth* and
*whether the checklist was written*, never *where its rows came from*. #398 adds the fourth bullet to the full-proposal shortcut's
"issue that's already a full proposal" section — "Criteria authored on this path have no designer's table behind them": criteria
authored on that path have no designer's table behind them at all, so a row there can be **born** in conflict with a documented
convention rather than **decayed** from a true one, and neither of the shortcut's two neighboring gates (the artifact check, the
measured-claim check) reaches a claim about *how* a row will be verified. Both are the same integrity discipline the rest of this
record states for authorship and timing, applied to provenance: a criterion's obligations do not relax because it arrived by a shorter
or less-scrutinized path than the designer's table.

## Compromise

Alternatives considered and rejected:

1. **Minting a `MUST BE MEASURED` marker token for an owed baseline (#378).** Rejected per decision (2): `[point-in-time]` and
`[not-yet-due]` are grading-time vocabulary for a row the *graders* must treat differently; an owed baseline is discharged before the
pledge is written and no grader ever sees it, so a marker here would be vocabulary no issue asked for and would misdescribe a
checkpoint-time discipline as a grading-time one.

2. **Excluding `analyst.md` from the #359 widening, honoring the issue body's own instruction to leave it alone.** Rejected per
decision (3): the file already carried a variant copy of the rule that a find-and-replace across the other four sites would not have
reached, so excluding it would have shipped a fifth copy disagreeing with the four being widened — a worse outcome than the scope
growth the issue was trying to avoid. Its variant enumeration ("module" for "tool") was preserved rather than harmonized to the other
four, since harmonizing it was outside every issue in this cluster.

3. **Continuing to treat `approval-and-audit.md`'s "Premises cross-checked against the artifacts they modify" carve-out as binding,
deferring #359's widening until #239 explicitly releases it.** Rejected per decision (4): the carve-out's premise was an *open* #239
with an unresolved axis; #239 is closed, and #359's axis (behavioural claims about a governing document) is not #239's axis (an
executable command that can never pass) in any case. Waiting on a closed issue to release a reservation whose axis it was never going
to address would have blocked #359 for no remaining reason.

4. **Grading a self-authored verification tool's done-when as sufficient on the tool's own clean report (#392).** This is the practice
the new rule forbids, not an alternative genuinely weighed for adoption — recorded here because it is the default a task under schedule
pressure gravitates to, and the rule exists precisely because a clean report proves nothing about a tool whose walk was quietly
narrowed to avoid the hard case.

5. **Rewriting ADR-0036 and ADR-0038 in place to reflect the #239 carve-out's expiry**, rather than adding a forward pointer to this
record. Rejected: both are accepted records of decisions made at the time the reservation was live and correct; the carve-out's status
changed because #239 closed, which is new information those records could not have had, not an error in what they originally decided. A
forward pointer keeps their original decisions intact and durable while directing a future reader to the current status.

## Consequences

A future editor extending this cluster with a new integrity rule checks first whether the rule is scoped to *when* a criterion arrives
(design-time, checkpoint-time, execution-time — decisions 1 and 2), *what kind of subject* it names (a function versus a governing
document — decision 3), or *how* it was produced (a designer's table versus a self-authored tool versus a shortcut's inline authoring —
decisions 5 and 6) — five of the six decisions above are one rule read through three different axes, not three unrelated rules, and a
fourth axis should be checked against this same "attaches to the criterion, not its origin" framing before being written up as
something new. Decision (4) is the exception: it is a procedural finding about a specific reservation's expiry, not a new axis of the
criterion-integrity rule, and does not extend the pattern the way the other five do.

The exact span "a function, tool, handler, command, or flag" no longer exists at any site in the plugin (decision 3); a future search
or a pinned criterion keying on that literal string will find zero hits at all five sites, including `analyst.md`'s own pre-widening
variant, which never matched it to begin with. Search or pin on "governing document" instead, or cite the sites individually.

`approval-and-audit.md`'s "Premises cross-checked against the artifacts they modify" sentence has now been edited twice since its
original creation — ADR-0036's `0c016f1` first added the "extends to a behavioural claim" framing, and this record's #359 widening is
the second — matching the count ADR-0038's Compromise 2 anticipated when it declined to make that widening a "third" edit itself. It
carries no further open reservation as of this record: #239 closed without landing a widening of its own against this sentence. A
future editor touching that item again should confirm no new issue has opened a fresh reservation before assuming the sentence's
current shape is final, the same caution ADR-0036 and ADR-0038 both stated for their own eras.

#392's self-authored-tool rule and the known-red-baseline blind spot it is the sibling of (`SKILL.md`, "What an implementer authored
does not certify itself") should be read together by anyone auditing a task that both builds and is graded by the same mechanism — one
gap is about never having a red moment to record, the other is about never having a corpus wide enough to turn red at all, and a single
task can carry both.
