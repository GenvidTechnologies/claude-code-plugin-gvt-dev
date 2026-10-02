# 0017. Pre-committed Acceptance Criteria for plan-task

- **Status:** accepted
- **Date:** 2026-07-23
- **Issue:** #145 (part of epic #142)

## Context

`plan-task`'s validator and code-reviewer gates fire *after* generation, checking the diff
against whatever the reviewer reconstructs from the plan in the moment. Acceptance criteria
are never pinned *before* implementation begins, and `plan.md` — the one artifact that
currently states them — is gitignored, so nothing about a plan's criteria is durably
committed anywhere. Epic #142's Verify pillar wants verification to be a pre-committed
gradient, closing the Spec↔Verify seam: a target fixed before the work starts, not
reconstructed after.

## Decision

Four parts:

1. **The planner emits a fixed-heading `## Acceptance Criteria` checklist before
   implementation**, seeded directly from the designer's existing `## Test Criteria` table —
   plain `- [ ]` items, one per verifiable requirement.
2. **It lives in the GitHub issue body (Home B)**, written best-effort via the existing
   `bugTracker` block: `readOne` to fetch the current body, a host-native edit command (e.g.
   `gh issue edit --body-file`) to write it back. For issue-less runs, it falls back to a
   committed `docs/acceptance/<slug>.md`.
3. **"Machine-checkable" reuses the already-dispatched gates** — `gvt-dev:validator` and,
   independently, `gvt-dev:code-reviewer` read the checklist and check each row against the
   staged diff at the existing gate. No new schema, engine, or scanner is introduced.
4. **The critic stays distinct from the author.** Implementers generate; `validator` and the
   distinct-model `code-reviewer` critique against the fixed, pre-committed target; the
   orchestrator gates the commit on both (per ADR-0008). Because the criteria are fixed before
   generation, the critic checks a target that can't move underneath it.

Architecture: this slots into the existing analysis → design → planning → execution pipeline
(ADR-0004) as a pure addition to the planner's output and a read at the existing gate — it
does not add a phase, a config surface, or a new agent.

## Compromise

Alternatives considered and rejected:

- **A schema-validated JSON criteria file plus a new validator engine** — rejected: infra for
  no payoff. The existing validator/code-reviewer gate already reads prose against a diff;
  a parallel structured engine would duplicate that capability for no additional coverage.
- **"Criteria = the eval assertions"** (the same file doubling as a runnable eval) — rejected:
  forces every plan to produce an eval, coupling the low-risk spec half (write a checklist) to
  the write-eval toolchain tension that the audit-conventions eval harness already flags as
  non-trivial (see `CLAUDE.md`'s Testing section). Acceptance criteria and evals solve related
  but separate problems and should stay separable.
- **Always-committed `docs/acceptance/*.md` for every plan** — rejected as the *primary* home:
  it adds a docs file and a TOC row to every single plan, most of which already have an issue.
  Kept only as the fallback for issue-less runs, where there is no issue body to write to.

## Consequences

Durable criteria survive the gitignored `plan.md` — the checklist outlives the session that
produced it. The critic checks a target that can't move, closing the seam epic #142 names.
Near-zero new friction: the mechanism reuses the `bugTracker` block and the existing
validator/code-reviewer gate rather than adding a new one. The design is tracker-dependent
(Home B needs a `bugTracker.readOne` and a host-native edit command) with a file fallback for
repos without one. The issue-body write is best-effort, not a hard gate — per
`development-principles.md` principle #9, a write to an external system that fails shouldn't
block the pipeline; the fallback and a warning cover that case.
