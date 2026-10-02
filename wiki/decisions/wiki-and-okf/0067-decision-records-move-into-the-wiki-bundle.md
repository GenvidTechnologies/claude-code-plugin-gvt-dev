---
type: decision-record
title: 'Decision records move into the wiki bundle: nine themes, OKF frontmatter, one global sequence'
description: 'This repo''s 66 decision records move from docs/decisions/ into nine themed wiki/decisions/ folders, each carrying OKF frontmatter and a theme index entry.'
tags: [decisions, wiki-and-okf]
status: stable
---
# 0067. Decision records move into the wiki bundle: nine themes, OKF frontmatter, one global sequence

- **Status:** accepted
- **Date:** 2026-10-01
- **Issue:** #584 (F1 of the docs→wiki chain #579)

## Context

#579's docs→wiki chain moves this repo's own curated documentation into the OKF-conformant
`wiki/` bundle ADR-0022 roots. This record is where the ADR trail itself makes that move: all 66
of this repo's decision records relocate from a flat `docs/decisions/` directory into themed
subdirectories of `wiki/decisions/`, resolved through `paths['docs/decisions/']` in
`.gvt-agent.json` (ADR-0062's generic mechanism, reused the same way ADR-0066 already wired
`create-adr`'s `--next` resolver to it). The move landed in three prior commits on this
branch — a pure `git mv` plus the pointer-baseline re-key, the OKF frontmatter plus a required
pointer shift, and the generated indexes plus bundle-link repointing — which this record treats
as settled mechanics, not as design. What this record owns is the set of decisions those three
commits encode and the amendments they force on five earlier records.

## Decision

**1. Location and layout.** Records live at `wiki/decisions/<theme>/NNNN-kebab-title.md`, one page
per record, numbered in a single chronological sequence that spans every theme (so "the highest
number" is a repo-wide fact, not a per-theme one). Nine themes hold the existing 66 records:
`acceptance-criteria`, `audit-conventions`, `audit-core`, `criteria-authoring`,
`development-practice`, `plan-execution`, `plugin-structure`, `skill-shapes`, and `wiki-and-okf`
(this record's own home). Each record's frontmatter carries `type: decision-record`, a `title`
without the leading number, a hand-written one-sentence `description` mirroring its index entry,
`tags: [decisions, <theme>]`, and `status` mapped from the record's own Status field
(`accepted` → `stable`, the only value this corpus currently needs). A `wiki/decisions/index.md`
root index and nine per-theme `index.md` pages list every record by title and description; the
bundle-root `wiki/index.md` links each theme directly, rather than only through the decisions root
index, because `maintain-wiki`'s `lint` counts a subdirectory reachable only when the bundle root
links it directly — an indirect-only link would read as an unreachable subtree. `docs/TOC.md`'s
former per-record "Decision Records" section collapses to one pointer row at the decisions root
index, since the records themselves are no longer curated-docs content.

**2. Five earlier records are amended, precisely as follows — none is rewritten; each amendment
lands only here.**

- **ADR-0007**'s committed-decision-record home (`docs/decisions/NNNN-kebab-title.md`) and its
  dogfood clause ("this repo dogfoods the convention it ships — `docs/decisions/` holds these
  records") are superseded for this repo. The declared default stays `docs/decisions/` for a
  consumer that sets no override; this repo's own records now resolve, through decision 1 above,
  to `wiki/decisions/<theme>/` with OKF frontmatter and theme-index registration standing in for
  the flat-directory-plus-TOC-row scheme ADR-0007 described.
- **ADR-0022**'s Architecture section described the bundle's content as concept pages plus the
  mandatory `index.md`/`log.md` pair. Decision 1 above adds decision records as a second,
  independent content kind living under `<wikiDir>/`, each typed `decision-record` rather than
  drawn from the concept-page vocabulary. This does not widen decision 4's conformance scope —
  "every non-reserved `.md` under `<wikiDir>/` carries parseable frontmatter with a non-empty
  `type`" already covered any content kind — it is the first time a second kind exercises that
  existing, type-agnostic scope.
- **ADR-0006 is not amended here**, although #584 originally listed it. Its only location claim is
  that a skill's prose conventions doc lives under the consuming repo's `docs/` (its example is
  `docs/issue-triage.md`); moving the decision records changes nothing it states. That clause is
  amended when the triage conventions doc itself moves into the wiki (#585, F2 of the chain).
- **ADR-0026** decision 5 accepted a standing floor of two out-of-bundle links (both pointing at
  ADR-0015 while it lived outside the bundle) as permanent, and the Consequences section called it
  "a permanent 2-advisory floor for `lint` on this bundle." That floor is retired: ADR-0015 now
  lives in-bundle at its themed location, so both links were repointed in-bundle during the
  indexing commit and `lint` reports zero findings on this bundle. A future "`lint` is clean"
  statement about this repo now means zero findings, not two.
- **ADR-0047** decision 3's citing corpus already reaches `wiki/` (ADR-0064), so nothing in its
  text changes. What changes is factual: the specific files its ratchet was resolving pointers
  into — the 66 decision records — are now `wiki/decisions/<theme>/*.md` rather than
  `docs/decisions/*.md`. The 106 baseline entries citing them were re-keyed with ADR-0065's
  `--rename` mechanism, preserving each entry's pointer text, occurrence, kind and digest
  verbatim apart from the citing path — exactly the workflow ADR-0065 was built for, with one
  hand-reviewed exception (decision 3 below).
- **ADR-0011** decision 3 described three writers (`plan-task → tech-writer`, `tech-writer`
  standalone, `create-adr`) sharing `docs/decisions/*.md` plus a `docs/TOC.md` index. For a repo
  whose decisions directory resolves inside the wiki bundle — this one, from this record forward —
  the same three writers now target `wiki/decisions/<theme>/*.md` plus that theme's (or the root)
  `index.md`, registering no `docs/TOC.md` row and no breadcrumb, per ADR-0066 decision 3. The
  blast-radius mitigations decision 3 names (clean-tree precondition, dry-run-then-confirm,
  highest-down `git mv` order, report-don't-blind-replace on ambiguous references) are unchanged
  mechanically; only where they write changed.

**3. Immutability, with two narrow exceptions.** The 64 records untouched by decisions 1-2's
mechanics are byte-identical below their new frontmatter. Two records' bodies changed, both
required by the move itself rather than by this record's content: the one cross-theme link inside
the record about this repo's five-dimension documentation convention was rewritten to its new
relative path, and the nine anchored pointers inside the record about the audit-core seam's
re-derivation — each citing a line inside a sibling audit-core record — were shifted by the seven
lines the frontmatter block now occupies above every record's heading.

**4. One drift accepted with a hand-built allowance.** Re-keying the baseline flagged one entry —
ADR-0026's pointer into the llm-wiki concept page — as drift "not explained" by the rename, because
the rename-reversal detector maps renamed basenames and this citation's basename never changed,
only its directory. The citation's one real change is its link target, rewritten to the record's
new in-bundle path, which is exactly what the rename caused. Reviewed and posted to the issue
before the move committed, then accepted with a hand-built `--allow-drift` token naming the new
digest.

**5. A known ratchet gap, left as #579 already named it.** One frozen `plugin/CHANGELOG.md`
citation into this repo's bundle-root record predates this move and is never rewritten — frozen
text is frozen. It now names a path that no longer exists, resolves to nothing, and its baseline
entry is silently excluded from the live scan rather than reported. This is the moved-target gap
#579 already identified, not a new one this record introduces.

**6. Frontmatter values are single-quoted YAML scalars.** Chosen for consistency with the
concept-page frontmatter contract (ADR-0024) and because it is the quoting form OKF's own spec
examples use. The shared `audit-core` YAML frontmatter helper does not currently un-escape a
doubled single quote inside a single-quoted scalar (filed upstream, `audit-core#11`); nothing in
this plugin reads a decision record's frontmatter programmatically today, so the gap has no
present consumer, but a future reader of these fields should know the escaping convention and the
open defect before trusting a value containing an apostrophe.

**7. One `wiki/log.md` entry for the move itself; none for per-record authoring.** The relocation
is a bundle-level structural change, like the original OKF migration, so it gets one dated
Migration entry. Authoring or amending an individual record inside the wiki — including this one —
gets no log entry, per ADR-0066 decision 3: that log is ingest-scoped, not authoring-scoped. This
record is itself the first test of that rule holding for a record about the ADR trail's own home.

## Compromise

**A flat `wiki/decisions/` directory, no themes.** Simplest move, smallest diff. Rejected: a
63-and-growing flat directory loses the orientation nine themes provide a reader scanning a long
chronological sequence, and the themed layout was already the one `renumber-adrs`'s discovery and
`create-adr`'s registration regime were built to understand (ADR-0063, ADR-0066) — flattening here
would have meant building the themed layout and then declining to use it on the one repo that
dogfoods it.

**Keep `docs/decisions/`, link to it from the wiki instead of moving it in.** Leaves the ADR trail
outside the OKF bundle. Rejected because it perpetuates, rather than retires, the exact
out-of-bundle-link debt ADR-0026 decision 5 already flagged as a standing floor for two links into
one record — moving the whole trail in-bundle closes that debt instead of compounding it across
every future bundle page that would otherwise want to cite an ADR.

**A second, hand-maintained description surface in `docs/TOC.md`, independent of frontmatter.**
Would let the collapsed TOC row carry its own prose instead of pointing at the bundle. Rejected:
every other theme's index entry renders its description directly from the record's own
frontmatter, mechanically; a second hand-written copy in `docs/TOC.md` has nothing keeping it in
sync with the frontmatter value the user already approved per record, and buys nothing a single
pointer row doesn't already give a reader.

## Consequences

`create-adr`, `tech-writer`, and `plan-task` now resolve this repo's decisions location and next
number through `renumber-adrs.mjs --next` exactly as ADR-0066 designed, and that resolver now
reports a themed `wiki/decisions/` layout with 67 records and a next number of 68 for this repo.
`docs/TOC.md` is no longer the ADR index for this repo — it carries one pointer row into
`wiki/decisions/index.md`, and the per-record discoverability work moves entirely to the bundle's
own root and theme indexes. A consuming repo that keeps `docs/decisions/` unmoved is unaffected by
any of this: nothing here changes the default resolution path, only what this repo's own override
now points at.
