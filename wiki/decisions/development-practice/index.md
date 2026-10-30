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
* [Triage verifies issue claims against the target artifact in a new analyst step 6](0072-triage-verifies-issue-claims-against-the-target-artifact.md) - issue-triage-analyst gains a read-only verification step with six outcomes; triage-issues offers cited rewrites, downgraded to comments when unattended.
* [Dispatch briefs mark every quoted block as source or content; everything else is direction](0075-quoted-artifacts-vs-direction-in-dispatch-briefs.md) - plan-task defines source, content and direction once and applies the roles at three dispatch sites; planner.md carries an inline copy and the self-audit gains a matching row.
* [A new principle (#15) guards against a false red; the validator names chain steps that never ran (`NOT RUN`) and self-checks its report](0081-false-red-principle-validator-chain-and-report-self-check.md) - Principle #15 owns the false-red rule with restatements where a red is acted on; the validator gains a NOT RUN status, a run-order rule and a report self-check.
* [A scripted reference grammar is the single definition of cross-reference state and readiness, shared by triage, ranking and planning](0087-a-scripted-reference-grammar-is-the-single-definition-of-cross-reference-state-and-readiness.md) - A pure script under triage-issues owns the grammar, state resolution and readiness; the analyst gains a [refs] comparand, and three optional bulk keys stay out of actionQuery (#209).
