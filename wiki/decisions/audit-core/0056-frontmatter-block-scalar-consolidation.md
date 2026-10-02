# 0056. Frontmatter parsing consolidates on one block-scalar-aware walker; the duplicate description extractor is retired

- **Status:** accepted
- **Date:** 2026-09-18
- **Issue:** #470

## Context

`audit-conventions` parsed YAML frontmatter twice: once in the shared `frontmatter.mjs` used for
contract validation (`metadata.expects`, `metadata.pillar`), and again in `description-length.mjs`'s own
`extractDescription`, used only to render a component's description for the length check. Only the shared
walker was defective. `frontmatter.mjs` did not understand YAML block-scalar indicators (`>`, `>-`, `>+`,
`|`, `|-`, `|+`), so on a multi-line `description` it returned the indicator line as the literal value and
then walked the folded body as ordinary `key: value` lines, splitting any line containing a colon-space into
a junk top-level key. `extractDescription` handled those same indicators correctly — that is precisely why it
existed, as its own module header recorded. The duplication was a workaround for the gap this record closes,
which is why closing the gap is what makes the duplicate removable.

Measured against the full 32-component corpus (23 skills + 9 agents) before the fix: 5 components parsed
`description` as the bare indicator (`migrate-cordova-ci`, `publish-npm-package`, `reconcile-mcp-pin`,
`release-npm-package`, `release-plugin`), and 7 junk top-level keys were invented across 4 of those five —
`publish-npm-package`'s bad description produced no junk key. `metadata.expects` and `metadata.pillar` had
**0** divergences from real YAML on the same corpus, so contract validation was never wrong. Neither was the
length check, which read the working extractor. What was wrong was `frontmatter.mjs`'s parsed `description`
value and the junk keys beside it — and, as the Consequences below record, nothing read either one.

ADR-0051's Consequences already named this issue and its ordering: it is "unblocked, and should land **first**
among the dependent work: it merges two independently-written frontmatter parsers into one and turns #458 step
(4) into a single-site swap instead of two."

## Decision

**Block-scalar knowledge moves into the shared parser's walk, not into a description accessor.** The junk keys
were produced by the block body being walked independently of what value `description` was ultimately assigned,
so a fix that only corrected the assigned value would have fixed the 5 descriptions and left all 7 junk keys.
`frontmatter.mjs` gains `readBlockScalar`, a consume-and-skip routine: it collects the folded/literal body by
indentation and returns the index of the first line the block does not consume, so the outer key/value walk
never re-parses body lines as top-level keys.

**Chomping indicators are adopted in full** — clipping (`>`, `|`) keeps a single trailing newline, stripping
(`>-`, `|-`) removes it, keeping (`>+`, `|+`) preserves all trailing blank lines. Before this, the one remaining
divergence from real YAML on the corpus was `migrate-cordova-ci`'s description, one character short (662 vs.
663), the only component using clipping `>`. Closing a one-character gap is worth doing because #457 extracts
this module **verbatim** into the published `@genvidtech/audit-core`, where it stops being "handles the
frontmatter this repo happens to write" and becomes a general-purpose library other consumers will parse
arbitrary YAML with. The keep case is sensitive to how the block terminated: an EOF-terminated block already
carries its final line-terminator as a trailing empty element from the line split, a dedent-terminated block
does not, so the correct trailing-newline count is the trailing-blank-line count plus one only in the
dedent-terminated case. A flat floor under-counts every dedent-terminated keep-chomped block that carries
trailing blank lines; the corpus never exercises `|` or any keep indicator, so this was caught by a synthetic
differential rather than by the corpus.

**`extractDescription` is retired.** `description-length.mjs` now delegates all parsing to `frontmatter.mjs`
and keeps only `renderedDescription`, a thin adapter that trims the parsed value — the listing renders a
description as one line, and a clip- or keep-chomped scalar carries a trailing newline a raw count would
include. Net 46 lines removed.

### Options considered and rejected

- **Swap to the `yaml` npm package now.** Rejected here on sequencing, not merits: ADR-0051 assigns
  `plugin/package.json` plus a committed lockfile to #458 step (2) and the preflight work to #477, and today
  `plugin/` cannot resolve a bare specifier because consumers run the audit from the installed plugin cache.
  This consolidation is what makes that later swap a single-site change instead of two.
- **Promote `extractDescription`'s logic as the sole fix, leaving it as the description value only.** Rejected
  as insufficient — it would leave the junk-key count at 7, failing the issue's own acceptance criterion.
- **Keep both extractors.** Rejected — merging them into one is the stated purpose of this issue per ADR-0051.

## Consequences

- Two edges are deliberately left unhandled, both documented in the module: a folded block's "more-indented
  lines keep their own line breaks" exception, and an explicit indentation indicator (e.g. `>2`), which falls
  through to the ordinary scalar path and yields the literal string. No component in the corpus exercises
  either.
- One behaviour change is dormant rather than observed: for a folded block containing an interior blank line,
  the retired extractor collapsed the run to a single space, while the shared parser folds it to one newline
  per blank line, per YAML. No component or test has that shape today, so nothing observable moved on this
  corpus — the shared parser's own tests pin the new behaviour directly.
- The defect was real but unobservable, which is why the issue was reclassified from `type:bug` to `chore`
  (priority unchanged, retained for chain position). Nothing downstream ever read the mis-parsed value: the
  audit's component loader reads only `metadata.expects` and `metadata.pillar` from parsed frontmatter, both
  measured at 0 divergences, and the description-length check used the separate, now-retired extractor. The
  sibling `gvt-construct3` audit is narrower still, reading only `metadata.expects`. The work is justified by
  the #457/#458 chain and by #457's upcoming publication, not by user-visible breakage.
- #457 now extracts a parser that agrees with real YAML (`yaml@2.9.1`) on this corpus, and #458's eventual swap
  to that package touches one call site instead of two.
