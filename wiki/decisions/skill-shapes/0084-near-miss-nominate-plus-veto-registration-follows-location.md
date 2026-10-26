---
type: decision-record
title: 'Near-miss detection nominates and vetoes, and contract registration follows the contract''s location'
description: 'triage-issues nominates a near-miss on either signal with vetoes outranking both, never removes a stale duplicate under --force, registers a wiki-located contract in the wiki index, and scaffolds into the wiki by default.'
tags: [decisions, skill-shapes]
status: stable
---
# 0084. Near-miss detection nominates and vetoes, and contract registration follows the contract's location

- **Status:** accepted
- **Date:** 2026-10-26
- **Issue:** #246 (with #509, #507, #601, #606, #665; combined plan)

Companion to [0083](0083-label-recipes-remove-only-other-labels-readback-gates-stamp.md), which covers the label-recipe half of the same plan. This record **amends** [0020](0020-near-miss-contract-resolution.md) and [0068](../plugin-structure/0068-prose-conventions-doc-default-is-relocatable.md); neither is edited.

## Context

[0020](0020-near-miss-contract-resolution.md) built `triage-issues` §0 around #178, a dead orphan: a hand-renamed
conventions doc that the skill failed to see, so it scaffolded a second contract beside it. Two signals
(a filename glob over the top level of `docs/`, and a marker line) were each sufficient alone.

Three things have since changed the surface that rule scans:

- The conventions doc can live in the wiki. The glob and marker rule now meet `docs/TOC.md`, `index.md`,
  `log.md` and pages derived from the contract (#246, #509). maintain-wiki's `wiki-schema.template.md`
  begins with the same `Project conventions consumed by` prefix the triage marker uses, so the prefix alone
  nominates a file that is not a triage contract.
- `--force` removed the stale duplicate when both the canonical and a near-miss were present (#507),
  a delete of hand-authored content with nobody watching.
- Registration assumed `docs/TOC.md`. A contract inside the wiki is indexed by the wiki index, not by
  the docs index, and some wikis generate that index (#601, #606). With no override, scaffolding wrote into
  `docs/` even when the docs index itself lived in the wiki (#665).

## Decision

**1. Either signal nominates; a veto outranks both.** The filename glob or the marker line nominates a
candidate. The marker must name `triage-issues` (or the pre-rename `triage-bugs`) after optional whitespace
following the `Project conventions consumed by` prefix. Two vetoes remove a candidate regardless of which signal fired:
index files (`index.md`, `TOC.md`, `log.md`, and whatever `paths['docs/TOC.md']` resolves to), and derived
pages whose frontmatter `sources` cite the resolved contract. The citation is matched by suffix, because a
`resource` can be a URL, but on a path-segment boundary: the value equals the resolved path or ends in `/`
followed by it, so `…/mydocs/issue-triage.md` does not match `docs/issue-triage.md`. When the wiki default
holds, the comparison also covers the wiki default paths, since with no override the resolved path is
`docs/issue-triage.md` and a wiki derived page would otherwise escape the veto. The four outcomes, the non-recursive scan and the audit placement from 0020 are
unchanged (4bdf366).

**2. `--force` never removes unattended.** The both-present stale duplicate is deferred under `--force`.
The §0b rename under `--force` is taken only for a marker-bearing candidate; a glob-only candidate defers.
With one marker-bearing candidate plus glob-only candidates, the marker-bearing one is renamed and the glob-only ones defer.
With two or more marker-bearing candidates, `--force` defers all of them, since it never auto-picks between candidates.
This is #507 and applies A1-wide, to every §0 path. A further rule covers the wiki: a near-miss candidate
whose source or whose rename destination lies inside `<wikiDir>/` defers under `--force` and `--non-interactive`
alike, because no file is moved into or inside the wiki unattended. It is reported as outstanding, with the
destination an interactive run would offer. The rename rules above then apply only when both the source and
the destination are outside the wiki. A second rule covers every unattended write: nothing is written onto an
existing file. Under `--force` and `--non-interactive`, a destination where anything other than the candidate
itself exists (a derived page the veto excluded can sit there) defers, for the rename and the scaffold copy
alike, and both paths are reported. The scaffold checks this before the override write, so a deferred scaffold
leaves `.gvt-agent.json` untouched.

**3. Registration follows the contract's location.** §0c resolves `paths['docs/TOC.md']` and `wiki.wikiDir`.
A contract outside the wiki keeps its docs-index Process row. A contract inside the wiki never touches
`docs/TOC.md`, counts as indexed through `<W>/index.md` or its own subdirectory's index, and is registered
there. When the new optional `wiki.indexCommand` key is set, the index is treated as generated: the missing
entry is reported together with that command and is never hand-edited (897df81). `plugin/CONVENTIONS.md`
lists the key in one edit, so consumers' copies drift once (baf94db). A contract outside the wiki whose
docs index itself lives in the wiki is reported, not registered: an out-of-bundle link in a wiki index is a
lint finding, so the skill suggests moving the contract into the bundle through the `paths` override.

**4. The wiki scaffold default is inferred, and only the default.** With no `paths['docs/issue-triage.md']`
override and the docs index inside the wiki, §0b scaffolds at `<wikiDir>/process/issue-triage.md` when that
directory exists, else `<wikiDir>/issue-triage.md`. For the scaffold, the `paths` override is written before
the file, so an interrupted run heals on the next run: the scaffold re-offers on Absent. The near-miss scan also covers the would-be target's parent and the wiki root, still non-recursive,
because the scan runs before the target is computed. A near-miss found there is renamed, interactively, to the same wiki
default, not to `docs/issue-triage.md`, so a wiki-resident contract never leaves the bundle. The rename
checks its resolved destination: a file other than the candidate already there is a conflict, never
overwritten, and the user is offered to keep both, merge (preview, then apply), or pick another destination.
The rename writes in the opposite order, moving the file first and the override second. A stop in between
leaves the file at the wiki default with no override, and the next run's wiki-default scan finds it at its
own target, where only the override is written, so it heals too. Writing the override first would not: with
the target under `process/` the next run would have an override, no wiki-root scan, an absent target, and
a second scaffold. A candidate already at the target is not moved. This does not reopen the implicit wiki convention that
[0062](../plugin-structure/0062-runtime-path-resolution-for-declared-expectations.md) rejected. 0062 rejected
inferring relocation from whether a `<wikiDir>/…` path exists, as invisible to the audit and ambiguous when
both locations exist. Here the existence check only chooses a default for a file that does not exist yet; the
choice is then written down as an explicit `paths` override, so resolution never infers anything afterwards.
For the scaffold, no contract exists at either location when the default is chosen, so there is nothing to be ambiguous about. For the rename, the resolved destination is checked and an occupied one is a conflict.
The bundled templates' headers now say where the contract goes without assuming `docs/` (a7e7df2).

**5. This repo's `docs/TOC.md` triage row is removed.** That discharges the "until #601 lands" condition in
[0068](../plugin-structure/0068-prose-conventions-doc-default-is-relocatable.md) decision 5. The contract stays reachable through
`docs/TOC.md` → `wiki/index.md` → `process/index.md` (a873d4f).

## Considered options

The labels below are the design's own option and requirement ids: A1 to A3 are the detection options (A1-wide extends A1's `--force` handling to every §0 path), G1 to G3 the generated-index options, (i) to (iii) the scaffold-default options, and R10 and R11 the requirements named where they first appear.

Detection:

- Option A1 is CHOSEN — "either signal nominates, vetoes outrank both".
- A2 (require both) is rejected: it falsifies #181 rows 3 and 4, and misses a hand-renamed orphan whose
  marker was edited out. That orphan is exactly the #178 case §0 was built for.
- A3 (rank / per-outcome thresholds only) is rejected as the sole fix: it still admits docs/TOC.md and the
  derived page as candidates.
- A1-wide: YES.
- #507: defer under `--force`.
- Merge is rejected: it rewrites the live contract unattended.
- Keep-as-is is rejected: it is the defect.

Registration of a generated index:

- Generated index: G1 is CHOSEN — a new optional `wiki.indexCommand` key.
- G2 (never write unattended) is rejected: R11 would then hold only interactively. (R11: a wiki-located
  contract ends up reachable from the wiki index.)
- G3 (always write) is rejected: it violates R10 for construct3-chef. (R10: a generated index is never
  hand-edited.)

Scaffold default (#665):

- #665 default: option (iii). `<wikiDir>/process/` if it exists, else `<wikiDir>/`.
- (i), always the wiki root, is rejected: it puts schema.md, index.md and practice notes on the scan surface.
- (ii), always process/, is rejected: it creates a theme the consumer never asked for (against ADR-0066 d4).

Rejected: require-both, rank-only, the CONVENTIONS marker rule, wiki-always-report-only.

## Why this amends rather than supersedes

Superseding 0020 would orphan its four-outcome logic, its non-recursive rationale and its rejected audit
placement, all of which survive here. Instead: 0020's Decision ("either alone qualifies") is replaced by
nominate-plus-veto, and its Compromise 1 is extended. The `--force` rename stays, but the remove it also
offered is withdrawn. 0068's decision 5 is amended by removing the row it said must stay.

## Consequences

- `plugin/CONVENTIONS.md` gained a key (`wiki.indexCommand`), a one-time drift for consumers' copies.
- maintain-wiki does not yet honour `wiki.indexCommand`; that is a follow-up.
- The stale both-present duplicate now survives every unattended run and is surfaced for a human to
  resolve.
- Evidence limit, stated plainly: the headless fixture comparisons against the old skill could not show
  the old defect firing. On the old text the model read the marker strictly, declined a delete, or was
  denied one. The new skill's behaviour was demonstrated; the old defect was not reproduced in that
  harness.

Implemented in 4bdf366 (detection and `--force`), 897df81 (registration, `wiki.indexCommand`, scaffold
default), baf94db (CONVENTIONS), a7e7df2 (template headers), a873d4f (this repo's TOC row), 05cec90
(review gaps in the near-miss scan, `--force`, registration and recipe checks), d7cf5b9 (wiki-resident
near-miss renamed to the wiki default), fa120fd (CLAUDE.md and docs/TOC.md descriptions), 79fa36d (no
unattended move inside the wiki, the occupied-target conflict), 4a0933c (this record's no-unattended-wiki-move
rule) and the final fixes (no unattended move into the wiki, no unattended write onto an existing file, the
two write orders, the derived-page veto against the wiki default).
