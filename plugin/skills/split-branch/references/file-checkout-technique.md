# File-Checkout Technique & Worked Example

Read this when the split is **by file category** rather than by commit grouping — e.g., code vs. generated data, where the same commits touch both categories so cherry-picking individual commits won't cleanly separate them. For the common commit-grouping case, use Technique A (cherry-pick) in `SKILL.md`.

## Technique B — File checkout (split by file category)

Instead of cherry-picking individual commits, check out specific files from the original branch onto each stacked branch.

```bash
# Create first branch from origin
git checkout -b <group1-name> origin/<default-branch>

# Cherry-pick ALL commits without committing
git cherry-pick --no-commit <first>..<last>

# Unstage files that belong to the next branch
git reset HEAD -- path/to/data/ path/to/other/

# Restore unstaged files to clean working tree
git checkout -- path/to/data/ path/to/other/

# Remove untracked new files (they come back in the next branch)
git clean -f -- path/to/data/ path/to/other/

# Commit what remains staged
git commit -m "<commit message>"

# Create next branch stacked on this one
git checkout -b <group2-name>

# Check out the remaining files from the original branch
git checkout <original-branch> -- path/to/data/ path/to/other/

# IMPORTANT: also delete files that were removed on the original branch.
# git checkout only adds/updates — it does NOT delete files absent from
# the source branch. Compare file lists and git rm the extras:
#   diff <(git ls-tree --name-only <original-branch> -- path/) <(ls path/)
git rm <files-that-should-be-deleted>

git commit -m "<commit message>"
```

> **Gotcha with `git checkout <branch> -- <path>`:** only adds or updates files — does NOT delete files removed or renamed on the source branch. Always compare the file listing on both branches and explicitly `git rm` any files that should no longer exist.

## Worked example: secrets-migration split

Original branch: `secrets-to-internal-title-data` (26 commits, 35 files)

Split into:

| Order | Branch | Theme | Files |
|-------|--------|-------|-------|
| 1 | `secrets-infrastructure` | Keys, template, upload | 7 |
| 2 | `secrets-logger` | Logger injection | 5 |
| 3 | `secrets-scheduler` | Scheduler io param | 9 |
| 4 | `secrets-displayname` | SIFT secrets, CLI | 8 |
| 5 | `type-migration` | Move internal types | 6 |
| 6 | `process-improvements` | `CLAUDE.md`, skills | 4 |
