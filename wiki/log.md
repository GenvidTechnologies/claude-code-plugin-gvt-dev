# Wiki Log

Record of every `ingest` run: what changed, why, and which `raw/` source
drove it, grouped under `## YYYY-MM-DD` date headings (ISO 8601) with the
**newest date group first**. Entries are prose bullets, e.g. `* **Update**:
…`, `* **Creation**: …`, `* **Deprecation**: …` — the leading bold word is a
convention, not a requirement.

**Add newest first, never edit or remove a prior entry.** "Newest first"
means a new entry (and, if today isn't already the top group, a new
`## YYYY-MM-DD` heading) is *prepended* above everything else — the
insertion point moves from the bottom to the top, but prepending never
touches a prior entry's text, so the append-only guarantee holds exactly as
before. If a past entry itself needs correcting, add a new entry that says
so; never edit or remove the old one in place. See `wiki/schema.md` for
the full maintenance schema.

## 2026-11-13

* **Update**: `maintainer/audit-author-time-findings.md` now says that
  rewording a cited line fails the pointer-baseline digest check even when
  no line moves, and how to re-take an entry whose cited passage is meant to
  change. From the #613 retro. Not an ingest; no `raw/` source drove it.
* **Update**: Performed the correction ADR-0041 recorded as owed (#613).
  `llm-wiki-pattern-in-gvt-dev.md` and `audit-conventions-as-proto-lint.md`
  no longer scope every hygiene scanner to `docs/**` and `CLAUDE.md`: they say
  that `scanRetiredTokens` alone also walks `wiki/`, and the proto-lint page's
  exclude list notes that the decisions exclusion follows a `paths` override
  (ADR-0064). `schema.md` now says log entries are prepended, matching this
  log's newest-first rule. Every line an ADR cites keeps its line number;
  the one cited passage that had to change (`llm-wiki-pattern-in-gvt-dev.md`
  lines 82-84, the passage ADR-0041 named) had its pointer-baseline digest
  re-taken. Not an ingest; no `raw/` source drove it.

## 2026-11-12

* **Update**: Added what `gh issue transfer` does to the `## Tracker` section
  of `process/issue-triage.md`: which labels it keeps, how it rewrites bare
  references, that sub-issue links survive, and that a title match misses
  issues. Observed during #443's ownership pass and recorded by its retro.
  Not an ingest; no `raw/` source drove it.

* **Update**: Added a paragraph to `maintainer/testing-the-audit.md`. It says
  that a test file is part of the pointer scanner's citing corpus, so a
  literal path-colon-number string in a test is a real pointer, and it gives
  the quick check: the bare `pointer-baseline.mjs` scan count must equal the
  baseline entry count. The `CLAUDE.md` Knowledge base trigger for that page
  now names this case. Source: the #594 retro.
  
* **Update**: Added a `## Tracker` section to `process/issue-triage.md`. It
  says which tracker owns an issue now that the wiki practice ships as
  `gvt-wiki`, and how to handle an issue with a half in each plugin. Recorded
  on #443, whose ownership pass moved 35 open issues to the `gvt-wiki` tracker.
  Not an ingest; no `raw/` source drove it.

* **Update**: Added a `## Class` section to `process/issue-triage.md`. It
  names the two stores of an issue's Now/Next/Later class (the coordinator's
  `class:now`/`class:next` labels, which the coach overview reads, and the
  `gvt-plugins` project's Class field) and says that a triage pass sets both.
  Added the `class:*` labels to its Labels list and the "Set coordinator class",
  "Set project Class" and "Read back the project Class" recipes. The triage of
  #919 to #927 set only the project field. Recorded on #865. Not an ingest; no
  `raw/` source drove it.

## 2026-11-11

* **Creation**: Added `decisions/plugin-structure/0098-gvt-wiki-move-own-guard-installed-resolution-and-external-provider.md`,
  recording the guard split by prefix, the installed-`gvt-wiki` resolution,
  the `providedBy` rendering of Practice Coverage, the write-only
  `wiki-editor` and the `MIGRATION.md` copy-base SHA (#441, with #914), and
  listed it in that theme's `index.md`. Not an ingest; no `raw/` source drove it.
* **Update**: Added an `Amended by` marker for ADR-0098 to
  `decisions/plugin-structure/0027-pillar-declaration-and-two-sided-coverage-report.md`
  (decisions 1 and 2).

## 2026-10-13

* **Creation**: Added `decisions/development-practice/0075-quoted-artifacts-vs-direction-in-dispatch-briefs.md`,
  recording the source / content / direction roles for quoted blocks in
  `plan-task` dispatch briefs (#554, with #569 and #646 combined), and listed it
  in that theme's `index.md`. Not an ingest; no `raw/` source drove it.

## 2026-10-12

* **Creation**: Added `decisions/development-practice/0072-triage-verifies-issue-claims-against-the-target-artifact.md`,
  recording the claim-vs-artifact verification step in `issue-triage-analyst`
  (#193, with #430 folded in), and listed it in that theme's `index.md`. Not an
  ingest; no `raw/` source drove it.

## 2026-10-09

* **Creation**: Added `maintainer/leaf-dependency-posture.md` and
  `maintainer/leaf-dependency-ledger.md`, the two documents ADR-0051 deferred
  until `gvt-dev` first pins a leaf, as recorded in ADR-0071 (#458, #578).
  Both are listed in `maintainer/index.md`. Not an ingest; no `raw/` source
  drove them.

## 2026-10-08

* **Update**: Retro of the docs→wiki chain. `maintainer/audit-author-time-findings.md`
  gains a note on moving a *cited* file: its baselined pointers go silently
  unresolved, so repair them by intent and check that the cited text still
  exists. `maintainer/release-cycle-rules.md` records that the leak-guard
  check now runs in `commands.validate` too. Not an ingest; no `raw/` source
  drove it.

* **Migration**: Moved the maintenance schema from `docs/` into the bundle as
  `schema.md` for #587, gave it OKF frontmatter as a `convention` page, listed
  it under `## Schema` in `index.md`, and brought its claims up to date with
  the moved tree. Not an ingest; no `raw/` source drove it.

## 2026-10-06

* **Migration**: Moved the long maintainer sections of `CLAUDE.md` into six
  `maintainer/` pages for #586, registered them in `maintainer/index.md`, and
  replaced them in `CLAUDE.md` with a `## Knowledge base` routing list. Not an
  ingest; no `raw/` source drove it.

## 2026-10-05

* **Migration**: Moved the issue-triage conventions to `process/issue-triage.md`
  and the plugin-authoring notes to `maintainer/plugin-authoring.md` for #585,
  gave each OKF frontmatter, added the `process/` and `maintainer/` indexes, and
  linked them from `index.md`. Not an ingest; no `raw/` source drove it.

## 2026-10-01

* **Migration**: Moved the repo's decision records from `docs/decisions/` into
  `wiki/decisions/<theme>/` for #584, gave each OKF frontmatter, added the
  decisions and theme indexes, and linked them from `index.md`. Not an
  ingest; no `raw/` source drove it.

## 2026-08-04

* **Migration**: Moved this bundle to OKF v0.2 for #192 — reworked
  `llm-wiki-pattern-in-gvt-dev.md`, `audit-conventions-as-proto-lint.md`,
  `index.md`, and `log.md` to the v0.2 page, index, and log shapes; see
  ADR-0026 for the reasoning. `usage_window` is omitted from the page
  frontmatter per #221. The 2026-07-21 entry below was re-rendered from the
  old 4-column table into a §9 prose bullet, not revised — its Change, Why,
  and Source text is preserved word-for-word.

## 2026-07-21

* **Creation**: Created `llm-wiki-pattern-in-gvt-dev.md` and
  `audit-conventions-as-proto-lint.md`; added both to `index.md`. Dogfooding
  #143 — standing up the wiki practice in the plugin repo itself, ingesting
  the two captured `raw/` sources into the first real wiki pages. Source:
  #143.
