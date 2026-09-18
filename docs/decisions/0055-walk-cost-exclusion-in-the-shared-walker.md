# 0055. Walk-cost exclusion moves into the shared walker, applied at any depth and on by default; policy exclusion stays at the consumer

- **Status:** accepted
- **Date:** 2026-09-18
- **Issue:** #476

## Context

`audit-conventions`' two gated `error`-severity scanners — `principle-citation` and `pointer-anchor` — walk
`plugin/node_modules/` once one exists. `node_modules` was skipped only at the repo root, never at depth, so
the first `npm install` under `plugin/` (the shape ADR-0051 permits, lockfile-gated, for the leaf
`@genvidtech/audit-core`) turns third-party prose into citing corpus. That corpus widening was measured
directly in ADR-0051 — a clean tree against one with a single third-party file injected showed the citing-file
count move — and ADR-0051 reaffirmed `error` severity for both scanners **conditional on this fix landing**,
naming three causal sites: the citing-file walker's missing skip parameter, a top-segment-only skip test that
doesn't catch a nested `node_modules/`, and a root-only directory filter used elsewhere in the audit that
doesn't apply to this walk. ADR-0047's standing directive also fires on its first clause here: any future
widening of the citing corpus reopens the severity question rather than inheriting the prior answer.

The findings this produces are doubly unworkable: unfixable, because the flagged prose belongs to a
third-party package this repo does not own, and un-baselineable, because `pointer-baseline.mjs --accept-new`
refuses to write while any pointer is provably wrong, and a guard test separately pins the specific swept
pointer strings that must never re-enter the baseline. A finding with no route to green is worse than a false
positive that can at least be accepted.

## Decision

**Walk-cost exclusion moves into the shared walker, applied at any directory depth, and is on by default with
an opt-out.** `listFiles` in `fs-walk.mjs` gains an options parameter defaulting to a `WALK_COST_DIRS` set
containing `.git` and `node_modules`, tested against every path segment of every directory the walk descends
into — not only the top-level entries of the root being walked. `isSkipped` in `pointer-anchors.mjs` is
corrected the same way: it tests every segment of a candidate's relative path, rather than only the first, so
a `node_modules` directory nested under a dogfooding subtree is caught exactly like one at the repo's own top
level.

**The load-bearing distinction is the one the code already documented, and this record ratifies it rather than
inventing it.** `pointer-anchors.mjs`'s `SKIPPED_DIRS` comment states that `.git` and `node_modules` are
excluded "as walk cost, not policy" — a directory that is expensive and pointless to descend into regardless
of which repo is being audited. `audit-conventions-evals/` is the opposite: it holds fixture consuming-repos
whose files carry contract filenames (`CLAUDE.md`, `CONVENTIONS.md`, `docs/TOC.md`), so counting them as
resolution candidates would turn correct citations of the real files into ambiguity findings — a decision that
depends on what this repo's own scanners mean by "candidate," not on filesystem cost. Keeping the two kinds of
exclusion in two different places — walk cost in the shared walker, policy at the consumer that owns the
policy — rather than flattening them into one list is the actual decision here; the depth fix alone would have
been a smaller, less durable change.

### Options considered and rejected

1. **An opt-in skip parameter**, matching the issue's own literal suggestion. Rejected: every caller of
   `listFiles`/`listUnder` would have to remember to pass it, and a future caller that forgets silently
   reintroduces the exact defect this record exists to close. Default-on is fail-safe in the direction that
   matters — a caller has to opt *out* of skipping walk cost, not opt in to it.
2. **Filter at each consumer, leave the walker alone.** Rejected: three call sites (`listCitingFiles`,
   `listTargetCandidates`, `principle-citations.mjs`'s corpus via `listMarkdown`) would each need to apply and
   maintain the same filter independently, the tree still gets walked in full regardless (the cost this
   exclusion exists to avoid is paid either way), and it leaves no shared seam for a future caller to inherit —
   which is the thing actually missing today.
3. **Scope the corpora by git tracking**, via `gitTrackedFiles`, extending the rule this repo already applies
   to the repo root's own citing files. Rejected: it changes semantics rather than fixing a bug — a legitimate
   new untracked file would silently drop out of the corpus, which is a different and broader behavior than
   "don't walk into a directory that is walk cost." The existing tracking rule was chosen for the repo root
   specifically, to keep a gitignored scratch artifact out of the corpus, and generalizing it tree-wide would
   graft that rationale onto a case it wasn't built for.

## Consequences

- Three consumers were exposed with three different filter postures, and the fix reaches them unevenly on
  purpose. `listCitingFiles` already applied `isSkipped` to its merged result, so the every-segment correction
  alone covers it. `listTargetCandidates` filtered directories only at the root level of the tree it walks, so
  it needed the walker's depth fix. `principle-citations.mjs` had no directory exclusion of its own at all —
  it needs no code change here, because it inherits the fix through `listMarkdown`, which calls the now-default
  `listFiles`.
- The walker no longer descends into `node_modules` at all, so this is a traversal-cost improvement as well as
  a correctness fix, independent of whether any scanner's corpus was ever contaminated by what it found there.
- This discharges the condition ADR-0051 attached to its `error`-severity reaffirmation for both
  `principle-citation` and `pointer-anchor`: that reaffirmation is no longer conditional once this change lands.

Measured this session against the working tree at `plugin.json` 4.25.0 (equal to tag `v4.25.0`, zero unreleased
commits), audit run under the Bash tool:

```
Clean tree                                   → audit exits 0; required 36 of 36; optional 73 of 85;
                                                12 "Info (optional)" bullets

One probe README.md injected at each of:
  plugin/node_modules/probe-pkg/
  plugin/x/node_modules/probe-pkg/           → audit exits 1, 4 error findings:
                                                2 x principle-citation, 2 x pointer-anchor-missing
                                                (one pair per injected depth)

Corpus contamination, clean vs. injected:
  listCitingFiles          176 -> 178   (2 contaminated paths)
  listTargetCandidates     237 -> 239   (2 contaminated paths)
  principle-citations corpus 48 -> 50   (2 contaminated paths)
```

The pair of findings at each depth is the direct evidence for the fix this record makes: a skip that only
caught the top-level case would have left the `plugin/x/node_modules/` injection's pair in place while clearing
the `plugin/node_modules/` pair, and the every-segment/any-depth correction is what closes both at once.
