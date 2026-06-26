---
name: audit-conventions
description: Validates the consuming repo against the genvid plugin's convention contract — walks every installed skill and agent's metadata.expects (required files, config keys, tools) and reports missing/mismatched items with the reason each was needed. Default mode is read-only; --fix migrates a legacy or greenfield repo to the new contract. Use to check whether a repo satisfies the plugin's expectations or to surface drift after a plugin update.
metadata:
  expects:
    tools:
      - command: node
        reason: Runs the validator script
      - command: git
        reason: Reads repo metadata (remote, submodules) for state detection
---

# Audit Conventions

Validates the consuming repo against the `genvid` plugin's convention contract and reports findings.

**This skill ships a deterministic validator script.** The script does the actual checking; this body tells you when to run it, how to read the output, and how to act on findings.

## When to run

- After installing or updating the `genvid` plugin (the plugin may have added new expectations).
- Before opening a PR, to verify the repo still satisfies the contract.
- When `/gvt-dev:validate-changes` or another skill reports that an expectation isn't met.
- As the first step in a migration from the legacy template-rendered setup (see `--fix` mode below).

## Process

### 1. Run the validator

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/audit-conventions/scripts/audit.mjs"
```

The script:

1. **Detects state** — greenfield (no `.gvt-agent.json` and no legacy submodule), legacy (has the `burbank-claude-config` submodule + old `claude-config.json`), or migrated (has `.gvt-agent.json` and no submodule).
2. **Walks the plugin's installed skills and agents** at `${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/agents/*.md`.
3. **Parses each component's frontmatter** to collect `metadata.expects.{files,config,tools}`.
4. **Evaluates each expectation** against the current working directory.
5. **Prints a structured report** grouped by severity (errors for required-but-missing; warnings for non-fatal repo-health drift; info for optional-but-missing).
6. **Exits non-zero** if any required expectation is unmet (so the skill can be wired into CI).

### 2. Read the report

Each finding includes:

- The **component** that declared the expectation (skill or agent name).
- **What was expected** (file path, config key, tool command).
- **What was got** (missing, found-but-wrong-type, etc.).
- **The reason** the component needs it — verbatim from the component's `metadata.expects[].reason`.

When a required check is missing, take the reason seriously — it's what the skill author wrote down explaining the dependency.

### 3. Act on findings

- **Missing required file** — create it with project-appropriate content. The plugin's `CONVENTIONS.md` describes the expected shape of each convention file.
- **Missing required config key** — add the key to the named file (typically `.gvt-agent.json`) per the schema in `CONVENTIONS.md`.
- **Missing tool** — install the tool, or document in `CLAUDE.md` why the skill in question isn't usable in this repo. **Windows caveat:** the tool check probes the PATH of the *shell that launched the audit*, so a POSIX tool like `grep` (the `cleanup-initiative` requirement) reports **missing** from PowerShell but **present** from Git Bash, which puts `usr/bin` on PATH. That's an environmental difference, not a false positive — if a skill you actually use needs `grep`, run it from a shell that has the tool (or install it on the system PATH) rather than treating the finding as a bug.
- **State = greenfield** — run `/gvt-dev:audit-conventions --fix` to scaffold the four convention files.
- **State = legacy** — run `/gvt-dev:audit-conventions --fix` to migrate from the old template-rendered setup.

## `--fix` mode

Two-step, and the two steps belong in **two separate turns**: dry-run to preview, hand the plan to the user, then `--apply` only once they've seen it and said go.

**Step 1 — preview the plan:**

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/audit-conventions/scripts/audit.mjs" --fix
```

Prints the numbered list of actions that would be applied. No files are written. Surface the full plan to the user and **stop there.**

**Step 2 — apply the plan** (only after the user has seen the plan and approved it):

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/audit-conventions/scripts/audit.mjs" --fix --apply
```

Executes the same plan against the filesystem and prints per-action results.

> **Don't collapse the two steps into one turn.** A request like "set this repo up" or "migrate us over" authorizes the *goal* — it is not standing approval to run a *specific plan the user hasn't seen yet*. The plan can include irreversible actions (deleting `claude-config.json`, deinit-ing and `git rm`-ing the submodule, overwriting `CLAUDE.md`); the whole point of the dry-run is to let the user veto a surprising action before it touches their tree. So present the numbered plan and wait for an explicit go-ahead, even when the original request sounds like a green light. The one exception is a non-interactive context (CI, a `--apply`-from-the-start instruction) where the user has already opted into unattended application.

### Behavior by state

- **Greenfield** — scaffolds `CLAUDE.md`, `CONVENTIONS.md` (copy of the plugin's canonical), `docs/TOC.md`, `.gvt-agent.json`. The scaffolded files have placeholders the user fills in. Any of these that **already exist** are left untouched and reported as SKIPPED — a repo can own a hand-written `CONVENTIONS.md` or `CLAUDE.md` while still classifying greenfield (no `.gvt-agent.json`), and the scaffold never overwrites existing content.
- **Legacy** — translates the old `claude-config.json` into `.gvt-agent.json` (mapping the project's real `PACKAGE_MANAGER` / `TEST_COMMAND` / validation commands into `commands.*`, not generic `npm` placeholders), adds the `@CONVENTIONS.md` import to `CLAUDE.md`, copies `CONVENTIONS.md` to the repo root, deletes the rendered `.claude/` files that came from the legacy templates (only files carrying the `AUTO-GENERATED` marker — and no `LOCAL EDIT` block — are deleted; user-edited and locally-extended files are kept and surfaced in the SKIPPED notes), ports legacy per-agent context sidecars (`.claude/agents/*/project-*.md`) to their new `docs/` homes, removes dangling references to the deleted files (the `pre-commit-lint.js` hook entry in `.claude/settings.json`, submodule-referencing `package.json` scripts), and removes the `burbank-claude-config` submodule via `git submodule deinit` + `git rm`. After applying, it prints a **Manual follow-up** report listing any stale text references (in `CLAUDE.md`, `docs/`) or orphaned sidecars it could not clean up automatically.
- **Migrated** — refuses to "fix" anything (validation only). Tell the user the repo is already migrated.

### Safety rails

- Refuses to **apply** on a dirty working tree (commit or stash first, so the migration lands as a clean reviewable diff). The dry-run writes nothing to your repo and previews fine on a dirty tree.
- **Preview and apply against the same tree.** The plan is recomputed from the *current* working tree on every run, so a file that changes between the dry-run and `--apply` can change which actions fire. To keep that from passing silently, the dry-run **persists** its plan (to the OS temp dir, keyed by repo — nothing is written to your repo) and `--apply` **reconciles** the recomputed plan against it, printing a line that names any previewed action that no longer applies — e.g. `Applied 53 of 54 previewed actions — 1 previewed action no longer applies (re-run --fix to see the current plan)`, plus a note when new actions appeared since the preview. It warns and proceeds; it never blocks. Since apply requires a clean tree, if you previewed on a *dirty* tree and then committed or stashed to clean it, the reconciliation line will flag any drift — re-run the dry-run on the now-clean tree to refresh the plan before applying.
- Doesn't auto-commit. The user reviews `git status` / `git diff` and commits manually.
- User-edited rendered files (no `AUTO-GENERATED` marker) are preserved — the plan reports them as SKIPPED so the user knows what was kept.
- Rendered files that keep the `AUTO-GENERATED` marker but add a `LOCAL EDIT` block are also preserved (never silently deleted) — the plan flags them as SKIPPED so their local content can be ported before the file is removed by hand.

The full migration logic is in `scripts/lib/migrate.mjs`; this skill body just explains when and how to invoke it.

## Output format

The script prints findings as Markdown so the report renders cleanly when Claude surfaces it back to the user. Example:

```markdown
## Audit Results

State: migrated

### Errors (must fix)
- **plan-task** expects `CLAUDE.md` — file not found. Reason: Read for project conventions, branching, commit format, and the inventory of project-specific implementer agents beyond ts-implementer.

### Warnings
- `repo.host` is `bitbucket` but the `origin` remote is a github URL — set `repo.host` to `github` in .gvt-agent.json (or update the remote).

### Info (optional)
- **code-reviewer** expects `docs/code-review-context.md` — file not found (optional). Reason: Provides project-specific context (architecture, domain rules) for review.

### OK
- 18 of 19 required expectations satisfied.
```

The **Warnings** section holds non-fatal repo-health flags that aren't tied to a component expectation — currently `repo.host` drift (the configured host disagrees with the `origin` git remote). Warnings are excluded from the required-expectations tally and never affect the exit code; an absent `repo.host` or an unresolvable/unrecognized remote stays silent.

Exit code: 0 if no errors (warnings alone keep it 0); non-zero if any required expectation is unmet.

## CI integration

To wire audit into CI, invoke the script from a pre-merge step:

```bash
node /path/to/genvid/skills/audit-conventions/scripts/audit.mjs
```

Outside Claude Code, `${CLAUDE_PLUGIN_ROOT}` isn't substituted. In CI, either resolve the plugin's install path at job setup, or check the script in as a wrapper that points at the installed plugin (the plugin install lives in `~/.claude/plugins/cache/...` for user-scope installs).
