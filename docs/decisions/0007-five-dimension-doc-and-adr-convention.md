# 0007. Five-dimension documentation + decision-record (ADR) convention

- **Status:** accepted
- **Date:** 2026-06-09
- **Issue:** #46

## Context

Retroactive record. A plan produced by the [analyst → designer → planner
pipeline](0004-agent-pipeline-with-user-checkpoints.md) is transient — it is gitignored,
local-only, and discarded after `--apply`. The durable *why* of a change (its architecture
and the alternatives it rejected) was therefore being lost the moment the work merged, with
no committed home a future maintainer could discover. The plugin needed a documentation
discipline that survives the plan and a place to put the load-bearing rationale.

## Decision

Adopt a **five-dimension documentation rule** (codified as development-principles #7):
documentation for a change addresses, where each applies, **implementation**, **design**,
**architecture**, **purpose**, and **compromise** — and a dimension that doesn't apply gets
an explicit "N/A because …", so coverage is a decision, not an omission. The durable
**architecture** and **compromise** rationale lands in a committed **decision record**
(`docs/decisions/NNNN-kebab-title.md`) using a bundled **MADR-lite template**, authored by
`tech-writer` and dispatched from `plan-task` Phase 4 when a non-trivial design decision was
made. Durable docs **link the originating issue** rather than transcribing it.

Architecture: rationale moves from the transient plan into version control, discoverable
beside the code; four surfaces enforce the vocabulary (the `plan-task` planning self-audit,
the `code-reviewer` gate, the `tech-writer` criteria, and the principle itself). The
`docs/decisions/` expectation is declared `required: false` so it stays optional repo-wide.

## Compromise

Alternatives rejected:

- **Keep all rationale in the plan** — lost after `--apply`; nothing committed.
- **Freeform docs with no dimension checklist** — recurring gaps (especially the
  *compromise* dimension) went unnoticed until far too late.
- **A heavyweight ADR format** — more ceremony than a fast-moving plugin sustains; MADR-lite
  (Context / Decision / Compromise / Consequences) is the minimum that still captures the
  trade-off.

The cost: every non-trivial change now carries a doc obligation, and the date of a
retroactive record must be reasoned out rather than stamped (a later refinement, #83, added
explicit ADR-dating guidance — derive from git history, hedge when diffuse, never fabricate).

## Consequences

This repo dogfoods the convention it ships — `docs/decisions/` holds these records, and the
template lives at `plugin/docs/decision-record.template.md`. The whole backfill
this record is part of exists *because* of this decision. The `required: false` declaration
keeps the audit's aggregated contract from widening for repos that don't keep ADRs.
