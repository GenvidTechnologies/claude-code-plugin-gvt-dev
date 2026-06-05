# Documentation Index

This repo is the `genvid-dev` **plugin itself**, not a consuming game project — so
its "documentation" is the convention contract and the plugin components, not the
`docs/architecture.md` / `docs/runbook.md` set a consumer would have. Genvid skills
(`plan-task`, `run-retro`, `tech-writer`, …) consult this index to find what to
read and update.

## Plugin contract & guidance

- [`../CONVENTIONS.md`](../CONVENTIONS.md) — the public convention contract consuming repos satisfy (canonical source)
- [`../CLAUDE.md`](../CLAUDE.md) — maintainer guide: repo layout, commands, how to add skills/agents, release flow
- [`../README.md`](../README.md) — plugin overview and install instructions
- [`development-principles.md`](development-principles.md) — the philosophy behind the analysis → design → planning pipeline

## Components

Each skill and agent carries its own documentation in its frontmatter (`metadata.expects`) and body:

- `../skills/*/SKILL.md` — one directory per skill
- `../agents/*.md` — flat agent definitions (analyst, designer, planner, code-reviewer, ts-implementer, tech-writer, validator, issue-triage-analyst)
- `../skills/triage-issues/SKILL.md` — interactive issue-backlog triage; reads project conventions from a consuming repo's `docs/issue-triage.md` + `bugTracker` block (see `skills/triage-issues/issue-triage.template.md` for the template)

## Scaffolding sources

- [`../skeleton/`](../skeleton/) — pristine placeholder convention files that `audit-conventions --fix` writes to a greenfield repo
- [`../examples/`](../examples/) — a worked, filled-in example consuming-repo (the Bunny game) for reference
