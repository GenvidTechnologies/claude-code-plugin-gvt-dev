# Plan Approval and Self-Audit

## User Approval Process

**Critical:** before executing the plan:

1. **Write the plan to `plan.md`** at the repo root (or to the project's planning location if `CLAUDE.md` specifies one).
2. **Display the plan properly formatted** in the conversation (not just a file write) so the user can review it directly.
3. **Ask whether the user has concerns or wants changes** — don't assume the first draft is ready for approval. Use `AskUserQuestion` to get explicit feedback.
4. **Iterate on feedback** — incorporate the user's changes, then present the revised plan.
5. **Wait for explicit approval** before creating the branch or making any changes.

The user must be able to see and review the complete plan in the conversation before approving. A plan is a conversation, not a deliverable — expect at least one round of feedback before it's ready.

**Do NOT use `EnterPlanMode`.** This skill has its own structured workflow (analysis → design → planning → execution). Plan mode's read-only constraints and separate plan file create friction: duplicate plan files, blocked writes to the planning location, and a redundant approval gate. Use `AskUserQuestion` for approval instead.

## Self-Audit Checklist

Before presenting the plan to the user, verify:

- [ ] **Committable units** — each task produces a single, independently committable change.
- [ ] **Dependencies verified** — prerequisite branches/PRs identified and checked against the base branch.
- [ ] **Scope check** — plan fits in one session. If not, use the multi-session structure from [`multi-session.md`](multi-session.md).
- [ ] **Pre-existing patterns** — checked the codebase for existing solutions before proposing new abstractions.
- [ ] **Risks are actionable** — each risk includes how to detect or mitigate it, not just a concern.
- [ ] **Concrete mitigations are tasks** — if a risk's mitigation is a concrete action ("document X", "add Y validation", "comment on Z"), promote it to a task in the execution list rather than leaving it as a conditional ("if ambiguous", "if needed"). Mitigations written down during planning have already been decided — landing them with the change that introduces the risk is cheaper than a code-review round trip.
- [ ] **"Make the change easy, then make the easy change"** — tasks are structured so earlier tasks create seams/primitives that later tasks compose — not a flat list of independent work.
- [ ] **Friction point audit done** — the `genvid-dev:designer` agent owns the friction audit. If you skipped the designer (simple-task shortcut), do at least a lightweight pass: missing seams, preparatory refactors, useful tooling.
- [ ] **Tool relationships** — if creating a new tool/command, documented how it complements existing tools in the same space.
- [ ] **Context management** — if there are 3+ substantial tasks, specified an execution strategy (subagents, fresh sessions, or single session) and the handoff mechanism (plan doc, committed code, mini-retros).
