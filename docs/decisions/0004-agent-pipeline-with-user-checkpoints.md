# 0004. Analyst → designer → planner pipeline with user checkpoints

- **Status:** accepted
- **Date:** 2026-05-31
- **Issue:** none — established at the v2.0.0 public release (decision predates the public repo; pinned to its first recorded appearance)

## Context

Retroactive record. Non-trivial work (features, refactors, migrations) fails in
predictable ways when one agent does everything at once: requirements get assumed, a design
is chosen before the problem is understood, and the plan inherits unvetted decisions. The
plugin needed a way to structure that work so each concern is separated and the user can
steer before cost is sunk.

## Decision

`plan-task` orchestrates a fixed pipeline of read-only exploration agents with an explicit
**user checkpoint between every phase**: **Phase 1** dispatches `genvid-dev:analyst` to map
current state and surface requirements *without* proposing solutions; **Phase 2** dispatches
`genvid-dev:designer` to propose 2–3 options and audit friction/footprint/trade-offs;
**Phase 3** dispatches `genvid-dev:planner` to turn the approved design into ordered,
one-commit-sized tasks. The orchestrator owns no exploration of its own — it sequences the
agents and makes only the decisions *between* phases, pausing for the user to read each
artifact and approve before the next.

Architecture: analysis, design, and planning are distinct agents with distinct outputs and
distinct prompts, composed by a thin orchestrator; the human is a gate at each seam rather
than a reviewer at the end. Execution later delegates to implementer agents behind
validator + code-reviewer gates.

## Compromise

Alternatives rejected:

- **One agent, one turn** — conflates the phases, so a wrong early assumption silently
  propagates into the plan with no checkpoint to catch it.
- **Automatic phase-to-phase flow (no checkpoints)** — faster, but the user can't redirect
  before a flawed design is fully planned; the interactive cost buys correctness.

The cost: a multi-turn, more interactive flow, and an orchestrator that must hold the line
on owning *only* the between-phase decisions.

## Consequences

The pipeline is the plugin's flagship workflow and the spine several later decisions refine:
the [orchestrator-owns-the-commit gate](0008-orchestrator-owns-commit.md), the
[five-dimension / decision-record convention](0007-five-dimension-doc-and-adr-convention.md)
(Phase 4 doc dispatch — this very ADR is its output), and the
[Agent-Dispatch-Guide domain-explorer preference](0010-agent-dispatch-guide-domain-explorers.md)
for Phase 1. It also seeded `plan-next-issue` as a pure orchestrator chaining triage → plan.
