---
type: decision-record
title: 'This repository keeps no docs/ tree: its documentation index resolves to wiki/index.md and no component requires docs/TOC.md'
description: 'The paths override resolves docs/TOC.md to wiki/index.md, docs/TOC.md is removed, condense-lessons declares it optional, and a test keeps docs/ empty; amends ADR-0067.'
tags: [decisions, wiki-and-okf]
status: stable
---
# 0099. This repository keeps no docs/ tree: its documentation index resolves to wiki/index.md and no component requires docs/TOC.md

- **Status:** accepted
- **Date:** 2026-11-20
- **Issue:** #939 (this repository's `docs/` tree), with #375 (`condense-lessons` requires `docs/TOC.md`); epic #579
- **Amends:** [ADR-0067](0067-decision-records-move-into-the-wiki-bundle.md), the last sentence of decision 1 and the matching Consequences sentence (the pointer row in `docs/TOC.md`), as the Architecture paragraph below states

## Context

Epic #579 moved this repository's documentation into the wiki bundle. Its scope said
that `docs/TOC.md` stays, because it is a required contract file, and that
`docs/superpowers/` stays frozen. [ADR-0067](0067-decision-records-move-into-the-wiki-bundle.md)
then left `docs/TOC.md` with one pointer row into `wiki/decisions/index.md`. After those
moves, `docs/` held three tracked files: that index and one dated plan and one dated spec
from 2026-06.

Two defects kept the three files in place.

- **A required file that most readers do not need (#375).** The audit aggregates the
  required expectations of all components. `condense-lessons` was the only one of the 11
  declarations of `docs/TOC.md` without `required: false`. So every repository without
  `docs/TOC.md` failed the audit, even one that never ran the skill.
- **A docs root that holds nothing the wiki does not.** The index of a repository that
  keeps its documentation in the wiki bundle is `wiki/index.md`. The `docs/TOC.md` file
  was a second, partial index: its links to bundle pages repeated `wiki/index.md`, and
  its other entries repeated `CLAUDE.md` and `README.md`.

The two dated records have a third constraint. The superpowers plugin writes its
brainstorming specs and plans into `docs/` by default. A recursive scan of `docs/` would
match them, and a record can carry a retired name as accurate history. The non-recursive
scan of `triage-issues` §0 exists for that reason
([ADR-0020](../skill-shapes/0020-near-miss-contract-resolution.md)). That section named
this repository's records as its proof case, so moving them makes the section stale.

## Decision

**1. The documentation index resolves to the wiki.** `.gvt-agent.json` sets
`paths['docs/TOC.md']` to `wiki/index.md`, and `docs/TOC.md` is removed. The audit then
takes the wiki bundle as the docs root and declines its link and orphan checks there
([ADR-0053](0053-audit-conventions-declines-bundle-content-to-wiki-lint.md)). The wiki
lint covers those two checks for the bundle. `wiki/index.md` states that it is also the
documentation index of the repository and names the documents outside the bundle
(`plugin/CONVENTIONS.md`, `README.md` and the references under `plugin/docs/`). `CLAUDE.md`
links `plugin/CONVENTIONS.md` and the `plugin/docs/` references.

**2. No component requires `docs/TOC.md`.** `condense-lessons` declares it
`required: false` (#375), and `plugin/CONVENTIONS.md` marks the file as not required.
The #375 change is a behavioural skill change, and the 5.2.0 release cycle carries it.
Recording this decision changes no version. The two changes cover different cases:

- The override gives this repository a resolved documentation index.
- The `required: false` declaration stops any repository without the file from failing
  the audit over a skill it never used.

Each leaves open the case that the other closes.

**3. The 2026-06 superpowers plan and spec move unchanged.** They move from
`docs/superpowers/plans/` and `docs/superpowers/specs/` to `raw/superpowers/plans/` and
`raw/superpowers/specs/`, with no text change and no capture header. `raw/` is immutable
by the wiki schema, and no hygiene scanner or pointer root walks it. A committed edit of
either file is a modification of a `raw/` file, which the wiki lint reports.

**4. This repository keeps no `docs/` tree.** A `CLAUDE.md` rule says so and says where a
tool-written design record goes: untracked while it changes, then committed under
`raw/superpowers/`. `test/no-docs-tree.test.mjs` fails when `git ls-files -- docs` lists
a file. `commands.test` and `commands.validate` run it.

**5. `triage-issues` §0 states its reason generically.** The non-recursive scan is
explained through the superpowers default location, not through this repository. The rule
is unchanged.

**Architecture.** The documentation index is a contract file with a `paths` override, as
[ADR-0062](../plugin-structure/0062-runtime-path-resolution-for-declared-expectations.md)
defines. This repository now uses that mechanism for the index, as it already did for the
decision records and the wiki schema. ADR-0067 said that `docs/TOC.md` carries one pointer
row into `wiki/decisions/index.md`. That state no longer holds: the file does not exist,
and `wiki/index.md` is the index. ADR-0067 is amended in part. Its decision to move the
records into the bundle stands.

## Compromise

Alternatives that were rejected:

- **The override alone.** The audit passes in this repository, but the inconsistency of
  #375 stays for every consumer without `docs/TOC.md`.
- **The #375 fix alone.** No component gets a resolved documentation index. The docs root points at a
  `docs/` folder that is absent, the audit prints 11 optional lines for the missing file,
  and it reports that the orphan check was skipped because no documentation index was found.
- **Placing the two records under `wiki/`.** It was measured on a scratch copy: the move
  gave 10 retired-token Info findings and 2 orphan findings. It also broke the bundle's
  frontmatter rule, so the OKF conformance claim for the bundle would no longer hold.
- **Deleting the records.** They are dated design records, and the move must keep their
  text byte for byte.
- **A new top-level `history/` directory.** `renumber-adrs` does not freeze it, so a
  file there is not protected from edits.

What is given up or not known:

- This repository no longer exercises the `docs/superpowers/` default exclusion on real
  data. Temporary fixtures in the audit tests still do.
- It is not known whether the components that name `docs/TOC.md` literally follow the
  `paths` override. The skills are `audit-conventions`, `cleanup-initiative`,
  `condense-lessons`, `create-adr`, `plan-task`, `run-retro` and `triage-issues`. The
  agents are the analyst, code-reviewer, designer, planner, tech-writer and
  ts-implementer; the ts-implementer reads the file only when it is present.
  No authoritative source says so, and no check was run. If they do not, they see the
  index as absent. After the `required: false` fix that is a clean, optional state.
  `CLAUDE.md` and `wiki/index.md` name the index directly, so the work does not depend on
  the answer. Only the discovery value of the override does.
- The `CLAUDE.md` rule depends on a tool honouring a user preference for the location of
  its output. The test catches a commit that does not.

## Consequences

- The audit in this repository declines the link and orphan checks for the docs root
  (ADR-0053). The link check covers `CLAUDE.md` only, and the wiki lint covers the
  bundle.
- A consumer repository without `docs/TOC.md` gets 11 optional Info lines from the audit
  instead of a required error. A consumer's copy of `plugin/CONVENTIONS.md` is out of
  date until the consumer resyncs it with `/gvt-dev:audit-conventions --fix --apply`.
- If #938 makes `wiki/index.md` a default for repositories with a wiki bundle, the
  override here becomes unnecessary. It does not become wrong.
- A tool that writes into `docs/` in this repository, such as the superpowers
  `brainstorming` and `writing-plans` skills, fails `commands.validate` when its file is
  committed there.

**Related:** ADR-0020, ADR-0053, ADR-0062, ADR-0067 (amended in part), #375, #938, #939, #579.
