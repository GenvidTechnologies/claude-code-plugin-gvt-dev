---
type: decision-record
title: 'The `wiki` block stays in `.gvt-agent.json`, owned by gvt-dev; ADR-0041 stands'
description: 'The wiki block stays in .gvt-agent.json and gvt-dev owns it; gvt-wiki reads it as a file-level contract, the retired-token scan of the wiki directory stays in audit-conventions, and Environment adoption detection stays in gvt-dev.'
tags: [decisions, plugin-structure]
status: stable
---
# 0096. The `wiki` block stays in `.gvt-agent.json`, owned by gvt-dev; ADR-0041 stands

- **Status:** accepted
- **Date:** 2026-11-10
- **Issue:** #442 (part of #438)

## Context

[ADR-0095](0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md) (#440) decided that the wiki practice (`maintain-wiki`, `wiki-librarian`, their templates and `wiki-lint`) ships as `gvt-wiki`. [ADR-0097](0097-no-plugin-dependency-between-gvt-dev-and-gvt-wiki.md) then decided that neither plugin depends on the other. Decisions 7, 8 and 10 of that record left three questions to #442:

- the retired-token scan of `<wikiDir>/` ([ADR-0041](../wiki-and-okf/0041-widen-retired-token-scan-to-wiki-amends-0015.md));
- where the `wiki` block of `.gvt-agent.json` lives;
- where detection of Environment adoption lives.

The `wiki` block has three keys: `wikiDir`, `rawDir` and `indexCommand`.

#442 framed two options:

- **Stays.** The block is a shared contract. `audit-conventions` keeps its `<wikiDir>/` coverage and ADR-0041 stays intact. The risk: a key whose owner is elsewhere, and a version skew that nothing detects.
- **Moves.** The block moves to the own config of `gvt-wiki`. `audit-conventions` loses its `<wikiDir>/` coverage, so ADR-0041 would have to be superseded.

Four `gvt-dev` skills read the block today. This was measured with grep in `plugin/skills/`. All four stay in `gvt-dev` after the move.

- `audit-conventions`: `scripts/audit-main.mjs` reads `wiki.wikiDir` and `wiki.rawDir` into the shared hygiene options. These drive the `<wikiDir>/` retired-token walk (ADR-0041) and the declines of ADR-0053 in `scanBrokenLinks` and `scanOrphanedDocs`. The script also passes `wikiDir` to `expectationCandidates` for the `prefer` resolution of ADR-0070 (`lib/expect-prefer.mjs`). It also calls `detectWikiAdoption` (`lib/practice-detect.mjs`), the Environment pillar verdict, whose sixth signal is the presence of the block.
- `create-adr`: `scripts/renumber-adrs.mjs` reads `wiki.wikiDir` and `wiki.rawDir`. They decide the wiki regime and the frozen-history exclusions.
- `triage-issues`: declares `wiki.wikiDir` and `wiki.indexCommand` as `required: false`. It uses them to place and register the triage contract inside the bundle.
- `run-retro`: resolves the schema doc through `<wikiDir>/schema.md` to decide whether the repository keeps a wiki.

The two wiki-practice components, `maintain-wiki` and `wiki-librarian`, also read the block.

The rationale of ADR-0041 is that the `lint` verb of `maintain-wiki` has no retired-token check. Without the scan, token drift on the wiki tier has no owner. That is still true of `wiki-lint`, which ADR-0095 decision 7 moves as it is.

## Decision

**1. The `wiki` block stays in `.gvt-agent.json`, and `gvt-dev` owns it.** `plugin/CONVENTIONS.md` defines its keys. The wiki practice reads it as a file-level contract, with no plugin dependency either way (ADR-0097). Four `gvt-dev` skills read the block, and `CONVENTIONS.md` of `gvt-dev` already defines it. The "Moves" option would make those skills read a key that only `gvt-wiki` defines, and `gvt-dev` cannot assume that plugin is installed. It would also drop the `<wikiDir>/` coverage that ADR-0041 gives. The "two owners" risk named in #442 does not arise, because the block has one owner.

**2. Changes to the block go through `gvt-dev`.** A key that the wiki practice needs is added by a `gvt-dev` change to `CONVENTIONS.md`. `gvt-wiki` files an issue against `gvt-dev` to ask for it. A new key is optional. A key is never removed or renamed without a `gvt-dev` major version and a CHANGELOG migration note. This is the control for version skew: `gvt-wiki` declares no `gvt-dev` version (ADR-0097 decision 1), so the contract stays additive. Limit accepted: nothing detects a `gvt-wiki` that reads a key which the installed `gvt-dev` does not yet document.

**3. ADR-0041 stands, unchanged.** `scanRetiredTokens` keeps walking `<wikiDir>/` whenever `wiki.wikiDir` is configured, subject to `hygiene.excludePaths`. The "otherwise unowned" rationale holds after the move, because `wiki-lint` moves as it is and has no retired-token check. A repository with `gvt-dev` and no `gvt-wiki` keeps the token scan of its bundle. If `gvt-wiki` adds its own retired-token check, a new record revisits ADR-0041. Until then the scan belongs to `gvt-dev`. The declines of ADR-0053 also stay with `gvt-dev`.

**4. Detection of Environment adoption stays in `gvt-dev`.** It stays in `practice-detect.mjs`, with the block. This settles what ADR-0095 decision 10 deferred to #442. The reporting change of that decision (the report names `gvt-wiki` as the provider) is still #441's and is unchanged.

**5. A `gvt-dev` component never reads a wiki-practice file that ships only in `gvt-wiki`.** Such files are the templates, `wiki-lint` and the scaffold mapping. A `gvt-dev` component may read the wiki files of the consumer repository, at paths that the block resolves. The rule follows from "neither plugin depends on the other" (ADR-0097), and it also holds in reverse (ADR-0097 decision 6).

**6. Owners of the seam issues.**

- **#348** (the scaffold never writes the `wiki` block, so Environment never reaches `adopted`): the owner is `gvt-wiki`. The fix that #348 proposes is in the `maintain-wiki` scaffold, which writes a block that `gvt-dev` defines. `gvt-wiki` may do that, because the block is a file-level contract that either plugin can read and write. The `CONVENTIONS.md` sentence that #348 asks for (the presence of the block is the sixth adoption signal) belongs to `gvt-dev`. #443 moves the rest of #348 to the `gvt-wiki` tracker.
- **#390** (the Environment pillar should name the missing schema-doc signal): the owner is `gvt-dev` (`audit-conventions`, `practice-detect.mjs`), by decision 4.
- **#387** (no re-sync path for the wiki schema of a consumer): the owner is `gvt-wiki`. #387 proposes three shapes. Decision 5 rules out the `audit-conventions` finding, because it would read a template bundled in `gvt-wiki`. The other two, a `maintain-wiki` verb and a version stamp on the template, belong to `gvt-wiki`.

## Compromise

- *Move the block to the own config of `gvt-wiki`.* Rejected. The four reader skills of `gvt-dev` would depend on a plugin that they cannot assume. `audit-conventions` would lose `<wikiDir>/` token coverage. ADR-0041 would need superseding, with no new owner for token drift.
- *Split the block: `wikiDir` and `rawDir` stay, wiki-only keys move.* Rejected. One practice would have two config homes. `triage-issues` reads `indexCommand` and stays in `gvt-dev`.
- *Keep the block, but drop the `<wikiDir>/` token scan from `audit-conventions` and hand it to `wiki-lint`.* Rejected for now. `wiki-lint` moves as it is (ADR-0095 decision 7), and a repository with only `gvt-dev` would lose the check.
- *A detector for version skew between the two plugins.* Rejected. No mechanism exists, because neither plugin declares a version of the other (ADR-0097 decision 1). An additive-only contract is the cheaper control.

**Costs accepted.**

- A key skew between the two plugins goes undetected.
- The config of the wiki practice lives in a file that another plugin owns.

## Consequences

- No code changes. `CONVENTIONS.md` gains a paragraph on ownership. Its per-scanner scope table is unchanged and stays true.
- #348, #390 and #387 each get a comment that names the owner when this record merges. #443 moves #348 and #387 to the `gvt-wiki` tracker.
- #228 (`--fix` practice scaffolding) is no longer blocked by #442. Decision 5 applies to its wiki half: `audit-conventions --fix` cannot read the `maintain-wiki` templates once they ship in `gvt-wiki`.
- [ADR-0097](0097-no-plugin-dependency-between-gvt-dev-and-gvt-wiki.md) records that neither plugin depends on the other. It keeps the ownership in this record as it stands.
- #441 is unchanged by this record. When `maintain-wiki` and `wiki-librarian` leave, their `required: false` declarations of `wiki.wikiDir` and `wiki.rawDir` leave with them. `triage-issues` still declares `wiki.wikiDir` and `wiki.indexCommand`, but not `rawDir`. So `wikiDir` and `indexCommand` stay declared inside `gvt-dev` as component expectations. `rawDir` is read by the code of `audit-conventions` and `create-adr`, and no remaining component declares it.
