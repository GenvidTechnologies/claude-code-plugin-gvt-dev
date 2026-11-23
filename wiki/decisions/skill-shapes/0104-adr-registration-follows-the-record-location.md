---
type: decision-record
title: 'ADR registration follows the location of the record and of the documentation index'
description: 'An ADR outside the wiki gets a Decision Records row only when the documentation index is outside the wiki too; with the index inside the wiki, create-adr and tech-writer write no entry and report the mismatch.'
tags: [decisions, skill-shapes]
status: stable
---
# 0104. ADR registration follows the location of the record and of the documentation index

- **Status:** accepted
- **Date:** 2026-11-22
- **Issue:** #1060
- **Amends:** [ADR-0066](0066-adr-authoring-resolves-decisions-location-retires-claude-md-fallback.md) (decision 3, its last sentence: "Resolve outside the wiki and today's behaviour is unchanged")
- **Related:** [ADR-0084](0084-near-miss-nominate-plus-veto-registration-follows-location.md) (decision 3, the same rule for the triage contract), [ADR-0101](../plugin-structure/0101-document-locations-default-to-the-wiki.md) (the documentation index defaults to `<wikiDir>/index.md`), [ADR-0102](../acceptance-criteria/0102-issue-less-acceptance-fallback-resolves-a-declared-location.md) (the issue-less acceptance file), #1046

## Context

[ADR-0066](0066-adr-authoring-resolves-decisions-location-retires-claude-md-fallback.md) decision 3 keys the ADR registration regime on wiki membership. A record inside the wiki is registered in a wiki index. For a record outside the wiki it says: "Resolve outside the wiki and today's behaviour is unchanged: a `docs/TOC.md` Decision Records row and a breadcrumb." When that was written, the documentation index defaulted to `docs/TOC.md`, outside the wiki, so a record outside the wiki and its index row were both outside the bundle.

[ADR-0101](../plugin-structure/0101-document-locations-default-to-the-wiki.md) changed the default: with no `paths['docs/TOC.md']` override, the documentation index is `<wikiDir>/index.md`. A consumer that keeps its records outside the wiki (for example with `paths['docs/decisions/']` set to `docs/decisions/`) and sets no `paths['docs/TOC.md']` then got a Decision Records row in `<wikiDir>/index.md` that links outside the bundle. The gvt-wiki lint reports such a link as out-of-bundle. This was inferred from the text of `create-adr` and `tech-writer`; no run was made against such a consumer.

The other components that register a doc already follow the location of the file and of the index. `triage-issues` §0c has the case "Contract outside W, T inside W": it does not write, and it reports ([ADR-0084](0084-near-miss-nominate-plus-veto-registration-follows-location.md) decision 3). The issue-less acceptance file of `plan-task` writes no entry in the same case and reports it. `plugin/CONVENTIONS.md` "The four convention files" stated that rule, with ADR registration named as the one exception (#1046).

The `create-adr-evals` fixture B is this case: it pins `paths['docs/decisions/']` to `docs/decisions/`, sets no `paths['docs/TOC.md']`, and its grader expected a Decision Records row in `docs/TOC.md`, a file that was no longer the documentation index.

## Decision

**1. ADR registration has three cases, keyed on the location of the record and of the documentation index.**

- Record inside the wiki: a wiki index, as before ([ADR-0066](0066-adr-authoring-resolves-decisions-location-retires-claude-md-fallback.md) decision 3, unchanged).
- Record outside the wiki, documentation index outside it too: a Decision Records row in the documentation index, as before.
- Record outside the wiki, documentation index inside it: no entry. The writer reports the mismatch and suggests two fixes: set `paths['docs/decisions/']` to a directory under `<wikiDir>/`, which moves the records into the bundle, or set `paths['docs/TOC.md']` to an index outside the bundle. The record itself is still written.

The documentation index is inside the wiki when its resolved path lies under `<wikiDir>/`. With no `paths['docs/TOC.md']` override it is always inside, so a record outside the wiki gets a row only when that override points outside the wiki.

The rule applies at every registering site: `tech-writer` step 7 of "Decision records (ADRs)" (which `plan-task` Phase 4 reaches through its dispatch), and in `create-adr` the regime table of §1, §2 step 3, the batch registration of §2b step 7 and the first-use scaffold of §4. `tech-writer` step 8 updates a count in the documentation index only when step 7 registered the record there. In the third case it changes no number there, and the mismatch report names any ADR count that index states.

**2. In the third case the first-use `<dir>/README.md` breadcrumb is scaffolded without its Index line, and is not self-indexed.** The breadcrumb's last paragraph says that all records are listed in the documentation index under **Decision Records**. With no row written, that sentence would be false. The rest of the breadcrumb (the template, how to add a record, retroactive records) still holds, so the file is kept.

**3. `plugin/CONVENTIONS.md` states the location rule with no ADR exception.**

**4. The `create-adr-evals` fixture B pins `paths['docs/TOC.md']` to `docs/TOC.md`.** With the pin, B is the second case (record and index both outside the wiki), and its expected Decision Records row in `docs/TOC.md` is right again.

## Compromise

- **Keep writing the row into a wiki documentation index.** Rejected: the link is out-of-bundle, which the gvt-wiki lint reports, and every other registering component already refuses it.
- **Write the row into `docs/TOC.md` when that file exists, whatever the resolution says.** Rejected: it brings back a location guess that [ADR-0066](0066-adr-authoring-resolves-decisions-location-retires-claude-md-fallback.md) decision 2 and the "Runtime path resolution" section of `plugin/CONVENTIONS.md` removed. Only the resolved documentation index is written.
- **Add the documentation index's location to the `renumber-adrs.mjs --next` output.** Deferred: the other registering components derive it in prose from `paths['docs/TOC.md']` and `wiki.wikiDir`, and ADR registration does the same. A resolver field would make the check mechanical for all of them, and is a separate change.
- **Skip the breadcrumb in the third case.** Rejected: only its Index line depends on the index; the rest of the file still guides a reader of the directory.

## Consequences

A consumer with records outside the wiki and the default documentation index no longer gets an out-of-bundle link in its wiki index. Its new records are not listed in any index until it sets one of the two overrides, and each `create-adr` or `plan-task` run that writes a record says so. A consumer that already holds such a row keeps it: nothing removes an existing row, and the gvt-wiki lint continues to report it.

All the registering components named in `plugin/CONVENTIONS.md` now follow one rule. A consumer's copy of `CONVENTIONS.md` drifts from the canonical once, and `/gvt-dev:audit-conventions --fix` re-syncs it.
