# 0053. `audit-conventions` declines OKF bundle content to `maintain-wiki lint`, enforcing a boundary it previously only assumed

- **Status:** accepted
- **Date:** 2026-09-15
- **Issue:** #454, #421

## Context

ADR-0041 states plainly that only `scanRetiredTokens` walks `<wikiDir>/`, and that *"`scanBrokenLinks` and `scanOrphanedDocs` are untouched."* Its rejected-alternatives section refuses a second, `hygiene.mjs`-rooted orphan/link implementation on the merits, because it *"would disagree with `lint` on bundle-absolute link resolution."* `plugin/CONVENTIONS.md` publishes that scope table to consumers as contract.

**That boundary was documented but never enforced.** A `paths` override of the form `{"docs/TOC.md": "wiki/index.md"}` makes `docsRoot` equal `wikiDir`, and the candidate walk is rooted at `docsRoot` — so bundle pages already reach both scanners. ADR-0041 treated "these two did not widen" as settling the question; it did not, because the override delivers the same content by a different route. **This record corrects that implicit *sufficiency* claim — not ADR-0041's decision, which is reaffirmed.**

### Measured evidence

Against `claude-code-plugin-gvt-construct3`, using that repo's own real config (`docsRoot: 'wiki'`, `wikiDir: 'wiki'`, `rawDir: 'raw'`, `excludePaths: ['raw/', 'wiki/decisions/']`), at working-tree source 4.25.0:

- `scanOrphanedDocs` → **0 findings**, identical to omitting `docsRoot` entirely. Inert: it reported zero orphans without ever reading an index, because the index there is `index.md` and the filename was a constant.
- `scanBrokenLinks` → **79 findings (occurrences)**, of which **79** are bundle-absolute. All **79** targets exist when resolved bundle-relative; **0** exist when resolved repo-root-relative. A 100% false-positive rate.
- `candidateFileCount` → **19 files**: 18 under `wiki/`, plus repo-root `CLAUDE.md`.
- Two scanners, one root cause, **opposite failure directions** — one silently under-reports, the other floods the report with findings that are all wrong.

Against this repo (`docsRoot: 'docs'`, no override): **4 candidate files, 0 declined, 0 broken-link findings** — byte-identical before and after. The audit still exits 0 with exactly **12** `### Info (optional)` bullets and no `### Warnings` section.

## Decision

Both scanners **decline bundle content and report the decline** as an `info` finding, rather than silently passing or wrongly failing. Two new finding kinds: `orphan-check-skipped` and `link-check-skipped`, both registered in `audit.mjs`'s `SELF_CONTAINED_KINDS`.

**The two mechanisms differ, and the asymmetry is principled rather than an oversight:**

- `scanOrphanedDocs` is a **whole-corpus** check — *"is every doc under the docs root listed in the index?"* When the docs root collapses onto the bundle, the index in question *is* the bundle's index, so there is no per-file residue worth checking. It already filters candidates to those under the docs prefix, so repo-root `CLAUDE.md` was never in its corpus. A **whole-check decline** loses nothing.
- `scanBrokenLinks` is a **per-file** check, and its candidate set is the docs root **plus repo-root `CLAUDE.md`**. `CLAUDE.md` is not a bundle page and is not covered by `maintain-wiki lint`, whose walk is `<wikiDir>/` only. A whole-scanner decline would hand it to nobody — in the measured repo it carries **14** scanner-visible local links. So the decline is **per-file**, filtering bundle-resident files out of the candidate list and checking the rest.

One principle — bundle content is `lint`'s, and the audit now enforces that instead of assuming it — two mechanisms, because the two checks have different arity.

**The trigger is the file's location, not the override's.** The property that makes a file `lint`'s is *that the file lives in the bundle*. Keying on *`docsRoot` having been overridden onto the bundle* coincides with that only under today's constants, and diverges in at least two ways the design space already admits: a **nested `wikiDir`** (e.g. `wiki` inside a `docs` root — the sibling `rawDir` handling already contemplates a nested layout), where the override-keyed guard never fires though bundle pages are walked; and any **future widening of the candidate set**, which moves the walk without moving `docsRoot`. This enumeration is the part a future maintainer will otherwise "simplify" back into the bug.

**Rejected alternatives:**

1. **Whole-scanner decline for links** — loses `CLAUDE.md` coverage entirely (14 links in the measured repo), handing a non-bundle file to no owner.
2. **Fix the bundle-absolute resolution in place** so a leading `/` resolves against the bundle root. It does fix the 79. Rejected because being *correct* rather than merely *not-false* also requires out-of-bundle classification and the tolerant-consumer framing — i.e. reimplementing `lint`; because that repo's `excludePaths` hides 17 of its 35 bundle files from the audit's walk, so "broken links: 0" would be a verdict over half the bundle with no indication of the gap; and because it ships the second implementation ADR-0041 refused.
3. **Both** — once bundle files are declined, the in-place branch is unreachable on every corpus that exercises it. Tested-but-unreachable code is worse than absent code.

## Consequences

- `plugin/CONVENTIONS.md`'s scope-table cells for these two scanners **stay `no`** — the guards enforce the published contract rather than changing it.
- The `info` severity keeps both new kinds out of the exit code, which matters because these scanners are **not** author-time gated and run in every consuming repo's audit.
- The substring-matching residual in the orphan check (tracked as an open issue about matching the literal link target rather than "appears in") becomes live for relocated *non-wiki* docs roots now that the scanner is no longer inert there — **flagged, not fixed, by this record**.
- The sibling broken-link defect and the orphan inertness share this root cause and are resolved together here, rather than as two separate fixes on two separate schedules.
