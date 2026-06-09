---
name: plan-task
description: Orchestrates an analysis → design → planning pipeline for non-trivial tasks by dispatching the genvid-dev:analyst, genvid-dev:designer, and genvid-dev:planner agents with explicit user checkpoints between phases. Produces a reviewable plan document, then drives execution by delegating to implementer agents with validator + code-reviewer gates. Use when starting a multi-step feature, refactor, or migration.
metadata:
  expects:
    files:
      - path: CLAUDE.md
        reason: Read for project conventions, branching, commit format, and the inventory of project-specific implementer agents beyond ts-implementer
      - path: docs/TOC.md
        required: false
        reason: Consulted to scope analysis and discover relevant project docs
    config:
      - key: repo.default_branch
        in: .genvid-agent.json
        required: false
        reason: Used as the base branch for new branches and as the comparison point for "up to date" checks
      - key: commands.validate
        in: .genvid-agent.json
        required: false
        reason: Referenced in the execution validation step
    tools:
      - command: git
        reason: Branch creation, log inspection, base-branch comparisons
---

# Plan Task

Orchestrate the analysis → design → planning pipeline by delegating to specialized agents, then drive execution with validation gates.

**Default branch resolution:** read `repo.default_branch` from `.genvid-agent.json`; if absent, fall back to `git symbolic-ref --short refs/remotes/origin/HEAD`. Below, `<default-branch>` refers to this value.

**See also:** `${CLAUDE_PLUGIN_ROOT}/docs/development-principles.md` for the philosophy behind the pipeline. Sub-docs in this skill: [`multi-session.md`](multi-session.md), [`approval-and-audit.md`](approval-and-audit.md).

## Pipeline

### Phase 0: Locate prior context

Before dispatching the analyst, check whether this task extends prior work. The project may have its own initiative-tracking convention — consult `CLAUDE.md` for any such convention. Common signals to look for:

- The task description references a previously-shipped feature, PR, or pattern by name
- The task is a follow-up the user mentioned in a prior session or retro
- Existing tracking files (initiative docs, roadmaps, ADRs) list the work as pending

If related prior context exists, default to **extending it** rather than starting fresh. Reuse existing requirements docs if the new work logically belongs in their scope.

If no related context exists, proceed normally.

### Phase 1: Analysis

Dispatch the **`genvid-dev:analyst`** agent with the task description. The analyst explores the problem space, identifies requirements, and documents constraints.

**Input:** the user's task description plus any relevant prior context (initiative docs, prior work).

**Output:** a requirements document. Present it to the user.

**For bug tickets, confirm the reported symptom is observable before moving to design.** Reproduce it, or trace the *read/render* path end-to-end (who actually observes the suspect value), not just the *write* path. A defect can exist in the code yet never surface — a self-healing re-render, a `trigger-once` re-init, or every reader re-deriving the value from a correct source can mask it. If no reader observes the bad value, reclassify the task as tech-debt/cleanup (`chore`/`refactor`) rather than a fix, and say so explicitly to the user. (This is distinct from the "re-trace on didn't work" check during execution, which verifies a *fix* worked — this verifies the *bug is real* up front.)

**Checkpoint:** "Here are the requirements. Any additions or corrections?"

Wait for user feedback. Iterate if needed.

### Phase 2: Design

Dispatch the **`genvid-dev:designer`** agent with the approved requirements document.

**Input:** the requirements document plus any user feedback from Phase 1.

**Output:** a design document with options, friction audit, and test criteria.

**Checkpoint:** "Here's the proposed design. Which option do you prefer? Any concerns?"

Wait for user feedback. Iterate if needed.

### Phase 3: Planning

Dispatch the **`genvid-dev:planner`** agent with the approved design document.

**Input:** the design document plus the user's chosen option and any feedback from Phase 2.

**Output:** an implementation plan with ordered tasks, domain assignments (see `CLAUDE.md` for the project's implementer-agent inventory), and risks.

**Checkpoint:** "Here's the implementation plan. Ready to proceed?"

Wait for explicit approval before saving. See [`approval-and-audit.md`](approval-and-audit.md) for the self-audit checklist to run before presenting.

### Phase 4: Save and Branch

1. Save the plan to the repo root as `plan.md` (or to the project's planning location if `CLAUDE.md` specifies one).
2. Create the branch named in the plan. When the current branch is only a few commits ahead of `origin/<default-branch>` and those commits naturally batch with the new work, prefer `git rebase origin/<default-branch> && git branch -m <new-name>` over spawning a fresh worktree. Spinning up a new worktree for one or two carry-forward commits trades one mechanical step for several.
3. **If continuing on the current branch**, verify it's up to date with the base branch:
   ```bash
   git log --oneline HEAD..origin/<default-branch>   # should be empty
   ```
   If behind, fast-forward (`git merge --ff-only origin/<default-branch>`) before starting. Stale-base execution produces a PR diff that mixes the plan's changes with upstream-merge noise.
4. **Commit the plan and any companion design docs as a single prep commit** before kicking off the first implementation task. This keeps git history in logical order (`prep → task 1 → task 2 → ...`) and prevents retroactive plan commits from landing after tested code. **Exception:** some repos gitignore `plan.md` (or the planning location) so it stays a local-only working artifact — check `git check-ignore plan.md` first. If it's ignored, that's intentional; don't force-add it. Skip the prep commit (or commit only the tracked companion design docs), and keep `plan.md` local.
5. The plan is now ready for execution.

### Dispatch resilience

Every phase above (and every implementer dispatch during execution) is delegated to an agent that can come back empty — it errors, or hits a session/token limit and returns an empty final message (`subagent_tokens: 0`). When that happens, **do not retry blindly or stall**:

- **Resume the same agent via `SendMessage` when that tool is available** — this reuses its accumulated context and is the cheapest recovery.
- **Otherwise, complete the phase inline from the prior phase's artifact.** The requirements doc, design doc, or the concrete touch points you already gathered usually carry enough to finish the next phase directly. Write the missing output yourself and continue, rather than re-running the whole dispatch from scratch.

## Execution (Post-Approval)

When the user says to execute:

1. **Check git log** — compare commit messages to plan tasks. Don't re-implement already-committed work.
2. **Delegate tasks** to the implementer agents per the plan's domain assignments. Use `genvid-dev:ts-implementer` for TypeScript work; the project may have additional domain-specific implementer agents listed in `CLAUDE.md`.
3. **Run `genvid-dev:validator`** after each implementation task.
4. **Run `genvid-dev:code-reviewer`** at the end. If it flags doc gaps, offer to dispatch `genvid-dev:tech-writer`.

## Shortcuts

For **simple tasks** (single-file, obvious implementation), compress the pipeline:

- Skip the analyst — state requirements inline
- Skip the designer if the approach is obvious
- The planner can produce a minimal plan directly

For an **issue that's already a full proposal** (rationale + proposed change + explicit open questions):

- Treat the **issue as the requirements doc** — skip the analyst.
- **Classify each open question before resolving it** — don't assume every one is a preference choice:
  - **Factual** (answerable from the code/repo — e.g. *"does the client read `result.success` for this handler?"*, *"does it re-query cache X after handler Y?"*) → resolve by dispatching the analyst (or an `Explore`/read-only investigation), folded into the current-state mapping. Do **not** ask the user — they usually don't know offhand, and only the code is authoritative. Asking can produce a worse plan (a factual question that resolves to a no-op once the code is read).
  - **Preference / scope** (a genuine product or design choice) → carry into a single `AskUserQuestion` call, one question per open question, recommended option first.

  Investigate the factual questions; only the preference questions go to `AskUserQuestion`. This replaces dispatching the designer.
- Present a combined design + plan in **one checkpoint**, explicitly flagging any friction the chosen answers introduce.
- Still produce `plan.md`, a prep commit, one-commit-each tasks, and the validator + code-reviewer gates.

For **continuation** of existing work:

- Read the project's tracking doc (if any) and the prior plan
- Check git log for completed tasks
- **Guard against a stale gitignored `plan.md`.** A gitignored plan lingers on disk after its branch merges, so an existing `plan.md` may describe *already-shipped, unrelated* work. Before treating it as continuation, confirm it maps to the current task — its branch is unmerged and its tasks aren't already in `origin/<default-branch>`'s log. If it's stale, treat the new work as a fresh plan — but **don't blindly overwrite a stale plan; first classify what kind of stale it is:**
  - **Already-shipped** — its branch is merged, its tasks are in `origin/<default-branch>`'s log, and no auto-memory references it. Overwrite freely.
  - **Unshipped / pending** — its branch is unmerged, its tasks aren't in `origin` yet, *or* a project auto-memory points at it as the live task list. This is an active artifact: **preserve it first** (rename to `plan-<topic>.md`) before writing the new plan, so you don't silently destroy pending work. (A gitignored `plan.md` is local-only, so an overwrite is unrecoverable — there's no git history to fall back on.)

  Either way, don't *resume* the stale plan as if it were this task's plan.
- If a `plan.md` exists with unexecuted tasks:
  1. Spot-check a few representative items from the plan against the current code to confirm they haven't drifted
  2. Present a brief summary: "Plan exists for X, Y tasks remaining. Ready to execute?"
  3. Skip the analyst — the plan is the requirements
  4. Skip design/planning unless the user flags issues
- If no plan exists or the approach changed, start from the next pending task — don't re-run analysis/design unless needed.

## Multi-Session Plans

For tasks spanning more than 10 files or 15 changes, structure the plan across multiple sessions. See [`multi-session.md`](multi-session.md) for the template structure and best practices.

## Key Principles

See [`${CLAUDE_PLUGIN_ROOT}/docs/development-principles.md`](../../docs/development-principles.md) for the full philosophy. Quick reference:

- **Iterative** — decide on what you know, work on what you decide, validate what you've done, investigate what you don't know.
- **MMMSS** — many much more small steps. Small steps beat large leaps.
- **Make the change easy first** — preparation (refactoring, tooling, tests) before the feature.
- **TDD with refactoring first** — if the test is hard to write, the design needs work.
- **The plan will change** — stop and reassess when reality contradicts a hypothesis. Scope is a beacon, not a driver.
