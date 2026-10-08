---
type: decision-record
title: 'The wiki schema resolves inside the bundle first, a prefer field declares the order, and ADR-0015 decision 1 is amended'
description: 'The wiki schema resolves from the paths override, then wiki/schema.md in the bundle, then legacy docs/wiki-schema.md; prefer declares it, amending ADR-0015.'
tags: [decisions, wiki-and-okf]
status: stable
---
# 0070. The wiki schema resolves inside the bundle first, a prefer field declares the order, and ADR-0015 decision 1 is amended

- **Status:** accepted
- **Date:** 2026-10-08
- **Issue:** #385 (schema resolution; ahead of #587 in the docs→wiki chain #579)

## Context

[ADR-0015](0015-maintain-wiki-design-boundaries.md) decision 1 put the maintenance schema
outside the wiki tier: "The maintenance-rules *schema* doc (`docs/wiki-schema.md`) is the
one wiki artifact that stays under `docs/`". [ADR-0022](0022-okf-bundle-root-is-the-wiki-tier.md)
then made `<wikiDir>` the OKF v0.2 bundle root, and `plugin/CONVENTIONS.md` records that
"`wikiDir` **is** the OKF v0.2 bundle root". Together they leave a bundle that cannot
describe itself: the one document that explains how its pages are maintained sits outside
it. A consuming repo that follows the practice and keeps its schema at `wiki/schema.md`
finds `maintain-wiki` no longer locates it (#385, hit in practice by a consumer).

The shipped expectation also names only one location. [ADR-0062](../plugin-structure/0062-runtime-path-resolution-for-declared-expectations.md)
gave `.gvt-agent.json` a `paths` override keyed by the declared path, and the audit
honours it, but the Environment detector `practice-detect` did not. So a repo with an
override was reported as `partial adoption` by the detector while the audit accepted it.

## Decision

**1. One resolution order, shared by every consumer.**

1. `paths['docs/wiki-schema.md']` when set. It wins outright, with no fall-through to
   the other two.
2. Else `<wikiDir>/schema.md`.
3. Else `docs/wiki-schema.md`, the legacy location.

`<wikiDir>` is `wiki.wikiDir`, default `wiki`. The canonical statement is `maintain-wiki`
§0 step 1. `run-retro` and the audit's Environment detector `practice-detect`, which now
also honours the `paths` override, restate the same order; that closes the mismatch
above. `wiki-librarian` reads the path its dispatcher resolved, and `triage-issues`
cites the wiki's schema doc without naming a location.

**2. ADR-0015 decision 1 is amended, not edited in place.** Following the precedent of
[ADR-0041](0041-widen-retired-token-scan-to-wiki-amends-0015.md), the older record stays
as written and this one supersedes its schema sentence. The schema no longer stays under
`docs/`. ADR-0015's rationale survives inside the bundle: the schema is still curated,
it is indexed (in `<wikiDir>/index.md`), token hygiene still reaches it, and wiki-lint
covers its links and orphan status. The `raw/` limb and decision 2 are untouched.

**3. A `prefer` field on the one `metadata.expects` entry.** It is an optional scalar
holding one `<wikiDir>` placeholder (`<wikiDir>/schema.md`). The entry's declared
`path: docs/wiki-schema.md` stays as it is, because it is the `paths` override key
(ADR-0062 key identity). The audit resolves `prefer` on gvt-dev's side of the audit-core
boundary, in `audit-main.mjs` plus a pure `lib/expect-prefer.mjs`, so audit-core is
untouched. An unmet entry names both locations. Alternatives:

- *Document the order in `reason` only.* The audit would still look for the declared
  path alone, so a bundle-only repo gets a false "file not found" line that contradicts
  its own Environment row.
- *Two entries.* Each is optional, so one is always unmet and the noise is permanent. A
  custom `wikiDir` makes the second one wrong, and it invents a second override key for
  one file.
- *Change the declared path to `<wikiDir>/schema.md`.* This breaks every existing
  override, since overrides are keyed by the declared path.

**4. Duplicate and dangling override.**

- When the resolved schema exists and another of the three locations also holds a file,
  every verb reports a *shadowed duplicate*, naming both paths and which one is read. It
  never deletes, merges or moves either file.
- A *dangling override* (override set, target missing, but a bundle or legacy copy
  exists) stops `ingest` before it writes anything. `query` and `lint` report it and
  continue.
- The report lives in skill prose. A deterministic wiki-lint finding is a possible
  follow-up only if prose proves unreliable; it is not in scope.
- **Scaffold** only when none of the three locations holds a file. The target is the
  override if set, else `<wikiDir>/schema.md`.

**5. Indexing follows location.** An in-bundle schema gets one line in
`<wikiDir>/index.md` under a `## Schema` heading and no `docs/TOC.md` row, because two
rows for one page would drift. A schema outside the bundle (an override pointing, say,
into `docs/`) keeps the existing `docs/TOC.md` Knowledge Base rule.

**6. Frontmatter is added at scaffold time.** A schema scaffolded inside the bundle gets
`type: convention` plus a title and description prepended (the index entry quotes the
description); one scaffolded outside the bundle gets none. It is not baked
into the template, which would shift every template line cited by baselined pointers.

**7. ADR-0062's Compromise is reconciled.** That record rejected "an implicit wiki
convention — inferring relocation by checking whether a `<wikiDir>/…` path happens to
exist", with the reasons "Invisible to the audit (nothing declares it), ambiguous when
both the old and new locations exist", and said it was "Kept only as #385's
schema-resolution fallback step, not adopted as the mechanism here." This record is that
step, and it answers both objections. *Invisible:* `prefer` declares the step on the
entry, so the audit sees it. *Ambiguous:* "bundle wins, report the duplicate" gives a
single answer when both exist. `plugin/CONVENTIONS.md` "Precedence" rule gains an
explicit exception for this one expectation, so the general rule is not silently
contradicted.

**8. No new config key.** There is no `bundleRoot` and no `schemaPath`. An in-bundle
schema makes the bundle self-describing, which strengthens the CONVENTIONS line that
`wikiDir` is the bundle root rather than competing with it. The `<schemaDoc>` token in
the scaffolded templates is a placeholder substituted at copy time, not a config key.

**Also recorded.** #587 then moves this repo's own `docs/wiki-schema.md` into the bundle
with no stub left behind, since a stub would be reported as a shadowed duplicate. Two
pointer citations in ADR-0022 gain content anchors because the template and `SKILL.md`
edits moved the lines they cite; the decision text of ADR-0022 is unchanged.

## Compromise

**Document the order in `reason` only**, **two expectation entries**, and **a changed
declared path** were each rejected, for the reasons under decision 3. **A new `bundleRoot`
or `schemaPath` key** was rejected under decision 8: a second name for one thing drifts.
**Making the audit-core resolver understand fallbacks** was rejected because it widens a
shared leaf library for one expectation; `prefer` keeps the change on this side of the
boundary.

What is given up: the resolution order now exists in two places that must agree, prose in
`maintain-wiki` §0 and the `prefer` field the audit reads. A parity test between the
skill frontmatter and `practice-detect` guards the code half. The duplicate report is
prose, so it depends on the model following the skill and is not a deterministic check.

## Consequences

A repo whose schema lives at `<wikiDir>/schema.md` is found without configuration, a
repo still on `docs/wiki-schema.md` works unchanged, and a repo with a `paths` override
is honoured by the detector as well as the audit. A greenfield scaffold lands in the
bundle. Existing overrides keep working because the declared path is unchanged. Both
copies existing is reported but never repaired, so a repo can sit in that state until its
owner removes one. The pointer-anchor baseline drops from 113 to 111 as the two ADR-0022
citations are anchored and pruned.

**Related:** ADR-0015 (decision 1 amended), ADR-0022, ADR-0041, ADR-0062, #385, #587, #579.
