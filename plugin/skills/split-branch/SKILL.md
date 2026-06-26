---
name: split-branch
description: Splits a large feature branch into multiple stacked branches for easier code review, using cherry-pick or file-checkout techniques. Use when a branch has many commits across distinct logical sessions/phases, touches many files (>15) or has many commits (>10), or when the user explicitly asks to split a branch for review.
metadata:
  expects:
    files:
      - path: CLAUDE.md
        required: false
        reason: Read for the project's commit format and branching conventions
    config:
      - key: commands.validate
        in: .gvt-agent.json
        required: false
        reason: Run on each split branch to verify it independently passes
      - key: repo.default_branch
        in: .gvt-agent.json
        required: false
        reason: All split branches are compared against and rebased from the default branch; falls back to git symbolic-ref refs/remotes/origin/HEAD
    tools:
      - command: git
        reason: All branch, log, cherry-pick, and ref operations
---

# Split Branch

Splits a large feature branch into multiple stacked branches for easier code review.

**Default branch resolution:** read `repo.default_branch` from `.gvt-agent.json`; if absent, fall back to `git symbolic-ref --short refs/remotes/origin/HEAD`. Below, `<default-branch>` refers to this value.

## Prerequisites

1. On the feature branch with all commits ready.
2. Clean working directory (no uncommitted changes).
3. Understanding of the logical groupings — review commit history and any session plan artifact.

## Pre-Flight Checklist

Before proposing a split, verify each item:

- [ ] **Fetch origin** with `git fetch origin` — always compare against remote, not stale local refs.
- [ ] **List all commits** with `git log --oneline origin/<default-branch>..HEAD`.
- [ ] **Check for already-merged commits** — if any commit messages reference merged PRs, verify with `git log --oneline origin/<default-branch> -- <file>` to confirm they're already in remote.
- [ ] **Check file ownership per commit** (not just per session) with `git show --name-only <commit>` for each.
- [ ] **Identify interleaved commits** — files that appear in unexpected sessions (e.g., `CLAUDE.md` edits inside a feature session).
- [ ] **Identify plan-only commits** — these will be excluded; their content informs commit messages instead.
- [ ] **Identify process improvements** — `CLAUDE.md`, skills, agents should typically be in their own branch.
- [ ] **Map dependencies** — which groups depend on which (determines stacking order).
- [ ] **Verify no file conflicts** — same file modified in "independent" groups indicates a hidden dependency.

> **Important:** always use `origin/<default-branch>` (not local) for comparisons. Local refs may be stale, causing already-merged commits to appear in the analysis.

### Quick file-ownership check

```bash
for commit in $(git log --reverse --oneline origin/<default-branch>..HEAD | cut -d' ' -f1); do
  echo "=== $commit ===" && git show --name-only --oneline $commit
done
```

### Identify plan-only commits

```bash
git log --oneline origin/<default-branch>..HEAD --name-only \
  | grep -B1 "^plan.md$" | grep -v "^plan.md$" | grep -v "^--$"
```

## Process

### 1. Analyze the branch

```bash
git fetch origin
git log --oneline origin/<default-branch>..HEAD              # all commits
git log --oneline --name-only origin/<default-branch>..HEAD  # files per commit
git diff --stat origin/<default-branch>..HEAD                # total diff stats
```

### 2. Identify logical groupings

Review commits and group them by:

- **Feature / session** — work done in distinct phases
- **Domain** — files that belong together (scheduler, account, types, etc.)
- **Independence** — changes that don't depend on each other can be parallel

Common groupings:

| Group type | Example |
|------------|---------|
| Infrastructure | Constants, keys, templates, utilities |
| Feature A | Handler + tests for feature A |
| Feature B | Handler + tests for feature B |
| Type changes | Type definitions, mappings, re-exports |
| Documentation | `CLAUDE.md`, skills, agents, `docs/` |

### 3. Identify commits to exclude or move

| Commit type | Action |
|-------------|--------|
| `plan.md` updates | Exclude — use content for commit messages instead |
| `CLAUDE.md` in feature sessions | Move to process-improvements branch |
| Process docs (skills, agents) | Move to process-improvements branch |
| Mixed commits (feature + plan.md) | Cherry-pick, then exclude `plan.md` changes |

Separating process improvements keeps feature branches focused, makes process changes independently reviewable, and avoids polluting feature history with meta-changes.

### 4. Create stacked branches

Choose the technique that fits the split strategy.

#### Technique A — Cherry-pick (split by commit grouping)

Best when commits map cleanly to logical groups.

```bash
# Create first branch from origin
git checkout -b <group1-name> origin/<default-branch>

# Cherry-pick relevant commits (excluding plan.md-only commits)
git cherry-pick <commit1> <commit2> <commit3>

# Squash into a single commit with a descriptive message (follow the
# project's commit format from CLAUDE.md)
git reset --soft origin/<default-branch>
git commit -m "<commit message>"

# Create the next branch FROM the previous one (stacking)
git checkout -b <group2-name>
# Cherry-pick and squash...
```

#### Technique B — File checkout (split by file category)

Best when the split is by file type (e.g., code vs. data) and commits span both categories. Instead of cherry-picking individual commits, check out specific files from the original branch onto each stacked branch.

This technique has a sharp edge — `git checkout <branch> -- <path>` adds and updates files but never deletes files absent from the source branch, so split branches silently keep files that should have been removed. The full step-by-step (with the `git rm` reconciliation) lives in [`references/file-checkout-technique.md`](references/file-checkout-technique.md). Read it before using this technique.

### 5. Verify each branch

Each branch must independently pass the project's validate command (from `.gvt-agent.json` `commands.validate`).

### 6. Push all branches

```bash
git push -u origin branch1 branch2 branch3 ...
```

### 7. Create PRs

Use `/gvt-dev:create-pr` for each branch. Set targets to create a stack:

| Branch | Target |
|--------|--------|
| Branch 1 | `<default-branch>` |
| Branch 2 | Branch 1 |
| Branch 3 | Branch 2 |
| ... | ... |

`create-pr` will offer to add a `Closes #N` keyword for any issue a branch resolves. On a stacked PR that keyword won't fire until the stack reaches the default branch — so put it on (and expect the close from) the branch whose merge actually lands the fix on the default branch.

## Tips

- **Keep branches focused** — each should have a clear theme reviewers can understand at a glance.
- **Preserve dependencies** — if B depends on A's changes, stack B on A.
- **Squash wisely** — one commit per branch makes review cleaner.
- **Use session plans** — if a plan artifact is available, use session descriptions for commit messages.
- **Test incrementally** — verify each branch before creating the next.
- **Exclude tracking files** — `plan.md` stays on the original branch or is deleted.

## Common Pitfalls

| Pitfall | How to avoid |
|---------|--------------|
| Using local `<default-branch>` instead of `origin/<default-branch>` | Always `git fetch origin` first; local refs may be stale |
| Grouping by session without checking file ownership | Use `git show --name-only` for each commit, not just session ranges |
| Missing interleaved commits (e.g., `CLAUDE.md` in Session 1) | Run the pre-flight checklist before proposing splits |
| Inaccurate file counts in proposal | Use `git diff --stat` for each proposed branch range |
| Same file in multiple "independent" branches | Check for hidden dependencies; may need to stack instead |
| Forgetting to verify intermediate branches | Test each branch before creating the next |
| `plan.md` included in feature branches | Exclude plan-only commits; use content for commit messages |
| `git checkout <branch> -- <path>` doesn't delete removed files | Compare file lists between branches; explicitly `git rm` files absent from source |

## After Merge

After each PR merges (squash-merge recommended):

1. The PR host (Bitbucket / GitHub) typically auto-updates the next PR's target to `<default-branch>` after the parent merges. If not, manually update the destination branch.
2. Delete merged branches.
3. The original feature branch can be deleted after all PRs merge.
4. Stacked branches whose parent was just merged need a `--onto` rebase — see `/gvt-dev:rebase-stack`.

## References

- [`references/file-checkout-technique.md`](references/file-checkout-technique.md) — Technique B step-by-step and a worked `secrets-migration` split (26 commits → 6 branches).

## Related Skills

- `/gvt-dev:plan-task` — create multi-session plans (keep process improvements in separate commits)
- `/gvt-dev:create-pr` — create pull requests for each stacked branch
- `/gvt-dev:rebase-stack` — rebase remaining stack branches after a parent is squash-merged
- `/gvt-dev:run-retro` — analyze the session and suggest improvements
