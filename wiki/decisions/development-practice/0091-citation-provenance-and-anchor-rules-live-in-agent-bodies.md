---
type: decision-record
title: 'Citation provenance and anchor rules live in agent bodies'
description: 'The non-repo provenance rule and the citation anchor rule are agent-body bullets, with tech-writer as the canonical statement and tailored copies elsewhere, not a new principle.'
tags: [decisions, development-practice]
status: stable
---
# 0091. Citation provenance and anchor rules live in agent bodies

- **Status:** accepted
- **Date:** 2026-11-03
- **Issue:** #225 (canonical; #318 was consolidated into it), #229

## Context

Two citation failures reach committed prose.

- **Provenance (#229).** An agent's context holds more than repo files: auto-memory entries, `<system-reminder>` blocks, scratch files, tool output and pasted issue bodies. They often read like documentation of this project. Agents cited them as if they were repo content and copied machine-local paths out of them into text that ships.
- **Decay (#225).** A positional `file:line` citation is correct when written. It goes stale when its target is edited, sometimes in the same change. Principle #12 covers correctness at writing. Nothing covered decay after writing.

The record has to settle where the two rules live, how many agents carry them, which citation forms they allow, and how they interact with the pointer-anchor scan that runs on this repository.

## Decision

### Surface: agent bodies, not a principle

The rules are Key Principles bullets in agent bodies. They are not a new `development-principles.md` principle.

- `plugin/agents/tech-writer.md` holds the canonical statement, as two separate bullets: "Non-repo content is an input, never a citable source." and "Anchor a citation to its content, not to a line number."
- `plugin/agents/analyst.md` carries a tailored copy of both bullets. The anchor copy is scoped to the durable text its reports feed, such as a Problem Statement or Current State finding. A Touch Points list stays transient.
- `plugin/agents/designer.md` and `plugin/agents/planner.md` carry a tailored copy of the first bullet only. Each names its own output surface, because the planner seeds acceptance criteria from design rows and those criteria reach the issue body.
- Each copy cites the canonical bullet by quoted title. This is cite-and-repeat, as [ADR-0033](../criteria-authoring/0033-criterion-baseline-and-evaluability-guardrails.md) and [ADR-0036](../criteria-authoring/0036-three-rules-three-owners-one-cluster.md) record.
- `plugin/skills/create-adr/SKILL.md` §2 step 2 carries a "Citation form" line. It cites the anchor rule by title and does not restate it. The record-authoring paths that reuse the §2 step 2 content contract inherit it.
- #240 stays open and owns stating cite-and-repeat as a general rule. This record decides one instance and does not pre-empt it.

The "Five-dimension coverage" parenthetical in tech-writer's "Link, don't duplicate" bullet pointed at a line number inside its own file. It now names the Role section paragraph by title, which removes the one live self-citation.

### Scope

The non-repo rule is in four agents: tech-writer, analyst, designer and planner. The anchor rule is in tech-writer and analyst only. The designer's and planner's output reaches issue bodies, which the anchor rule treats as transient, and commit messages, which are not among the committed documents it governs. tech-writer writes those documents, and the analyst's findings are often carried into them.

Naming where an insight was recorded is not citing it, so `condense-lessons` is unchanged.

### Citation forms

The anchor rule prescribes a strict subset of the anchor forms the pointer-anchor scan accepts, so a citation written to it always carries an anchor the scan recognises. The scan also checks that the anchored text is still at the cited line, which the rule cannot guarantee. The full grammar stays in `audit-conventions`.

- Unnumbered anchors are preferred: a path with a quoted span and no line number, or a quoted heading or backticked symbol name. A numbered form is allowed only when the line number is immediately followed by a quoted span of that line.
- The `file:line @ <hash>` form from #225's body is dropped. The shipped anchor grammar finds no anchor after a hash, so a hash between the number and the span breaks the pointer.
- The durable-code-target carve-out from #318 is dropped. The shipped scan anchors every positional pointer, whatever it points into.
- Issue and PR bodies count as transient for the anchor rule, so "durable" means committed to the repo. They count as shipped for machine-local paths, because such a path is wrong the moment it is written.
- Never cite by line number into the file being edited. The edit moves the line.

### Repairs

A stale citation is repaired by intent, in a shipped record too: find where the cited text lives now and cite it with an anchor. This replaces #225's original "do not repair" item and follows current practice (`wiki/maintainer/audit-author-time-findings.md`, "Repair by intent, not by offset.").

### Where the two rules meet

An unnumbered anchor cannot decay, but no tool checks it. Its quoted text must therefore come from a repo file that was opened. The anchor bullet states this once and ties it to the non-repo bullet and to principle #12.

### The gate does not move

The pointer-anchor scan still runs only on the plugin's own repository ([ADR-0047](../audit-conventions/0047-pointer-anchor-checker-error-severity-and-ratchet.md), [ADR-0064](../audit-conventions/0064-pointer-anchor-wiki-corpus-and-decisions-exclusion-paths-override.md)). Consumers get the guidance and no check. #513 owns any detection step. The bullets say so and do not imply enforcement outside this repository.

## Compromise

**Option A: canonical statement in tech-writer, tailored copies, two separate tech-writer bullets.** Chosen. It fits the Key Principles seam that ADR-0033 and ADR-0036 already use. Each failure has its own title, so each copy cites the half it needs.

**Option B: one merged tech-writer bullet covering both rules.** Rejected.
- Two failures with different remedies would sit in one long bullet.
- The designer and planner copies need only the provenance half, so they could not cite one title.

**Option C: one byte-identical shared bullet, pinned by `test/shared-blocks.test.mjs`.** Rejected.
- It contradicts the decision for tailored copies, because the surfaces differ.
- It adds test code to a prose-only change.
- It competes with #240, which owns the general mechanism. It remains the natural follow-up if #240 lands one.

**Also rejected.**
- A new shared principle. The rules name agent-specific output surfaces, and a principle would still need the inline copies, because a standalone-dispatched agent may never load it.
- Widening the pointer-anchor gate to consumers. That is a separate decision tracked by #513.
- Recording this only in the CHANGELOG. It would lose the rejected options.

**Costs accepted.**
- Four copies of the provenance rule can drift. No test covers them, since each is in its agent's own voice.
- Unnumbered anchors are unchecked. The meeting rule above is the only guard.
- A strict subset of the grammar means some forms the scan accepts are not recommended.

## Consequences

- A change to the provenance rule is a four-file edit, and a change to the anchor rule is a two-file edit. After a review fix to one copy, re-read the others.
- In consuming repositories, agents follow the rules from their own bodies and nothing verifies the result.
- In this repository, the pointer-anchor scan also checks citations written to the rules: it confirms the anchor form and that the anchored text is still where the citation points.
- If #240 lands a cite-and-repeat mechanism, revisit Option C for these bullets.
- Dogfooded agents run from the installed plugin cache, so they see the rules only after a release and a cache update.
- Related records: [ADR-0031](0031-verified-vs-inherited-facts-stay-in-skill-body.md), [ADR-0033](../criteria-authoring/0033-criterion-baseline-and-evaluability-guardrails.md), [ADR-0036](../criteria-authoring/0036-three-rules-three-owners-one-cluster.md), [ADR-0047](../audit-conventions/0047-pointer-anchor-checker-error-severity-and-ratchet.md), [ADR-0064](../audit-conventions/0064-pointer-anchor-wiki-corpus-and-decisions-exclusion-paths-override.md).
