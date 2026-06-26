---
name: clear-worktree
description: Tears down a git worktree safely after recovering anything worth keeping — in-progress changes, unpushed commits, stashes, open PRs, and worktree-keyed auto-memory entries. Use when a worktree's branch has merged or its experiment is being abandoned, and the directory should be removed without losing work that was saved into the worktree-keyed memory dir.
metadata:
  expects:
    config:
      - key: repo.default_branch
        in: .gvt-agent.json
        required: false
        reason: Used to compare worktree branch against the project's default; falls back to git symbolic-ref refs/remotes/origin/HEAD
    tools:
      - command: git
        reason: All worktree, status, log, and ref operations
      - command: gh
        required: false
        reason: Lists open PRs against the worktree's branch when available
---

# Clear Worktree

Tears down a git worktree safely after recovering anything worth keeping: in-progress changes, unpushed commits, stashes, open PRs, and worktree-keyed auto-memory entries.

**Default branch resolution:** read `repo.default_branch` from `.gvt-agent.json`; if absent, fall back to `git symbolic-ref --short refs/remotes/origin/HEAD`. Below, `<default-branch>` refers to this value.

**Argument:** the worktree to clear (path or branch name). If omitted, list `git worktree list` and ask the user which one.

## When NOT to use

- The current shell is **inside** the target worktree — `cd` back to the main checkout first; `git worktree remove` cannot remove a worktree that contains the active CWD.
- The branch is still in active use — finish the work (see `/gvt-dev:rebase-branch`, `/gvt-dev:create-pr`) before removing the worktree.

## Step 1: Identify the worktree

```bash
git worktree list
```

Confirm the target with the user. Resolve the canonical absolute path. From that path, derive:

- **Branch**: the ref the worktree has checked out.
- **Memory dir slug**: the auto-memory directory key for that path. The harness slugifies the absolute CWD by replacing path separators and `:` with `-`. Example: `c:\repos\<project>\worktrees\<name>` → `c--repos-<project>-worktrees-<name>`.

The candidate auto-memory directory lives at `~/.claude/projects/<slug>/memory/` (Windows: `%USERPROFILE%\.claude\projects\<slug>\memory\`).

## Step 2: Check the worktree for recoverable work

Run from the main checkout, addressing the worktree with `git -C <worktree-path>`:

```bash
git -C <worktree-path> status                                  # uncommitted/staged changes
git -C <worktree-path> stash list                              # stashes
git -C <worktree-path> log @{u}.. --oneline                    # unpushed commits (if upstream is set)
git -C <worktree-path> log origin/<default-branch>.. --oneline # commits ahead of base
```

Also check:

- Untracked files that aren't ignored — `git -C <worktree-path> ls-files --others --exclude-standard`.
- Open PRs against the branch — `gh pr list --head <branch> --state all` (GitHub).

**Report findings to the user. If anything looks salvageable, stop and ask.** Do not auto-stash, auto-commit, or pass `--force` on the user's behalf.

## Step 3: Recover memory from the worktree slug

Worktree-keyed auto-memory dirs orphan when the worktree is removed — the slug never auto-loads again. Salvage anything worth keeping into the **main repo** memory dir before deleting.

```bash
ls ~/.claude/projects/<worktree-slug>/memory/    # POSIX
# Windows PowerShell:
#   Get-ChildItem $env:USERPROFILE\.claude\projects\<slug>\memory
```

If the directory is missing or empty, skip to Step 4.

If it contains entries:

1. Read its `MEMORY.md` index.
2. For each entry, classify:
   - **Project-general** (patterns, gotchas, diagnostic checklists, post-mortem learnings) → copy the file into the main repo memory dir (`~/.claude/projects/<main-repo-slug>/memory/`) and add a one-liner under the matching section of that dir's `MEMORY.md`.
   - **Worktree-specific** (in-progress branch state, half-decided initiative notes) → drop. The worktree is going away.
3. Show the migration plan and ask for confirmation before copying.
4. Watch for name collisions with existing entries in the main repo dir; rename or merge as needed.

## Step 4: Remove the worktree

```bash
git worktree remove <worktree-path>
```

**Submodule note**: if the repo uses git submodules, this fails with `working trees containing submodules cannot be moved or removed`. When that's the *only* blocker (Step 2 confirmed clean tree, no untracked files, branch is merged), `--force` is structural rather than dangerous — tell the user upfront that `--force` is needed only because of the submodule guard, and ask once. Don't surface it later as a mid-flow surprise.

If `--force` would be needed for any other reason (uncommitted changes, untracked files, unpushed commits), **stop and revisit Step 2**. Forcing past those discards unstaged work permanently.

After success, `git worktree list` should no longer show the entry. The directory may or may not be gone — see Step 5.

## Step 5: Clean up the leftover folder

`git worktree remove` deletes the directory in the simple case. If `--force` was used — typically because of a submodule guard — the worktree is unregistered from `git worktree list` but the on-disk folder commonly remains:

```text
error: failed to delete '<path>': Directory not empty
```

That message after `--force` on submodule-bearing repos is **expected** and not a failure. Proceed to manual cleanup:

```bash
rm -rf <worktree-path>                                       # POSIX
Remove-Item -Recurse -Force <worktree-path>                  # PowerShell
```

On Windows, bash `rm -rf` is sometimes permission-denied by the harness; if so, use:

```bash
powershell -Command "Remove-Item -Recurse -Force <worktree-path>"
```

Only delete after verifying nothing important remains — if Step 2 was skipped or forced past actual uncommitted work, this step is a point of no return.

## Step 6: Remove the orphan memory dir (optional)

Once Step 3 has migrated anything worth keeping, the worktree memory dir is dead weight. Optional cleanup:

```bash
rm -rf ~/.claude/projects/<worktree-slug>                            # POSIX
Remove-Item -Recurse -Force $env:USERPROFILE\.claude\projects\<slug> # PowerShell
```

Keep it if there's a specific reason (e.g., session transcripts under `subagents/` worth retaining for forensics).

## Step 7: Prune branch refs (optional)

If the branch was merged and the local ref is no longer needed:

```bash
git branch -D <branch>
git fetch origin --prune
```

## Common mistakes to avoid

1. **Removing the worktree without checking memory** — orphans cross-session learnings into a dir the harness will never auto-load again.
2. **Passing `--force` to `git worktree remove` past actual uncommitted work** — silently discards it. (`--force` past *only* a submodule guard, with a clean tree, is fine — see Step 4.)
3. **Running from inside the worktree being removed** — `cd` to the main checkout first.
4. **Treating worktree-specific notes as canonical** — those die with the worktree, by design; don't migrate them to main.
5. **Treating Step 5 as optional after `--force`** — submodule-bearing repos consistently leave the directory; manual `Remove-Item` / `rm -rf` is mandatory, not conditional.
