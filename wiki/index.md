---
okf_version: "0.2"
---

# Wiki Index

This is the wiki's table of contents — every page under `wiki/`, grouped
under section headings, one line each. `/gvt-dev:maintain-wiki` keeps this
list current: a new page is added here when it's created, and `lint` flags
any page listed in **no** index — here, or in a subdirectory's own
`index.md`. Each entry's description is the linked page's frontmatter
`description`, so the index and the page can't drift. See
`docs/wiki-schema.md` for the page format and maintenance rules.

## Practice notes

- [The LLM-Wiki Pattern in gvt-dev](llm-wiki-pattern-in-gvt-dev.md) — How
  Karpathy's LLM-maintained-wiki pattern maps onto gvt-dev surfaces that
  predate maintain-wiki — docs/TOC.md, ADRs, run-retro/condense-lessons, and
  audit-conventions' hygiene scanners.
- [`audit-conventions` as Proto-Lint](audit-conventions-as-proto-lint.md) —
  How audit-conventions' hygiene scanners already act as an informal advisory
  content-lint over docs/** and CLAUDE.md, and where the boundary with
  maintain-wiki lint sits per ADR-0015.
