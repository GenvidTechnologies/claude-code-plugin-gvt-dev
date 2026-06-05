# Documentation Index

This repo is the `genvid-dev` **plugin itself**, not a consuming game project — so
its "documentation" is the convention contract and the plugin components, not the
`docs/architecture.md` / `docs/runbook.md` set a consumer would have. Genvid skills
(`plan-task`, `run-retro`, `tech-writer`, …) consult this index to find what to
read and update.

## Plugin contract & guidance

- [`../plugin/CONVENTIONS.md`](../plugin/CONVENTIONS.md) — the public convention contract consuming repos satisfy (canonical source)
- [`../CLAUDE.md`](../CLAUDE.md) — maintainer guide: repo layout, commands, how to add skills/agents, release flow
- [`../README.md`](../README.md) — plugin overview and install instructions
- [`../plugin/docs/development-principles.md`](../plugin/docs/development-principles.md) — the philosophy behind the analysis → design → planning pipeline
- [`plugin-authoring.md`](plugin-authoring.md) — cross-plugin authoring gotchas (shipping MCP servers via `plugin.json`; `npx` package-name resolution; version pinning)

## Components

Each skill and agent carries its own documentation in its frontmatter (`metadata.expects`) and body:

- `../plugin/skills/*/SKILL.md` — one directory per skill
- `../plugin/agents/*.md` — flat agent definitions (analyst, designer, planner, code-reviewer, ts-implementer, tech-writer, validator, issue-triage-analyst)
- `../plugin/skills/triage-issues/SKILL.md` — interactive issue-backlog triage; reads project conventions from a consuming repo's `docs/issue-triage.md` + `bugTracker` block (scaffolds from `issue-triage.template.md` or the flat-label `issue-triage.flat.template.md`, auto-selected per the repo's label scheme — see SKILL.md §0)
- `../plugin/skills/plan-next-issue/SKILL.md` — orchestrator that goes backlog → plan: optionally triages (`triage-issues`), proposes a ranked shortlist of issues, then hands the choice to `plan-task`

## Scaffolding sources

- [`../plugin/skeleton/`](../plugin/skeleton/) — pristine placeholder convention files that `audit-conventions --fix` writes to a greenfield repo
- [`../examples/`](../examples/) — a worked, filled-in example consuming-repo (the Bunny game) for reference
