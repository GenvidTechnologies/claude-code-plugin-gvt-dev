# 0063. `renumber-adrs`: recursive theme discovery, single-pass whole-filename token rewrite, and frozen-history exclusion

- **Status:** accepted
- **Date:** 2026-09-29
- **Issue:** #581 (P2a of the docs→wiki chain #579)

## Context

`plugin/skills/create-adr/scripts/renumber-adrs.mjs` was flat and narrow. Discovery was
non-recursive, so a themed ADR root (`<decisions>/<theme>/NNNN-slug.md`) was a silent no-op, and
running the script once per theme directory instead produced duplicate numbers across themes.
Reference rewriting used two per-form regexes (a markdown-link form and a TOC-row form) that missed
cross-theme references, bundle-root-absolute paths, backticked bare and path-form filename
pointers, and `.json` files — so `.pointer-baseline.json` keys went stale after a renumber. Two
further defects were independent of theming: links inside a moved ADR were read for rewriting
*after* its `git mv`, at a path that no longer existed (an `ENOENT` warning, exit 0, and a dangling
link left behind); and rewriting per old filename via a sequential string replace let a renumbered
name embedding a shared slug get rewritten twice, double-shifting it past its intended target.
Date-stamped notes files (`NNNN-NN-NN-slug.md`) were also mistaken for ADR 2026 by the old filename
pattern. Frozen history — `CHANGELOG.md`, `docs/superpowers/`, the wiki raw tree, `wiki/log.md`, and
`.pointer-baseline.json` — was being rewritten in place, corrupting artifacts that are deliberately
immutable.

## Decision

**1. Recursive discovery, one chronological sequence across themes.** `discoverAdrs` walks `dir` to
any depth (skipping dot-directories and `node_modules`), collecting every `NNNN-slug.md` basename
that isn't date-shaped into a single sequence sorted by number. A number reused across two theme
directories is a hard error (`EDUPLICATE`) raised before any file is touched, alongside `ENOADRS`
(no ADRs found) and `EINSERTAT` (a non-integer or `< 1` `--insert-at`) — each surfaces as a one-line
CLI message and exit 1, no stack trace, no partial change.

**2. Single-pass whole-filename token rewrite, never chained.** `buildTokenRewriter` compiles one
regex alternation of every moved ADR's old basename (longest first, so a filename that embeds a
shorter one — e.g. a `supersedes-0003-c` slug embedding `0003-c.md` — matches whole), bounded by a
lookbehind/lookahead that requires a whole-filename-token boundary. The whole corpus (`git ls-files
--cached --others --exclude-standard`, binaries excluded by a NUL-byte heuristic on the first 8 KB)
is rewritten in one `replace` per file, covering every citing form — sibling, `../theme/`,
bundle-root-absolute, theme index, root TOC, and both backtick forms — with a single mechanism
instead of one regex per form. Replaying detected hits one at a time via string substitution was
rejected as unsafe: `String#split`/`replace` on a bare filename also matches it as a substring of a
longer token (`x0003-c.md`, `0003-c.md.bak`), which is exactly the boundary violation the token
regex exists to prevent, and chaining per-name replaces across a shifted sequence is what produced
the double-shift defect above. A bare `ADR-NNNN`/`ADR NNNN`/`decision NNNN` mention stays
report-only and unrewritten, per ADR-0011 item 3's "never blind-replace" rule — restated here for
the corpus-wide token rewrite, and reported only for numbers that actually moved.

**3. Compute in memory before any move, `git mv` highest-down, then write, then stage.** Every
file's final content — a moved ADR's own heading and self/cross-references, and every citing file's
rewrites — is computed by reading from the *old* (pre-move) path before any `git mv` runs. Moves
then execute highest-numbered first (to avoid collisions), each rewritten file is written to its
*post-move* path, and every written path is `git add`ed in the same operation. This fixes the
read-after-move `ENOENT` defect: nothing is read from a path that has already been renamed out from
under it.

**4. Frozen history is scanned and listed, never rewritten.** `isFrozenPath` recognizes any
`CHANGELOG.md` by basename, anything under `docs/superpowers/`, anything under the configured
`wiki.rawDir` (default `raw/`), the configured `wiki.wikiDir`'s `log.md` (default `wiki/log.md`),
and the repo-root `.pointer-baseline.json`. A hit in a frozen file is counted and the file is listed
under "Left untouched (frozen history — deliberately not rewritten)" in the report, but its content
is never modified. Reusing the audit's hygiene `excludePaths` was rejected: that list already
excludes `docs/decisions/` itself (the very tree this script renumbers) and carries unrelated
entries with no reason to track together. `.pointer-baseline.json`'s own re-keying after a renumber
is left as an operator step (`create-adr` SKILL.md's baseline guidance), not automated here; a
rename-aware `pointer-baseline.mjs` mode is deferred to #583.

**5. Dry-run output ends in one machine-checkable `Summary:` line** — moves, reference-rewrite
occurrences and the distinct files they land in, frozen-history occurrences left untouched, and
distinct ambiguous lines — alongside the existing discovered-count header, move list, grouped
reference-rewrite section, untouched-file list, and ambiguous-reference section.

Architecture: this refines, rather than replaces, ADR-0011 item 3's safeguards for `create-adr` as a
third writer of the shared `docs/decisions/` store — the clean-tree precondition, dry-run-then-apply
flow, highest-down move order, and never-blind-replace rule for ambiguous references are all kept
unchanged; this record adds the recursive/themed discovery, the single-pass rewrite mechanism, and
the frozen-history exclusion that flat-layout use never needed.

## Compromise

Alternatives rejected:

- **Extend the two per-form regexes to cover the missing citing forms** — each new form (backtick
  bare, backtick path, `.json`) is a new regex to maintain, and any future form is a miss by
  default. The whole-filename token rewrite covers every current and future citing form with one
  mechanism, since it matches on the token itself rather than on how it's introduced.
- **Path-aware link resolution** (rewrite a link relative to the citing file's own directory rather
  than matching the bare filename). Its only benefit over a bare-token match is distinguishing two
  different files that happen to share a basename in different directories — a case that did not
  occur anywhere in this repo's tree at design time — at the cost of bundle-root resolution rules
  and a markdown-link-parsing dependency neither of which the token rewrite needs.
- **Reuse the audit's hygiene `excludePaths` for frozen-history exclusion** — see decision 4 above;
  its existing exclusion of `docs/decisions/` and unrelated entries makes it the wrong list to
  extend for this purpose.

The cost: the corpus scan now reads every tracked non-binary file on every invocation (dry-run
included) to compute reference rewrites, rather than only the files a caller expects to cite an ADR;
judged acceptable given the plugin repo's tree size and that renumbering is an infrequent, explicit
operation.

## Consequences

The CLI surface is unchanged (`--dir`, `--insert-at`, `--apply`). Dry-run and apply output changed
shape (grouped-by-file sections, the `Summary:` line, the frozen-history list). Existing flat-layout
consumers see corrected behavior — no double-shift, no post-move `ENOENT` warnings, frozen files left
alone — with no migration needed. `create-adr` SKILL.md documents the recursion, the `ADR-NNNN`
report-only convention, staging, and the pointer-baseline re-key step this record's decision 4
leaves to the operator.

**Related:** ADR-0011 item 3 (the safeguards this record refines rather than replaces).
