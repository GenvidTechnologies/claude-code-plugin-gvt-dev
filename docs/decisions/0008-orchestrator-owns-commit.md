# 0008. Orchestrator owns the commit; gate before commit

- **Status:** accepted
- **Date:** 2026-06-11
- **Issue:** #63

## Context

Retroactive record. When `plan-task` executes a plan it delegates each task to an
implementer agent (`ts-implementer`, `tech-writer`, or a domain implementer). The early
flow let implementers commit their own work, then validated — which produced a contradiction
surfaced in #63: commit authorship was mixed across a plan, and the validator gate ran
*after* the commit, so a red task could land committed and need unwinding.

## Decision

The **orchestrator owns the commit, and the gate runs before it.** A dispatched implementer
**stages** its files (`git add <files>`) and reports what changed, but does **not** commit.
The orchestrator then runs the `genvid-dev:validator` gate; only on pass does it commit, and
on failure it rejects the change and marks the task red — uncommitted. An implementer run
**standalone** (not under an orchestrator) still commits itself. One-commit-per-task is the
default, not an anti-batching rule: several tasks refining the same file may be committed
together as one logical commit.

Architecture: commit authorship is uniform across a plan, the integrity gate (validation) is
strictly upstream of the commit, and red work never reaches history. This is enshrined as
development-principles #4.

## Compromise

Alternatives rejected:

- **Implementers always commit** — loses uniform authorship and lets unvalidated or red work
  land before the orchestrator can gate it.
- **Orchestrator pre-validates but implementers commit anyway** — the gate ends up *after*
  the commit in practice, re-introducing the #63 contradiction.

The cost: implementers need two modes (staged-and-reported under an orchestrator vs.
self-committing standalone), and the orchestrator carries the commit responsibility for the
whole plan.

## Consequences

Refines the [agent pipeline](0004-agent-pipeline-with-user-checkpoints.md)'s execution
phase. Because the *installed* skill runs a `plan-task`, this rule (shipped after v3.0.0)
only takes effect once the consuming repo updates the plugin — a dogfooding lag noted in
`CLAUDE.md`. Standalone implementers bypass pre-commit hooks (`-n`/`--no-verify`) since the
validator gate already ran.
