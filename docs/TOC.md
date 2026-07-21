# Documentation Index

This repo is the `gvt-dev` **plugin itself**, not a consuming game project — so
its "documentation" is the convention contract and the plugin components, not the
`docs/architecture.md` / `docs/runbook.md` set a consumer would have. Genvid skills
(`plan-task`, `run-retro`, `tech-writer`, …) consult this index to find what to
read and update.

## Plugin contract & guidance

- [`../plugin/CONVENTIONS.md`](../plugin/CONVENTIONS.md) — the public convention contract consuming repos satisfy (canonical source)
- [`../CLAUDE.md`](../CLAUDE.md) — maintainer guide: repo layout, commands, how to add skills/agents, release flow
- [`../README.md`](../README.md) — plugin overview and install instructions
- [`../plugin/docs/development-principles.md`](../plugin/docs/development-principles.md) — the philosophy behind the analysis → design → planning pipeline (incl. principle #7: five-dimension doc coverage + decision records)
- [`plugin-authoring.md`](plugin-authoring.md) — cross-plugin authoring gotchas (shipping MCP servers via `plugin.json`; `npx` package-name resolution; version pinning)

## Components

Each skill and agent carries its own documentation in its frontmatter (`metadata.expects`) and body:

- `../plugin/skills/*/SKILL.md` — one directory per skill
- `../plugin/agents/*.md` — flat agent definitions (analyst, designer, planner, code-reviewer, ts-implementer, tech-writer, validator, issue-triage-analyst)
- `../plugin/skills/triage-issues/SKILL.md` — interactive issue-backlog triage; reads project conventions from a consuming repo's `docs/issue-triage.md` + `bugTracker` block (scaffolds from `issue-triage.template.md` or the flat-label `issue-triage.flat.template.md`, auto-selected per the repo's label scheme — see SKILL.md §0)
- `../plugin/skills/plan-next-issue/SKILL.md` — orchestrator that goes backlog → plan: optionally triages (`triage-issues`), proposes a ranked shortlist of issues, then hands the choice to `plan-task`
- `../plugin/skills/reconcile-mcp-pin/SKILL.md` — maintainer skill: after a bundled MCP server pin is bumped in `plugin.json`, reconcile the agents' hand-enumerated tool inventories (read/mutate split, count-sanity-checked `npm pack` surface, stale-version sweep) and hand off to `release-plugin`
- `../plugin/skills/migrate-cordova-ci/SKILL.md` — migrate a Cordova plugin's CI/CD from CircleCI to GitHub Actions; bundles parameterized `android.yml`/`ios.yml` (smoke + distribute tiers) + `version-guard.js` templates (lifted from `cordova-plugin-marketplace`), encodes the 8 known CI gotchas, and runs a manual live-CI gate
- `../plugin/skills/maintain-wiki/SKILL.md` — maintain a project's LLM-wiki compounding-memory knowledge base (`ingest`/`query`/`lint`); scaffolds the three-tier `raw/`/`wiki/`/`docs/wiki-schema.md` layout; carries the `wiki-librarian` agent for its read-only `query` phase
- [`create-adr`](../plugin/skills/create-adr/SKILL.md) — author or chronologically insert an ADR on demand; dispatches `tech-writer` for scaffold/fill/index, owns the numbering + renumber-and-sweep
- [`../plugin/docs/decision-record.template.md`](../plugin/docs/decision-record.template.md) — MADR-lite decision-record (ADR) template; `tech-writer` scaffolds it into a consuming repo's `docs/decisions/` when dispatched from `plan-task` Phase 4 or the `create-adr` skill (see development-principles principle #7)

## Decision Records

This repo dogfoods the ADR convention it ships (see `development-principles.md` principle #7). Records live in `docs/decisions/` using the MADR-lite template at `plugin/docs/decision-record.template.md`, numbered in chronological decision order.

- [`decisions/0001-skills-as-directories-agents-as-flat-files.md`](decisions/0001-skills-as-directories-agents-as-flat-files.md) — why skills are directories (carrying supporting files) while agents are flat, stateless files
- [`decisions/0002-self-declaring-skill-contract.md`](decisions/0002-self-declaring-skill-contract.md) — why each component declares its prerequisites in `metadata.expects` and the audit aggregates them (with the `required: false` lever)
- [`decisions/0003-plugin-root-path-substitution.md`](decisions/0003-plugin-root-path-substitution.md) — why shared reference docs are cited via `${CLAUDE_PLUGIN_ROOT}/docs/…` rather than absolute or relative paths
- [`decisions/0004-agent-pipeline-with-user-checkpoints.md`](decisions/0004-agent-pipeline-with-user-checkpoints.md) — why `plan-task` runs analyst → designer → planner as separate agents with a user checkpoint between phases
- [`decisions/0005-git-subdir-plugin-layout.md`](decisions/0005-git-subdir-plugin-layout.md) — why the plugin lives under `plugin/` and ships via git-subdir rather than at the repo root or as a separate mirror
- [`decisions/0006-two-surface-external-system-pattern.md`](decisions/0006-two-surface-external-system-pattern.md) — why external-system config is split across a JSON block, a prose doc, a bundled template, and an exploration agent
- [`decisions/0007-five-dimension-doc-and-adr-convention.md`](decisions/0007-five-dimension-doc-and-adr-convention.md) — why durable architecture + compromise rationale lands in a committed decision record instead of the transient plan
- [`decisions/0008-orchestrator-owns-commit.md`](decisions/0008-orchestrator-owns-commit.md) — why dispatched implementers stage but don't commit, and the validator gate runs before the orchestrator's commit
- [`decisions/0009-finish-quality-over-additional-scope.md`](decisions/0009-finish-quality-over-additional-scope.md) — why finish-quality of touched code is part of a change's definition of done (principle #8) and can't be deferred
- [`decisions/0010-agent-dispatch-guide-domain-explorers.md`](decisions/0010-agent-dispatch-guide-domain-explorers.md) — why `plan-task` Phase 1 prefers a repo's named domain explorer over the generic analyst when one is declared
- [`decisions/0011-create-adr-skill-dispatch-design.md`](decisions/0011-create-adr-skill-dispatch-design.md) — why `create-adr` delegates all writes to `tech-writer` (not reimplementing), moves the MADR-lite template to `plugin/docs/`, and gates renumber blast radius with clean-tree + dry-run
- [`decisions/0012-stale-config-migration-state.md`](decisions/0012-stale-config-migration-state.md) — why the audit-conventions state detector gets a distinct `stale-config` state for the pre-rebrand `.genvid-agent.json` filename instead of falling through to `greenfield` or reusing `legacy`
- [`decisions/0013-migrated-state-conventions-resync-scoping.md`](decisions/0013-migrated-state-conventions-resync-scoping.md) — why the `--fix` CONVENTIONS.md resync is scoped to the migrated state only, leaving `pushScaffold`'s skip-if-exists intact for greenfield/stale/legacy
- [`decisions/0014-git-tracked-config-scan-for-retired-tokens.md`](decisions/0014-git-tracked-config-scan-for-retired-tokens.md) — why the retired-token scanner's config-file coverage is intersected with `git ls-files` rather than scanned by presence, so untracked local overrides (e.g. `.claude/settings.local.json`) can't trip false positives
- [`decisions/0015-maintain-wiki-design-boundaries.md`](decisions/0015-maintain-wiki-design-boundaries.md) — why `maintain-wiki`'s `wiki/`+`raw/` tiers live at the repo root (outside the hygiene scanners' `docs/**` walk), why `lint` stays a standalone verb never wired into `audit.mjs`, and why `ingest` is a new thin verb rather than a rewrite of `run-retro`/`condense-lessons`

## Scaffolding sources

- [`../plugin/skeleton/`](../plugin/skeleton/) — pristine placeholder convention files that `audit-conventions --fix` writes to a greenfield repo
- [`../examples/`](../examples/) — a worked, filled-in example consuming-repo (the Bunny game) for reference
