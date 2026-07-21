# Wiki Index

This is the wiki's table of contents — every page under `wiki/`, in one line
each. `/gvt-dev:maintain-wiki` keeps this list current: a new page is added
here when it's created, and `lint` flags any page missing from this list. See
`docs/wiki-schema.md` for the page format and maintenance rules.

- [The LLM-Wiki Pattern in gvt-dev](llm-wiki-pattern-in-gvt-dev.md) — how
  Karpathy's LLM-wiki pattern maps onto surfaces already in the gvt-dev
  plugin (`docs/TOC.md`, ADRs, `run-retro`/`condense-lessons`,
  `audit-conventions`'s scanners).
- [`audit-conventions` as proto-lint](audit-conventions-as-proto-lint.md) —
  how the existing hygiene scanners already function as an informal lint
  tier, and where the boundary with `maintain-wiki lint` sits per ADR 0015.
