# 0024. OKF v0.2 concept-page frontmatter contract: full key set, `## Sources` dropped, `wiki.decay` retired

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #190

## Context

ADR-0022 fixed the OKF v0.2 bundle root at `<wikiDir>/` but deliberately decided
nothing about what a concept page's frontmatter contains — the actual format
`maintain-wiki` emits was still unspecified, and the skill shipped a near-miss
of a published standard, which is exactly what epic #142's buy-vs-build
constraint warns against (`docs/decisions/0022-okf-bundle-root-is-the-wiki-tier.md`).

This is cheap to land now: `maintain-wiki` and `wiki-librarian` have never
shipped (both sit in `plugin/CHANGELOG.md` `[Unreleased]`), so there is no
installed base, no consumer breakage, and no migration owed. Landing this
before the release that first ships `maintain-wiki` makes OKF conformance
simply what the skill has always emitted.

Implemented in `8aaab71` (concept-page frontmatter contract) and `47af89b`
(index/log structures, `wiki.decay` retirement).

## Decision

**1. Emit the full OKF key set, not the normative minimum.** `type` alone is
fully conformant (§4.1, §11.2), but a `type`-only bundle carries no provenance
or routing metadata — which is the first of the two standing costs #183 names
for *not* adopting OKF, so the minimum would have failed the adoption's own
goal. Emitted: `type`, `title`, `description`, `tags`, `status`, `stale_after`,
`generated`, `usage_window`, `sources[]`, plus per-claim footnotes keyed to
`sources[].id`. Cost accepted: every emitted key is one `tech-writer` must get
right on every ingest and one that can go stale, and per-claim footnote
attribution is 0 today — net-new authoring across roughly 176 lines that lands
on #192, not here. This ADR writes the format; #192 pays for it.

**2. Top-level `resource` is omitted.** §4.1 makes it "absent for concepts
that describe abstract ideas rather than physical resources"; a synthesized
practice page is an abstract concept. Recorded so a later reader doesn't "fix"
the omission.

**3. Drop the `## Sources` body section; keep `## Related`.** This is the
load-bearing decision. #183's Q4 framed this as having no principled answer,
quoting §4.2's conventional-headings list ("OKF §4.2 offers no blessed middle
ground"). That framing was wrong: the spec treats the two sections
**asymmetrically**. §13.1 states the body citations list *is* superseded by
`sources` frontmatter, so keeping both would duplicate provenance with nothing
keeping the two in sync. But §6.1 keeps cross-links as ordinary body markdown
with **no** frontmatter equivalent at all, so `## Related` duplicates nothing
and remains its natural home. Dropping one and keeping the other is therefore
principled, not a split-the-difference compromise. Secondary benefit: `lint`'s
existing dead-link check keeps its target, which matters because #191 and
#150 are coupled to it.

**4. `type` vocabulary is a starter set in the template, owned and extensible
by the consuming repo** (`practice-note`, `reference`, `decision-context`,
`incident`). §4.1 requires only non-empty and §11 forbids consumers rejecting
unknown `type` values, so an open-but-recommended set is both routable and
spec-conformant. A closed plugin-owned enumeration would be a breaking format
change for every consumer whenever it grew.

**5. Retire `wiki.decay`; staleness is per-page `stale_after`.** This is a
retirement, not a breaking change, because it costs no consumer:
`CONVENTIONS.md` defined `decay` with **no sub-key schema**; its only
ever-named sub-key `staleAfterDays` appeared solely as illustrative `e.g.`
prose in three sites and was never a real key; and this repo's own schema doc
stated outright that decay was "defined but not enforced here." §5.5
independently argues for absolute dates over relative TTLs — a plain date
comparison with no reference to when the page was read. The date is chosen
per page by a judgment rule stated in the schema doc, derived from the
topic's own volatility. Audit consequence: one fewer optional expectation,
moving the optional tally 13 → 12 unmet, with `required: 35 of 35` unaffected.

**6. `generated.by` is `process:maintain-wiki`.** §5.2's `process:<id>` actor
form. It names the durable producer — the skill's ingest contract — rather
than an agent or model name that changes underneath the page. Cost accepted:
no model-level attribution, so "which pages did the weaker model write?" is
not answerable later.

**7. Approving an `ingest` is NOT `human:` verification; `verified` is never
auto-emitted.** §5.3's tiers exist to distinguish checked knowledge from
generated knowledge, and stamping a workflow approval as human review would
make the human-reviewed tier carry no information exactly where it matters
most. Consequence stated plainly and accepted: every page reads `unverified`
until someone deliberately checks it — which is the truthful state.

**8. Newest-first and append-only are reconciled, not traded off.** §9
mandates newest-first, which means prepending; prepending edits no prior
entry, so the append-only guarantee survives intact and only the insertion
point moves. The template wording changed from "append" to "add newest first"
because the bare word had come to misdescribe the mechanics.

**9. Two `sources[]` entries per capture** — one citing `../<rawDir>/<capture>.md`,
one citing the upstream URL. ADR-0022 surfaced that the relative path dangles
when the bundle is extracted on its own and that §6.1's broken-link tolerance
covers *links*, not path-valued fields — it named two mitigations and
explicitly left the pick to #190. This is that pick. The rejected alternative
— one entry carrying the URL in `title` — is declined because it overloads a
human-readable label with a machine-resolvable address.

**Architecture.** This sits directly under ADR-0022's bundle-root decision:
0022 fixed *where* the bundle lives and left *what a page contains* open; this
record closes that gap without reopening 0022's scope (`raw/` immutability,
`lint`'s standalone-verb status, and ADR-0015's boundary rationale are all
untouched). The frontmatter contract lands in the bundled
`wiki-schema.template.md` and this repo's own `docs/wiki-schema.md` — the same
split ADR-0022 assumed — so a consuming repo's `tech-writer` learns the format
from its own copy, never from the plugin source.

## Compromise

- **`type`-only normative minimum.** Fully conformant per §4.1/§11.2, but
  fails the adoption's own interoperability goal (#183's standing costs) by
  carrying no provenance or routing metadata.
- **Keeping both `## Sources` and frontmatter `sources`.** Accepts permanent
  unsynced duplication of provenance — the exact failure mode §13.1 exists to
  retire.
- **Dropping `## Related` as well.** Hurts plain-markdown readability and
  widens #191 by moving `lint`'s dead-link target for no spec-mandated gain —
  §6.1 gives cross-links no frontmatter equivalent to move to.
- **A closed plugin-owned `type` enumeration.** Would be a breaking format
  change for every consumer whenever the vocabulary needed to grow; §11
  forbids rejecting unknown values, so a closed set fights the spec rather
  than using it.
- **Keeping `wiki.decay` as a TTL that `ingest` computes `stale_after` from.**
  Would make `decay` a real key with a real sub-key schema for the first
  time, and add date arithmetic to `ingest` — new behavior in a change that is
  only supposed to specify a format.
- **Stamping ingest approval as `human:` verification.** Would inflate the
  human-reviewed trust tier with a workflow checkpoint that isn't a genuine
  content review, destroying the tier's signal.

## Consequences

- **#191 and #192 now inherit this contract.** #191 couples `lint` and
  `wiki-librarian` to this format; #192 pays the per-claim-footnote authoring
  cost and is what makes the conformance claim true.
- **No conformance claim is made yet.** Per ADR-0022 decision 4 the producer
  claim is scoped to "the `wiki/` bundle is OKF v0.2 conformant", never "this
  repo is", and it becomes claimable only when #192 lands. Nothing in this
  change asserts it.
- **The `## Decay / staleness policy` heading kept its name** despite its
  content being wholly replaced, because `SKILL.md` locates schema guidance by
  heading name and a rename is a silent contract break.
- **ADR-0022's consequences rows 2 and 3** (the pre-existing link-form
  defects — the stray `` `raw/<file>` `` form and the blessed out-of-bundle
  `../docs/…` link examples) are repaired here rather than deferred.
- **Two stale premises in #190's body were corrected during planning**: its
  "Blocked by the bundle-root decision" line (ADR-0022 had shipped), and its
  listing Q12 (is conformance a claim?) as open (ADR-0022 decision 4 had
  already closed it).
