---
name: rebase-stack
description: Rebases a feature branch onto the default branch after an earlier branch in its stack was squash-merged, skipping the now-obsolete merged commits via git rebase --onto. Use when the user mentions a stacked branch and reports that a parent was merged, or when a normal rebase produces unexpected conflicts that look like replayed already-merged work.
metadata:
  expects:
    files:
      - path: CLAUDE.md
        required: false
        reason: Read for the project's branching conventions
    config:
      - key: commands.validate
        in: .genvid-agent.json
        required: false
        reason: Run for post-rebase verification if defined
      - key: repo.default_branch
        in: .genvid-agent.json
        required: false
        reason: Used as the rebase target; falls back to git symbolic-ref refs/remotes/origin/HEAD
    tools:
      - command: git
        reason: All rebase, log, and ref-management operations
---

# Rebase Stack

Rebases a feature branch onto the default branch after an earlier branch in its stack was squash-merged.

**Default branch resolution:** read `repo.default_branch` from `.genvid-agent.json`; if absent, fall back to `git symbolic-ref --short refs/remotes/origin/HEAD`. Below, `<default-branch>` refers to this value.

## The Problem

After squash-merge:

```
<default-branch>: A -- B -- S    (S = squashed commit containing C1+C2)
your branch:      A -- B -- C1 -- C2 -- D1 -- D2
                           ↑ obsolete    ↑ your work
```

A normal `git rebase` fails because git tries to replay C1-C2, which conflict with S.

## Solution: `git rebase --onto`

```bash
git rebase --onto origin/<default-branch> <merged-branch-ref> HEAD
```

"Take commits AFTER `<merged-branch-ref>` and replay them on `origin/<default-branch>`."

## Process

### 1. Fetch and identify the merged branch

```bash
git fetch origin
git log --oneline origin/<default-branch> -10   # recent merges
git branch --list '<your-prefix>-*'             # local refs for stacked branches
```

### 2. Verify branch structure

```bash
git log --oneline --decorate origin/<default-branch>..HEAD
```

Find the branch ref that was merged — that's your `<old-base>`.

### 3. Rebase with `--onto`

```bash
git rebase --onto origin/<default-branch> <merged-branch-ref> HEAD
```

For stacks with multiple branch pointers, use `--update-refs` so intermediate refs are moved during the rebase:

```bash
git rebase --onto origin/<default-branch> <merged-branch-ref> HEAD --update-refs
```

### 4. If the local ref was deleted

Find the commit manually:

```bash
git log --oneline origin/<default-branch>..HEAD       # show all commits ahead of base
# Identify the LAST commit from the merged branch (just before your unique work)
git rebase --onto origin/<default-branch> <commit-hash> HEAD
```

Or check the reflog:

```bash
git reflog | grep <branch-name>
```

### 5. Resolve any conflicts

Conflicts may still occur if your work overlaps with other changes in `<default-branch>`. Normal conflict resolution:

```bash
# Edit conflicted files
git add <resolved-files>
git rebase --continue
```

### 6. Post-rebase verification

```bash
git log --oneline origin/<default-branch>..HEAD       # commit history looks right
```

Run the project's validate command (from `.genvid-agent.json` `commands.validate`) if defined.

### 7. Clean up

```bash
git branch -d <merged-branch-name>     # delete obsolete local ref
git push --force-with-lease            # after careful review
```

## Deep Stacks with `--update-refs`

For a deep stack (A → B → C → D) where A was merged:

```bash
git checkout <branch-d>
git rebase --onto origin/<default-branch> <branch-a> HEAD --update-refs
# --update-refs automatically moves B and C refs to their new positions
```

Verify all refs were updated:

```bash
git log --oneline --decorate origin/<default-branch>..HEAD
```

## When merging the parent CLOSED the child PR

Squash-merging the parent **with branch deletion** doesn't just orphan the child's commits — GitHub auto-**CLOSES** the child PR (not "MERGED-but-commits-lost", an outright *closed* state). And a closed PR **whose base branch was deleted cannot be reopened or retargeted**: both `gh pr edit <child> --base <default-branch>` and `gh pr reopen <child>` error out. There is no in-place recovery — you must rebuild the PR.

Recovery is the same `--onto` rebase followed by a **fresh** PR:

```bash
git rebase --onto origin/<default-branch> <old-parent-ref> <child-branch>
git push --force-with-lease
gh pr create --base <default-branch> ...    # the closed PR cannot be reused
```

**Prevent it:** before merging the parent, **retarget the child to `<default-branch>`** (`gh pr edit <child> --base <default-branch>`) while the child's base branch still exists. Once retargeted, merging (and deleting) the parent leaves the child a normal open PR against the default branch — no close, no rebuild.

## Troubleshooting

**`invalid upstream` error.** The branch ref was likely deleted. Find the commit hash via `git reflog | grep <branch-name>` or `git log --oneline origin/<default-branch>..HEAD`.

**Conflicts still occurring.** You may have identified the wrong base. Verify with `git log --oneline --graph origin/<default-branch> HEAD -20` — the `<old-base>` should be the tip of the merged branch, not a commit within it.

**Lost branch pointers after rebase.**
```bash
git reflog                          # find where branches were before rebase
git branch <branch-name> <reflog-hash>
```

**`--update-refs` didn't update a branch.** It may not have been in the rebase range. Manually update: `git branch -f <branch-name> <new-commit-hash>`.

## Recovery

```bash
git rebase --abort        # return to pre-rebase state (during rebase)
git reflog                # find pre-rebase HEAD (after a bad rebase)
git reset --hard <pre-rebase-hash>
```

## Comparison with Normal Rebase

| Situation | Command |
|-----------|---------|
| Simple rebase onto default branch | `git rebase origin/<default-branch>` |
| Rebase after squash-merge | `git rebase --onto origin/<default-branch> <merged-branch> HEAD` |
| Stack rebase with ref updates | `git rebase --onto origin/<default-branch> <merged-branch> HEAD --update-refs` |
