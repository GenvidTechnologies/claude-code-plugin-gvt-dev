# 0001. Skills as directories, agents as flat files

- **Status:** accepted
- **Date:** 2026-05-31
- **Issue:** none — established at the v2.0.0 public release (the decision predates the public repo; pinned to its first recorded appearance)

## Context

Retroactive record. Claude Code's plugin loader discovers a plugin's two component
kinds differently: skills from `skills/<name>/SKILL.md` (a directory per skill), agents
from flat `agents/<name>.md` files. Subdirectories under `agents/` are **not** discovered.
The plugin had to decide where component-adjacent material (sub-docs, scripts, eval
harnesses, templates) lives, working within that loader contract rather than against it.

## Decision

Lean into the loader's shape rather than fight it. A **skill is a directory**
(`plugin/skills/<name>/SKILL.md`) and may carry supporting files alongside its manifest —
sub-docs (`plan-task/multi-session.md`), scripts and tests (`audit-conventions/scripts/`),
and bundled templates (`triage-issues/issue-triage.template.md`). An **agent is a single
flat file** (`plugin/agents/<name>.md`) with no local directory; anything an agent needs
to carry ships either in the skill that dispatches it or as a sibling skill directory.

Architecture: skills are the unit that accumulates infrastructure; agents stay stateless,
file-sized, and reusable across skills (one `validator` agent serves every gate).

## Compromise

Alternatives rejected:

- **Agents as directories too** — the loader doesn't discover them, so it would silently
  drop content; and it would invite per-agent local state, eroding agent reusability.
- **A custom recursive loader / build step** — re-introduces the render step this plugin
  deliberately avoids (flat files read at runtime, no template engine).

The cost: an agent that grows its own supporting material has nowhere native to put it and
must borrow a skill's directory, and the skill-vs-agent split is a rule every contributor
must learn (it is called out in `CLAUDE.md` and `CONVENTIONS.md`).

## Consequences

Adding a skill means creating a directory; adding an agent means creating one `.md` file —
`claude plugin validate` enforces the shapes. Skill directories became the home for the
eval harness, the audit scripts, and the bundled templates that later skills rely on. A
rename of a skill directory under an active file-watch can hit a Windows "Permission
denied" (see `CLAUDE.md`); agents, being single files, rename cleanly.
