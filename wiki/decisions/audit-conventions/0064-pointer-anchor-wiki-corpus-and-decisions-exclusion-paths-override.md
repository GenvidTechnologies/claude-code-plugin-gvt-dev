# 0064. Pointer-anchor corpus includes `wiki/`; hygiene decisions exclusion follows `paths`

- **Status:** accepted
- **Date:** 2026-09-29
- **Issue:** #583 (Part 1 of the docs→wiki chain #579; Parts 2/3 split to #594/#593)

## Context

The docs→wiki chain relocates contract docs — and, per ADR-0063, ADRs themselves — into a repo's
`wiki/` bundle. Two of this repo's own audit mechanisms hadn't caught up:

- The hygiene scanners' `DEFAULT_EXCLUDE_PATHS` hardcodes `docs/decisions/`. A repo that relocates
  its ADRs (to `docs/adr/`, or into `wiki/decisions/`) loses that exclusion, and the retired-token
  scan starts flagging accurate history inside the moved ADRs.
- `pointer-anchor`'s `CITING_ROOTS` was `['docs', 'plugin']`, so pages under `wiki/` were never
  scanned for positional citations at all — including the four `wiki/*.md` pages this repo already
  carries.

## Decision

**D1. `CITING_ROOTS` gains `wiki`, hardcoded rather than config-driven.** The citing corpus is
`['docs', 'plugin', 'wiki']` — a plain array literal in `pointer-anchors.mjs`, not a new config key.
Three reasons: the `AUDITING_PLUGIN_SOURCE` gate already confines the whole check to this repo's own
source, so nothing a consumer sets could widen its reach; the scanner stays config-free like the rest
of its corpus decisions (ADR-0047 decision 3 already made `docs`/`plugin` and the exclusion list
fixed, not configurable); and a config key here could only ever *narrow* an `error`-severity corpus,
which is the wrong shape for a citing convention that is part of the contract rather than a per-repo
preference.

**D2. Re-asking ADR-0047's directive.** ADR-0047's Consequences section states plainly: "Any future
widening of the citing corpus — or any change that makes the check runnable outside
`AUDITING_PLUGIN_SOURCE` — reopens the severity question rather than inheriting the answer recorded
here." This change widens the corpus, so the question is re-asked rather than assumed:

*Runnable outside the gate now?* No — `wiki` joins the array read at the same gated call site;
nothing about this change touches `AUDITING_PLUGIN_SOURCE` itself.

*ADR-0019's two questions, re-answered for this corpus:*
- **Is the gap real?** Yes. Wiki pages were never checked for positional-citation decay, and the
  docs→wiki chain (#579) is actively moving prose — including ADRs, per ADR-0063 — into `wiki/`,
  which makes the gap grow rather than sit static.
- **Is the blast radius confined?** Yes, but — as ADR-0047 decision 2 already flagged for
  `docs/decisions/` — **by the gate alone, not by the scanner's reach.** A consumer can and does have
  a `wiki/` tree once `/gvt-dev:maintain-wiki` scaffolds one, exactly as a consumer has `docs/decisions/`
  once `create-adr` scaffolds it. `AUDITING_PLUGIN_SOURCE` being path-derived from the *audited* repo
  is what keeps this repo's own `wiki/` distinct from a consumer's.

Measured at `327c2ff` (the commit that lands D1 in code): `listCitingFiles` went from 199 to 203
entries, the 4 new ones all under `wiki/` (`wiki/audit-conventions-as-proto-lint.md`, `wiki/index.md`,
`wiki/llm-wiki-pattern-in-gvt-dev.md`, `wiki/log.md`); total pointers in the corpus stayed at 136, with
0 of them under `wiki/` — the four new files carry no positional pointers today. The baseline
(`.pointer-baseline.json`, 114 entries) is unchanged: `pointer-baseline.mjs` reports 0 added, 0 pruned
against the widened corpus, and `audit.mjs` exits 0. **Severity stays `error`** (reaffirmed, not
re-derived from scratch — the reasoning above is the re-derivation ADR-0047 requires).

**D3. Bundle-absolute pointers are accepted debt, reported loudly rather than silently mis-resolved.**
`wiki/` pages written under the OKF bundle convention can cite a sibling page with a leading-slash,
bundle-root-relative path (e.g. `/decisions/0001-x.md`), mirroring how `maintain-wiki lint` resolves
links against the bundle root. `pointer-anchor` does not do this: `matchCandidates` (unchanged by this
record) matches a cited path against the whole repo-relative candidate list by suffix, so a
leading-slash form never lines up with anything and reports `pointer-unresolved` — `error` severity,
same as any other broken citation — while the equivalent repo-root-relative form
(`decisions/0001-x.md`) resolves cleanly. This is loud, not silent: the scanner never mis-resolves a
bundle-absolute pointer to the wrong file, it simply reports it as unresolved. A test pins both halves
of this behaviour (`plugin/skills/audit-conventions/scripts/test/pointer-anchors.test.mjs`, "a
repo-root-relative pointer under wiki/ resolves; a leading-slash form does not"). Re-entry condition:
revisit if a real bundle-absolute pointer is ever written in this repo's own `wiki/` tree — none exists
today. One residual note: `wiki/log.md` is append-only history (per `maintain-wiki`'s own convention),
so a pointer found stale there cannot simply be edited in place the way a live page can; that is a
`maintain-wiki` concern, not something this scanner works around.

**D4. The hygiene scanners' `docs/decisions/` default exclusion resolves through a `docs/TOC.md`
`paths` override, and the exclusion set is the union of the resolved directory and the literal
default.** `decisionsExclude` (in `hygiene.mjs`) calls `resolveExpectationPath(opts.paths,
'docs/decisions/')` (ADR-0062's mechanism) and, when the result differs from the literal default,
adds it as an *additional* excluded directory via `effectiveExcludes` — never a replacement. This is a
deliberate, scoped deviation from ADR-0062's own stated precedence ("the override wins when present"):
resolution itself still returns exactly what ADR-0062 says it should (the override, when set); what
differs is that the *exclusion set* keeps both the override's target and the original default,
because a partially-migrated repo can legitimately have ADRs sitting in both places at once (some
already moved, some not yet), and excluding only one location would surface the other's accurate
history as retired-token findings mid-migration.

Guards, exercised by tests H1–H8 (`hygiene.test.mjs`): an unusable override value (empty, whitespace,
`.`, `./`, an absolute path, a drive letter, a `..` segment, or a non-string) is ignored and adds
nothing (`anchoredDirEntry` returns `null`); a value that anchors straight back to `docs/decisions/`
adds nothing (there is nothing to add); a value naming a walked root or one of its ancestors
(`opts.docsRoot`, `opts.wikiDir`) adds nothing, since excluding a whole walked root because its ADR
subdirectory moved there would blind every other scanner to that root's ordinary content;
`isExcluded` already ignores empty/non-string entries, unaffected by this change. With no `paths`
override set at all, `effectiveExcludes` is byte-identical to the pre-existing
`DEFAULT_EXCLUDE_PATHS` behaviour — this is inert for every repo that hasn't adopted the override,
including this one at HEAD. `hygiene-probe.mjs` prints the resolved set verbatim
(`excludePaths: [...]`) rather than a hand-reconstructed one, so a maintainer can see exactly what a
given `paths`/`hygiene` config resolves to without reading the source.

Measured on a throwaway copy with every tracked ADR moved to `wiki/decisions/` and
`paths: {"docs/decisions/": "wiki/decisions/"}` added to `.gvt-agent.json`: retired-token findings
under `wiki/decisions/` went from 17 to 0, while the scan of everything else was unaffected.

## Compromise

Alternatives rejected:

- **A `CITING_ROOTS`-configuring key in `.gvt-agent.json`** (D1) — rejected because the gate, not
  configurability, is what confines this check's reach, and a config surface here would invite
  narrowing an `error`-severity contract per-repo, which is not a decision an individual consumer
  should get to make unilaterally.
- **Resolving bundle-absolute pointers against the wiki bundle root** (D3) — rejected as out of
  scope: that resolution logic already exists and is owned by `/gvt-dev:maintain-wiki lint`
  (ADR-0053's precedent for `scanBrokenLinks`/`scanOrphanedDocs` declining bundle content rather than
  reimplementing bundle-aware resolution). Duplicating it here for one scanner would fork the
  resolution rule the moment either implementation changed.
- **Replacing the literal `docs/decisions/` default when an override is set, matching ADR-0062's
  general precedence** (D4) — rejected because a migration is rarely atomic: freezing the exclusion to
  only the override's target the moment a repo sets it would immediately start flagging every
  not-yet-moved ADR still sitting at the old path.

## Consequences

`pointer-anchor` now checks `wiki/` pages in this repo's own source tree, at the same `error` severity
and behind the same gate as `docs/` and `plugin/`; consumers are unaffected until they run this
plugin's source directly, which they cannot. The hygiene scanners' decisions exclusion now tracks a
relocated `docs/decisions/` the same way `triage-issues` already tracks a relocated
`docs/issue-triage.md` (ADR-0062) — another adopter of that same resolution mechanism, per
`plugin/CONVENTIONS.md`'s "Runtime path resolution" section. A future corpus widening of
`pointer-anchor` (a fourth citing root, or a change to how the gate itself is derived) must re-ask
D2's questions again rather than inherit this record's answer, per ADR-0047's own standing directive.

**Related:** ADR-0019 (the two-question severity test this record re-answers), ADR-0047 (the directive
requiring re-derivation on corpus widening, and the citing-corpus/gate design this record extends),
ADR-0062 (the `paths`-override resolution mechanism D4 reuses), ADR-0053 (bundle-content declines,
the precedent D3's compromise follows), #583 (this issue), #579 (the docs→wiki chain), #594/#593
(Parts 2/3, split out of #583).
