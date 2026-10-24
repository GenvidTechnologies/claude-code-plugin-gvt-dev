---
type: decision-record
title: 'The audit report names what it actually examined: an override arrow, a path-deduped retired-token corpus, a per-scanner Summary and provenance on wiki-reached findings'
description: 'Findings name a paths-override target, the retired-token corpus is deduped by path, the Summary has one scanned line per scanner built from the scanners corpus functions, and only wiki or config findings carry provenance.'
tags: [decisions, audit-conventions]
status: stable
---
# 0082. The audit report names what it actually examined: an override arrow, a path-deduped retired-token corpus, a per-scanner Summary and provenance on wiki-reached findings

- **Status:** accepted
- **Date:** 2026-10-24
- **Issue:** #731, #453, #401 (amends [ADR-0041](../wiki-and-okf/0041-widen-retired-token-scan-to-wiki-amends-0015.md); refines [ADR-0053](../wiki-and-okf/0053-audit-conventions-declines-bundle-content-to-wiki-lint.md) and [ADR-0077](0077-candidate-resolution-probes-the-kind-and-stops-at-a-candidate-it-cannot-examine.md) decision 6; boundary per [ADR-0049](../audit-core/0049-audit-core-mechanism-policy-boundary.md))

## Context

Three reports said less, or more, than the audit really did.

- **#731.** A file or config expectation relocated by a `.gvt-agent.json` `paths` override was reported under the
  declared path alone. The reader could not tell that the audit had looked somewhere else.
- **#453.** When the docs root and the wiki bundle overlapped, `retiredTokenCorpus` walked the same file twice, so
  every retired-token finding in the overlap was reported twice. A gvt-construct3 snapshot showed 8 lines where 4
  were true. The count behind the Summary line disagreed with the scanner, and that hid the doubling.
- **#401.** The Summary had one line, `scanned N file(s) under docs/, CLAUDE.md`. It omitted the wiki walk and the
  tracked config files the retired-token scan reads, and it overstated what the link and index checks read when
  they declined bundle files under ADR-0053. The figure came from `candidateFileCount`, a second derivation that
  walked the candidates on its own and could not agree with the scanners.

The fixes are plugin-side report policy. The mechanism they sit on, the audit-core resolution and tally
primitives, did not change (ADR-0049).

## Decision

**1. The override arrow.** A finding about a file or config expectation that a `paths` override relocated renders
``expects `<declared>` (→ `<resolved>` via paths)``. When the override equals the declared path there is no arrow,
and findings with no override are byte-identical to before. The helper is `formatOverrideTarget` in
`plugin/skills/audit-conventions/scripts/lib/candidate-resolution.mjs`, the one-candidate counterpart of
`formatCandidateTarget`, which names a passed-over chain of candidates.

**2. The retired-token corpus is deduped by path.** `retiredTokenCorpus` merges the docs walk, the wiki walk and
the tracked config files by repo-relative path. The first walk wins and insertion order is kept, so layouts without
overlap produce exactly the findings, in the order, they did before. `listCandidateFiles` counts `CLAUDE.md` only
when it exists.

**3. A per-scanner Summary built from shared corpus functions.** The Summary prints one `scanned` line per hygiene
scanner. `hygieneCorpora` builds the lines from the same corpus functions the scanners read (`retiredTokenCorpus`,
`linkCheckCorpus`, `indexCheckCorpus`), counting only files that exist, and names any bundle files declined under
ADR-0053. `candidateFileCount` is retired. With an empty deny-list (`hygiene.retiredTokens: []`) the retired-token scan does
not run, and its line reads `retired-token scan off (hygiene.retiredTokens is empty); 0 file(s) checked`. For example, in this repo:

```
- scanned 18 file(s) for retired tokens under docs/, wiki/, CLAUDE.md, .gvt-agent.json
- scanned 2 file(s) for links under docs/, CLAUDE.md
- scanned 0 file(s) for index coverage under docs/ (index docs/TOC.md)
```

**The invariant: a Summary figure comes from the scanner's own corpus function, never from a second derivation.**
The disagreement between the old `candidateFileCount` and the scanner is what caused #401 and what hid #453. No
scanned line contains `orphan`, `broken link` or `contains retired token`, so a downstream digest that counts those
finding phrases cannot count a Summary line.

**4. Provenance only on findings reached through the wiki walk or a tracked config file.** Such a retired-token
finding carries a suffix such as `(via wiki/, retired-token scan only)` or `(via tracked config file,
retired-token scan only)`. Findings from the docs root and `CLAUDE.md` are unchanged.

## Compromise

Override rendering:

- Chosen: R1, the declared path then the arrow and the resolved path.
- Rejected: R2, align with `formatCandidateTarget` — it does not say why the paths differ and reads like a two-step prefer chain.
- Rejected: R3, resolved path first — it breaks the pinned test regex and grep-by-declared-path.

Where the tally comes from:

- Chosen: C1, `hygieneCorpora` built from the corpus functions the scanners already call.
- Rejected: C2, scanners return `{findings, corpus}` — it breaks an exported API used by many tests, `hygiene-probe.mjs` and `staleFollowup`.
- Rejected: C3, `audit-main` recomputes counts ad hoc — a second derivation path, the original defect.
- Rejected: `listUnder` from `fs-walk.mjs` for the dedupe — it sorts, which reorders findings in layouts without overlap.

Summary shape:

- Chosen: S1, one line per scanner.
- Rejected: S2, a single Summary line with a parenthetical — long and overloaded.
- Rejected: S3, keep the line and add a wiki clause — it leaves the link and index overstatement.

Provenance:

- Chosen: P-A, a suffix only on findings reached through the wiki walk or a config file.
- Rejected: P-B, a suffix on every finding — it changes every retired-token line in every repo.
- Rejected: P-C, a `via` field only — the renderer prints detail only, so it never reaches the report.

## Consequences

- The Summary's single `scanned` line becomes three. A consumer that matches the old line must change it:
  gvt-construct3 documents `scanned 21 file(s) under wiki/, CLAUDE.md` in the residue table of its
  `wiki/the-audit-contract.md`; its snapshot test does not anchor on that line. Follow-up:
  GenvidTechnologies/claude-code-plugin-gvt-construct3#169.
- Retired-token findings, and the advisory counts built on them, drop in layouts where the docs and wiki walks
  overlap. The gvt-construct3 snapshot went from 8 lines to 4.
- ADR-0041's single Summary line is now per-scanner, and ADR-0053's declines show in the Summary as well as in
  Info.
- Any later scanner that gets a Summary line must expose a corpus function and have `hygieneCorpora` call it.

**Related:** ADR-0041, ADR-0053, ADR-0077, ADR-0049, ADR-0014, #731, #453, #401.
