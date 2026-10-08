---
type: decision-record
title: 'Baseline re-key on rename: `--rename` and `--allow-drift`'
description: 'pointer-baseline.mjs gains a rename re-key mode, and allow-drift narrows the ratchet to one reviewed entry per run.'
tags: [decisions, audit-conventions]
status: stable
---
# 0065. Baseline re-key on rename: `--rename` and `--allow-drift`

- **Status:** accepted
- **Date:** 2026-09-30
- **Issue:** #593 (Part 2 of the docs→wiki chain #579; split from #583 alongside #594)

## Context

Citing files move — a `renumber-adrs` pass, or the #584 relocation of every ADR into
`wiki/decisions/` — and every baseline entry keyed to the old path goes stale at once.
`pointer-baseline.mjs` had no re-key operation, only add and prune, so an operator facing a
citing-file move had two bad options and both were measured against the real corpus before this
record was written:

- **`--accept-new` after the move silently drops debt.** The stale entries at the old key simply
  vanish on the next prune (they match nothing at the new key either), and the new-key findings for
  a file the corpus no longer resolves the same way land outside the citing corpus's reach entirely
  — measured against the ADR-0022 move: 0 entries added, 39 pruned, with no signal that 39 accepted
  citations had just been erased rather than re-accepted.
- **`--accept-new` after a move-plus-edit launders drift.** Moving a file and editing one of its
  cited lines in the same pass produces a fresh digest at the new key that `--accept-new` accepts
  as a brand-new entry, with no comparison against what was accepted before — 0 drift findings,
  because the old entry was pruned and the new one never existed to drift from.

Neither path lets an operator distinguish "this pointer moved, unchanged" from "this pointer moved,
and something about it changed" — which is exactly the distinction `pointer-anchor-drift` exists to
draw for a citation that stayed in place (ADR-0047 decision 4).

## Decision

**1. `--rename <old>=<new>` re-keys only the citing `file` field.** Every baseline entry whose
`file` equals `<old>` moves to `<new>`; `pointer`, `occurrence`, `kind`, and `digest` are carried
verbatim. Repeatable `--rename` pairs are applied as one simultaneous batch — vacating every `<old>`
before anything is re-keyed — so a chain (`a=b, b=c`) and a swap (`a=b, b=a`) both land correctly
without an intermediate state where two pairs momentarily collide.

**2. Five refusal categories, collected and printed together in one pass, nothing written on any of
them (rc 1):** a re-keyed entry's stored digest and the current digest at its new key are both
non-null and disagree, and no `--allow-drift` token names that entry at its current digest; a
re-keyed entry's new key matches no current finding at all; a rename target that already holds
baseline entries of its own that are not themselves part of the batch being vacated; an
`--allow-drift` token that matched no drifting entry, or named a digest other than the current one
(an unused allowance); and the whole run re-keying nothing at all — including an absent or
unreadable baseline, which `--rename` never creates or overwrites. Usage errors (a malformed pair, a
duplicate `<old>` or `<new>`, `--rename` combined with `--accept-new`, `--allow-drift` without
`--rename`) are rc 2, checked before any of the five.

**3. `--allow-drift <new-file>@<pointer>#<occurrence>=<current-digest>` is the one digest re-take.**
It names one re-keyed entry by its post-rename key and the current digest it authorizes that entry
to take instead of refusing on drift. This is compatible with the header's own "this script never
re-takes a digest on its own" rule and with ADR-0047 decision 4's "this pointer, against this
content" premise, because it does not loosen either: it narrows the delete-and-`--accept-new` hatch
that rule already sanctions for a drifted acceptance, down to entries re-keyed in the very same run,
one explicit token per entry, pinned to the digest an operator has actually reviewed. An unused
token refuses rather than doing nothing, so a stale or mistyped allowance can never silently
authorize a drift it wasn't meant to.

`renameExplainsDrift` (`lib/pointer-anchors.mjs`) labels drift the rename itself caused — a
cross-reference inside the target naming the citing file's old basename, rewritten to the new one in
the same batch — by reverse-mapping renamed basenames back to their old names and re-digesting the
reconstructed content. Only explained drift gets a printed, ready `--allow-drift` token; unexplained
drift gets neither, meaning its content genuinely changed and the citation needs repair rather than
acceptance. A hand-built token is still honoured either way — the annotation is a convenience, not a
gate of its own.

A per-file allowance (authorizing every drifted entry in a given file rather than one named entry)
was rejected: it would have approved both measured laundering drifts below, which share a file
(`plugin/CONVENTIONS.md`) with 37 other, clean entries — the exact blast radius a per-entry token
exists to avoid.

**4. One mode per run.** `--rename` is a pure re-key — no prune, no accept — and is mutually
exclusive with `--accept-new`. This keeps the diff an operator reviews before `--write` limited to
the rename itself, rather than a rename entangled with an unrelated prune or accept happening in the
same pass.

**5. Pointer text is never re-keyed, only the citing `file`.** Exactly one baselined entry in this
repo names an ADR path inside its pointer text — the frozen `plugin/CHANGELOG.md` citation into
ADR-0022 (ADR-0047 decision 3's positive control) — and rewriting that pointer text on a rename would
orphan the entry from the frozen prose it was baselined against. A moved *target* whose pointer text
names it (rather than the citing file being what moved) remains #579's own known gap, unaffected by
this change.

**6. A zero-entry rename pair is listed and skipped, not refused.** Measured at design time against
the two real moves this record's evidence covers: of 64 ADRs relocated by `renumber-adrs
--insert-at 1`, 55 pairs re-keyed zero baseline entries (the other 9 ADR files hold the corpus's 106
entries). Refusing on a zero-entry pair would block both the renumber and the #584 relocation
outright, since most individual files simply carry no baselined citation. The whole-run refusal
(decision 2's `nothingToRekey`) still catches the degenerate case — a run that re-keys nothing at
all, including a typo'd pair naming no real baseline entry anywhere — and a left-behind warning
flags any file moved outside the named pairs whose own entries no longer match anything current.

**7. Flags only, no map file.** The 64-pair renumber case above serializes to 9,016/9,143 argv
characters as repeated `--rename` flags — within the limit Windows `CreateProcess` allows when the
process is spawned without an intervening shell. A `--rename-file` taking a path to a mapping file
is a follow-up to reach for if a future move grows past that, not something this record needs to add
pre-emptively.

**Evidence.** Real-data runs against `git archive` copies of this repo at HEAD, using the shipped
CLI: moving ADR-0022 into `wiki/decisions/wiki-and-okf/` re-keyed 39 entries and brought the scan
from 78 findings (39 of them stale) to 0; after `--write`, a bare re-run printed `Nothing to change`.
Relocating all 64 ADRs into `wiki/decisions/t/` (#584's move) re-keyed 106 stale entries, from 212
findings down to 0. The `renumber-adrs --insert-at 1 --apply` case (64 pairs) refused once on one
explained drift — the printed `--allow-drift` token named ADR-0027's (formerly 0026) pointer into
`wiki/llm-wiki-pattern-in-gvt-dev.md` — and, once supplied, re-keyed 105 entries plus the one allowed
drift, landing at 0 findings. A laundering run (move ADR-0022, then edit a cited line of
`plugin/CONVENTIONS.md`) refused with 2 drift entries, both reported `not explained by this rename`,
and offered no token — the citation needs repair, not acceptance. Mutation testing confirmed each
refusal category is load-bearing: forcing the drift comparison to always report equal, dropping the
no-finding check, ignoring an allowance's digest, and forcing `renameExplainsDrift` to always return
true each broke exactly the test(s) asserting that behaviour and none else.

## Compromise

Alternatives rejected:

- **A per-file `--allow-drift` allowance** (decision 3) — rejected because it would have accepted
  both measured laundering drifts, which land in a file carrying dozens of unrelated clean entries;
  a per-entry token confines the exception to exactly the reviewed pointer.
- **Refusing on any zero-entry rename pair** (decision 6) — rejected because the measured real-data
  moves are dominated by zero-entry pairs (55 of 64 in the renumber case); refusing on them would
  make the two workflows this feature exists for both unusable.
- **A `--rename-file` mapping file instead of repeated flags** (decision 7) — rejected as unneeded
  pre-emptive complexity: the largest measured real move fits comfortably under the argv-length
  ceiling, so there is no evidence yet that flags alone are the wrong shape.
- **Re-keying pointer text alongside the citing `file`** (decision 5) — rejected because the one
  entry that would be affected is a frozen historical citation whose text must stay as it read at
  the time it was accepted, not track the cited file's later moves.

## Consequences

#584 re-keys the baseline with `--rename` — one pair per "File moves" line — before editing any
cited line in the moved files, so the reviewed diff at each step is either a pure rename or a pure
content edit, never both entangled. The dry-run → confirm → `--write` workflow this feature enables
is documented in `create-adr` SKILL.md §3g, including how to read a drift refusal (explained: copy
the printed `--allow-drift` token and re-run; unexplained: stop and repair the citation first) and
when to fall back to the existing `--accept-new` path (a rename is not in play at all). A left-behind
warning on a pure re-key run is a signal the operator may not have finished naming every moved file
in the batch yet, not a hard refusal.

**Related:** ADR-0047 (the ratchet and its "this pointer, against this content" premise, which
decision 3's exception narrows rather than loosens), ADR-0063 (the `renumber-adrs` single-pass
rewrite this record's re-key workflow pairs with, and whose Decision 4 deferred a rename-aware
`pointer-baseline.mjs` mode to #583), ADR-0064 (the `wiki/` corpus widening that makes the #584
relocation possible in the first place), #593 (this issue), #584 (the ADR relocation this feature
exists to support), #579 (the docs→wiki chain), #594 (the sibling issue split out of #583 alongside
this one).
