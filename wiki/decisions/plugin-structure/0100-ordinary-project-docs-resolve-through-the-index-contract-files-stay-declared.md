---
type: decision-record
title: 'A component finds an ordinary project doc through the documentation index; only a contract file is declared at a fixed path'
description: 'An architecture, design-patterns, coding-conventions, runbook or lessons-learned doc is found through the documentation index, never declared in metadata.expects; a docs/ path the plugin defines stays declared, and a test keeps the declared docs/ paths to an allowlist.'
tags: [decisions, plugin-structure]
status: stable
---
# 0100. A component finds an ordinary project doc through the documentation index; only a contract file is declared at a fixed path

- **Status:** accepted
- **Date:** 2026-11-20
- **Issue:** #363 (`ts-implementer`, `analyst`, `designer`, `planner`), with #357 (`run-retro`), #388 (the other body prose) and #938 (the `plugin/CONVENTIONS.md` wording)

## Context

Some components name a project doc by a fixed path. Two kinds of doc are named that way.

- **A contract file.** The plugin defines its location: a skill scaffolds it there, or
  reads it at a fixed heading. Examples are `docs/TOC.md` (the documentation index),
  `docs/decisions/`, the three `docs/code-review-*.md` docs and `docs/issue-triage.md`.
  A repository that moves one sets a `paths` override, and the components resolve the
  declared path through it ([ADR-0062](0062-runtime-path-resolution-for-declared-expectations.md)).
- **An ordinary project doc.** The project decides where it lives. Examples are the
  architecture, design-patterns, coding-conventions, runbook and lessons-learned docs.
  The documentation index exists to say where such docs are.

`ts-implementer` declared three ordinary docs in `metadata.expects`
(`docs/architecture.md`, `docs/design-patterns.md` and `docs/coding-conventions.md`), and
its body told the agent to read them at those paths. `analyst`, `designer`, `planner` and
`run-retro` named the same docs in their bodies. A repository that moved the docs into its
wiki and listed them in its index got a green audit with three "file not found (optional)"
lines, and the agents read nothing. Observed in a consuming repository on 2026-08-18.

The declarations were `required: false`, which is correct, because not every project has
these docs. So nothing showed the breakage. A `paths` override per doc would hide the
lines, but it would make each repository repeat, in `.gvt-agent.json`, a location that its
index already records.

`condense-lessons` already did it the other way: "Consult `docs/TOC.md` to find the
project's lessons-learned doc", with a common path only as a fallback.

## Decision

**1. An ordinary project doc is found through the documentation index.** A component body
names the doc by its role (for example "the project's architecture doc"), tells the agent
to find it through the documentation index, and gives a common path only as the place to
look when there is no index or the index lists no such doc. The index is the file that
`plugin/CONVENTIONS.md` "Runtime path resolution" resolves for `docs/TOC.md`. The components
name no default for it, so a change of the default, such as the one #938 makes for a
repository with a wiki, leaves their text true. The statement of the rule in
`plugin/CONVENTIONS.md` belongs to #938.

**2. Only a contract file is declared in `metadata.expects` under `docs/`.** A component
that reads ordinary docs declares the index (`docs/TOC.md`, `required: false`) instead.
`ts-implementer` drops its three declarations and declares `docs/TOC.md`, like the other
eleven components that read the index.

**3. A test keeps the declared `docs/` paths to an allowlist.**
`test/expects-docs-contract.test.mjs` reads the frontmatter of every skill and agent, and
fails when a declared `docs/` path is not one of the contract files: `docs/TOC.md`,
`docs/decisions/`, `docs/code-review-context.md`, `docs/code-review-docs.md`,
`docs/code-review-patterns.md` and `docs/issue-triage.md`. To declare a new `docs/` path,
first decide that the plugin owns its location, then add it to the allowlist and to this
list. The test reads frontmatter only. Body prose is not checked, because a body can name a
common path as a fallback.

## Consequences

- A repository that keeps these docs in its wiki and lists them in its index gets them read,
  with no override. Its audit loses the three "file not found (optional)" lines of
  `ts-implementer`.
- A repository with no index and the docs at the common paths is not affected: the agents
  look there when there is no index.
- An agent reads the index before it reads these docs. That is one more file read when the
  docs are at the common paths.
- The fix for the body prose is split by file. #363 changes `ts-implementer`, `analyst`,
  `designer` and `planner`. #357 changes `run-retro`. #388 changes the remaining body prose
  that reads a `docs/` path. `condense-lessons` already follows the rule and is unchanged.
- The test does not prove that a component reads its ordinary docs through the index. It
  proves only that no component declares one. The body prose is checked by review.
