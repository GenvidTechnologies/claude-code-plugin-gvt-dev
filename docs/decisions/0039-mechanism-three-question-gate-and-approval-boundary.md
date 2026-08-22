# 0039. A prescribed mechanism gets three questions, reaches every ticket type, and plan approval is distinguished from execution approval

- **Status:** accepted
- **Date:** 2026-08-17
- **Issue:** #198 and #248 (mechanism gate), #350 (approval boundary)

## Context

#198 and #248 were planned and executed as one change (branch
`plan-task-mechanism-gate-and-approval-boundary`) alongside a third, narrower
issue, #350. `plan-task`'s mechanism check previously asked only whether a
prescribed mechanism was **current** — superseded by shipped code. #248 and
#198 each found that insufficient in a different way a passing "is it
current?" doesn't catch: a mechanism can be live, un-superseded, and still
structurally unable to satisfy the issue's own acceptance criteria (**Is it
sufficient?**, #248); and a full proposal prescribes *a* mechanism, not
necessarily the best one, with an absent open-questions section being no
evidence of a settled design (**Was it ever the best option?**, #198).
Separately, #350 reported a run that answered an `AskUserQuestion` about
design forks and read it as a go-ahead to implement — nine tasks and two
commits, no separate execution approval.

The decisions landed in four commits on this branch: `74359ed` (extracts the
mechanism-supersession check into its own paragraph, ungated from "For
feature tickets" so it reaches bug tickets too — pure verbatim relocation,
preparatory for the three-question gate), `a06ac1f` (splits the check into
the three questions, adds the dependency-behavior/call-ordering reach, and
deletes rather than sharpens the shortcut's duplicate clause), `049a839`
(states the plan/execution approval distinction at four sites), and `c412f1b`
(version bump to 4.17.0). This record is the durable home for the surface
decisions — which file, which section, which owner — a future editor of this
cluster would otherwise have to re-derive from three issue threads and four
commits.

## Decision

**(1) The three-question guidance stays in `plan-task/SKILL.md`'s Phase 1
paragraph and its Shortcuts-section mirror; it does not get promoted into
`development-principles.md`'s stale-mechanism corollary (principle #8).**
Promoting it was genuinely considered — "un-superseded ≠ sufficient" reads
like a fact about any tracking item, not just a `plan-task` concern — and
rejected on **audience**, not reachability. A repo-wide grep for the
corollary's existing footprint —
`grep -rn "prescribed mechanism\|mechanism check\|mechanism superseded\|stale-mechanism" plugin/ docs/ --include=*.md | grep -v CHANGELOG.md`
— returns **7 sites**. Two of them cite the corollary for a materially
different purpose than the one this change addresses:
`plugin/agents/issue-triage-analyst.md:54` (the `issue-triage-analyst`'s
per-issue enrichment step) and `plugin/skills/triage-issues/SKILL.md:313-314`
(the `triage-issues` mutation-recipe step) both cite it to **detect an issue
body that prescribes a mechanism and offer to rewrite it to outcome +
acceptance criteria** — a concern about how a *tracking item is written*.
This change's three questions are a **plan-time re-verification technique**
(read a dependency's shipped `dist` for call ordering; check a mechanism
against the issue's own stated acceptance criteria; route an unweighed fork
to `AskUserQuestion` citing `gvt-dev:build-probe`) consumed only by the
planning skill. Widening the shared corollary with that detail would push
planner-only technique into a paragraph two triage components read for an
unrelated reason. A middle option — one added sentence in the corollary
naming the insufficiency, with the technique itself staying in
`plan-task/SKILL.md` — was also considered and rejected: it fragments this
change's two sharpenings across two files and mints a fourth statement of a
rule (see below) that already has three.

**(2) #198's axis is owned by the mechanism gate itself, not by the "Classify
each open question" block it was originally proposed against.** #198 proposed
its rule as a bullet inside the open-questions classification step
(`plugin/skills/plan-task/SKILL.md`'s "Classify each open question before
resolving it" bullet). It landed instead as the third question of the
mechanism gate (`SKILL.md:68`, mirrored at the shortcut, `SKILL.md`'s "The
same three questions apply to a full proposal" bullet), with only a one-line
pointer sub-bullet left at the classification block (`SKILL.md`'s *"An issue
with no open-questions section resolves this classification block
trivially… That's exactly where the mechanism gate above earns its
keep…"*). The blind spot #198 names is *observed* at the open-questions
block — an absent section produces nothing to classify — but the *check* it
calls for is a claim about the **mechanism's soundness**, not about the
questions, so the gate is where the rule belongs and where it stays
discoverable alongside Q1 (currency) and Q2 (sufficiency).

**(3) The full-proposal shortcut's duplicate mechanism-check clause was
deleted, not sharpened.** Before this change, the mechanism-supersession
check was stated once at Phase 1 and restated, near-verbatim, inside the
shortcut's requirements-adoption bullet (the `SKILL.md`'s "issue that's
already a full proposal" bullet era). Sharpening both copies in place would
have left them free to drift again — which is precisely how #248 records
the original gap survived (a Phase-1-only fix in an earlier change never
reached the shortcut's copy). `a06ac1f` deletes the shortcut's inline
restatement and replaces it with a new bullet (`SKILL.md`'s "The same three
questions apply to a full proposal" bullet) that states the three questions
once, at the shortcut, and closes with an explicit cross-reference to the
Phase 1 gate rather than repeating its prose. Exactly two statements exist
now, one per reading path (Phase 1 at `SKILL.md:68`, Shortcuts at
`SKILL.md`'s "The same three questions apply to a full proposal" bullet),
never three.

## Also recorded

**The reconciliation itself.** #248 and #198 are questions 2 and 3 of one
family, not competing rewrites of the same paragraph — because **Q2
(sufficiency) and Q3 (best-option) both fail silently under a passing Q1
(currency)**. A mechanism can be un-superseded and still fail either later
question, and nothing in the Q1-only check would surface that. That shared
failure mode is why the three questions ship as one gate (`a06ac1f`'s commit
message states this explicitly) rather than as three independent bullets
scattered across the skill.

**The ticket-type finding, named in neither issue.** The supersession check
sat inside the Phase 1 paragraph scoped to *"For feature tickets"* — so the
gate structurally never reached a bug ticket, even though #248's own
motivating case (`construct3-chef#151`) is a P2 bug. Preparatory commit
`74359ed` extracted the check into its own standalone paragraph (a
byte-identical relocation apart from trimming a trailing space), placing it
above the feature-ticket paragraph where both bug and feature tickets reach
it.

**The fourth approval-boundary site, named in no issue.**
`plugin/skills/plan-task/approval-and-audit.md:11` stated plan approval in
wording — *"Wait for explicit approval before creating the branch or making
any changes"* — that reads as authorizing execution, not just Phase 4.
`049a839` found it by walking every checkpoint statement in the skill after
#350 named three (the full-proposal shortcut's combined checkpoint, Phase
3's checkpoint, and the simple-tasks shortcut, which had no checkpoint
statement at all) and confirmed a fourth existed in the shared self-audit
doc every path reads.

**The B1/B2 distinction now stated at all four sites.** Plan approval
authorizes Phase 4 only (saving `plan.md`, creating the branch, writing the
acceptance-criteria checklist, the prep commit) and stops there. The first
implementer dispatch needs its own separate, explicit **execution approval**,
taken as its own turn under `## Execution (Post-Approval)`. Conflating the
two — treating an `AskUserQuestion` answer about a design fork as
authorization to implement — is the defect #350 reports. Each of the four
sites states the distinction in wording scoped to what a reader has and
hasn't read by the time they reach it (e.g. the shortcut path's version
explains that the canonical statement lives in a section that path has
already read past); the canonical statement under `## Execution
(Post-Approval)` itself is left untouched, and both hand-scoped wordings that
already existed are preserved byte-identical rather than replaced.

## Compromise

Alternatives considered and rejected:

1. **Promoting the three-question technique (or a pointer to it) into
   `development-principles.md`'s stale-mechanism corollary (principle #8).**
   Rejected per decision (1): the corollary's other two citation sites
   (`issue-triage-analyst.md:54`, `triage-issues/SKILL.md:313-314`) use it for
   issue-authoring detection, not plan-time re-verification technique, and
   widening it would hand two unrelated components prose they'd never read
   for its stated purpose.
2. **A one-sentence "C-lite" compromise** — naming the insufficiency in the
   shared corollary while leaving the technique in `plan-task/SKILL.md`.
   Rejected: it fragments the two sharpenings (#248's sufficiency check,
   #198's best-option check) across two files and mints a fourth statement of
   a rule that already exists in three forms.
3. **Landing #198's rule as a bullet at the open-questions classification
   block**, per its original issue framing. Rejected per decision (2): the
   check is a claim about the mechanism, not about the questions, so an
   absent open-questions section is where the blind spot is *observed*, not
   where the rule should be *owned*.
4. **Sharpening the shortcut's duplicate mechanism-check clause in place**
   rather than deleting it. Rejected per decision (3): two independently
   maintained copies of the same check is exactly the shape that let the
   original ticket-type gap survive undetected; a single statement plus a
   cross-reference removes the drift surface entirely.

**What was traded, not just rejected.** This change is not purely additive:
it deletes a shipped clause (the shortcut's duplicate mechanism check) and
relocates shipped text (the supersession paragraph, out from under "For
feature tickets"). It also grows the `## Shortcuts` full-proposal list from
18 to 20 top-level bullets (`git diff` bullet count, verified against both
the pre-change tree at tag `v4.16.0` and the current tree) — no explicit
density ceiling is documented for that section the way `designer.md` item 8's
five-named-group scheme is (ADR-0037), so the growth is not against a stated
budget, but it is the section's known-densest reading path getting denser
again.

## Consequences

A future editor extending the mechanism gate adds a fourth question (if one
is ever needed) at both `SKILL.md:68` and its shortcut mirror at
`SKILL.md`'s "The same three questions apply to a full proposal" bullet,
keeping the two-statement, one-per-reading-path shape decision (3)
establishes — a third copy anywhere is the drift this change was written to
close. A future editor of the stale-mechanism corollary
(`development-principles.md` principle #8) should not assume `plan-task`'s
three questions are latent there; they are deliberately not, per decision
(1), and the corollary's two other citers (`issue-triage-analyst.md`,
`triage-issues/SKILL.md`) are about issue-body rewriting, a different
concern from plan-time re-verification.

A future editor touching plan/execution approval wording checks all four
sites named above (`SKILL.md`'s "Wait for explicit approval before saving"
Phase 3 checkpoint, `SKILL.md`'s "The compressed checkpoint above
authorizes Phase 4 only" simple-tasks shortcut note, `SKILL.md`'s "Present
a combined design + plan in" full-proposal shortcut checkpoint, and
`approval-and-audit.md:11`) rather than assuming one canonical statement
suffices — the whole point of this change was that a
reader on any one path meets the boundary before reaching the canonical
statement under `## Execution (Post-Approval)`.

The `## Shortcuts` full-proposal bullet list is now denser (20 top-level
bullets) with no stated ceiling; a future change adding another shortcut gate
there should weigh whether the section needs the same kind of named-group
restructure ADR-0037 applied to `designer.md` item 8, rather than continuing
to append bullets indefinitely.
