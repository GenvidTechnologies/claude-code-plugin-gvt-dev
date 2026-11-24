---
type: decision-record
title: 'A later comment that names no blocker withdraws a prose blocker only when it is the only one'
description: 'The reference grammar retracts a prose blocker on a later "No longer blocked" comment that names no reference when exactly one prose blocker stands; with several it keeps them unresolvable and attaches the line as withdrawnBy.'
tags: [decisions, development-practice]
status: stable
---
# 0105. A later comment that names no blocker withdraws a prose blocker only when it is the only one

- **Status:** accepted
- **Date:** 2026-11-23
- **Issue:** #906

## Context

ADR-0087 gave the reference grammar one retraction rule: a later comment that names the same target and withdraws it makes the reference `retracted`. Two gaps kept that rule from reaching a common case.

- A blocker line that names no issue is `unresolvable` with kind `prose` and a null target. `sameTarget` is false when either side has no target, so no comment could retract it.
- The retraction pattern matched "no longer blocked by" but not "No longer blocked:". A comment such as "No longer blocked: … #N" did not retract #N.

Observed 2026-11-10 in the triage of `GenvidTechnologies/claude-code-plugin-gvt-fleet#4`, with gvt-dev 4.49.0. Comment 1 read "Blocked by the gvt-fleet CLI's task dispatch (in progress)…". Comment 2 read "No longer blocked: the gvt-fleet CLI's task dispatch has shipped (merged 2026-11-09)…". The analyst reported comment 1 as `unresolvable` kind `prose` and did not report comment 2. `unresolvable` is an uncleared outcome, so `plan-next-issue` also kept the issue `blocked`.

## Decision

The grammar in `plugin/skills/triage-issues/scripts/lib/refs-grammar.mjs` gains a target-less withdrawal. It amends the retraction fact of ADR-0087. It changes the shared grammar, so all four callers of ADR-0087 get it without a copy of the rule.

**What counts as a withdrawal.** A comment line is a target-less withdrawal when both hold:

- It opens, after list markers and emphasis, with "No longer blocked", "No longer depends on", "No longer a blocker", "Unblocked" or "Blocker is (satisfied|cleared|resolved)" (`WITHDRAW_OPEN_RE`).
- It names no reference at all. A repo-ambiguous `lib#5` counts as a reference (`isTargetlessWithdrawal`).

A line that only mentions "no longer blocked" mid-sentence withdraws nothing. Fenced, blockquoted, struck and inline-code text is excluded, as for every other statement. Only comments withdraw, and the body is earlier than every comment.

**What it withdraws.** Withdrawals are applied in comment order to the earlier prose blockers still standing (`applyWithdrawal`). A blocker stands when its target is null, its kind is `prose`, and it is not `repo-ambiguous`, not `heading-detached` and not already retracted (`isProseBlocker`).

- Exactly one standing: it becomes `retracted`.
- Several standing: none is retracted. Each stays `unresolvable` kind `prose`.

In both cases the reference carries a new key `withdrawnBy`, the withdrawing line, trimmed. In the second case the readiness reason reads "unverified blocker (unresolvable: prose, possibly withdrawn by a later comment)" (`describeBlocker` in `refs-resolve.mjs`).

**A named target is separate.** `RETRACT_RE` now matches "no longer blocked" without "by". "No longer blocked: #N has shipped" retracts the reference to #N only, as "No longer blocked by #N" already did.

**Callers.**

- `issue-triage-analyst` step 8 reports `withdrawnBy` with the finding.
- `triage-issues` §3 asks which blocker an ambiguous line means. It offers two body edits, each with per-issue approval: rewrite a blocker that still holds into `owner/repo#N` form, which leaves one prose blocker before the line, or strike the withdrawn blocker's body line.
- `plan-next-issue` quotes the line in its rationale.
- `plan-task` Phase 0 shows it.

**Precedent.** A deferral trigger with no reference is already fired by a later comment that says so (`isFiredByLaterComment`). A later comment already settles a reference-free statement elsewhere in the grammar.

**Evidence.** Twelve tests titled `WITHDRAW: …` or `WITHDRAW resolve: …` in `plugin/skills/triage-issues/scripts/test/issue-refs.test.mjs` pin the rules. Eight of them failed against the code before the change. Four are guards that passed before it. A run of 11 mutations (each rule, both call sites and the readiness reason) failed at least one test each.

## Compromise

**Rejected, always retract.** Every earlier prose blocker becomes `retracted`. It is the simplest rule. With two prose blockers it can withdraw the one the author did not mean, and the issue then ranks ready while it is still blocked. A false ready costs more than a false blocked.

**Rejected, evidence only.** Every prose blocker stays `unresolvable` and the line is attached. It writes nothing on its own. An issue whose author withdrew its only blocker then stays blocked in `plan-next-issue` until someone edits the body. With a single standing blocker the line has only one possible meaning.

**What the chosen rule still gives up.**

- The ambiguous case still needs a person.
- A withdrawal that names no blocker can still be wrong about the single blocker. The author's word is taken, as it is for a targeted retraction.
- The opening-phrase list is fixed. Another wording, such as "Not blocked any more", is missed and stays a plain prose finding.

## Consequences

- An issue whose only blocker was prose, and whose author later wrote "No longer blocked", no longer stays blocked. The analyst reports the line, and the grammar treats the blocker as `retracted`.
- With several prose blockers the issue stays blocked. The line is shown to the user, so the choice is made by a person.
- `withdrawnBy` is a new optional key on a reference. A caller that does not read it sees the old outcomes, with `retracted` where one blocker stood.
- A new withdrawal wording is a change to `WITHDRAW_OPEN_RE` and a test, not a change to the caller bodies.

**Related records:** ADR-0087 (the grammar whose retraction fact this amends; ADR-0087 is not edited).
