---
okf_version: "0.2"
---

<!-- `okf_version` is the ONLY frontmatter key permitted here (§8/§12) — this
     file scaffolds the bundle-root index (`<wikiDir>/index.md`, the OKF
     bundle root per ADR-0022). A `<wikiDir>/<subdir>/index.md` carries NO
     frontmatter at all. -->

# Wiki Index

This is the wiki's table of contents — every page under `<wikiDir>/`, grouped
under section headings, one line each. `/gvt-dev:maintain-wiki` keeps this
list current: a new page is added here when it's created, and `lint` flags
any page listed in **no** index — here, or in a subdirectory's own
`index.md`. Each entry's description is the linked
page's frontmatter `description`, so the index and the page can't drift. See
`docs/wiki-schema.md` for the page format and maintenance rules.

<!-- Example section and entry — replace with your own sections and first
     real page, or delete once the wiki has at least one page of its own.
     The `##` heading level below is a local choice — §8 mandates grouping
     concepts under section headings, not a specific heading depth.

## Example section

* [Example topic](example-topic.md) - one-line description of what this page
  covers, matching its frontmatter `description`.
-->
