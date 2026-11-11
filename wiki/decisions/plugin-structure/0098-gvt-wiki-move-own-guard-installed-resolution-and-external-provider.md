---
type: decision-record
title: 'The gvt-wiki move: gvt-wiki carries its own git-state guard, this repo resolves the installed gvt-wiki, and Practice Coverage names an external provider'
description: 'gvt-wiki ships its own copy of the git-state guard, scoped to its own agents; gvt-dev resolves the installed gvt-wiki and fails loud; the Environment pillar carries providedBy; wiki-editor is write-only; MIGRATION.md names the copy base SHA.'
tags: [decisions, plugin-structure]
status: stable
---
# 0098. The gvt-wiki move: gvt-wiki carries its own git-state guard, this repo resolves the installed gvt-wiki, and Practice Coverage names an external provider

- **Status:** accepted
- **Date:** 2026-11-11
- **Issue:** #441 (part of #438; the gvt-wiki side is tracked in #914)
- **Amends:** [ADR-0027](0027-pillar-declaration-and-two-sided-coverage-report.md), decisions 1 and 2, as decision 3 below states

## Context

[ADR-0095](0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md) decided that the wiki practice ships as the `gvt-wiki` plugin. [ADR-0097](0097-no-plugin-dependency-between-gvt-dev-and-gvt-wiki.md) decided that neither plugin depends on the other. It left three mechanisms to #441:

- the git-state guard for the agents of `gvt-wiki`;
- how this repository runs the moved code that it still uses;
- how the Practice Coverage report shows a pillar whose components moved.

[ADR-0096](0096-the-wiki-block-stays-in-gvt-agent-json-owned-by-gvt-dev.md) keeps the `wiki` block in the `CONVENTIONS.md` of `gvt-dev`. That does not change.

Facts about the move:

- `gvt-wiki` v0.1.0 was created from `gvt-dev` at commit `3aa5ca5e0b5e8fe4d3118f707c14ef89b65efd28` (repository `GenvidTechnologies/claude-code-plugin-gvt-wiki`, PR #1, tag `v0.1.0`).
- The `maintain-wiki` skill and the `wiki-librarian` agent are removed from `gvt-dev` on this branch.
- The work was split into two issues: #914 (bootstrap of `gvt-wiki`) and #441 (the `gvt-dev` side). The split is "Option 1A: split". "Option 1B: one issue, one plan with cross-repo tasks" was rejected.
- `gvt-wiki` takes the first version 0.1.0 (user choice). `gvt-dev` takes 5.0.0, because two invocable components are removed.
- The default retired-token list of `audit-conventions` gains `gvt-dev:maintain-wiki` and `gvt-dev:wiki-librarian`, at `info` severity. The zero-reference criterion for the move forbids only these stale forms. Records under `wiki/decisions/` are exempt and may name them where history needs it.

## Decision

**1. `gvt-wiki` carries its own git-state guard; the guards split by prefix.** `gvt-wiki` ships its own PreToolUse git-state guard. It is a copy of the classifier of `gvt-dev`, scoped to `gvt-wiki:` agent types. It denies `stash`, `reset`, `checkout`, `switch`, `restore`, `clean`, `merge`, `rebase`, `cherry-pick`, `revert`, `pull` and `am`, with the same exceptions as the original: `stash list`, `stash show` and `clean -n`.

The guard of `gvt-dev` stays scoped to `gvt-dev:` agent types. [ADR-0061](../development-practice/0061-git-state-mutation-principle-and-agent-scoped-hook-backstop.md) still governs it, including its limit to "a prefix this plugin itself controls". A test in `gvt-dev` pins that a payload from `gvt-wiki:wiki-librarian` is allowed by the guard of `gvt-dev`. With both plugins installed, each guard acts only on its own prefix. With one installed, that plugin's agents are still guarded.

Cost accepted: two copies of the classifier, with no cross-repository drift check.

Rejected:

- Widening the guard of `gvt-dev` to `gvt-wiki:`. With `gvt-dev` absent, the agents of `gvt-wiki` would have no protection. It would also couple `gvt-dev` to the name of another plugin.
- Both: an own guard in `gvt-wiki` and a widened guard in `gvt-dev`. It keeps both costs and removes neither.
- No `Bash` for the agents of `gvt-wiki`, and accepting the gap. Decision 4 removes `Bash` from `wiki-editor` only.

ADR-0061 and ADR-0095 carry no amendment marker. This record fills what they delegated and changes neither.

**2. This repository resolves the installed `gvt-wiki` and fails loud.** The `commands.test` and `commands.validate` of `gvt-dev` drop the unit tests of `maintain-wiki`. They run in the CI of `gvt-wiki`.

`create-adr-evals/grade.mjs` loads `lintWiki` from the installed `gvt-wiki` through `create-adr-evals/gvt-wiki-root.mjs`. The module resolves the root in this order:

1. `GVT_WIKI_ROOT`;
2. the user-scope `gvt-wiki@gvt-plugins` entry in `~/.claude/plugins/installed_plugins.json`;
3. the first entry of that file that has an `installPath`.

When none is found, it throws. The message names `GVT_WIKI_ROOT` and the file. The test file then fails to load. It does not skip.

CI is unchanged. `plugin-deps.yml` never ran `create-adr-evals`. No `wiki-lint` gate is added to `commands.validate`, because `wiki-lint` always exits 0 and cannot gate. The manual command is in `wiki/maintainer/dogfooding-the-plugin.md`.

Rejected: also cloning a pinned `gvt-wiki` tag in CI (CI never ran `create-adr-evals`); dropping the wiki checks from `gvt-dev`; vendoring a copy (a copy drifts).

**3. Practice Coverage names an external provider with `providedBy`.** This amends ADR-0027 in two places.

- *Decision 1.* The census "the 11 components epic #142's own table names" no longer holds on the real tree. The Environment components moved, so 9 components declare `metadata.pillar`. The opt-in scalar and its parser are unchanged.
- *Decision 2.* The section still carries zero findings and still cannot move the exit code. What changes is the Components cell of a pillar with no declaring component. If the pillar carries `providedBy`, the cell reads `provided by the gvt-wiki plugin`, and no `> Pillar gap:` line is emitted for it.

Chosen: "Option 2A: a `providedBy` field on the `PILLARS` entry". The Environment pillar carries `providedBy: 'gvt-wiki'`. The adoption column still comes from `detectWikiAdoption` ([ADR-0096](0096-the-wiki-block-stays-in-gvt-agent-json-owned-by-gvt-dev.md), decision 4).

Rejected:

- "Option 2B: a separate `EXTERNAL_PROVIDERS` map". It splits the data of one pillar across two modules.
- Detecting an installed `gvt-wiki` at audit time. It reads the install state of `gvt-wiki`, which ADR-0096 decision 5 forbids. The report would also differ by machine.

**4. The `wiki-editor` is write-only.** The ingest writer of `gvt-wiki` is `wiki-editor`. Chosen: "Option 3A: write-only, no Bash". Its tools are Read, Write, Edit, Grep and Glob. It never stages or commits. `maintain-wiki ingest` passes it the UTC timestamp and reports the changed paths, and the caller commits them.

Rejected: "Option 3B: keep `Bash`, and commit one pathspec-scoped commit per ingest run in standalone mode". The user confirmed 3A.

Consequence: the previous `gvt-dev:tech-writer` dispatch committed by default in standalone mode. `ingest` no longer does. A caller that wants the commit makes it.

**5. `MIGRATION.md` names the copy base.** Chosen: "Option 4A: name the copy base". The `MIGRATION.md` of `gvt-wiki` names `3aa5ca5e0b5e8fe4d3118f707c14ef89b65efd28`. The moved files are unchanged on `gvt-dev` `main` from that commit until their removal. So `git log 3aa5ca5e0b5e8fe4d3118f707c14ef89b65efd28 -- plugin/skills/maintain-wiki plugin/agents/wiki-librarian.md` in `gvt-dev` is their full history. The final gate of #441 checks that with `git diff --quiet`.

Rejected: "Option 4B: after the `gvt-dev` merge, amend `MIGRATION.md` to name the parent of the squash-merge commit".

## Compromise

Costs accepted:

- Two classifier copies, with no check that they stay equal (decision 1).
- The dogfood run of `create-adr-evals` needs `gvt-wiki` installed on the machine, or `GVT_WIKI_ROOT` set. Without it the test file fails to load (decision 2).
- No automatic gate runs `wiki-lint` for this repository (decision 2).
- The Components cell for the Environment pillar states a provider by name. It does not check that the plugin exists (decision 3).
- Ingest no longer commits (decision 4).
- The practice-detect pin of `gvt-dev` now checks `SCHEMA_EXPECTATION` against `plugin/CONVENTIONS.md` and a test fixture. Nothing in `gvt-dev` compares it with the real `maintain-wiki` declaration in `gvt-wiki`. Drift between the contract text and the skill of `gvt-wiki` is caught only by review.
- The pointer baseline carries two accepted `pointer-unresolved` entries, for ADR-0022 citations of files that moved to `gvt-wiki`. They are accepted as historical, because ADR records are not rewritten.

Known gap, carried to `gvt-wiki` issue #2: the schema of `gvt-wiki` needs an upstream URL for every source, so a session insight cannot be ingested yet.

## Consequences

- The `gvt-dev` tree has no `maintain-wiki` skill and no `wiki-librarian` agent. `plugin.json` is 5.0.0.
- `pillars.mjs` and `pillar-report.mjs` support `providedBy`. The real-tree census is 9 declaring components.
- The CHANGELOG carries a migration note for 5.0.0. Consumers install `gvt-wiki` to keep `/gvt-wiki:maintain-wiki`.
