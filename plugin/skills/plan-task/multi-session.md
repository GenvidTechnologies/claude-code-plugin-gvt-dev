# Multi-Session Plans

For large tasks (more than 10 files or 15 changes), structure the plan for multiple sessions.

## Template Structure

```markdown
# Plan: [Feature Name]

## Branch
<branch name following the project's CLAUDE.md branching convention>

## Summary
[1-2 sentence overview]

## Progress
| Session | Status | Commit |
|---------|--------|--------|
| 1: [Goal] | Pending | - |
| 2: [Goal] | Pending | - |

## Session 1: [Goal] (N files)
- [ ] Task 1 and commit
- [ ] Task 2 and commit

**Verification:** [How to verify this session is complete]

**Additional work done:** (fill in after session)
- [Unplanned work captured here]

## Session N Retro
**What went well:** ...
**Lessons learned:** ...
**Blockers discovered:** ...
```

## Best Practices

- **Audit related code first** — before Session 1, look for pre-existing bugs in related code.
- **Capture scope drift** — use "Additional work done" to record unplanned changes.
- **Update plan during execution** — mark `[done in Session N]` if tasks complete early.
- **Per-session retros** — capture lessons while fresh, not batched at the end.
- **Progress table** — update commit hash and status after each session.

## Session Sequencing

When planning a follow-up session, always:

1. Run `git log origin/<default-branch>..HEAD` to surface any untracked commits since the last recorded session. Informal work (fixes, scope additions on the same branch without a formal plan) won't appear in the progress table. If untracked commits exist, add them as an "untracked session" row at the top of the new plan.
2. Check the progress table to identify the next pending session.
3. Don't skip sessions — earlier sessions (e.g., exploration, scaffolding) create context that later sessions depend on.

## Project-Specific Tracking

Some projects have their own multi-session tracking convention (initiative folders, ADRs, RFCs). Consult `CLAUDE.md` for any such convention — when present, the project's convention takes precedence over the generic structure above, and the plan should be saved to the project's tracking location rather than the repo root.

## Session Management

For large plans (heavy codebase exploration or parallel subagent work), recommend splitting into separate sessions: plan in one session (commit `plan.md`), execute in the next (read `plan.md` and work through todos). This prevents context exhaustion before execution completes.
