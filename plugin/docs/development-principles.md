# Development Principles

These principles guide all decision-making — analysis, design, planning, and implementation.

1. **Iterative development.** No two iterations are the same — some lean toward analysis and design, others toward implementation and testing. Decide on what you know, work on what you decide, validate what you've done, investigate what you don't know. Build tools when needed to investigate or validate.
   - Project workflow: Explore → Propose → Validate → Prepare → Implement → Reevaluate, with checkpoints between phases. See the `plan-task` skill for the full flow.

2. **Many Much More Small Steps (MMMSS).** On unfamiliar terrain, the shortest path is not the direct one — it's the one that gets you there. Small steps beat large leaps because you can't see the canyon until you're in it.

3. **Make the change easy, then make the easy change** (Kent Beck). Prepare the landscape so the actual feature is a confident small step on known ground. Preparation isn't just refactoring — it includes writing tools to validate or automate the change. Keep generic tools around.
   - Prepare/Feature split: P-steps (pure additions, no behavioral change) before F-steps (wire together). See the `plan-task` skill's Friction Point Audit.

4. **TDD with refactoring first.** A good test fails first, then you make it pass. If the test is hard to write, stop and go back to the drawing board — the design probably needs work. Refactoring comes before tests: make the code testable, write the failing test, then implement.
   - Red-then-green commit ordering for bug fixes: when a fix requires both an invariant change that *exposes* the bug and a behavioral change that *corrects* it, commit them in that order. The exposing commit flips an existing test (or a new one) to failing; the correcting commit turns it green. The commit log becomes a bisect-friendly regression record — no post-hoc revert-and-verify needed.
   - The validation gate runs before the commit; in an orchestrated pipeline the orchestrator owns the commit. A gate is only meaningful before the change is recorded — so an implementer dispatched by an orchestrator (e.g. `plan-task`) stages its files and leaves them uncommitted, and the orchestrator validates, then commits only on pass. Running standalone, the implementer commits itself. This keeps commit authorship uniform across a plan and stops a red task from landing committed. (#63)

5. **The first thing to fall on the battlefield is your plan.** You can't know what you don't know, including what you know wrong. When the plan is wrong, stop, figure out why, and decide what to do next — including backing up to reassess whether the goal still makes sense.

6. **Preview, then apply — across two turns.** When an action is irreversible (deleting files or directories, force-pushing, deinit-ing a submodule, overwriting committed content), show the concrete plan in one turn and execute it in the next, after the user has seen it and said go. A task request ("set this up", "migrate us", "clean it out") authorizes the *goal*, not blind execution of a specific plan the user hasn't seen yet — the whole point of the preview is to let them veto a surprising step before it touches their tree. The exception is a genuinely non-interactive context (CI, an explicit "just do it" / `--apply`-from-the-start instruction) where unattended execution was opted into up front.

7. **Document across five dimensions; link, don't transcribe.** Good documentation for a change covers, where each applies: **implementation** (how it works), **design** (how it's structured and why this shape), **architecture** (how it fits the wider system), **purpose** (what problem it solves / why it exists), and **compromise** (what was traded away, what was rejected). Address every dimension — one that doesn't apply gets an explicit "N/A because …", so coverage is a decision, not an omission. Durable **architecture** and **compromise** rationale lands in a committed decision record (`docs/decisions/NNNN-*.md`), because the plan is transient (gitignored, local-only). When a durable doc records a change, **link the originating issue** (GitHub `#N` or a Bitbucket issue URL — tracker-agnostic) instead of transcribing the full bug/purpose: the issue carries the context (low long-term noise), the doc carries the decision and a back-link.

None of these are strict rules. All of them can get you out of trouble before the trouble happens.
