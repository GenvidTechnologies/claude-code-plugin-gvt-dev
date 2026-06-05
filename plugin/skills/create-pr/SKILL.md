---
name: create-pr
description: Creates a pull request with a prepared title and description. Detects the host (GitHub vs. Bitbucket) from the git remote and uses gh CLI on GitHub or a copy-paste link on Bitbucket. Reads the project's PR title/body format from CLAUDE.md. Use when the user asks to open a PR, after a branch is pushed and ready for review.
metadata:
  expects:
    files:
      - path: CLAUDE.md
        reason: Read for the project's PR title format and test plan template
    config:
      - key: repo.default_branch
        in: .genvid-agent.json
        required: false
        reason: Default base branch; falls back to git symbolic-ref refs/remotes/origin/HEAD
      - key: repo.host
        in: .genvid-agent.json
        required: false
        reason: Override when the git remote is ambiguous (mirrored across hosts); otherwise inferred from the remote URL
    tools:
      - command: git
        reason: Remote inspection, branch info, commit log, diff stats
---

# Create PR

Creates a pull request by preparing details and either invoking `gh` (GitHub) or providing a copy-paste link (Bitbucket).

**Default branch:** read `repo.default_branch` from `.genvid-agent.json`; if absent, fall back to `git symbolic-ref --short refs/remotes/origin/HEAD`. Below, `<base>` refers to this value.

## Prerequisites

1. **Branch is pushed to remote:**
   ```bash
   git push -u origin <branch-name>
   ```
2. **Commits are ready:**
   ```bash
   git log --oneline origin/<base>..HEAD
   ```

## Process

### 0. Clean up scratch files

Check `git status` for stray scratch files at the repo root and handle them deliberately:

- **Ephemeral planning files** (e.g., `plan.md` at root, typically gitignored): if all tasks are complete, delete locally — the PR replaces it as the record of work. If tasks remain, ask the user.
- **Other root-level scratch artifacts** (any `*.md`, `*.csv`, `*.txt` outside `docs/` that looks like an in-progress draft): **ask the user before deleting**. These are often pre-session user scratch — offer "delete / move / keep" as explicit options.
- **Permanent docs and tracking files** (anything in `docs/`, project tracking files the project uses): leave alone.

### 1. Detect the git host

Inspect `git remote get-url origin` and pick the flow:

- Contains `github.com` → **GitHub** flow (Step 4a, uses `gh pr create`)
- Contains `bitbucket.org` → **Bitbucket** flow (Step 4b, copy-paste link)
- Anything else → check `.genvid-agent.json` `repo.host`, or ask the user

### 2. Gather information

```bash
git remote get-url origin
git branch --show-current
git log --oneline origin/<base>..HEAD       # commits on this branch
git diff --stat origin/<base>..HEAD          # file change summary
```

### 3. Determine the base branch

- Default: `<base>` (resolved above)
- If the branch is stacked on a feature branch: use that branch
- If the user specifies: use their choice

### 4. Prepare PR description

Read `CLAUDE.md` for the project's PR title format (some projects use a ticket prefix, some don't; some require a type tag like `[infra]`) and any project-specific test plan items.

Default description template (override sections per CLAUDE.md):

```markdown
## Summary

- Bullet point covering what changed
- Bullet point covering why
- Bullet point covering anything reviewers should pay attention to

## Changes

### <category>
- <specific file or area> — <what changed>
- <another>

### <category>
- ...

## Test plan

- [ ] <project-specific test items per CLAUDE.md>

🤖 Generated with [Claude Code](https://claude.ai/code)
```

### 4a. Create the PR — GitHub

Use the `gh` CLI directly (no copy-paste step). Pass the body via heredoc:

```bash
# Check if a PR already exists for this branch
gh pr view --json url,state,title 2>/dev/null

# If none exists, create it
gh pr create --base <base> --title "<title>" --body "$(cat <<'EOF'
## Summary

- ...

## Changes

### <category>
- ...

## Test plan

- [ ] ...

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)"
```

**Notes:**

- **Always pass the body via heredoc.** Never `--body "..."` with embedded newlines — quoting breaks across shells.
- **Draft PRs:** add `--draft` to `gh pr create`. (Bitbucket has no draft flag in the create URL — tell the user to mark it draft via `...` → "Mark as draft" in the PR interface after creating it.)
- **If a PR already exists:** do not create a second one. Either report the existing URL or use `gh pr edit <number> --body "$(cat <<'EOF' ... EOF)"` to update it (after user confirmation).
- **Return the PR URL** that `gh pr create` prints.

### 4b. Create the PR — Bitbucket

Bitbucket has no CLI flow that accepts a body — generate a link and have the user paste the description.

Parse the remote URL to extract the workspace and repo:

```bash
git remote get-url origin
# git@bitbucket.org:workspace/repo.git → workspace, repo
# https://bitbucket.org/workspace/repo.git → workspace, repo
```

Check whether a PR already exists (the `git push` output often prints `View pull request for <branch>: <url>`).

**If PR exists:** provide the existing PR URL.

**If no PR exists:** provide the create URL:

```text
https://bitbucket.org/<workspace>/<repo>/pull-requests/new?source=<source-branch>&dest=<base>
```

### 5. Present to user

For both providers, give the user:

1. The PR title (plain text).
2. The PR description in a **markdown code block** for easy copy-paste — even when `gh` already created the PR, this makes follow-up edits painless.
3. The PR URL — what `gh pr create` returned (GitHub), or the create/view link (Bitbucket).

## Tips

- Keep the summary to 3–5 bullet points.
- Group related changes under clear headings.
- Include specific file paths for significant changes.
- Always include the test plan checklist.
- Link to relevant documentation if applicable.
