---
type: decision-record
title: 'A shipped writing-style doc owns style and voice, with an identical block in each writer body and a drift test'
description: 'plugin/docs/writing-style.md owns the sentence-level rules and the receiver-side voice rule; 23 bodies carry one identical paragraph, and a permanent test fails when a copy differs.'
tags: [decisions, development-practice]
status: stable
---
# 0089. A shipped writing-style doc owns style and voice, with an identical block in each writer body and a drift test

- **Status:** accepted
- **Date:** 2026-10-31
- **Issue:** #733, #522

## Context

Two gaps shared one answer.

- #733: the plugin had no rule for how its agents and skills write. Sentence length, naming, and the separation of observation from inference were left to each writer.
- #522: the agents that receive a dispatch brief (`tech-writer`, `ts-implementer`) had no rule that keeps the brief's direction out of what they write. The sender side shipped earlier (ADR-0075); the receiving side was deferred.

The plugin already has two shapes for a rule that several roles follow. A principle in `development-principles.md` owns it with restatements in the bodies (ADR-0061, ADR-0081), or a skill body owns it and others cite it (ADR-0030, ADR-0031). A rule can drift in the places that restate it, and ADR-0032 records that a rule which costs a file-open is the one an agent improvises past.

## Decision

### The owner is a new shipped doc, not a principle

`plugin/docs/writing-style.md` owns the rules. It holds a scope section, seven rule sections (short direct sentences; one name for each component; observations, hypotheses and checks stay apart; one action in each procedural step; conditions, warnings and uncertainty are kept; say what each check can establish; no invented measurement or diagnosis), a voice section, and the short form. Principle #16 is not taken.

This differs from the ADR-0061 and ADR-0081 shape for three reasons.

- A style rule with seven items, a disclaimer and citations to four overlapping rules is far longer than its sibling principles. The principles list frames itself as decision guidance and says none of it is a strict rule, which softens a style rule.
- The principle-citation scan checks numbers, not content, so a principle adds no protection that the drift test below does not already give.
- Issue #285's claim on the next principle slot stays open. Its own body leaves the placement unsettled, so the claim was weaker than it looked, but numbering is append-only and leaving #16 free costs nothing.

### One owner for style and voice

The doc owns the #522 voice rule as well as the #733 style rules. A brief says what the document must end up saying, not wording to reproduce, and the document is written in its own voice for every document type. `plan-task` keeps the source, content and direction vocabulary in `### Quoted artifacts vs. direction in a dispatch brief`; the doc cites that heading and does not redefine it. The rules that overlap an existing rule cite it by heading or principle number: `### Verified vs. inherited facts in a dispatch brief`, principle #15, and `plan-task`'s "An implementer's authored technical claims are output, not report".

The voice section lists four tells that show a brief's voice leaked into a document:

- a heading or lead-in that begins "Record the…";
- a parenthetical that only makes sense as an instruction to the writer;
- a phrase true of the dispatch but false of the document, such as "verified this run";
- a plan task id or sequencing word, such as "T3" or "once T3 lands".

Two things still ship: a string the brief marks as required wording ships verbatim, and an acceptance-row id may be cited. Voice and truth fail independently, so the voice rule sits beside the inherited-claim rules and does not replace them.

### An identical paragraph in 23 bodies, held by a permanent drift test

One paragraph of 122 words, the shared block, goes under a `## Writing style` heading in 23 bodies: 8 agents and 15 skills. Its lead is the bold sentence "Write technical text in the gvt-dev writing style." It states the style in one pass, says that shipped text is written in its own voice, carries the disclaimer that the style is inspired by ASD-STE100 and is not compliance with it, and points at the doc. The copy is deliberate: an agent dispatched standalone may never open the doc (the #167 precedent, restated in ADR-0061).

The block names shipped text on purpose. The planner and `plan-task` write task ids into a plan, and the plan does not ship.

`test/shared-blocks.test.mjs` is the permanent check. A table of `{ id, lead, canonical, files[] }` drives it. It finds the canonical line in the doc exactly once, runs one subtest per listed body that asserts exactly one line starting with the lead and byte-identical to the canonical line (after stripping a trailing `\r`), asserts that no other file under `plugin/**/*.md` carries the lead, and includes an in-memory case in which a one-character change is reported. A failure names the file and the first differing column. The test is wired into `commands.test` and `commands.validate` in `.gvt-agent.json`, and the root `CLAUDE.md` tells a maintainer who adds a skill or agent to add the block and enrol the file.

This extends two earlier practices from a task gate to a standing check. `plan-task` already requires that text pledged identical across files is authored once and hash-checked at its own task's gate. ADR-0079 mirrors a criteria block between the grader bodies by the same discipline. Both check once, at the change that introduces the copies; the test checks on every later change too. Only the writing-style block is enrolled. The ADR-0079 grader block could be enrolled in the same table later.

The block restates a summary of the doc, which `tech-writer`'s own "Link, don't duplicate" rule warns against. That rule exists because copies drift. The drift test removes the drift, so the exception is accepted. The doc's short-form section says only that the copy is deliberate; this record carries the reasoning.

### Four receivers carry a tailored rule

Each receiver also gets a short rule beyond the block.

- `tech-writer`: a Key Principles bullet after the inherited-claim bullet. A dispatch brief is a specification of what the document must end up saying, never wording to reproduce; an ADR states decisions, a skill body addresses the agent that runs it, a CHANGELOG entry addresses a consumer, and a reference doc addresses its reader. It names the tells and the two exceptions.
- `ts-implementer`: Process item 11. Plan task ids and plan jargon never go into shipped comments, test names or docstrings. The item is about voice; item 10 is about truth.
- `code-reviewer`: a paragraph at the end of `### Documentation (Always Check Proactively)`. Each added tell is reported as a 🟡 Warning that quotes the line. An acceptance-row id and a brief-marked required string are not hits.
- `issue-triage-analyst`: a sub-bullet under the per-issue enrichment bullet that defines body language cleanup as a rewrite in this writing style. A cleanup never changes what the issue claims and keeps every condition and uncertainty the body states. The two triage templates are unchanged because they hold command recipes, not a standard.

These four close the item that ADR-0075 listed as deferred, "Receiving-side copies in tech-writer and ts-implementer (ADR-0031 pattern)". ADR-0075 stays unedited, as history of what it decided then.

### Scope: run-time text, plus the plugin's own prose from now on

The style applies to text that an agent or skill writes into a consuming repo or tracker: docs, ADRs, issue bodies and comments, plans, review findings, reports, commit messages, PR bodies, CHANGELOG entries, code comments, docstrings and test names. It also applies to the plugin's own shipped prose, written from now on.

There is no bulk retrofit. A change that rewrites a passage brings that passage to the style (principle 8 applied to prose). A change that only inserts text does not restyle the text around it (principle 10). The rollout itself inserts only, and a diff check confirms that no agent or skill body lost a line.

### Conformance

- The drift test fails when a copy of the block differs or when a file carries the lead without being enrolled.
- The `code-reviewer` check reports voice tells as a 🟡 Warning. It is never a gate.
- No zero-hit grep gate covers any tell. The tells also appear legitimately: "verified this run" occurs in rules about dispatches in several agent bodies, a skill body and an earlier ADR, and "Record the" occurs mid-sentence in `designer.md` and `planner.md`. A reader judges each hit in context.
- `plan-task`'s existing step, read an authored document as its reader would before committing it, is cited and unchanged.
- A `C-voice` variant in `create-adr-evals` is the behavioural test of `tech-writer`. Its brief plants the four tells and one required string. The grader matches each planted string as a whole word, and it also matches each tell class as a pattern: a line-start "Record the" lead-in, "verified (in) this run", a parenthetical that addresses the writer, and a whole-token plan task id. It applies these checks to the ADR and to the lines the writer adds to a decisions index. It also requires the required string verbatim in the ADR. Its unit tests cover paraphrased leaks and an index-only leak. Three metered runs on this branch, against the four-tell `tech-writer` bullet, all passed. That shows `tech-writer` did not echo the planted tells for this one brief. It does not show behaviour for other document types or for tells the patterns do not describe, and there is no pre-change run to compare against.

## Compromise

**Rejected, Option B:** principle #16 as the owner, with the voice rule kept agent-local. This is the literal ADR-0061 and ADR-0081 shape. The design's reasons: eight items plus a disclaimer and overlap citations make one principle much longer than its siblings, and the list's footer softens a style rule; splitting voice from style leaves the analyst, designer and 15 skills with no voice statement; it takes #16 from #285; and the citation scan checks numbers, not content, so it adds no protection the drift test does not already give.

**Rejected, Option C:** both, a one-line principle #16 pointing at the doc. The design's reasons: the rule gets two homes and the principle adds nothing the shared block does not already say; it adds a numbered citation surface to keep in step; and it still takes #16 from #285. Its one advantage, that a reader of the principles list alone would learn the style exists, concerns a maintainer, and the root `CLAUDE.md` Knowledge base line already reaches that reader.

**Rejected sub-alternatives**, with the design's one-line reasons:

- A gate-only hash check with no permanent test: the mirror-drift risk stays open after merge.
- A pointer-only line in skill bodies: each body needs the rule restated, and ADR-0032 says a rule that costs a file-open is the one improvised past.
- A session hook that injects the style: it is global and consumer-visible, with a cost on every session.
- A wiki/maintainer page: it would be a copy of the doc.

**Cost in body length.** The block adds 122 words to each of 23 bodies, and the four receivers add a tailored rule on top. Added prose competes for attention with the rest of a body (ADR-0081 makes the same point), and the validator body is already long. This cost is not measured. The `C-voice` variant is the only behavioural measure planned, and it covers `tech-writer` only.

**Accepted tension with "Link, don't duplicate".** See the decision above: the copy is deliberate, and the drift test is what makes it safe.

## Consequences

- A rule edit to the block is a 24-file edit: the doc's canonical line and 23 bodies. The drift test makes a partial edit fail loudly, and it names the file and column.
- A maintainer who adds a skill or agent that writes prose adds the block and enrols the file. A copy without enrolment fails the closed-set subtest.
- The block was appended at the end of each body, not placed mid-file. Adding the receiver paragraph mid-file in `code-reviewer.md` shifted three line citations in ADR-0029 and ADR-0032, and they were repointed. Appending keeps later insertions from shifting citations in other bodies.
- Dogfooded agents run from the installed plugin cache. They see the block only after a release and a cache update.
- The style is a habit, not a glossary: a component is called by the name the repo already gives it (its file name, heading, identifier or frontmatter `name:`, and for a plugin component the namespaced form such as `gvt-dev:tech-writer`). A glossary would be a second home for names that already have one.
- Related records: [ADR-0030](0030-verify-authored-prose-claims.md), [ADR-0031](0031-verified-vs-inherited-facts-stay-in-skill-body.md), [ADR-0032](../acceptance-criteria/0032-acceptance-criteria-splice-and-single-edit.md), [ADR-0061](0061-git-state-mutation-principle-and-agent-scoped-hook-backstop.md), [ADR-0075](0075-quoted-artifacts-vs-direction-in-dispatch-briefs.md), [ADR-0079](../criteria-authoring/0079-count-rows-account-for-every-writer-group-2-lead-and-grader-mirror.md), [ADR-0081](0081-false-red-principle-validator-chain-and-report-self-check.md).
