---
type: decision-record
title: 'The pointer-baseline guard proves the baseline against a live scan, not a size floor (#615)'
description: 'The pointer-baseline guard test replaces its entry-count floor and fixed control entry with a cross-check of the baseline against a live scan of the repo.'
tags: [decisions, audit-conventions]
status: stable
---
# 0074. The pointer-baseline guard proves the baseline against a live scan, not a size floor (#615)

- **Status:** accepted
- **Date:** 2026-10-12
- **Issue:** #615 (unblocks #405 and #519; related: [ADR-0047](0047-pointer-anchor-checker-error-severity-and-ratchet.md), which established the ratchet)

## Context

The guard test `pointer-baseline-guard.test.mjs` forbids the swept pointers from re-entering
`.pointer-baseline.json`. Absence alone passes against an emptied, truncated or foreign baseline, so the test
carried its own proof that the file it searched was the real one: a size floor, `MIN_BASELINE_ENTRIES`, and one
fixed `CONTROL` entry that had to be present.

Both proxies decay as the ratchet does its job. The baseline held 102 entries against a floor of 100, and the
test's own comment recorded 126 entries when it was written. Of the 102 entries, 95 cite files under
`wiki/decisions/`, which is exactly the tree #405 plans to sweep, and the `CONTROL` entry was chosen from one of
those records. This change prunes 4 entries (ADR-0039's re-anchored citations), taking the baseline from 102 to
98, with 0 entries added and `--accept-new` not used. Under the old floor, 98 fails: the old guard against the
98-entry baseline gives pass 2 / fail 1, "holds 98 entries, below the floor of 100". A correct prune was
therefore rejected by the guard that exists to protect the baseline, and #405 and #519 were blocked on it.

## Decision

The guard drops `MIN_BASELINE_ENTRIES` and the `CONTROL` entry. In their place the guarded test runs
`scanPointerAnchors(REPO_ROOT, { useBaseline: false })`, then `applyBaseline(live, { present: true, entries:
baseline.entries })` on the very entries it just read, and asserts the result is empty. The baseline is real if
and only if it accounts for every live pointer finding, leaves no accepted digest drifted, and has no entry
matching nothing. The separate envelope test (parses, version, `entries` array) is kept, so a corrupt file still
fails with a message naming it rather than as a `TypeError` inside the guard.

This moves ownership of "the baseline is real" from a test constant and a hand-picked entry to the lib's own
scan, the same code the audit applies. The test cannot drift from the audit's idea of a matching baseline,
because it uses the audit's matcher.

What it rejects: an emptied, truncated, unparseable or foreign baseline, at any size. What it accepts: any
correct prune, including 102 to 98, and #405's future sweep, with no edit to the test.

## Compromise

- **Lower the floor (for example to 90):** still a size proxy, and it would need lowering again at the next
  prune.
- **A floor plus a documented lowering procedure:** the same proxy, plus ceremony every contributor must know.
- **A recorded count or digest field written by `--write`:** a writer bug that truncates the file would also
  write a consistent value, so it cannot catch the case it exists for.
- **A `--targets` cross-check:** not implemented (#594).
- **Keep a `CONTROL`-only check:** a truncation that keeps the `CONTROL` entry passes it. Measured below.
- **Cost accepted:** new unaccepted pointer debt now fails this test as well as the audit. The failure message
  says to accept it with `pointer-baseline.mjs` rather than hand-editing the file, so the audit and the guard
  fail together and are cleared together.

## Consequences

- A legitimate prune, and #405's sweep of the `wiki/decisions/` citations, no longer touch the test. #405 and
  #519 are no longer blocked by the floor.
- The guard now runs a full scan of the repo, so it is slower than a file read; this is accepted.
- **Evidence.** Mutations were applied one at a time on the index tree `f1de530` (this change's guard staged on
  31f2627) against the 3-test guard file, each reverted byte-for-byte. The failing test in every case was "no
  swept pointer has been baselined away, over a baseline proven to match a live scan".

  | Mutation | Result |
  |---|---|
  | Emptied baseline | pass 2 / fail 1 |
  | Former `CONTROL` entry removed (97 entries) | pass 2 / fail 1 |
  | Every other entry dropped, `CONTROL` kept (49 entries) | pass 2 / fail 1 |
  | Last 200 bytes cut | pass 1 / fail 2 (the envelope test and the live-scan test both fail) |
  | Foreign 4-entry envelope | pass 2 / fail 1 |

  The third row is the reason `CONTROL` had to go: a `CONTROL`-only check would have passed it.
- The guard's fixture of swept pointers and its absence assertions are unchanged; only the proof that the
  searched corpus is real was replaced.
