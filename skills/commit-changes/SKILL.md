---
name: commit-changes
description: Creates a git commit following the project's commit format and pre-commit conventions. Stages specific files, reviews what's about to be committed, formats the message per CLAUDE.md, and uses heredoc so multiline bodies survive shell quoting. Use when the user asks to commit, "make a commit", or finishes a unit of work ready to be recorded.
metadata:
  expects:
    files:
      - path: CLAUDE.md
        reason: Read for the project's commit message format (subject pattern, body conventions, trailers)
    tools:
      - command: git
        reason: All staging, diffing, and commit operations
---

# Commit Changes

Create a git commit following the project's conventions.

**Read `CLAUDE.md` first** for the project's commit format — subject pattern, body conventions, type prefixes, ticket-prefix rules, mistakes-to-avoid table. This skill carries the workflow; the format lives in the project.

## Pre-Commit Checklist

Before committing:

1. **Stage specific files** — avoid `git add -A` or `git add .`. Explicit staging prevents accidental inclusion of `.env`, credentials, or unrelated work.
2. **Review staged changes** — run `git diff --staged` to see exactly what's about to be committed.
3. **No sensitive files** — verify nothing under `.env*`, `credentials*`, or similar is staged.
4. **Lint passes** — most projects enforce this via pre-commit hook; verify the hook is in place or run the project's lint command (consult `.genvid-agent.json` `commands.lint`).
5. **Tests pass for code changes** — run the project's test command (`.genvid-agent.json` `commands.test`) when committing code.

## Commit Command Template

Use a HEREDOC for proper formatting — multiline messages and quoted content survive shell quoting:

```bash
git commit -m "$(cat <<'EOF'
<subject line following CLAUDE.md format>

<optional body explaining the why>

- Bullet point for a specific change
- Another bullet point if needed

Co-Authored-By: <your current model and version> <noreply@anthropic.com>
EOF
)"
```

**Co-author trailer:** include your current model identifier (the model you're running as right now) in the `Co-Authored-By` trailer. Don't hardcode an older model name.

## Common Mistakes to Avoid

These apply across projects regardless of format details:

| Mistake | Fix |
|---------|-----|
| `git add .` or `git add -A` | Stage specific files by name |
| Subject line over the project's char limit | Keep it concise; details go in the body |
| Bullets directly after the subject (no blank line) | Empty line before bullet lists |
| Using `--amend` after a hook failure | Create a NEW commit instead — the failed commit didn't happen, so `--amend` would modify the PREVIOUS commit |
| Hardcoded co-author model from an old session | Use the current model identifier |
| Skipping hooks with `--no-verify` | Fix the underlying issue; only skip if explicitly authorized |

## After Committing

Run `git log --oneline -1` to verify the commit was created with the expected subject.

If a pre-commit hook ran and modified files (formatter, linter), those changes are NOT in your commit — review with `git status` and either commit them as a separate fix or amend if appropriate per project policy.
