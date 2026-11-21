---
type: decision-record
title: 'Document locations default to the wiki'
description: 'A declared docs/ path with no paths override derives its default location from the wiki directory (docs/TOC.md becomes <wikiDir>/index.md); resolution never checks existence, a 5.x location is reported, and the change ships as a major version.'
tags: [decisions, plugin-structure]
status: stable
---
# 0101. Document locations default to the wiki

- **Status:** accepted
- **Date:** 2026-11-21
- **Issue:** #938
- **Amends:** [ADR-0062](0062-runtime-path-resolution-for-declared-expectations.md) (its Decision, its Consequences promise of "no behaviour change", and its rejected implicit wiki convention), [ADR-0068](0068-prose-conventions-doc-default-is-relocatable.md) (decision 1), [ADR-0084](../skill-shapes/0084-near-miss-nominate-plus-veto-registration-follows-location.md) (decision 4, the §0b trigger) and [ADR-0095](0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md) (decision 9, first sentence only)
- **Related:** [ADR-0100](0100-ordinary-project-docs-resolve-through-the-index-contract-files-stay-declared.md) (#363), [ADR-0102](../acceptance-criteria/0102-issue-less-acceptance-fallback-resolves-a-declared-location.md) (#455), #1012, GenvidTechnologies/claude-code-plugin-gvt-wiki#60

## Context

A skill, an agent or a script resolves a declared expectation path through the `paths` override of `.gvt-agent.json`, and otherwise uses the declared path unchanged ([ADR-0062](0062-runtime-path-resolution-for-declared-expectations.md)). The declared paths of `gvt-dev` name `docs/`: `docs/TOC.md`, `docs/decisions/`, `docs/issue-triage.md` and the others. A repository whose documents live in a wiki had to set one override per path. [ADR-0068](0068-prose-conventions-doc-default-is-relocatable.md) decision 1 kept `docs/` as the default for a consumer that sets no override. [ADR-0084](../skill-shapes/0084-near-miss-nominate-plus-veto-registration-follows-location.md) decision 4 added a §0b trigger in `triage-issues` that scaffolds into the wiki when the documentation index is already inside it.

[ADR-0095](0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md) decision 9 and its Compromise reject wiki-first auto-detection. [ADR-0062](0062-runtime-path-resolution-for-declared-expectations.md) rejected an implicit wiki convention with three objections: it is invisible to the audit, it is ambiguous when both locations exist, and it does not generalize past the wiki case.

The user decided on 2026-11-20, at the planning checkpoints of #938, that the wiki is the default home of every project document. This record states that decision, how it answers the three objections, and what it costs. The audit, the writers and the prose that describe the rule ship with #938. #363, #357 and #455 changed the prose of other components before #938 merged. #388 changes the remaining prose that names `docs/` literally, after #938.

## Decision

**1. A wiki is signalled by a `wiki` block, not by a file.** `"wiki": {}` in `.gvt-agent.json` is enough. No file or folder has to exist.

**2. Wiki defaults apply everywhere.** Every repository with no `paths` override gets the wiki-derived defaults. That includes a repository with no `wiki` block and no wiki folder. `<wikiDir>` is `wiki.wikiDir` when it is set and not blank, and `wiki` otherwise.

**3. The documentation index moves with the rest.** `paths['docs/TOC.md']` when set, else `<wikiDir>/index.md`.

**4. One generic rule covers every declared `docs/` path.** Each declared `docs/<rest>` derives `<wikiDir>/<rest>`. The one special case is `docs/TOC.md`, which derives `<wikiDir>/index.md`. An entry with `prefer` keeps its own order. An override always wins. Resolution never checks whether a location exists. The code is `resolveDeclaredPath`, `wikiDerivedDefault` and `effectiveWikiDir` in `plugin/skills/audit-conventions/scripts/lib/path-overrides.mjs`, and the rule is written in `plugin/CONVENTIONS.md`, "Runtime path resolution".

**5. The `wiki` block has one remaining role: it gates two audit findings.** The link and orphan declines of [ADR-0053](../wiki-and-okf/0053-audit-conventions-declines-bundle-content-to-wiki-lint.md) fire only when the `wiki` block is present. Decision 1 therefore matters only for those declines and for the adoption verdict of practice-detect. Resolution ignores it.

**6. A 5.x location is reported, and `--fix` pins it.** The audit renders a derived location as `` `docs/X` (→ `wiki/X` via wiki default) ``. A `legacy-location` warning reports content that still sits at a 5.x `docs/` location, and it never changes the exit code. `audit-conventions --fix` pins the location (`paths[declared] = declared`) when its wiki-derived copy is absent, and leaves a pair with content at both locations to the user. `renumber-adrs --next` defaults to `<wikiDir>/decisions/` and exits 1 while `docs/decisions/` holds records with no override. `--dir`, any override, and `wiki.wikiDir: docs` never make it refuse. `triage-issues` defaults its contract to `<wikiDir>/issue-triage.md`, drops the §0b "wiki default" trigger, pins or moves a 5.x contract, and pins and reports in an unattended run.

**7. This repository keeps its own three `paths` overrides.** They are now redundant, not wrong ([ADR-0099](../wiki-and-okf/0099-this-repo-keeps-no-docs-tree.md)).

**8. The release is a major version, 6.0.0.** #938 alone sets it. The coach merges #357 and #363 first, then #938, then #388. 6.0.0 is released only after #388 merges.

**What stays of ADR-0095.** Decision 9 of [ADR-0095](0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md) says "There is no wiki-first auto-detection." That sentence is amended in its reading of a missing override: a missing override now derives a default. Its core stays true, and so does its Compromise line: resolution never checks whether a location exists. The default is derived from the configuration, and a file on disk never selects it.

### How this answers the three objections of ADR-0062

- *Invisible:* the rule is written in `plugin/CONVENTIONS.md`, and the audit names "via wiki default" on every derived location, so the audit shows each place where the rule applied.
- *Ambiguous:* resolution never checks existence, so it gives one answer. A 5.x location gets a warning, `renumber-adrs --next` refuses to number past it, `triage-issues` pins or moves it, and `--fix` pins it. When both locations hold content, the derived one is used and the 5.x one is reported, as in the "bundle wins, report the duplicate" answer of [ADR-0070](../wiki-and-okf/0070-wiki-schema-resolves-inside-the-bundle-amends-0015.md) decision 7.
- *Does not generalize:* one rule covers every declared `docs/` path, including a key that a later record declares. The index name is the only special case.

## Compromise

- *Option A (chosen): one derived-default rule for every declared `docs/` path. Resolution never checks existence. A 5.x location is reported, writers refuse, and `--fix` pins it.*
- *Option B (rejected): a per-key table of the three keys.* The pro is a smaller blast radius. The con is that "wiki defaults everywhere" holds only in part, so a repository keeps a mixed layout. The third objection of ADR-0062 gets a weaker answer, since every new key is a contract change. The new key of #455 needs its own decision. The census shows that users already redirect the other keys.
- *Option C (rejected): generic mapping with a wiki-first fallback chain (the `prefer` style).* Rejected. This is the "wiki-first auto-detection" that ADR-0095 decision 9 and its Compromise reject, and the existence inference of ADR-0062. Every prose resolver would have to implement a three-step existence chain and a creation-target rule. It also gives no single answer for a writer: which location does `create-adr` number against?

**Costs accepted.**

- ADR-0062 and ADR-0068 promised "a repo that sets no override sees no behaviour change". That promise is broken for every repository that relies on a `docs/` default without an override.
- Census, 2026-11-20: the shipped `legacyLocations` check ran read-only over the local base clones. The clones can lag their remotes. It found 16 clones, 14 with a `.gvt-agent.json`, and 8 of those with a `wiki` block. It flagged 6 repositories and found 8 clean, with 11 key instances: `docs/TOC.md` 5, `docs/issue-triage.md` 4, `docs/decisions/` 2. No repository had content at both locations. None of the other declared `docs/` paths was flagged. The census was re-run on 2026-11-21 over the 7 paths declared after #363 and #455 merged, with the same result. The 8 repositories with a `wiki` block override all three named keys.
- So 6 of the 14 local repositories with a `.gvt-agent.json` get `legacy-location` warnings on upgrade (11 keys). Two of them have a `docs/decisions/` directory with no override, where `renumber-adrs --next` refuses if the directory holds ADR records. The census counted the directory, not its records, so how many actually refuse is not measured.
- A greenfield repository now has `wiki/index.md` and no `wiki` block, so practice-detect can read it as partial wiki adoption.
- Prose in other components that names `docs/...` literally disagrees with the audit until #388 lands. #388 merges after #938, and 6.0.0 is released only after #388. This is the lag between the audit and the prose.
- A stale-config `--fix` run's retired-token follow-up walks `<wikiDir>/`. In a repository still on the 5.x layout it does not read `docs/` until `docs/TOC.md` is pinned. The `legacy-location` warning points at the pin.
- The `maintain-wiki` skill of `gvt-wiki` declares `docs/TOC.md`. That is filed as GenvidTechnologies/claude-code-plugin-gvt-wiki#60.

## Consequences

- `gvt-dev` declares 7 `docs/` expectation paths, the contract files of ADR-0100: `docs/TOC.md`, `docs/decisions/`, `docs/issue-triage.md`, `docs/code-review-context.md`, `docs/code-review-patterns.md`, `docs/code-review-docs.md` and `docs/acceptance/`. Each default moves: `docs/TOC.md` to `<wikiDir>/index.md`, and each other path to `<wikiDir>/…` with the same tail.
- The docs root of the hygiene scanners moves from `docs/` to `<wikiDir>/`, and the decisions exclusion follows the resolved decisions location.
- A greenfield or stale-config `--fix` scaffolds the index at `wiki/index.md` and writes no `wiki` block. A migrated `--fix` pins a 5.x location.
- The scope of `tech-writer` is the wiki by default.
- ADR-0100 (#363) makes ordinary project docs resolve through the index while contract files stay declared. ADR-0102 (#455) adds the declared key `docs/acceptance/`, which derives `<wikiDir>/acceptance/` under this rule with no further change.
- #1012, the plugin repository as a consumer with its own root `CONVENTIONS.md`, is out of scope.
- The records amended here carry an "Amended by" marker. Their text is not edited.
