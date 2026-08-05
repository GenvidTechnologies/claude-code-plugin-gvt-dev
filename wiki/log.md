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
so; never edit or remove the old one in place. See `docs/wiki-schema.md` for
the full maintenance schema.

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
