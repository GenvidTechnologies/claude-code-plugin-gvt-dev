@CONVENTIONS.md

# Bunny

Bunny is an example live-ops game project. This file holds the project-specific facts the `genvid` plugin's skills read at session start. The contract for what goes here is in `CONVENTIONS.md` (imported above).

## Commit Format

```text
{type} - BUN-XXXX: One-line description (under 72 characters)

Optional body explaining the reason or goal of the changes.

- Bullet point for specific changes
- Another bullet point if needed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Required elements:**

1. **Type**: `feat`, `fix`, `refactor`, `docs`, `test`, or `chore`
2. **Separator**: ` - ` between type and ticket
3. **Ticket**: `BUN-XXXX` (use `BUN-0000` when no ticket)
4. **Colon and space** after the ticket
5. **Subject**: one line, under 72 characters, describes WHAT changed
6. **Empty line** before the body and before any bullet list
7. **Body** (optional): explains WHY the change was made
8. **Co-author** trailer: always included

Stage specific files (avoid `git add -A`). The pre-commit hook validates lint locally.

## Pull Request Format

Title under 70 characters. Body uses two sections:

```markdown
## Summary
- 1–3 bullet points covering what changed and why

## Test plan
- [ ] `npm run lint` passes
- [ ] `npm run levels:validate` passes (if level data changed)
- [ ] `npm run loc:validate` passes (if loc keys changed)
- [ ] `npm test` passes
- [ ] Manual testing completed (describe if needed)
```

PRs target `development`, not `main`.

## Branching

- Branch name format: `BUN-XXXX-lowercase-description` (use `BUN-0000` when no ticket)
- Base branch: `development` (also configured as `repo.default_branch` in `.genvid-agent.json`)
- Rebase, don't merge, when picking up upstream changes

## Project layout quick reference

See `docs/TOC.md` for the full documentation index.

- `scripts/` — game logic
- `eventSheets/` — event sheet JSON
- `docs/` — architecture, design patterns, runbooks
- `test/` — unit and integration tests
