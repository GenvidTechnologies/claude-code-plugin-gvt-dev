# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

This repo is the **`gvt-dev` plugin** for Claude Code: shared skills, agents, hooks, and conventions used across Genvid game projects. It is published through a separate marketplace repo, [`GenvidTechnologies/claude-code-gvt-marketplace`](https://github.com/GenvidTechnologies/claude-code-gvt-marketplace) (catalog name `gvt-plugins`, shared with `gvt-construct3`).

Consuming repos install the plugin via Claude Code's `/plugin install` flow — there is **no submodule, no template engine, no render step**. Skills and agents are flat files that read project context at runtime from a small convention contract (`CLAUDE.md`, `CONVENTIONS.md`, `docs/TOC.md`, `.gvt-agent.json`) in the consuming repo.

The contract itself is documented in [`CONVENTIONS.md`](plugin/CONVENTIONS.md).

## Knowledge base

Maintainer rules that are not loaded automatically. Read the page before its trigger applies.

- Before dogfooding a plugin orchestrator here, or when a dogfooded skill behaves unlike its source → [`wiki/maintainer/dogfooding-the-plugin.md`](wiki/maintainer/dogfooding-the-plugin.md)
- Before running the audit or `commands.validate` on Windows → [`wiki/maintainer/running-the-audit-on-windows.md`](wiki/maintainer/running-the-audit-on-windows.md)
- Before writing or editing a skill or agent `description` → [`wiki/maintainer/skill-frontmatter-rules.md`](wiki/maintainer/skill-frontmatter-rules.md)
- Before trusting a green audit when adding a skill or agent, or when writing a line-number citation → [`wiki/maintainer/audit-author-time-findings.md`](wiki/maintainer/audit-author-time-findings.md)
- Before adding audit logic or a content-scanning check, proving a scanner ignores a surface, or deciding whether a skill needs an eval harness → [`wiki/maintainer/testing-the-audit.md`](wiki/maintainer/testing-the-audit.md)
- Before starting a multi-issue chain, bumping `plugin.json` `version`, writing a CHANGELOG entry, or importing audit-core from outside `plugin/` → [`wiki/maintainer/release-cycle-rules.md`](wiki/maintainer/release-cycle-rules.md)

## Repo layout

The plugin lives under `plugin/` (published as a **git-subdir** to the marketplace); the repo root holds this repo's own dogfood contract, maintainer notes, examples, and eval harnesses.

```
claude-code-plugin-gvt-dev/
├── plugin/                           # The published plugin (git-subdir source)
│   ├── .claude-plugin/plugin.json    # Plugin manifest
│   ├── CONVENTIONS.md                # Public contract (canonical source)
│   ├── CHANGELOG.md                  # Plugin changelog (versioned consumer surface)
│   ├── skills/<name>/SKILL.md        # One directory per skill
│   ├── agents/<name>.md              # Flat .md files (not directories)
│   ├── hooks/
│   │   ├── hooks.json                # Hook wiring (PreToolUse on Bash)
│   │   ├── pre-commit-lint.js        # Lints commands.lint before every git commit
│   │   ├── git-state-guard.mjs       # PreToolUse entry point: denies state-mutating git for gvt-dev:* subagents
│   │   ├── lib/git-state-guard.mjs   # Pure, unit-tested classifier (dependency injected, testable with a stub parser)
│   │   └── test/                     # node:test suite for the classifier
│   ├── docs/
│   │   └── development-principles.md # Shared reference imported by skills/agents
│   └── skeleton/                     # Pristine placeholder files greenfield --fix writes (source of truth for the scaffold)
├── .gvt-agent.json                # This repo's own contract config (dogfood — makes genvid skills work here)
├── .pointer-baseline.json         # Accepted-debt ratchet for the pointer-anchor scan (regenerate with pointer-baseline.mjs, never hand-edit)
├── docs/
│   └── TOC.md                        # This repo's documentation index (dogfood)
├── wiki/
│   ├── process/issue-triage.md       # Dogfood consuming-repo triage conventions (resolved via paths)
│   └── maintainer/plugin-authoring.md  # Maintainer authoring notes (internal, not shipped)
├── examples/                         # Worked, filled-in example consuming-repo files (Bunny game) for reference
└── audit-conventions-evals/          # Skill eval harness (developer tooling)
```

**Important layout details:**

- **The plugin lives under `plugin/`** — `plugin/.claude-plugin/plugin.json` plus `plugin/skills/`, `plugin/agents/`, `plugin/hooks/`, `plugin/docs/`. The repo root carries only this repo's dogfood contract (`.gvt-agent.json`, `docs/TOC.md`, `wiki/process/issue-triage.md`), maintainer notes (`wiki/maintainer/plugin-authoring.md`), `examples/`, and the `*-evals/` harnesses.
- **Skills are directories** (`plugin/skills/<name>/SKILL.md`). The directory can include supporting files (sub-docs, scripts).
- **Agents are flat files** (`plugin/agents/<name>.md`). Subdirectories are NOT discovered by the plugin loader.
- **`plugin/skeleton/` is the scaffold's source of truth.** The greenfield `audit-conventions --fix` copies `plugin/skeleton/{.gvt-agent.json,CLAUDE.md,docs/TOC.md}` verbatim into a new repo (and `plugin/CONVENTIONS.md`). Edit the placeholder there, never a JS string literal. `plugin/skeleton/` holds *empty placeholders*; `examples/` holds a *filled-in* worked example — different purposes (see `plugin/skeleton/README.md`).
- **This repo dogfoods its own contract.** It carries a real `.gvt-agent.json` and `docs/TOC.md` at the repo root so the genvid skills (`plan-task`, `run-retro`, `validator`, …) work when developing the plugin itself. The audit therefore classifies this repo as `migrated`, not `greenfield`.

## Commands

```bash
# Validate the plugin manifest and component frontmatter
claude plugin validate plugin

# Re-install / update the local plugin from the marketplace
claude plugin marketplace add https://github.com/GenvidTechnologies/claude-code-gvt-marketplace.git
claude plugin install gvt-dev@gvt-plugins
claude plugin update gvt-dev@gvt-plugins
claude plugin details gvt-dev

# Install the audit's own runtime dependency (needed for a git checkout; the Claude Code cache installs it automatically)
npm ci --prefix plugin --ignore-scripts

# Run audit-conventions tests
node --test plugin/skills/audit-conventions/scripts/test/*.test.mjs

# Run the audit script against this repo or any consuming repo
node plugin/skills/audit-conventions/scripts/audit.mjs           # validate
node plugin/skills/audit-conventions/scripts/audit.mjs --fix     # dry-run a migration
node plugin/skills/audit-conventions/scripts/audit.mjs --fix --apply  # apply

# Maintain the pointer-anchor ratchet (.pointer-baseline.json) — never hand-edit it
node plugin/skills/audit-conventions/scripts/pointer-baseline.mjs                  # prune-only dry run: drops entries matching nothing, adds none
node plugin/skills/audit-conventions/scripts/pointer-baseline.mjs --write --accept-new  # also accept new debt; refuses, with no write, while any pointer is provably wrong
node plugin/skills/audit-conventions/scripts/pointer-baseline.mjs --rename <old>=<new>   # re-key a moved citing file's entries (dry run; add --write to apply)
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
        in: .gvt-agent.json
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

See [`CONVENTIONS.md`](plugin/CONVENTIONS.md) for the full contract.

## Adding a new skill

1. Create `plugin/skills/<verb-noun-name>/SKILL.md` with frontmatter (name, description, optional metadata.expects). Write the `description` to the rules in [`wiki/maintainer/skill-frontmatter-rules.md`](wiki/maintainer/skill-frontmatter-rules.md).
2. Avoid skill names containing `claude` or `anthropic` (reserved by Anthropic's validator).
3. Prefer verb-noun names that read alone (`commit-changes`, not `commit`) — avoids collisions with built-in Claude Code skills.
4. Verify with `claude plugin validate plugin`.
5. **Run the audit** — `node plugin/skills/audit-conventions/scripts/audit.mjs` (exit 0) — to confirm any new `required: false` expectations stayed optional and didn't widen the aggregated contract (see [`wiki/maintainer/testing-the-audit.md`](wiki/maintainer/testing-the-audit.md)). Read [`wiki/maintainer/audit-author-time-findings.md`](wiki/maintainer/audit-author-time-findings.md) before trusting the exit code.
6. **`plugin/CHANGELOG.md`** — add an `[Unreleased]` entry. A new invocable skill is consumer-visible surface, so it needs a version bump and a changelog note.
7. **`docs/TOC.md`** — add a one-line Components entry for discoverability (especially orchestrators or skills carrying notable config — the `triage-issues` line is the precedent).
8. Smoke-test by updating the local install (`claude plugin update gvt-dev@gvt-plugins`) and checking `claude plugin details gvt-dev`.

**If the new skill orchestrates other skills** (invokes them via the Skill tool rather than doing the work itself — e.g. `plan-next-issue` chains `triage-issues` → `plan-task`), keep it a *pure orchestrator*: it owns no exploration and no writes, it sequences the delegated skills and makes only the decisions *between* them. Redeclare any config it reads (e.g. a `bugTracker` key consulted to rank candidates) in its own `metadata.expects` as `required: false` — accurate, and since it's optional the audit's aggregated contract is unaffected. This differs from the agent-dispatching orchestrators (`plan-task`) and from the two-surface external-system pattern below: a pure orchestrator introduces no new agent, template, or contract file of its own.

**If the skill needs project-specific config for an external system** (a bug tracker, CI, a dashboard — anything the plugin can't infer), follow the **two-surface pattern** rather than hardcoding one tool or stuffing prose into JSON:

- **Structured access mechanics** → a namespaced top-level block in `.gvt-agent.json` (e.g. `bugTracker`: queries, command templates, key names). Lean, machine-read. Declared in the skill's `metadata.expects` as `required: false` (skill-conditional — see `CONVENTIONS.md`).
- **Prose conventions + recipes** → a doc in the consuming repo, under `docs/` by default (e.g. `docs/issue-triage.md`) and relocatable through a `.gvt-agent.json` `paths` override (ADR-0062): taxonomy, policies, and the tracker-specific command recipes. Located by fixed headings.
- **A bundled template** alongside the skill (e.g. `plugin/skills/triage-issues/issue-triage.template.md`) that the skill offers to scaffold into the consuming repo when the doc is absent — never guess conventions. When one contract has materially different shapes across repos, ship **multiple template variants** (e.g. `issue-triage.template.md` for a structured taxonomy vs. `issue-triage.flat.template.md` for a flat label set) and have the scaffold step **auto-select by probing the repo** (e.g. `gh label list` for a `type:`/`priority/` prefix), confirming the detected default rather than asking blind. **When the scaffolded doc lands under `docs/`, the scaffold step must also self-index it in `docs/TOC.md`** — add a one-line entry under a conventional section heading (offer interactively, auto in `--non-interactive`, idempotent, skip gracefully if `docs/TOC.md` is absent). The planning/triage skills discover docs *through* that index, so an unindexed scaffolded doc is invisible to them — the gap behind #90. `plan-task`'s `docs/decisions/` indexing (under `Decision Records`) and `triage-issues`'s `docs/issue-triage.md` indexing (under `Process`) are the precedents.
- **A read-only exploration agent** (e.g. `issue-triage-analyst`) that does the fetching/analysis off the main thread and returns a structured report, so the orchestrator skill keeps the main context for decisions and writes. `triage-issues` is the reference implementation.

## Adding a new agent

1. Create `plugin/agents/<name>.md` — **flat file**, not a directory.
2. Agent frontmatter supports `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, plus custom `metadata`. **`hooks`, `permissionMode` and `mcpServers` are ignored for plugin agents**. Claude Code warns "which is ignored for plugin agents. Use .claude/agents/ for this level of control." So a per-agent hook must live in `plugin/hooks/hooks.json` and scope itself by the payload's `agent_id`/`agent_type`, whose value for a plugin agent is `gvt-dev:<name>` (see ADR-0061). `tools`/`disallowedTools` take whole tool names only, not `Bash(<pattern>)` rules.
3. Skills dispatching the agent use `subagent_type: "gvt-dev:<name>"` — plugin agents are namespaced.

## Renaming a skill or agent

A rename touches more than the file — work the whole cross-reference surface:

1. **`git mv`** the file/directory (and any bundled sub-docs/templates) so history is preserved. *(Windows: `git mv` of a whole directory under an active file-watch — e.g. `plugin/skills/` — can fail with "Permission denied" while a node/editor process holds a watch handle; move its children individually into the new parent, then remove the emptied dir.)*
2. **Frontmatter `name:`** in the moved `SKILL.md` / agent `.md`, plus the body title and self-references.
3. **Dispatch references** — every `gvt-dev:<old-name>` (skills dispatching an agent) and `/gvt-dev:<old-name>` invocation mention.
4. **`metadata.expects` paths** — a renamed scaffolded doc (e.g. `docs/<x>.md`) is declared in *both* the skill and its agent.
5. **Cross-doc references** — `plugin/CONVENTIONS.md`, `CLAUDE.md`, `docs/TOC.md`.
6. **Tracker label / metadata descriptions** — an issue-tracker label whose *description* names the skill (e.g. the `triaged` label's `set by /gvt-dev:triage-issues`) is a cross-reference the repo-file scanners never see; update it with the tracker CLI (`gh label edit <name> --description …`). This surface is **invisible to `audit-conventions`' retired-token scan** (it walks `docs/**.md` + `CLAUDE.md` only), so it drifts silently across a rename or rebrand — exactly how the `triaged` label's description outlived both the #92 rebrand and the `triage-bugs`→`triage-issues` rename before this retro caught it.
7. **`plugin/CHANGELOG.md`** — add an `[Unreleased]` migration note; **leave shipped version entries intact** (they record what actually shipped).
8. **Leave `docs/superpowers/specs|plans/` historical artifacts unchanged** — they're dated design records.
9. **Decide config-schema scope** — a namespaced config block (e.g. `bugTracker`) can keep its name to avoid a consumer config break even when the skill is renamed; if so, note the intentional decoupling.
10. **Consumer impact** — a renamed invocation name or scaffolded doc path is **breaking**: it needs a version bump and a CHANGELOG migration note.
11. **Verify** — `claude plugin validate plugin` and `node plugin/skills/audit-conventions/scripts/audit.mjs` (exit 0).

## Adding shared reference content

Reference docs that multiple skills/agents import live at `plugin/docs/`. Reference them via `${CLAUDE_PLUGIN_ROOT}/docs/<filename>.md` — the substitution works in skill and agent content (but NOT in CLAUDE.md `@`-imports), and `${CLAUDE_PLUGIN_ROOT}` resolves to the `plugin/` directory.

Sub-docs specific to one skill live alongside that skill (e.g., `plugin/skills/plan-task/multi-session.md`).

When adding a **new** doc: add it to `docs/TOC.md` and an `[Unreleased]` `plugin/CHANGELOG.md` entry. Whether it needs a **version bump** depends on the doc's audience — and the move splits the two kinds across two directories:

- **Runtime-imported reference content** (pulled in by a skill/agent via `${CLAUDE_PLUGIN_ROOT}/docs/…`, e.g. `development-principles.md`) lives at `plugin/docs/`, ships to consumers, and is part of the plugin's behavioral surface → **bump**.
- **Maintainer/authoring notes** read only by humans working *on* the plugin (e.g. `wiki/maintainer/plugin-authoring.md`) live in the wiki bundle under `wiki/maintainer/`, listed in `wiki/maintainer/index.md`, and are internal → CHANGELOG entry for traceability, **no bump**.

## Releasing a new version

Use `/gvt-dev:release-plugin` — it owns the full release runbook: assessing repo state (and distinguishing a stale local checkout from a genuine inconsistency), bumping `plugin/.claude-plugin/plugin.json` `version`, moving the `plugin/CHANGELOG.md` `[Unreleased]` section, authoring the `release: vX.Y.Z` commit, pushing the annotated `vX.Y.Z` tag, bumping the plugin's `source.ref` in the marketplace catalog, and handing off the consumer-facing `/plugin update` step. The skill reads `paths.plugin_root` (`"plugin"`) from `.gvt-agent.json` to resolve those paths.

The marketplace catalog ([`claude-code-gvt-marketplace`](https://github.com/GenvidTechnologies/claude-code-gvt-marketplace)) pins this plugin by a **plain annotated `vX.Y.Z` tag** via the `source.ref` field in its `.claude-plugin/marketplace.json`, using a `git-subdir` source with `"path": "plugin"` — the tag string (minus `v`) must equal `plugin/.claude-plugin/plugin.json` `version`. Consumers pick up a release with `/plugin update gvt-dev@gvt-plugins`.

## Conventions in this repo

- **Commit messages**: scope-based freeform (`<scope>: <description>`), no ticket prefix. The `BUN-XXXX` format in `examples/` is illustrative of a *consuming* game project, not this repo. Individual commits carry the harness-standard `Co-Authored-By:`/`Claude-Session:` trailers when Claude Code authors them; since PRs are **squash-merged**, those per-commit trailers are collapsed away at merge, so the convention that reaches `main` is just the squash message — don't rely on the trailers surviving.
- **Branches**: descriptive kebab-case, no prefix (e.g., `split-marketplace`).
- **Merging PRs**: merge commits are disabled — PRs are **squash-merged** (`gh pr merge <n> --squash`). A `--merge` will be rejected by the repository.
- **Skill names**: verb-noun, namespaced as `/gvt-dev:<name>` at invocation time.
- **Agent dispatch references** inside skills: always namespaced (`gvt-dev:validator`, `gvt-dev:analyst`, etc.).
- **Release tags**: plain annotated tags named `v<semver>` (e.g. `v2.0.0`). The marketplace pins by `source.ref` in `.claude-plugin/marketplace.json`, which must match the tag name exactly (tag minus `v` == `plugin/.claude-plugin/plugin.json` `version`).
- **License**: MIT-0 (`LICENSE` at repo root).

## Testing

The plugin has no top-level test runner script. `plugin/package.json` exists, but only to declare the audit's one runtime dependency (`@genvidtech/audit-core`, see ADR-0060) — it carries no `scripts` block. `commands.validate`/`commands.test` run `npm ci --prefix plugin` first to install that dependency, then hand off to native `node --test`, which is what the audit-conventions skill's own unit tests use:

```bash
node --test plugin/skills/audit-conventions/scripts/test/*.test.mjs
```

For skill/agent **content**, `claude plugin validate` catches schema errors, manual review catches content drift, and `claude plugin details` confirms the plugin's component inventory after changes.
