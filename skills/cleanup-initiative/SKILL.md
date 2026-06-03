---
name: cleanup-initiative
description: Closes out a shipped phase of a multi-phase initiative (flips the Phases-table status) or fully retires a completed initiative (extracts improvements, verifies knowledge transfer, creates a successor for deferred work, deletes the directory). Requires the project to use an initiatives/<name>/ folder convention — adopt the convention, or skip this skill. Run after every shipped phase, not just at end-of-initiative.
metadata:
  expects:
    files:
      - path: docs/TOC.md
        required: false
        reason: Consulted to discover which project docs should hold extracted insights
      - path: CLAUDE.md
        required: false
        reason: Read for the project's commit format and any project-specific conventions around initiative folders
    tools:
      - command: git
        reason: Reads working tree, runs git rm, stages cleanup commits
      - command: grep
        reason: Searches source for inbound references to the initiative folder before deletion
---

# Cleanup Initiative

Close out an initiative — or a single shipped phase of a multi-phase initiative.

**Run this skill after every shipped phase, not just at end-of-initiative.** The multi-phase branch is short (steps 1–3 only) and prevents the recurring "initiative.md still says Planned for a shipped phase" drift that otherwise has to be backfilled by the next phase's prep commit.

For a fully-completed initiative, the skill additionally extracts improvement items, verifies knowledge transfer to project docs, creates a successor initiative for deferred work, and **deletes the original directory**. Completed initiatives have no lasting value — session plans accumulate, become stale, and create confusion. Git history preserves the directory if anyone needs to consult it later.

## Convention dependency

This skill assumes the project uses an `initiatives/<name>/` folder convention with an `initiative.md` per folder. If the project uses a different multi-session-workstream convention (ADRs, RFCs, roadmap files, etc.), don't run this skill — adapt the pattern to a project-local skill instead.

## Arguments

The user may specify an initiative directory name (e.g., `story-battle-menu`). If not provided, ask which initiative to clean up. Check `initiatives/` for available directories.

## Before You Start: Multi-Phase Initiatives

Some initiatives are designed as **living documents covering multiple phases** — they ship Phase 1, then Phase 2 in a follow-up PR, then Phase 3 (design or implementation), all under the same `initiatives/<name>/` folder. Look for a **Phases table** in `initiative.md` listing shipped vs planned vs design-pending status.

**Verify a non-shipped status against git before trusting it.** Stale status is the common failure mode, and it drifts in *both* directions. The skill already warns about a phase row that says `Planned` on already-shipped work; the inverse is just as common — the table says `in-progress`/`Planned` but the whole scope actually **shipped** (e.g. as a single PR), and trusting the table would wrongly skip cleanup of a genuinely-done initiative. Before concluding any phase is unshipped:

- Run `git log --oneline --grep '<initiative keyword>'` and/or look for a merge commit / PR matching the phase's scope.
- Cross-check one concrete deliverable from the plan against the working tree (e.g. "the migration this phase describes — is it already present in the code/data?").
- If git shows the work shipped but `initiative.md` says otherwise, treat the phase as complete (flip to the full close-out flow below) and note the status drift in the Step 7 summary.

If the initiative has any **genuinely** unshipped phases (Planned, Design-pending, In progress — and confirmed against git, not just the table):

1. **Do NOT delete the directory.** The folder is a long-lived working space; deleting it strands the next phase's plan.
2. **Do NOT create a successor initiative.** The "successor" is the next phase, which lives in the same folder.
3. **Update the Phases table in `initiative.md`.** Flip the just-shipped phase's Status from **Planned** (or **In progress**) to **Shipped**, and set the PR column to the merge commit's PR number. A stale Phases table is a recurring issue — the next `/genvid-dev:plan-task` invocation sees "Planned" on an already-shipped phase and has to discover the truth from `git log`. Fixing it here is the cheapest point in the cycle.
4. Run only steps 1–3 (inventory + knowledge transfer for the *shipped* phase).
5. Skip steps 4–6 (no successor, no memory migration, no directory deletion).
6. Step 7 summary: report which phase was closed; remind the user that phases M+ remain. Suggest extending the initiative with a phase-specific plan doc when ready (`initiatives/<name>/phase-N-plan.md`) rather than spawning a sibling folder.

Only proceed with the full delete-and-successor flow below if the initiative is **genuinely complete** — every phase listed in `initiative.md` is shipped, with no follow-up work planned. If unsure, ask the user.

## Steps

### 1. Read and inventory

Read `initiatives/<name>/initiative.md` and all session files in the directory. Classify every item into one of:

| Category | Description | Example |
|----------|-------------|---------|
| **Done** | Implemented and committed | Session N completed, commit hash listed |
| **Deferred** | Explicitly deferred to future work | "Deferred to follow-up", "Future cleanup" |
| **Improvement** | Quality/architecture improvement identified but not blocking | Performance optimization, code smell |
| **Open question** | Unresolved design/product question | Needs clarification before proceeding |
| **Bug** | Known bug not yet fixed | Race condition, edge case |

### 2. Verify knowledge transfer

For each non-obvious technical insight discovered during the initiative, check whether it's already documented. Consult `docs/TOC.md` for the project's documentation map and use an Explore agent for thoroughness.

Report each insight as FOUND (with location) or MISSING.

**Source-level documentation counts as canonical.** Test-file JSDoc headers, helper-file JSDoc, and inline-on-the-type comments are legitimate homes for non-obvious patterns — don't flag a concept as MISSING just because no `docs/<file>.md` describes it. Before declaring something MISSING, cross-check with `Grep` over the project's source directories for the relevant identifier or pattern name. If a test file has a multi-line JSDoc explaining a classification scheme, or a helper has full JSDoc explaining its API and lineage, that's sufficient knowledge transfer and no tech-writer dispatch is needed in Step 3.

**Grep source for inbound references to the initiative directory.** Initiative design docs are commonly cited from `@see` and "See …" JSDoc on type definitions written during the initiative. Those references go dead the moment Step 6 deletes the directory. Run:

```bash
# From the repo root, before any deletion:
grep -rn "initiatives/<name>" . --include='*.ts' --include='*.js' --include='*.md' --exclude-dir=node_modules 2>/dev/null
```

Adjust the include globs for the project's languages (consult `.genvid-agent.json` `project.languages`). For each hit, either:

- Redirect the reference to surviving documentation (the relevant test-file JSDoc, a `docs/` page, an entry in the project's lessons-learned doc).
- Strip the dead-link line as part of the same close-out commit.
- If the reference points at a **live data/code artifact** (not prose) that the project still consumes at build/validate/runtime — a checked-in snapshot, fixture, or generated file — redirect-or-strip is wrong. **Relocate the artifact to a permanent home** outside `initiatives/` (e.g. a `data/`, `fixtures/`, or `snapshots/` dir), update every reference, and — if a tool writes the artifact — repoint its default output. Only then proceed to deletion, or the delete removes a live dependency. Use `git mv` (not delete + recreate) to preserve the artifact's history; note that `git mv` can leave an empty source subdir that needs its own cleanup before the folder delete.

The doc-only check above does **not** catch this — it looks at outbound knowledge, not inbound references — and the gap is structural for any initiative whose design docs got cited by source `@see` annotations. Skipping this step ships dead JSDoc links into the default branch.

### 3. Transfer missing knowledge

For any MISSING items, delegate to the `genvid-dev:tech-writer` agent to add them to the appropriate doc. Follow the "document at point of discovery" principle — the right doc is the one a future developer would look in when encountering the same situation.

### 4. Create successor initiative

If there are Deferred, Improvement, Bug, or Open Question items, create a new initiative:

1. Create `initiatives/<new-name>/initiative.md`.
2. Organize items by category with priority ordering.
3. **Copy** any forward-looking files (specs, designs, proposals still relevant) from the original initiative into the successor — don't reference them by relative path, because the original directory will be deleted in step 6.
4. Include estimated effort per category where possible.

If the deferred items don't need any of the original specs/designs (e.g., the original initiative's plans/designs are fully spent and the follow-up is just a list of items), a single `initiative.md` summary file is sufficient — don't copy plan/design files just to have something there.

If there are no forward-looking items, skip this step.

### 5. Migrate worktree memories

If the current session is running in a git worktree (path contains `worktrees/`), memories stored in the worktree-specific memory directory will be lost when the worktree is deleted.

1. List memory files in the worktree memory path (under `~/.claude/projects/<worktree-id>/memory/`).
2. For each memory file, classify as:
   - **Durable** (feedback, reference) — migrate to the main repo memory path (under `~/.claude/projects/<main-repo-id>/memory/`).
   - **Stale project** (completed initiative status, ephemeral notes) — skip.
3. Copy durable files and update the main repo's `MEMORY.md` index.
4. Report what was migrated.

If not in a worktree, skip this step.

### 6. Delete the initiative directory

Once knowledge transfer is verified (steps 2–3) and any forward-looking content has been copied into a successor (step 4), delete the original directory:

```bash
git rm -r initiatives/<name>/
```

Use `git rm -r`, not `rm -rf` — `git rm -r` stages the deletion as a reviewable diff in `git status` and is reversible until commit. Plain `rm -rf` of a tracked directory skips the staging step.

`git rm -r` refuses to delete files with **unstaged local modifications**. A typical case: the multi-phase Step 0 row-flip in `initiative.md` was made earlier in the same session and not yet committed. Either commit the row-flip first (recommended — it preserves the final-state record in git history alongside the deletion commit's parent) or pass `-rf` to force-delete the unstaged edit. Discarding the row-flip leaves the deletion commit's parent showing the just-shipped phase as `Planned`, which is misleading for future archaeology.

This is not destructive — git history preserves the directory. Deleting it prevents stale session plans from accumulating in the working tree and confusing future readers.

Only skip this step if the user explicitly asks to keep the directory. If skipping, say why in the summary.

### 7. Summary

Report to the user:

- How many items in each category (Done / Deferred / Improvement / Bug / Open Question).
- Knowledge transfer status (N of M items already documented).
- What was created (successor initiative path, if any).
- Whether the original directory was deleted.
- Any items that need user decisions (open questions, priority ordering).
