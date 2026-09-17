# 0054. `wiki-lint`'s mechanical checker: no cross-skill imports, a `lib/` shape, and resolution-based orphan matching

- **Status:** accepted
- **Date:** 2026-09-17
- **Issue:** #150, #428

## Context

`maintain-wiki lint` needed a mechanical checker for the OKF bundle it maintains: dead links, out-of-bundle notes, orphaned pages, and `raw/` immutability. Building it raised three questions with no existing answer in this repo, plus one question #428 raised directly against the orphan check's matching rule.

The first question is where the checker's link- and fence-masking logic should live. `audit-conventions/scripts/lib/md-scan.mjs` already implements fence and inline-code masking for markdown link scanning, and `wiki-lint`'s own `md-links.mjs` needs the same masking. Before this work, and after it, `plugin/` contains zero cross-skill imports — no skill's `scripts/lib/` is imported by another skill's scripts.

The second is which script layout to follow. `create-adr/scripts/` ships one script plus a test; `audit-conventions/scripts/` ships a `lib/` tree of modules plus a companion test per module, per this repo's own `CLAUDE.md` guidance that an entrypoint should be orchestration-only and testable logic should live in `lib/`.

The third is #428's own concern: the orphan check needs to decide whether a page is "listed" by an index. A naive implementation reads a page as listed whenever its filename appears as a substring of some link target in the index — which reads `query-cache.md` as listed because the index links `cloudscript-query-cache.md`, a page with an unrelated name that merely ends the same way. #428 proposed a fix, but proposed applying it to the literal link-target marker before resolving that target against the filesystem — which conflicts with the dead-link check, since a target that resolves to nothing is exactly what the dead-link check calls broken, not evidence that some other page is unlisted.

The fourth is whether the checker should ever be able to fail a build. OKF §11 forbids a tolerant consumer from rejecting a bundle, and #150 frames `lint`'s verb as reporting rather than gating.

## Decision

**1. `wiki-lint`'s modules do not import from `audit-conventions` or any other skill's `scripts/`.** `md-links.mjs` re-implements the fence and inline-code masking `md-scan.mjs` already provides, rather than importing it. A skill is an independently versioned, independently published unit, and importing another skill's internals would couple two components that ship on separate release schedules — exactly the coupling this repo's zero-cross-skill-import baseline has held to so far. `md-scan.mjs` is also shaped by `audit-conventions`'s own needs (a compatibility artifact of that scanner, not a neutral primitive), so promoting it to a shared location would have been a larger decision than this work warranted. If a third consumer of the same masking logic appears, extracting a genuinely shared module becomes worth reconsidering at that point.

**2. The checker's scripts take the `lib/` + `test/` shape, not the single-file shape.** `create-adr`'s one-script-plus-test layout fits a single cohesive script; this checker is four modules (`checks.mjs`, `git-raw.mjs`, `md-links.mjs`, `wiki-pages.mjs`) each with its own test file, plus a thin `wiki-lint.mjs` entrypoint, so it follows `audit-conventions`'s precedent instead.

**3. Orphan matching is resolution-based.** A page counts as listed when a link target in the bundle-root index, or in its own subdirectory's index, *resolves* to that page — never by the target merely containing the page's filename as a substring. Resolving the target first, and only then comparing it against the candidate page, is the reading consistent with the dead-link check: a target that resolves nowhere is a dead link, not evidence of an unlisted page elsewhere. #428's own drafted wording, which matched before resolving, was not adopted for that reason.

**4. `wiki-lint.mjs` always exits 0, and there is no `--strict` flag.** OKF §11's tolerant-consumer bound applies to this checker as much as it does to `lint` itself: it must never fail a build over bundle content. `--strict` remains a possible future addition should a caller ever want the reporting-only verb to also gate — that seam is left open rather than built now.

## Consequences

- The checker reports **"could not check"** rather than an empty passing result in four situations: the bundle-root index is missing, the bundle itself is absent or empty, git is unavailable or the working tree is not a git repository, and there is no history under `rawDir`. This mirrors the inapplicable-versus-passed distinction ADR-0053 established for the audit's hygiene scanners, reached independently here. It was not the first draft: the CLI initially reported "checked — clean" over a bundle that did not exist at all, because both link checks return an empty finding list in that case and an empty list from them is genuinely ambiguous between "checked and clean" and "not checked."
- A reserved file (`index.md`, `log.md`) is exempt from orphan *candidacy* — it is not itself something that needs to be listed — but not from having its own links read by the dead-link check. The first draft conflated the two, scoping the link scan to the orphan candidate set; that would have left a dead link written into `log.md` invisible to the only check capable of seeing it, since `log.md` is never itself scanned by the orphan check.
- `node` is declared in `maintain-wiki`'s `metadata.expects.tools` as `required: false`, so the aggregated required-tool contract the audit enforces across consuming repos is unchanged.
- The substring-matching defect this record's decision 3 replaces was measured at design time against both this repo's own bundle and the corpus checked for ADR-0053, and affected 0 pages on either — it was latent rather than observed firing against real content. The rule in decision 3 is pinned by synthetic fixtures built to exercise it, not by a reduction in real findings.
- Against this repo's own bundle, the checker currently reports 0 dead links, 2 out-of-bundle notes, 0 orphans, and 0 `raw/` modifications, over 4 candidate files and 2 page candidates. Injecting a dead link into the bundle and re-running produces a finding that then disappears once the injection is reverted, which is the evidence that the clean result above is discriminating rather than an artifact of a checker that reports clean unconditionally.
