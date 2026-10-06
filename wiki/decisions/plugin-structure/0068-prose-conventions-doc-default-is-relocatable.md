---
type: decision-record
title: 'Prose conventions doc default is relocatable; maintainer notes move into the wiki bundle'
description: 'The ADR-0006 prose-conventions doc defaults to docs/ but resolves through a paths override, and maintainer notes now live under wiki/maintainer/.'
tags: [decisions, plugin-structure]
status: stable
---
# 0068. Prose conventions doc default is relocatable; maintainer notes move into the wiki bundle

- **Status:** accepted
- **Date:** 2026-10-05
- **Issue:** #585 (F2 of the docs→wiki chain #579)

## Context

#585 moves this repo's own instance of the triage conventions doc and the maintainer
authoring notes into the wiki bundle. ADR-0006 decision 2 states the prose-conventions
surface as "**Prose conventions + recipes** → a doc under the consuming repo's `docs/`
(e.g. `docs/issue-triage.md`)". ADR-0067 left that clause untouched when it relocated
the ADR trail itself, saying only that it "is amended when the triage conventions doc
itself moves into the wiki (#585, F2 of the chain)" — this record is that amendment.
ADR-0062 already generalized runtime resolution of a declared expectation path through
`.gvt-agent.json`'s `paths` override, and ADR-0066 reused that mechanism for the
decisions directory; this move is the next adopter, on the triage doc itself.

Separately, CLAUDE.md's Testing section previously stated that maintainer/authoring
notes "stay at the repo-root `docs/`" and are internal. That clause is reversed here.
ADR-0051 deferred a leaf-dependency ledger it has not yet written, naming a home for it
in advance: "the ledger belongs in the repo-root `docs/`". That forward guidance is
re-homed in the same move, even though no ledger exists yet to carry with it.

## Decision

**1. ADR-0006 decision 2 is amended, not rewritten.** The amended reading: `docs/` is
the default location for a consumer that sets no override, relocatable through a
`.gvt-agent.json` `paths` override per ADR-0062. This repo's own instance now resolves
to `wiki/process/issue-triage.md`, fulfilling the forward reference ADR-0067 left open.

**2. The maintainer-notes policy is reversed.** CLAUDE.md's old "stay at the repo-root
`docs/`" clause is retired; maintainer and authoring notes now live under
`wiki/maintainer/`, indexed in that folder's own `index.md`. ADR-0051's deferred
leaf-dependency ledger is re-homed the same way: its forward-looking "repo-root `docs/`"
destination now points at `wiki/maintainer/` instead. Only the forward guidance changes
— no ledger has been written either before or after this record.

**3. Layout.** `wiki/process/` holds this repo's process contracts; `wiki/maintainer/`
holds maintainer notes (#586 is expected to add CLAUDE.md's gotcha sections there).
`wiki/process/`'s top level doubles as `triage-issues`' near-miss scan surface, so it
must carry no other `*[Tt]riage*.md` file and no marker line beyond the one genuine
conventions page.

**4. Types.** The triage contract gets `type: convention`, ahead of the schema
vocabulary #587 is expected to add (unknown types are tolerated in the meantime); the
authoring notes get `type: practice-note`. Both pages carry a 5-key frontmatter (type,
title, description, tags, status) with no `generated`/`sources` keys, since neither page
was produced by an ingest pass.

**5. TOC.** `docs/TOC.md` keeps a row naming the full path `wiki/process/issue-triage.md`,
because `triage-issues`' own TOC-indexing step is idempotent only against the resolved
path, not against a directory-level pointer. #601 proposes letting that step skip the row
entirely for a wiki-resident contract doc; until it lands, the row stays.

**6. Log.** One Migration entry in `wiki/log.md` covers the move itself; this record gets
none, per the authoring-vs-ingest split ADR-0066 and ADR-0067 both apply to their own
ADR relocations.

**7. No redirect stubs.** A stub left behind at `docs/issue-triage.md` would trip
`triage-issues`' "both present" stale-duplicate outcome on every subsequent run, which is
worse than leaving no file there at all.

**8. Verification.** A single headless `--plugin-dir` triage run against the moved tree
resolved `wiki/process/issue-triage.md` through the existing override, found no
near-miss, saw all 8 fixed sections, and left the TOC row alone — evidence posted on
#585.

## Compromise

**One folder for both kinds of page.** Rejected: maintainer pages would join
`triage-issues`' near-miss scan surface under `wiki/process/`, risking a false match
against a page that has nothing to do with issue triage.

**Moving only the authoring notes, leaving the triage doc at `docs/`.** Rejected: this
repo would stop exercising the `paths` override on its own triage contract, leaving
ADR-0067's forward reference unfulfilled and the override's runtime path undogfooded for
the one consumer-doc case that most needs it.

**A TOC row pointing only at `wiki/process/index.md`.** Rejected: `triage-issues`' TOC
step checks the resolved file path, not an index page, so every run would re-add a
file-specific row regardless of the index-level pointer.

**The full concept-page key set (`generated`, `sources`, …).** Rejected: neither page was
produced by an ingest pass, and carrying those keys would assert a false `generated`
provenance.

## Consequences

`triage-issues` and `issue-triage-analyst` already resolve `wiki/process/issue-triage.md`
through the existing `paths['docs/issue-triage.md']` override (ADR-0062), confirmed by
the headless run named above. CLAUDE.md's repo-layout and Testing sections,
`plugin/CONVENTIONS.md`'s `excludePaths` example, and `docs/TOC.md`'s Process and Plugin
contract & guidance rows are repointed to the new paths as part of this move. A
consuming repo that keeps its prose-conventions doc at the `docs/` default, or sets no
override, sees no behaviour change — ADR-0062's no-override-no-change guarantee holds.
#586 is expected to add CLAUDE.md's gotcha sections under `wiki/maintainer/`; #587 adds
schema vocabulary that formalizes `type: convention` and `type: practice-note`; #601
may let the TOC-indexing step skip the Process row entirely once it understands a
wiki-resident contract doc. This record ships no code of its own — the repo-side move it
describes landed in the prior commits on this branch.

**Related:** ADR-0006 (amended), ADR-0062, ADR-0066, ADR-0067, ADR-0051, #585, #586,
#587, #601, #579.
