---
type: decision-record
title: 'CLAUDE.md maintainer sections move to wiki/maintainer, split by change driver, behind a routing list'
description: 'CLAUDE.md long maintainer sections move verbatim into six wiki/maintainer pages split by change driver; a routing list replaces stubs and amends ADR-0023.'
tags: [decisions, plugin-structure]
status: stable
---
# 0069. CLAUDE.md maintainer sections move to wiki/maintainer, split by change driver, behind a routing list

- **Status:** accepted
- **Date:** 2026-10-06
- **Issue:** #586 (F3 of the docs→wiki chain #579)

## Context

CLAUDE.md had grown to 253 lines and 45,308 bytes, and it is loaded into every session
in this repo. Most of that weight was maintainer gotcha prose that applies only when a
maintainer is doing one specific job (dogfooding an orchestrator, running the audit on
Windows, writing a skill description, cutting a release). ADR-0068 created
`wiki/maintainer/` as the home for maintainer notes and said #586 was expected to add
CLAUDE.md's gotcha sections there; this record is that move.

Two earlier decisions constrain it. ADR-0023 kept the `run-retro` cache-lags-source gate
skill-local and made `CLAUDE.md`'s dogfooding caveat point at it, "so the link is
bidirectional". And the plugin ships a `plugin/` surface to consumers that is a
different audience from the maintainers of this repo.

## Decision

**1. Six pages, one per change driver.** The text moved verbatim, apart from a closed set
of link and reference edits, into these pages under `wiki/maintainer/`:

- The dogfooding cluster (cache lag, missing instructions, release-first, carry-by-hand
  on a chain branch, headless `--plugin-dir`) →
  [`dogfooding-the-plugin.md`](../../maintainer/dogfooding-the-plugin.md).
- The two Windows/Bash audit paragraphs under Commands →
  [`running-the-audit-on-windows.md`](../../maintainer/running-the-audit-on-windows.md).
- The description sub-bullets of step 1 of *Adding a new skill* (the 1536-character cap,
  the colon-space trap) →
  [`skill-frontmatter-rules.md`](../../maintainer/skill-frontmatter-rules.md).
- Step 5's tail from "Exit 0 is necessary" (severity table, the gating layers,
  pointer-anchor authoring) →
  [`audit-author-time-findings.md`](../../maintainer/audit-author-time-findings.md).
- The Testing paragraphs plus the eval-harness paragraph →
  [`testing-the-audit.md`](../../maintainer/testing-the-audit.md).
- The branch-at-the-start rule, Versioning and the CHANGELOG entry shape →
  [`release-cycle-rules.md`](../../maintainer/release-cycle-rules.md).

CLAUDE.md went from 253 lines and 45,308 bytes to 203 lines and 20,564 bytes.

**2. A `## Knowledge base` routing list replaces the moved text.** It sits right after
"What this repo is" and has six trigger → page items, one per page. Steps 1 and 5 of
*Adding a new skill* also link to their pages. No stub or partial copy of any moved block
stays in CLAUDE.md.

**3. ADR-0023 is amended, narrowly.** What changes: the CLAUDE.md side of ADR-0023, the
dogfooding caveat text its Decision calls the caveat that "now names the gate", now lives
on the dogfooding page rather than in CLAUDE.md. The entry point a maintainer reaches
from CLAUDE.md is the routing-list line "when a dogfooded skill behaves unlike its
source". What does not change: the verification gate itself stays skill-local in
`run-retro` §1, which this move leaves untouched, and ADR-0023's rejection of promoting
the hazard into `development-principles.md` stands. The pointer remains bidirectional in
substance; only the CLAUDE.md end of it is now a routing line plus a page.

**4. The fork resolves as "repo wiki only".** This is maintainer guidance for this repo.
It goes to this repo's `wiki/maintainer/` and not into the shipped `plugin/` surface.

**5. `run-retro` §2 names the new pages.** Its plugin-repo note now lists the
`wiki/maintainer/` pages among the docs a plugin-repo retro updates, and says a refined
rule is edited on its page, not added back to CLAUDE.md. Two corrections ride along.
**F-a:** the same note drops a false "or the plugin repo itself" case from the
missing-`docs/TOC.md` sentence, since this repo has a TOC. **F-b:** the moved "(step 6/7)"
wording on the audit page was wrong, because step 6 of *Adding a new skill* is the
CHANGELOG step. It now reads "(the TOC row is step 7 of `CLAUDE.md`'s *Adding a new
skill*; the README row has no numbered step there)".

**6. Dated figures stay as history.** The "131 positional pointers / 120 bare" figure on
the audit page is left as written, measured 2026-09-18, and was not re-measured by this
move.

**7. Frozen ADRs are unchanged.** ADR-0006, ADR-0014, ADR-0017, ADR-0019, ADR-0020,
ADR-0023, ADR-0032, ADR-0033, ADR-0054 and ADR-0068 still cite CLAUDE.md for text that has
since moved. They stay as accurate history of what the file said when they were written.
This record is where a reader learns where that text went.

**8. Index.** `docs/TOC.md` rewords its CLAUDE.md row and adds one row for
`wiki/maintainer/index.md`.

## Compromise

**A single maintainer page (option B).** Rejected: the blocks change for different
reasons (a release rule, a Windows quirk, an audit severity change, a dogfooding hazard).
One page would bundle them so that any edit touches a file mostly irrelevant to it, and
the routing list could not tell a reader which part to read.

**Leaving stubs in CLAUDE.md.** Rejected: a stub is a partial copy, and partial copies
drift from the page they summarise. One routing line per page carries the trigger and
the link and nothing that can go stale.

**`@` imports of the pages into CLAUDE.md.** Rejected: an import loads the text into
every session, which restores the size the move exists to remove.

**Moving the audit-related text into `plugin/skills/audit-conventions/SKILL.md`.**
Rejected: that file is shipped surface read by consumers. These notes are about
maintaining this repo and would put maintainer-only guidance in front of the wrong
audience, with a version bump to change it.

## Consequences

CLAUDE.md loads at roughly 45% of its previous size, and each maintainer rule is read on
demand through its trigger. The cost is one extra read when a trigger applies, and a
dependence on the routing list's triggers staying accurate. A rule refined later is edited
on its page. Older ADRs that cite CLAUDE.md for moved text now send a reader to a section
that no longer holds it, which is the accepted cost of leaving them frozen. #587 adds the
schema vocabulary for the page types these notes carry.

**Related:** ADR-0023 (amended), ADR-0068, ADR-0067, #586, #579.
