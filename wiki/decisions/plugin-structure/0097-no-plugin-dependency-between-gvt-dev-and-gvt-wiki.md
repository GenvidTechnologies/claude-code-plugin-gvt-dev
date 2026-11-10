---
type: decision-record
title: 'The wiki practice and gvt-dev have no plugin dependency either way; the wiki carries no project writing style'
description: 'gvt-wiki and gvt-dev declare no dependency on each other; gvt-wiki carries its own writer for ingest, which cites only generic standards (ASD-STE100, OKF v0.2), and the wiki block contract stays in gvt-dev as a file-level contract.'
tags: [decisions, plugin-structure]
status: stable
---
# 0097. The wiki practice and gvt-dev have no plugin dependency either way; the wiki carries no project writing style

- **Status:** accepted
- **Date:** 2026-11-10
- **Issue:** #442 and #440 (part of #438)
- **Amends:** [ADR-0095](0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md), decision 4 and the rejected "no dependency" compromise

## Context

[ADR-0095](0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md) decided that `gvt-wiki` depends on `gvt-dev` by bare name. Its reasons were that `maintain-wiki` dispatches `gvt-dev:tech-writer` and cites the shared writing style, and that a second writer and a copy of the style would duplicate content and drift.

The user has since chosen no dependency in either direction. A user can install `gvt-wiki`, `gvt-dev`, or both. The user also decided that the writing style of `gvt-dev` does not ship inside `gvt-wiki`. Only generic, named standards may appear there, for example ASD-STE100 and the OKF v0.2 bundle format.

The coupling that ADR-0095 relied on was narrow:

- `ingest` dispatches `gvt-dev:tech-writer` (the "Dispatch gvt-dev:tech-writer" step in `plugin/skills/maintain-wiki/SKILL.md`);
- the skill cites the writing style of `gvt-dev`.

The components of `gvt-dev` do not use `gvt-wiki` code. The `wiki` block is JSON configuration. The retired-token scan stays in `gvt-dev` ([ADR-0041](../wiki-and-okf/0041-widen-retired-token-scan-to-wiki-amends-0015.md), kept by [ADR-0096](0096-the-wiki-block-stays-in-gvt-agent-json-owned-by-gvt-dev.md)). `wiki-lint` is not wired into the audit (ADR-0015 decision 2).

The inverse direction, `gvt-dev` depending on `gvt-wiki`, was also considered. It would have no runtime consumer. It would install the wiki practice for every `gvt-dev` user, which reverses ground (b) of ADR-0095 decision 2.

## Decision

**1. Neither plugin declares a dependency on the other.** The `plugin.json` of `gvt-wiki` has no `dependencies` entry for `gvt-dev`. The `plugin.json` of `gvt-dev` has none for `gvt-wiki`. Each installs and runs alone.

**2. `gvt-wiki` carries its own authoring agent for `ingest`.** Its name and tool set are decided in #441, not here. The writer does not dispatch `gvt-dev:tech-writer`.

**3. The writer carries no project writing style.** It cites generic standards by name only: ASD-STE100 and the OKF v0.2 bundle format. The project conventions of a consumer live in its wiki schema, `<wikiDir>/schema.md`, which the writer reads at run time. `plugin/docs/writing-style.md` stays in `gvt-dev`, for the agents of `gvt-dev` only. `gvt-wiki` does not copy it.

**4. The `wiki` block contract stays where ADR-0096 put it.** `plugin/CONVENTIONS.md` of `gvt-dev` defines it, and `gvt-dev` owns it. Both plugins read it as a file-level contract. Neither plugin needs the other installed to read the file. `gvt-wiki` documents the keys by reference to `CONVENTIONS.md`. The additive-only rule of ADR-0096 decision 2 still applies.

**5. What stays of ADR-0095.**

- Superseded where they assume a dependency: decision 4 (dependency mechanics, bare name) and the limits that rest on it. Those limits are "A wiki consumer needs `gvt-dev`" in decision 2 (b), "`gvt-wiki` cannot state a minimum `gvt-dev` version" in decision 2 (d), and the cost "There is no wiki without `gvt-dev`".
- Decision 5 (the gating premise) is unchanged. It may stay as written.
- Decisions 1 (split), 7 (`wiki-lint` moves as it is), 10 (the Environment pillar moves with the practice) and 11 (dogfood installs `gvt-wiki`) stay in force as written. Under decision 11, `gvt-wiki` now needs no `gvt-dev` to run.

**6. Rule for the two plugins.** The rule of ADR-0096 decision 5 (a `gvt-dev` component never reads a file that ships only in `gvt-wiki`) still holds. It now also applies in reverse: `gvt-wiki` never reads a file that ships only in `gvt-dev`. The one exception is the `wiki` block contract, which is read by file path.

## Compromise

- *`gvt-wiki` depends on `gvt-dev` (ADR-0095).* Rejected. `ingest` needs the writer and the style of `gvt-dev`, so the wiki cannot run without `gvt-dev`.
- *`gvt-dev` depends on `gvt-wiki`.* Rejected. It has no runtime consumer, and it installs the practice for every `gvt-dev` user.
- *A copy of the writing style of `gvt-dev` in `gvt-wiki`.* Rejected. It drifts. The shared-blocks drift test covers one repository only.
- *A third, shared plugin for the style.* Rejected. It adds a plugin that holds one file. Revisit it only if a third consumer needs the style.

**Costs accepted.**

- `gvt-wiki` needs its own authoring agent. That is more to maintain.
- A writer that cites generic standards only may write less consistently with the house style of `gvt-dev`.
- The key list of the `wiki` block is documented in two repositories, so the `gvt-wiki` copy can drift.

## Consequences

- #441 changes. It declares no dependencies. The writer agent is new. The `${CLAUDE_PLUGIN_ROOT}` writing-style citation in `maintain-wiki` is removed. The git-state-guard prefix must cover the writer of `gvt-wiki`; #441 decides how.
- #443 is unchanged, except for the tracker move.
- No code changes in this repository.
