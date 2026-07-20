# Genvid Plugin Conventions

This document is the contract between the `genvid` Claude Code plugin and the repositories that install it. Skills and agents in the plugin read project context from a small set of files at well-known paths. As long as your repo provides those files with the expected shape, the plugin's skills work without any per-repo configuration of the plugin itself.

If you're forking or adapting the plugin for your own org, this file is what you most need to read.

## The four convention files

| File | Purpose | Required |
|------|---------|----------|
| `CLAUDE.md` | Project context loaded by Claude Code on session start. Holds project-specific facts the plugin's skills reference (commit format, PR format, etc.). Imports this file with `@CONVENTIONS.md`. | Yes |
| `CONVENTIONS.md` | This file. Lives at the consuming repo's root as a copy of the plugin's canonical version, written by `/gvt-dev:audit-conventions --fix` on first migration. The plain audit warns on each run if this copy has drifted from the canonical; `/gvt-dev:audit-conventions --fix` (dry-run preview, then `--apply`) re-syncs it after the plugin updates. | Yes |
| `docs/TOC.md` | Index of the project's documentation. Used by planning skills to scope their work. | Yes |
| `.gvt-agent.json` | Capability registry — project name, build/test commands, repo settings, feature toggles. | Yes |

Anything else (architecture docs, runbooks, design patterns) is your own; the plugin doesn't depend on it.

Some skills scaffold a doc into `docs/` and **self-index it in `docs/TOC.md`** under a conventional section heading — `Decision Records` for ADRs (`/gvt-dev:plan-task`), `Process` for workflow/convention docs like `docs/issue-triage.md` (`/gvt-dev:triage-issues`). These sections are optional and created on demand. The index is the discovery surface, so a scaffolded doc that isn't indexed is invisible to the planning and triage skills.

> **Scope note:** genvid carries project-aware workflows, not generic tooling. It deliberately does not reimplement standalone PR review or code simplification — use Anthropic's official `code-review` (`/code-review`) and `code-simplifier` plugins for those. The `gvt-dev:code-reviewer` agent exists only as the `plan-task` review gate.

## Expected sections in `CLAUDE.md`

The plugin's skills look for these sections by heading. Wording can vary; the headings can be any level (`##`, `###`).

| Section | Used by | What it should contain |
|---------|---------|------------------------|
| `Commit Format` | `/gvt-dev:commit-changes` | The exact commit message format your team uses (subject line shape, body, trailers). |
| `Pull Request Format` | `/gvt-dev:create-pr` | PR title and body conventions; whether you use Bitbucket or GitHub if non-obvious from the git remote. |
| `Branching` | `/gvt-dev:rebase-branch`, `/gvt-dev:split-branch` | Branch naming, base branch, when to rebase vs. merge. |
| `Agent Dispatch Guide` | `/gvt-dev:plan-task` (Phase 1) | The project's domain-specific recon/explorer agent(s) (e.g. `<domain-plugin>:<explorer>`) so planning dispatches domain-aware recon instead of the generic `gvt-dev:analyst`. Omit it and planning falls back to the analyst. |

Skills tolerate missing sections — they fall back to generic behavior — but warn the user that project-specific guidance was unavailable.

## `.gvt-agent.json` schema

```json
{
  "project": {
    "name": "<short identifier, no spaces>",
    "description": "<one-line description>",
    "languages": ["<language>", ...]
  },
  "commands": {
    "test": "<shell command>",
    "lint": "<shell command>",
    "build": "<shell command>",
    "validate": "<shell command — usually a composition of the above>"
  },
  "repo": {
    "host": "<bitbucket|github — optional, inferred from git remote>",
    "default_branch": "<branch name — optional, inferred from git>"
  },
  "features": {
    "<flag>": <boolean>
  },
  "paths": {
    "<convention-key>": "<override path>"
  }
}
```

### Field reference

**`project`** (required object)
- `name` (required): short kebab-case or PascalCase identifier. Used in skill output headers.
- `description` (optional): one-line free-form.
- `languages` (optional): array of language identifiers (`typescript`, `rust`, `python`, etc.) for skills that adjust suggestions per language.

**`commands`** (required object) — shell commands the plugin's skills invoke verbatim.
- `test`, `lint`, `build`, `validate`: required if the corresponding skill is used. `/gvt-dev:validate-changes` reads `commands.validate`.

**`repo`** (optional object) — overrides only. Default values are inferred from the git remote and `git symbolic-ref refs/remotes/origin/HEAD`.
- `host`: explicit override when the git remote is ambiguous (e.g. mirrored on multiple hosts).
- `default_branch`: explicit override when the default branch isn't tracked by `origin/HEAD`.

**`features`** (optional object) — boolean toggles for team practices the plugin can't infer.
- Use sparingly. If a flag can be detected from repo state (`package.json`, file presence), prefer detection over a flag.
- Suggested toggles: `tdd` (project practices TDD), `monorepo` (multiple sub-projects in one repo).

**`paths`** (optional object) — two distinct uses, told apart by key name.
- **Convention-file overrides** — keys are convention-file names, values are the override path. Set only when a convention file lives somewhere non-default. Example: `{"docs/TOC.md": "documentation/INDEX.md"}`.
- **Reserved key `plugin_root`** — *not* a convention-file override. When this repo **publishes** a Claude Code plugin from a subfolder (so several plugins, or a plugin plus a dev/consumer workspace, can share one repo), `paths.plugin_root` names that subfolder — the directory containing `.claude-plugin/plugin.json` (e.g. `"plugin"`). Consumed only by `/gvt-dev:release-plugin`, which resolves `.claude-plugin/plugin.json`, `CHANGELOG.md`, `claude plugin validate`, and the release-triangle `git show` paths relative to it, and selects the `git-subdir` marketplace source shape. Defaults to `"."` (plugin at the repo root → current behavior, fully backward-compatible) when absent. Declared `required: false` in `release-plugin`'s `metadata.expects`. A convention-file override never uses the key name `plugin_root`.

### Skill-specific config blocks

The keys above are the shared core, but the schema is **not closed**. A single skill that needs project-specific config for an external system may introduce its own **namespaced top-level block** — e.g. `triage-issues` reads a `bugTracker` block (its fetch queries, command templates, and label names). Such a block:

- is declared by that skill's (or its agent's) `metadata.expects` with `required: false`, so the audit surfaces it as optional and never fails a repo that doesn't use the skill;
- is owned by the skill, not the shared contract — only repos that use the skill need it;
- may keep its name across a skill rename — the block name is decoupled from the skill name, so renaming the skill need not break consumer configs (note the intentional decoupling when you do).

This is expected extensibility, **not** schema drift. Keep these blocks lean (machine-read access mechanics); put prose conventions and command recipes in a `docs/<skill>.md` doc instead. (Reserve `features` for booleans the plugin can't infer; reserve a namespaced block for richer per-skill config.)

One scope caution for the `bugTracker` block: keep its `actionQuery` covering the **whole open backlog**, not narrowed to a single label (e.g. `--label bug`). `triage-issues` and `plan-next-issue` detect untriaged work by subtracting `triagedLabel` from `actionQuery`, so a label-scoped query silently hides untriaged issues that don't match the label and makes the backlog look groomed when it isn't.

A second example is `audit-conventions`' optional `hygiene` block, tuning its advisory repo-hygiene scanners (retired-token deny-list, broken intra-repo doc links, orphaned-doc check — see the skill for what each check does). Two optional keys, each with baked-in defaults so the block can be omitted entirely:

- `retiredTokens` (array) — **replaces** the default deny-list (`genvid:`, `genvid-dev:`, `genvid-c3`) when provided, since a repo's deny-list is a deliberate full override.
- `excludePaths` (array) — **unioned** with the default exclusions (`CHANGELOG.md`, `docs/superpowers/`, `docs/decisions/`) when provided, so a repo only needs to name what it wants to *add*. Applies to all three scanners. This repo's own `.gvt-agent.json` uses it to exclude `docs/plugin-authoring.md` (maintainer-only notes) from the token scan.

## How `/gvt-dev:audit-conventions` works

`audit-conventions` is the plugin's validator and migration tool.

**Validate mode** (default):
1. Reads every installed skill's frontmatter and collects its `metadata.expects` block.
2. For each declared expectation (file, config key, or shell tool), checks whether the current repo satisfies it.
3. Reports missing/mismatched expectations with the reason the skill needs them.

Run with no arguments to validate. Exit code is non-zero if any required expectation is unmet.

**Fix mode** (`--fix`):
1. Detects the repo's state — greenfield (no conventions yet), legacy (still on the old template-rendered system), or migrated.
2. **Greenfield:** scaffolds the four convention files with sensible defaults; any that already exist are left untouched and reported as SKIPPED.
3. **Legacy:** translates the old `claude-config.json` into `.gvt-agent.json`, adds the `@CONVENTIONS.md` import to `CLAUDE.md`, removes the `burbank-claude-config` submodule, and deletes files rendered from the legacy templates (using an embedded snapshot of the old manifest to avoid touching project-local additions).
4. **Migrated:** validates only; never modifies files.

`--fix --apply` refuses to run with a dirty working tree (the dry-run previews fine on a dirty tree) and prints the full plan before applying. Always review and commit the result yourself.

## Self-declaring skills

Every skill in the plugin declares its prerequisites in YAML frontmatter under `metadata.expects`. This is what `audit-conventions` reads.

```yaml
---
name: plan-task
description: Plan a multi-step implementation following project conventions
metadata:
  expects:
    files:
      - path: CLAUDE.md
        reason: Project context lives here
      - path: docs/TOC.md
        reason: Drives planning scope
      - path: docs/ARCHITECTURE.md
        required: false
        reason: Used if present
    config:
      - key: project.name
        in: .gvt-agent.json
        reason: Used in plan output headers
    tools:
      - command: git
        reason: Reports current branch
---
```

Three axes — `files`, `config`, `tools` — plus a mandatory `reason` on every entry. `required: true` is the default; only `required: false` is written explicitly. A skill with no prerequisites omits `expects:` entirely.

Because `audit-conventions` aggregates every installed skill's **required** expectations into one repo-wide check, a prerequisite that only one skill needs — and that isn't one of the four contract files — should be `required: false`. Otherwise every consuming repo's audit fails even when that skill is never used. (Same principle as the `commands.*` rule above: "required if the corresponding skill is used.") The `package.json` expectation in `publish-npm-package` is the canonical example.

## Forking and adapting

This plugin is intentionally generic. If your org has different conventions, the right move is usually to fork the plugin and edit the skill bodies — not to keep adding feature flags to `.gvt-agent.json`. The `.gvt-agent.json` schema deliberately stays small to keep the contract readable.
