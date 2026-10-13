---
type: decision-record
title: 'Dispatch briefs mark every quoted block as source or content; everything else is direction'
description: 'plan-task defines source, content and direction once and applies the roles at three dispatch sites; planner.md carries an inline copy and the self-audit gains a matching row.'
tags: [decisions, development-practice]
status: stable
---
# 0075. Dispatch briefs mark every quoted block as source or content; everything else is direction

- **Status:** accepted
- **Date:** 2026-10-13
- **Issue:** #554 (#569 and #646 combined)

## Context

Three issues share one cause at different hand-offs: the text that crosses
from one agent to the next carries no mark of its role.

- #569: planner task entries paraphrased the design's options. The paraphrase
  misdescribed the chosen option and invented rejected alternatives the design
  never weighed, and that wording was headed for a permanent record.
- #646: orchestrator briefs to implementers restated acceptance rows, and the
  implementer built to the restatement rather than to the row.
- #554: briefs that prescribed verbatim strings leaked their imperative voice,
  and plan task ids, into shipped artifacts.

The fixes pull against each other. Quoting more text into briefs cures #569 and
#646, but it invites #554's failure unless the receiver can tell a quote it
builds to from a string it must reproduce, and from the surrounding
instructions that must not ship at all.

## Decision

**Chosen, Option A, "Canonical section in plan-task + local application sites + inline planner item":** define the roles once where every dispatch is assembled, and repeat only into the agent body that cannot load the skill.

The roles, defined in the new `plan-task` section `### Quoted artifacts vs.
direction in a dispatch brief`:

- **Source:** an acceptance row or a design decision. The receiver builds to it
  or records from it, in the artifact's own voice; its wording is not the
  artifact's wording.
- **Content:** a required string. It must appear verbatim, and rewording it
  is the defect. Required strings go in their own block, never inside
  imperative sentences, and the brief states that the surrounding text is
  direction.
- **Direction:** everything outside a quoted block. It never ships, plan task
  ids included.

The section has three application sites:

- Phase 3 passes the design's option labels and one-line reasons through
  verbatim, so the planner has something to quote.
- The Execution lead requires an implementer brief to quote each owned
  acceptance row verbatim, restate only below the quote and labelled as
  context, and call out literal inputs a fixture would not naturally use.
- The label-2 step reads an authored document as its reader would. It catches
  claims that are right but misaddressed, which accuracy-focused review and
  literal-presence rows both pass, and it greps the staged diff for the plan's
  own task-id pattern without making zero hits a gate.

`planner.md` Process item 13 is an inline copy: the planner runs standalone and
does not load the skill. It requires quoting the design's labels and reasons,
forbids supplying alternatives the design did not weigh, and requires flagging
a summary-only dispatch instead of reconstructing the options. The
`plan-task` self-audit gains a matching row. Every edit was insertion-only.

## Compromise

**Rejected, Option B, "New development-principles principle with pointers":** planner and 6 other agents never load the shared doc, so inline copies would be needed anyway, and #285's residual is a pending claimant for that list.

"Load" here means the agent body carries a `${CLAUDE_PLUGIN_ROOT}/docs/…` path it can resolve when dispatched standalone. Measured at `ea6db6d`, seven agent bodies carry none: `analyst`, `designer`, `issue-triage-analyst`, `planner`, `ts-implementer`, `validator` and `wiki-librarian`. Several of them mention `development-principles.md` by name, but a name with no resolvable path does not put the text in front of the agent.

**Rejected, Option C, "Three independent local rules, no shared definition":** a quoted row and a required-strings block would look the same to the receiver, which is the interaction the combined plan exists to resolve.

**Rejected, Option A-alt, "Extend the Verified-vs-inherited section in place":** that section labels provenance, this one labels role; a separate heading gives the sites a name to cite.

**Deferred, "Receiving-side copies in tech-writer and ts-implementer (ADR-0031 pattern)":** this is #522's side, and the user approved #554 only.

The scope boundary this records: this decision covers the sender side of a brief (`plan-task` and `planner`); the receiving agents' own rules are #522's to decide.

## Consequences

Briefs now mark each quoted block by role, and the planner and orchestrator
sides are covered. The receiving agents (`tech-writer`, `ts-implementer`) are
unchanged, so a receiver that ignores the marks is not yet backed by its own
body; that side is #522.

A required-strings block with no acceptance row pinning it is still ungraded,
so a reworded string can pass; that gap is #353. Task ids already shipped in
artifacts are tracked in #661.

Watch for: the inline planner item drifting from the `plan-task` section, since
the two are deliberately duplicated, as in ADR-0031's cite-and-repeat split.
