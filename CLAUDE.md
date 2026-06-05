# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

This repo is the **`genvid-dev` plugin** for Claude Code: shared skills, agents, hooks, and conventions used across Genvid game projects. It is published through a separate marketplace repo, [`genvid-holdings/claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace) (catalog name `genvid-plugins`).

Consuming repos install the plugin via Claude Code's `/plugin install` flow — there is **no submodule, no template engine, no render step**. Skills and agents are flat files that read project context at runtime from a small convention contract (`CLAUDE.md`, `CONVENTIONS.md`, `docs/TOC.md`, `.genvid-agent.json`) in the consuming repo.

The contract itself is documented in [`CONVENTIONS.md`](CONVENTIONS.md).

## Repo layout

```
claude-code-plugin-genvid-dev/
├── .claude-plugin/plugin.json    # Plugin manifest
├── .genvid-agent.json            # This repo's own contract config (dogfood — makes genvid skills work here)
├── CONVENTIONS.md                # Public contract (canonical source)
├── skills/<name>/SKILL.md        # One directory per skill
├── agents/<name>.md              # Flat .md files (not directories)
├── hooks/
│   ├── hooks.json                # Hook wiring (PreToolUse on Bash)
│   └── pre-commit-lint.js        # The actual hook script
├── docs/
│   ├── TOC.md                    # This repo's documentation index (dogfood)
│   └── development-principles.md # Shared reference imported by skills/agents
├── skeleton/                     # Pristine placeholder files greenfield --fix writes (source of truth for the scaffold)
├── examples/                     # Worked, filled-in example consuming-repo files (Bunny game) for reference
└── audit-conventions-evals/      # Skill eval harness (developer tooling)
```

**Important layout details:**

- **The plugin lives at the repo root** — `.claude-plugin/plugin.json` plus `skills/`, `agents/`, `hooks/`, `docs/` are all top-level.
- **Skills are directories** (`skills/<name>/SKILL.md`). The directory can include supporting files (sub-docs, scripts).
- **Agents are flat files** (`agents/<name>.md`). Subdirectories are NOT discovered by the plugin loader.
- **`skeleton/` is the scaffold's source of truth.** The greenfield `audit-conventions --fix` copies `skeleton/{.genvid-agent.json,CLAUDE.md,docs/TOC.md}` verbatim into a new repo (and `CONVENTIONS.md` from this repo's root). Edit the placeholder there, never a JS string literal. `skeleton/` holds *empty placeholders*; `examples/` holds a *filled-in* worked example — different purposes (see `skeleton/README.md`).
- **This repo dogfoods its own contract.** It carries a real `.genvid-agent.json` and `docs/TOC.md` so the genvid skills (`plan-task`, `run-retro`, `validator`, …) work when developing the plugin itself. The audit therefore classifies this repo as `migrated`, not `greenfield`.

## Commands

```bash
# Validate the plugin manifest and component frontmatter
claude plugin validate .

# Re-install / update the local plugin from the marketplace
claude plugin marketplace add https://github.com/genvid-holdings/claude-code-marketplace.git
claude plugin install genvid-dev@genvid-plugins
claude plugin update genvid-dev@genvid-plugins
claude plugin details genvid-dev

# Run audit-conventions tests
node --test skills/audit-conventions/scripts/test/*.test.mjs

# Run the audit script against this repo or any consuming repo
node skills/audit-conventions/scripts/audit.mjs           # validate
node skills/audit-conventions/scripts/audit.mjs --fix     # dry-run a migration
node skills/audit-conventions/scripts/audit.mjs --fix --apply  # apply
```

## Self-declaring skill / agent metadata

Every skill and agent in the plugin uses YAML frontmatter with custom `metadata.expects` declaring its prerequisites. The `audit-conventions` skill reads these declarations and validates them against the consuming repo.

```yaml
---
name: plan-task
description: Third-person what+when description — used by Claude for routing.
metadata:
  expects:
    files:
      - path: CLAUDE.md
        reason: Required file
      - path: docs/ARCHITECTURE.md
        required: false
        reason: Optional file
    config:
      - key: project.name
        in: .genvid-agent.json
        reason: Required config key
    tools:
      - command: git
        reason: Required tool
---
```

- Top-level frontmatter stays Anthropic's standard (`name`, `description`, `tools`, `model`).
- Custom data goes under `metadata` so `claude plugin validate` doesn't reject it.
- `required: true` is the default; only `required: false` is written. Mark a prerequisite `required: false` when it's **skill-conditional** (only one skill needs it) rather than part of the universal contract — the audit aggregates required expectations across all skills, so a skill-specific required file would make unrelated repos fail. The `package.json` expectation in `publish-npm-package` is the canonical example.
- The `reason` field is mandatory and load-bearing — it's what `audit-conventions` prints to explain why a missing item matters.

See [`CONVENTIONS.md`](CONVENTIONS.md) for the full contract.

## Adding a new skill

1. Create `skills/<verb-noun-name>/SKILL.md` with frontmatter (name, description, optional metadata.expects).
2. Avoid skill names containing `claude` or `anthropic` (reserved by Anthropic's validator).
3. Prefer verb-noun names that read alone (`commit-changes`, not `commit`) — avoids collisions with built-in Claude Code skills.
4. Verify with `claude plugin validate .`.
5. **Run the audit** — `node skills/audit-conventions/scripts/audit.mjs` (exit 0) — to confirm any new `required: false` expectations stayed optional and didn't widen the aggregated contract (see [Testing](#testing)).
6. **`CHANGELOG.md`** — add an `[Unreleased]` entry. A new invocable skill is consumer-visible surface, so it needs a version bump and a changelog note.
7. **`docs/TOC.md`** — add a one-line Components entry for discoverability (especially orchestrators or skills carrying notable config — the `triage-issues` line is the precedent).
8. Smoke-test by updating the local install (`claude plugin update genvid-dev@genvid-plugins`) and checking `claude plugin details genvid-dev`.

**If the new skill orchestrates other skills** (invokes them via the Skill tool rather than doing the work itself — e.g. `plan-next-issue` chains `triage-issues` → `plan-task`), keep it a *pure orchestrator*: it owns no exploration and no writes, it sequences the delegated skills and makes only the decisions *between* them. Redeclare any config it reads (e.g. a `bugTracker` key consulted to rank candidates) in its own `metadata.expects` as `required: false` — accurate, and since it's optional the audit's aggregated contract is unaffected. This differs from the agent-dispatching orchestrators (`plan-task`) and from the two-surface external-system pattern below: a pure orchestrator introduces no new agent, template, or contract file of its own.

**If the skill needs project-specific config for an external system** (a bug tracker, CI, a dashboard — anything the plugin can't infer), follow the **two-surface pattern** rather than hardcoding one tool or stuffing prose into JSON:

- **Structured access mechanics** → a namespaced top-level block in `.genvid-agent.json` (e.g. `bugTracker`: queries, command templates, key names). Lean, machine-read. Declared in the skill's `metadata.expects` as `required: false` (skill-conditional — see `CONVENTIONS.md`).
- **Prose conventions + recipes** → a doc under `docs/` (e.g. `docs/issue-triage.md`): taxonomy, policies, and the tracker-specific command recipes. Located by fixed headings.
- **A bundled template** alongside the skill (e.g. `skills/triage-issues/issue-triage.template.md`) that the skill offers to scaffold into the consuming repo when the doc is absent — never guess conventions.
- **A read-only exploration agent** (e.g. `issue-triage-analyst`) that does the fetching/analysis off the main thread and returns a structured report, so the orchestrator skill keeps the main context for decisions and writes. `triage-issues` is the reference implementation.

## Adding a new agent

1. Create `agents/<name>.md` — **flat file**, not a directory.
2. Agent frontmatter supports `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, plus custom `metadata`.
3. Skills dispatching the agent use `subagent_type: "genvid-dev:<name>"` — plugin agents are namespaced.

## Renaming a skill or agent

A rename touches more than the file — work the whole cross-reference surface:

1. **`git mv`** the file/directory (and any bundled sub-docs/templates) so history is preserved.
2. **Frontmatter `name:`** in the moved `SKILL.md` / agent `.md`, plus the body title and self-references.
3. **Dispatch references** — every `genvid-dev:<old-name>` (skills dispatching an agent) and `/genvid-dev:<old-name>` invocation mention.
4. **`metadata.expects` paths** — a renamed scaffolded doc (e.g. `docs/<x>.md`) is declared in *both* the skill and its agent.
5. **Cross-doc references** — `CONVENTIONS.md`, `CLAUDE.md`, `docs/TOC.md`.
6. **`CHANGELOG.md`** — add an `[Unreleased]` migration note; **leave shipped version entries intact** (they record what actually shipped).
7. **Leave `docs/superpowers/specs|plans/` historical artifacts unchanged** — they're dated design records.
8. **Decide config-schema scope** — a namespaced config block (e.g. `bugTracker`) can keep its name to avoid a consumer config break even when the skill is renamed; if so, note the intentional decoupling.
9. **Consumer impact** — a renamed invocation name or scaffolded doc path is **breaking**: it needs a version bump and a CHANGELOG migration note.
10. **Verify** — `claude plugin validate .` and `node skills/audit-conventions/scripts/audit.mjs` (exit 0).

## Adding shared reference content

Reference docs that multiple skills/agents import live at `docs/`. Reference them via `${CLAUDE_PLUGIN_ROOT}/docs/<filename>.md` — the substitution works in skill and agent content (but NOT in CLAUDE.md `@`-imports).

Sub-docs specific to one skill live alongside that skill (e.g., `skills/plan-task/multi-session.md`).

## Releasing a new version

Use `/genvid-dev:release-plugin` — it owns the full release runbook: assessing repo state (and distinguishing a stale local checkout from a genuine inconsistency), bumping `.claude-plugin/plugin.json` `version`, moving the `CHANGELOG.md` `[Unreleased]` section, authoring the `release: vX.Y.Z` commit, pushing the annotated `vX.Y.Z` tag, bumping the plugin's `source.ref` in the marketplace catalog, and handing off the consumer-facing `/plugin update` step.

The marketplace catalog ([`claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace)) pins this plugin by a **plain annotated `vX.Y.Z` tag** via the `source.ref` field in its `.claude-plugin/marketplace.json` — the tag string (minus `v`) must equal `plugin.json` `version`. Consumers pick up a release with `/plugin update genvid-dev@genvid-plugins`.

## Conventions in this repo

- **Commit messages**: scope-based freeform (`<scope>: <description>`), no ticket prefix. The `BUN-XXXX` format in `examples/` is illustrative of a *consuming* game project, not this repo.
- **Branches**: descriptive kebab-case, no prefix (e.g., `split-marketplace`).
- **Merging PRs**: merge commits are disabled — PRs are **squash-merged** (`gh pr merge <n> --squash`). A `--merge` will be rejected by the repository.
- **Skill names**: verb-noun, namespaced as `/genvid-dev:<name>` at invocation time.
- **Agent dispatch references** inside skills: always namespaced (`genvid-dev:validator`, `genvid-dev:analyst`, etc.).
- **Versioning**: `.claude-plugin/plugin.json` carries a semver `version`. Bump it when shipping a meaningful change to skills/agents/hooks.
- **Release tags**: plain annotated tags named `v<semver>` (e.g. `v2.0.0`). The marketplace pins by `source.ref` in `.claude-plugin/marketplace.json`, which must match the tag name exactly (tag minus `v` == `plugin.json` `version`).
- **License**: MIT-0 (`LICENSE` at repo root).

## Testing

The plugin has no top-level test runner (no `package.json`, no npm). The audit-conventions skill ships its own unit tests using native `node --test`:

```bash
node --test skills/audit-conventions/scripts/test/*.test.mjs
```

For skill/agent **content**, `claude plugin validate` catches schema errors, manual review catches content drift, and `claude plugin details` confirms the plugin's component inventory after changes.

**Executing a TDD-style plan for skills/agents** (e.g. via the superpowers `writing-plans` / `subagent-driven-development` flow): there's no test runner to make "write the failing test" literal, so map red→green onto the tools that exist. **Red** = a presence/structural check that fails before the file exists (`test -f …`, or a `grep` for required headings/frontmatter). **Green** = that same structural check passing, plus `claude plugin validate .`, plus `node skills/audit-conventions/scripts/audit.mjs` exiting 0 (proves new `required: false` expectations stayed optional and didn't widen the contract). Commit per task as usual.

For skill **behavior** — does Claude wielding the skill do the right thing? — there's a skill-level eval harness under [`audit-conventions-evals/`](audit-conventions-evals/) (see its README). It runs the skill against fixture consuming-repos via subagents and grades behavioral assertions (ran the validator vs. hand-rolled, identified state, previewed `--fix` before applying, stopped at the dry-run for approval). It's worth building one for a skill whose correctness is **objectively verifiable, state-dependent, or safety-gated**; judgment-heavy workflow skills (most of the plugin) don't need it. The harness is developer tooling — it requires Claude subagents, so it doesn't run in CI.
