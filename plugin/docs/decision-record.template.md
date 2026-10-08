<!--
  Decision record (ADR) template — MADR-lite.
  tech-writer scaffolds a copy of this into the repo's resolved decisions
  location — paths['docs/decisions/'] in .gvt-agent.json, or docs/decisions/
  by default (see CONVENTIONS.md's Runtime path resolution) — when dispatched
  from plan-task Phase 4 (ADR authoring) or from the create-adr skill
  (on-demand ADR creation). See development-principles.md principle #7.
  Naming: NNNN-kebab-title.md  (NNNN = 4-digit zero-padded sequence, next
  number after the highest existing record).
  Date = when the decision was accepted/finalized, not when the record was written.
  For a retroactive record, use the original decision date (or, if diffuse, the date
  it was finalized) — never a date before the problem existed.

  Inside the wiki, the resolved location's own indexing convention applies:
  the filled file starts directly with the frontmatter block below instead of
  this comment. Mirror the key set and `type` of sibling ADRs already in that
  location when they exist; otherwise use this default block:

    ---
    type: decision-record
    title: '<Decision title>'
    description: '<One-line summary matching the index entry>'
    tags: [decisions, <theme>]
    status: draft | stable | deprecated
    ---

  `title`/`description` carry no ADR number — renumbering can rewrite file
  names but never rewrites these. Drop `<theme>` from `tags` when the record
  isn't under a theme subdirectory. `status` maps from the Status field below:
  proposed -> draft, accepted -> stable, superseded -> deprecated.
  Outside the wiki, no frontmatter is added and the file starts directly at
  the heading below.
-->

# NNNN. <Decision title>

- **Status:** proposed | accepted | superseded by NNNN
- **Date:** YYYY-MM-DD
- **Issue:** <#N (GitHub) or the full Bitbucket issue URL — the originating issue, NOT a paste of its text>

## Context

<The forces at play: the problem, the constraints, what made a decision necessary.
Keep it short — link the issue above for full background rather than transcribing it.>

## Decision

<What we decided, in one or two paragraphs. Cover **architecture**: how this fits the
wider system.>

## Compromise

<What was traded away. The alternatives considered and why they were rejected. This is
the durable home for trade-off rationale — the plan that produced it is transient.>

## Consequences

<What becomes easier or harder as a result. What to watch for later.>
