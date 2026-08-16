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
- [ ] **Premises cross-checked against the artifacts they modify** — every concrete claim the plan inherited from an issue or proposal (replacement wording, a JSON/config shape, a snippet, a schema, a cited `file:line`) was diffed against the target file rather than transcribed. Where a claim and its target disagreed, the plan records **which source settled it** — an external spec, git history, or the artifact's own provenance — and, when the artifact was the wrong one, includes correcting it. An unresolvable conflict is surfaced at the checkpoint as an explicit fork, not silently decided (see [`development-principles.md`](../../docs/development-principles.md) principle #13). The same cross-check extends to a **behavioural claim** — an assertion about what a named subject (a function, tool, handler, command, or flag) produces, emits, returns, or rejects — except there's no target value to diff against: it's verified by reading that named subject in full, the discipline `designer.md`'s step 9, "Verify what you name before emitting," already owns.
- [ ] **Risks are actionable** — each risk includes how to detect or mitigate it, not just a concern.
- [ ] **Concrete mitigations are tasks** — if a risk's mitigation is a concrete action ("document X", "add Y validation", "comment on Z"), promote it to a task in the execution list rather than leaving it as a conditional ("if ambiguous", "if needed"). Mitigations written down during planning have already been decided — landing them with the change that introduces the risk is cheaper than a code-review round trip.
- [ ] **Documentation coverage (five dimensions)** — each dimension (implementation, design, architecture, purpose, compromise — see [`development-principles.md`](../../docs/development-principles.md) principle #7) is either covered by a doc the plan updates/creates, or explicitly recorded as "N/A because …" (one line). Mandatory to *address* every dimension; content is required only where it applies. Durable **architecture** and **compromise** rationale must land in a committed decision record (`docs/decisions/`), not the transient `plan.md`. When a doc is touched, **link the originating issue** rather than transcribing its full context. Any required doc update is a concrete mitigation — promote it to a task per the item above.
- [ ] **"Make the change easy, then make the easy change"** — tasks are structured so earlier tasks create seams/primitives that later tasks compose — not a flat list of independent work.
- [ ] **Deferrals classified** — every deferred or carved-out item is verified to be *additional scope* (its own slice is fine) rather than *finish-quality of the code this plan touches* (the inconsistencies #8 enumerates, visible in this change's own diff); finish-quality folds into its motivating task rather than becoming a separate cleanup task or follow-up issue (see [`development-principles.md`](../../docs/development-principles.md) principle #8).
- [ ] **Friction point audit done** — the `gvt-dev:designer` agent owns the friction audit. If you skipped the designer (simple-task shortcut), do at least a lightweight pass: missing seams, preparatory refactors, useful tooling.
- [ ] **Tool relationships** — if creating a new tool/command, documented how it complements existing tools in the same space.
- [ ] **Context management** — if there are 3+ substantial tasks, specified an execution strategy (subagents, fresh sessions, or single session) and the handoff mechanism (plan doc, committed code, mini-retros).
- [ ] **Acceptance criteria recorded** — the `## Acceptance Criteria` checklist was written to the issue body (or `docs/acceptance/<slug>.md` fallback) before execution begins. For a combined plan spanning multiple target issues, written to the **canonical** target only, with a pointer comment on every sibling (Phase 4 step 4) — the siblings are the half most easily skipped, so verify each one carries its pointer comment, not just that the canonical carries the checklist.
