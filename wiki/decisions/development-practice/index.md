# Development practice

Decisions about the agent pipeline, commit ownership, and the principles governing this repo's own practice.

## Records

* [Analyst → designer → planner pipeline with user checkpoints](0004-agent-pipeline-with-user-checkpoints.md) - plan-task runs analyst, designer, and planner as separate agents with a user checkpoint between each phase.
* [Five-dimension documentation + decision-record (ADR) convention](0007-five-dimension-doc-and-adr-convention.md) - Durable architecture and compromise rationale is recorded in a committed decision record rather than the transient plan.
* [Orchestrator owns the commit; gate before commit](0008-orchestrator-owns-commit.md) - Dispatched implementers stage but never commit, and the validator gate runs before the orchestrator's own commit.
* [Finish-quality over additional scope (principle #8)](0009-finish-quality-over-additional-scope.md) - Finish-quality of touched code is part of a change's definition of done and cannot be deferred.
* [Agent-Dispatch-Guide for domain-specific explorers](0010-agent-dispatch-guide-domain-explorers.md) - plan-task Phase 1 prefers a repo's named domain explorer over the generic analyst when one is declared.
* [Proposal-vs-artifact cross-check gate](0021-proposal-artifact-cross-check.md) - A full proposal's claims are cross-checked against the artifact it modifies via a shared principle cited at both plan-task entry points.
* [Verify authored prose claims against their structured source, guarded inline in the skill body](0030-verify-authored-prose-claims.md) - Prose-claim verification lands as two adjacent paragraphs in plan-task's skill body rather than a new development-principles principle.
* [Verified-vs-inherited dispatch-brief labeling lands in `plan-task`'s skill body, not a new principle](0031-verified-vs-inherited-facts-stay-in-skill-body.md) - The verified-vs-inherited dispatch-brief labeling rule is defined once in plan-task's skill body and cited by name elsewhere.
* [A new development-principles principle (#14) forbids state-mutating git in agent dispatches; a PreToolUse hook backstops it for `gvt-dev:*` subagents](0061-git-state-mutation-principle-and-agent-scoped-hook-backstop.md) - A new principle forbidding state-mutating git in agent dispatches is restated in four agent bodies and backstopped by a scoped PreToolUse hook.
