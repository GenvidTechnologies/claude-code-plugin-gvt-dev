# claude-code-plugin-genvid-dev

The **`genvid-dev` plugin** for Claude Code — shared skills, agents, and hooks used across Genvid game projects.

The plugin provides workflows for git (`commit-changes`, `create-pr`, `rebase-branch`, `rebase-stack`, `split-branch`), planning (`plan-task` with an analyst → designer → planner pipeline), validation, code review, session retrospectives, and convention auditing.

It is distributed through the [`claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace) catalog (marketplace name `genvid-plugins`).

## Install

```text
/plugin marketplace add https://github.com/genvid-holdings/claude-code-marketplace.git
/plugin install genvid-dev@genvid-plugins
```

After installing, run the audit:

```text
/genvid-dev:audit-conventions
```

The audit reports whether the repo satisfies the plugin's [convention contract](CONVENTIONS.md) — what files and config keys the installed skills and agents expect.

For a greenfield repo or a legacy setup migrating from the old template-rendered system, run with `--fix` (see [Migration](#migrating-from-the-legacy-template-rendered-setup) below).

## What the plugin provides

**Skills** (invoked as `/genvid-dev:<name>`):

| Skill | Purpose |
|-------|---------|
| `commit-changes` | Create a git commit following the project's CLAUDE.md format |
| `create-pr` | Open a PR (GitHub via `gh`, Bitbucket via copy-paste link) |
| `plan-task` | Analysis → design → planning pipeline with user checkpoints |
| `validate-changes` | Dispatch the validator agent on the project's full validation suite |
| `rebase-branch` | Rebase a feature branch with conflict resolution guidance |
| `rebase-stack` | Rebase a stacked branch after an earlier branch was squash-merged |
| `split-branch` | Split a large branch into reviewable stacked branches |
| `run-retro` | Session retrospective — proposes doc / skill / agent improvements |
| `sync-config` | Wraps `/plugin update genvid-dev` + audit re-run |
| `cleanup-initiative` | Close out an initiative folder (optional convention) |
| `condense-lessons` | Extract reusable insights from a lessons-learned doc |
| `publish-npm-package` | Set up a package to publish on npmjs via OIDC trusted publishing |
| `audit-conventions` | Validate / migrate against the convention contract |

**Agents** (dispatched via `subagent_type: "genvid-dev:<name>"`):

`analyst`, `designer`, `planner`, `tech-writer`, `ts-implementer`, `validator`, `code-reviewer`.

**Hook:** `pre-commit-lint` runs `commands.lint` from `.genvid-agent.json` before every `git commit` in the Bash tool.

**Complementary official plugins:** genvid-dev stays focused on project-aware workflows and intentionally does *not* reimplement generic tooling. For standalone PR review use Anthropic's `/code-review` command (its `code-review` plugin); for quality-only refactor passes use the `code-simplifier` agent. The in-pipeline `genvid-dev:code-reviewer` agent is scoped to the `plan-task` review gate, not full PR review.

## The convention contract

The plugin reads project context from four files in the consuming repo, in a contract documented at [`CONVENTIONS.md`](CONVENTIONS.md):

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context, imports `@CONVENTIONS.md` |
| `CONVENTIONS.md` | Copy of the plugin's canonical contract, synced by `/genvid-dev:audit-conventions --fix` |
| `docs/TOC.md` | Documentation index |
| `.genvid-agent.json` | Capability registry — project name, commands, repo overrides, feature flags |

Every skill and agent self-declares its expectations under `metadata.expects` in its YAML frontmatter — paths, config keys, and tools it needs. The `audit-conventions` skill walks these declarations and reports any unmet expectations against the consuming repo.

## Migrating from the legacy template-rendered setup

If your repo currently has a `burbank-claude-config` git submodule and a `claude-config.json` file at the root, run:

```text
/genvid-dev:audit-conventions --fix
```

The audit will print a dry-run summary of the migration: translating `claude-config.json` → `.genvid-agent.json`, adding the `@CONVENTIONS.md` import to `CLAUDE.md`, copying `CONVENTIONS.md` to the repo root, deleting rendered `.claude/` files (only files carrying the `AUTO-GENERATED` marker — user-edited files are kept and surfaced as SKIPPED notes), and removing the submodule.

Review the plan, then run:

```text
/genvid-dev:audit-conventions --fix --apply
```

The migration script refuses to run on a dirty working tree and doesn't auto-commit. After it runs, review `git status` / `git diff` and commit.

## Forking and adapting

The plugin is intentionally generic — it carries workflows, not project-specific content. If your org needs different conventions, fork the repo and edit the skill bodies directly. The `CONVENTIONS.md` schema is small on purpose; new feature flags or paths can be added there for non-inferable team practices.

## Contributing

Development guide in [`CLAUDE.md`](CLAUDE.md). Highlights:

- The plugin lives at the repo root; skills are directories with `SKILL.md`; agents are flat `.md` files in `agents/`.
- Top-level frontmatter is fixed (`name`, `description`, plus the Anthropic-supported fields); custom expectations go under `metadata`.
- Verb-noun skill names avoid collisions with built-in Claude Code skills.
- Validate with `claude plugin validate .`.
- Test `audit-conventions` with `node --test skills/audit-conventions/scripts/test/*.test.mjs`.
- Commits in this repo use scope-based freeform messages — no ticket prefix.
