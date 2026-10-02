# 0026. OKF v0.2 dogfood migration semantics: provenance dates, pruned `sources[]`, and a standing out-of-bundle advisory

- **Status:** accepted
- **Date:** 2026-08-04
- **Issue:** #192

## Context

Three records led here and all three deferred the same thing. ADR-0022 fixed
the bundle root at `<wikiDir>/` and scoped the conformance claim to the bundle,
stating outright that the claim "is **not yet true**" and "becomes claimable
only when **#192** lands." ADR-0024 wrote the concept-page frontmatter contract
and noted that "#192 pays for it." ADR-0025 wired `lint` and `wiki-librarian` to
that format and handed over two rules exercised only against a throwaway
scratchpad fixture, plus four `wiki-librarian` frontmatter behaviors that
"ship UNVERIFIED against real data."

This issue is where the format meets real pages: `wiki/index.md`, `wiki/log.md`,
and the two concept pages. Most of that was mechanical, and the mechanics are the
commit log (`e33cd18`, `578ac93`, `0796616`, `872a884`) — not this record.

What is *not* mechanical is that seven questions came up that no prior record
answers, each with a weighed alternative, and each setting a precedent the next
`ingest` will follow by imitation. A migration is the first place a format's
under-specified edges are discovered, and edges resolved silently in a commit
are edges the next author has to re-litigate. This record states the seven.

Spec pin unchanged from ADR-0022: OKF v0.2, upstream
`GoogleCloudPlatform/knowledge-catalog` `okf/SPEC.md` @
`3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`.

## Decision

**1. `generated.at` records content production, not file mutation.** Both
concept pages carry `2026-07-21T19:27:45Z` — the commit date of `ee95549`, the
`git log --diff-filter=A` commit that created them under #143 — not the
migration date. The migration re-expressed existing prose in a new container; it
generated no new claim, so §5.2's `generated` block still describes July 21.
This is not a bookkeeping nicety: `wiki-librarian` judges a page's currency from
`generated.at` (a #191 addition, `plugin/agents/wiki-librarian.md:58`), and this
migration is the **first real data that behavior has ever seen**. Stamping the
migration date would make the key wrong on that very first read, and wrong in
the direction that hides staleness — a page reformatted in 2026-08 would report
as freshly generated knowledge. The rule generalizes: `generated.at` moves when
`ingest` folds in new material, not when a page is reformatted, relinked, or
moved.

**2. `usage_window` is omitted absent any `usage_count`, and the format question
is handed to #221 rather than fixed here.** The key is defined — in both
`docs/wiki-schema.md:117-118` and
`plugin/skills/maintain-wiki/wiki-schema.template.md:88` — as framing "every
`usage_count` in the page." Nothing in the format emits a `usage_count`, and
`wiki-librarian` never reads `usage_window`. Emitting it would frame an empty
set with invented dates, which is worse than silence. §11 forbids a conformant
consumer from rejecting a bundle for a missing optional field *or a missing
optional family*, so omission is conformant and no page is defective for it.

The underlying format defect — a key whose only stated purpose is to frame a
value the format never produces — is **real but out of scope here**, because
fixing it spans three coupled surfaces (`docs/wiki-schema.md`, the bundled
`wiki-schema.template.md`, and ADR-0024's emitted key list). Amending only this
repo's copy would create exactly the cite-and-repeat drift ADR-0025 decision 4
warns about, where three copies of one contract silently disagree. Filed as
**#221**.

**Contrast with `stale_after`, which is also omitted and is *not* a defect.**
`docs/wiki-schema.md:184-185` explicitly sanctions the omission — "`stale_after`
is typically omitted … Set one only when a page describes something actively in
flux." Both pages describe settled structure, so no date is owed. That asymmetry
is the whole point of separating the two: one omission is the schema's own
guidance being followed, the other is a judgment call working around a format
gap. Recording them as if they were the same thing would bury #221.

**3. `sources[]` is per-claim provenance, pruned to claim-supporting captures.**
The `beyond-rag` pair was dropped from `wiki/audit-conventions-as-proto-lint.md`.
Its stated contribution in the superseded `## Sources` body section was "the
point that maintenance discipline, not format alone, is what makes a wiki (or a
lint tier) actually useful" — and no sentence in that page's body makes or
depends on that point. It was provenance for nothing.

The operative rule is **keep-where-cited / drop-where-not**, applied to both
pages: a `sources[]` entry stays when a body footnote keys to it. `beyond-rag`
keeps a real footnote on the sibling page (`wiki/llm-wiki-pattern-in-gvt-dev.md:42`),
where the RAG-contrast framing it genuinely contributed lives — so the source is
not dropped from the bundle, only from the page it did not inform. Nothing is
lost from the record either way: `wiki/log.md`'s 2026-07-21 entry still records
that #143's ingest read both captures.

This is the operational reading of ADR-0024 decision 1's "per-claim footnotes
keyed to `sources[].id`" — per-claim cuts both ways. If a source supports a
claim, footnote it; if it supports none, it does not belong in that page's
`sources[]`.

**4. Body footnotes key to the capture id, never the `-upstream` alias, and
footnote definition labels are plain text.** ADR-0024 decision 9 emits two
`sources[]` entries per capture — the `../<rawDir>/…` path and the upstream URL
— as **address redundancy for one source**, not two distinct sources. So the
`-upstream` entries are legitimately unfootnoted, and a reader finding no
`[^karpathy-upstream]` in the body is looking at the format working correctly.
Footnotes key to the capture because the capture is the immutable artifact
`wiki-librarian` traces provenance into `<rawDir>/`; the URL is where it came
from, not what the page was written against.

Relatedly, the footnote *definition* labels (`[^karpathy]: Karpathy's LLM Wiki
as Agent Memory — immutable capture, 2026-07-21.`) are plain text, never
markdown links. Linking them would have added three new out-of-bundle links —
one per definition, since a marker is inline and cannot carry a link — and
changed `lint`'s expected output on this bundle from 2 advisories to 5 — turning
a documented, understood standing finding (decision 5) into noise, for a
convenience the `sources[]` block already provides.

**5. The two out-of-bundle links are kept, as a documented standing advisory.**
`wiki/audit-conventions-as-proto-lint.md:63` and
`wiki/llm-wiki-pattern-in-gvt-dev.md:73` both point at
`../docs/decisions/0015-maintain-wiki-design-boundaries.md`. ADR-0025 identified
them and explicitly deferred the keep-or-retarget decision here. They are kept.

Both cite the boundary record the two pages are *about*, and no in-bundle page
states that boundary — there is nothing inside the bundle to re-point them at.
They are legal per §6.1, and they will surface as two `lint` advisories on
**every** future run, permanently. That permanence is accepted with a second
benefit noted: these two links are the **only** real-data exercise #191's new
out-of-bundle check will get, so removing them would leave the check running
against nothing.

**6. Exactly one link adopted §6.1's bundle-absolute form; navigational links
stay relative.** The rule: *navigational links — index entries and `## Related`
— stay relative so the bundle browses correctly on GitHub; an inline in-body
cross-reference may take the bundle-absolute `/page.md` form.* Applied, that
converts one of the bundle's five in-bundle links:
`wiki/llm-wiki-pattern-in-gvt-dev.md:84`, an inline pointer inside a bullet.

Accepted cost, stated plainly: **that one link 404s on github.com**, because
GitHub resolves `/audit-conventions-as-proto-lint.md` against the repository
root, not the bundle root. The gain is that bundle-absolute resolution goes from
**0 real instances** (ADR-0025's explicit hand-off: "0 instances in the current
corpus … exercised only against a throwaway scratchpad fixture") to 1, closing a
validation debt rather than passing it on again. A corpus mixing both link forms
is also a strictly harder test for `lint`'s resolver than a uniform one — a
resolver that handles only the form it always sees is untested, not correct.

**7. §9's newest-first re-render of `log.md`'s existing entry is legal under
append-only.** ADR-0024 decision 8 reconciled §9's newest-first mandate with the
log's append-only guarantee by way of *prepending* — prepending edits no prior
entry. It said nothing about **re-formatting** an existing entry, which §9
forces: a 4-column table row cannot be a `## YYYY-MM-DD` group with prose
bullets, so the pre-existing 2026-07-21 row had to be re-rendered.

Resolution: **append-only protects an entry's content, not its bytes.** The
guarantee's own text names what it is for — "if a past entry itself needs
correcting, add a new entry that says so" — i.e. it exists to stop history being
*revised* or *removed*. A format re-render corrects nothing, removes nothing,
and asserts nothing new, so the guarantee holds. Two disciplines make that
checkable rather than merely asserted: the 2026-07-21 entry's Change, Why, and
Source text is preserved **word-for-word**, and the migration's own 2026-08-04
entry self-documents the one representational edit, so the log discloses its own
single exception.

**Architecture.** This record adds no surface: no file, no config key, no
template, no agent. It is the fourth and last of the OKF adoption chain — 0022
fixed *where* the bundle is, 0024 fixed *what a page contains*, 0025 fixed *what
a consumer may reject*, and this one fixes *what the values mean when a real
page is produced*. Each of the seven is a producer-side semantic that the format
alone under-determines, which is why they surfaced only when the format was
applied. They bind `ingest` (and the `tech-writer` it dispatches) from here on;
nothing in `audit-conventions` or the plugin contract is touched, per ADR-0015
decision 2.

## Compromise

Keyed to the decision each alternative was rejected under.

- **(1) Stamp the migration date into `generated.at`.** The obvious reading of
  "generated," and the one a mechanical `git log` on the touched file would
  produce. Rejected because it inverts the key's meaning for its very first
  consumer: `wiki-librarian`'s currency judgment would read a reformatted 2026-07
  page as freshly generated 2026-08 knowledge. A format's first real datum
  setting the wrong precedent is expensive to unwind, because every later page
  imitates it.
- **(2) Emit `usage_window` with plausible dates.** Would make the frontmatter
  key-complete against ADR-0024 decision 1's list. Rejected: the key is defined
  as framing "every `usage_count` in the page," and the page has none — so the
  dates would frame an empty set and be invented rather than observed. §11's
  tolerance for a missing optional field means completeness buys nothing here.
- **(2) Fix the `usage_window` definition in this repo's `docs/wiki-schema.md`.**
  Tempting, since the defect is small and the file is right there. Rejected
  because the definition exists in three coupled places and amending one is how
  cite-and-repeat copies drift (ADR-0025 decision 4) — the fix has to land in the
  schema doc, the bundled template, and ADR-0024's key list together. Filed as
  **#221** instead of half-done here.
- **(3) Keep the `beyond-rag` pair on the proto-lint page, unfootnoted.** Fully
  legal — §5.1 does not require every `sources[]` entry to be cited in the body,
  and this is the zero-diff option. Rejected because the page would then assert
  an influence its body does not carry: a reader (or `wiki-librarian` resolving
  citations) would reasonably conclude some claim on the page rests on that
  capture, and none does.
- **(3) Author a sentence for the source to support.** Would have preserved the
  citation and arguably improved the page. Rejected on principle: writing prose
  to justify a citation is backwards — the claim comes first and the provenance
  follows it, never the reverse. A migration is also the worst possible moment to
  introduce new claims, since it is the one change where "nothing was asserted
  that wasn't already there" is the reviewable property.
- **(4) Footnote the `-upstream` entries as well, or make footnote labels
  links.** Rejected: the `-upstream` entry is the same source at a second
  address (ADR-0024 decision 9), so a second footnote would double-cite one
  source; and linking the labels would add four out-of-bundle links, taking
  `lint`'s expected output from 2 advisories to 5 and drowning the two
  deliberate, documented findings in incidental ones.
- **(5) Inline ADR-0015's content into a wiki page and drop the links.** Would
  close both advisories and make the bundle self-contained. Rejected: it
  duplicates the boundary rationale with nothing keeping the copy in sync with
  the ADR, which is the failure mode §13.1 and ADR-0024 decision 3 exist to
  retire — and an ADR is precisely the artifact that must not be paraphrased,
  since it is immutable once accepted while a wiki page is living.
- **(5) Convert the links to `sources[]` entries.** Rejected as a category
  error: `sources[]` is provenance for what the page was *written from*, and
  ADR-0015 is a thing the pages *point at*. It would also make the dangling
  strictly worse — ADR-0022 already recorded that §6.1's broken-link tolerance
  covers **links**, not path-valued fields, so a dangling `resource` behaves
  worse to a consumer than a dangling link.
- **(5) Drop the links.** Cheapest, and takes `lint` to zero findings. Rejected
  because the pages would lose the pointer to the record they are *about*, to
  make a health check look tidier — optimizing the advisory rather than the
  content.
- **(6) Convert all five in-bundle links to bundle-absolute.** The uniform,
  most-conformant-looking option. Rejected on the cost: every one of the five —
  including both `index.md` entries, the bundle's front door — would 404 in
  GitHub's UI. For a wiki whose entire value proposition is being browsable
  markdown with no retrieval engine, breaking the front door to exercise a
  resolver is a large regression bought with a small validation gain.
- **(6) Convert none.** Zero risk, zero 404s. Rejected because it hands
  ADR-0025's "0 instances" validation debt straight back with nothing changed —
  the debt was explicitly routed here, and #192 is the only issue in the chain
  that produces real data to pay it with.
- **(7) Treat the §9 re-render as forbidden and leave the table.** Would have
  kept append-only unarguable, at the cost of a `log.md` that does not satisfy
  §9 — which is the one thing #192 exists to fix, and would have left the
  conformance claim unassertable. Rejected. The narrower variant — re-render but
  say nothing — was also rejected: an undisclosed edit to an append-only file is
  exactly what the guarantee is supposed to make impossible to do quietly, so the
  disclosure in the migration entry is not decoration, it is what makes the
  exception legible.

## Consequences

- **The conformance claim becomes assertable.** ADR-0022 decision 4 scoped the
  producer claim to the bundle and made it conditional on #192; that precondition
  is now met — every non-reserved `.md` under `wiki/` carries parseable
  frontmatter with a non-empty `type`, and `wiki/index.md` / `wiki/log.md` follow
  §8 / §9. A following task asserts it in `docs/wiki-schema.md`, with a caveat
  naming **#150** as the future *mechanical* guarantee: until #150 ships there is
  no checker, so the claim rests on human discipline and can silently stop being
  true. The phrasing rule from ADR-0022 decision 4 is unchanged and applies to
  every future statement of it — always "**the `wiki/` bundle is OKF v0.2
  conformant**," never "this repo is."
- **What #192 validates, and what it does not.** Now exercised against real data:
  §11's tolerant-consumer bound (two omitted optional keys, neither a defect),
  the out-of-bundle advisory (**2** instances), bundle-absolute link resolution
  (**1** instance). **Still unexercised: the nested-`index.md` orphan rule.** The
  wiki has no subdirectories, and creating one purely to exercise a check would
  be inventing content to satisfy a test. ADR-0025 handed over *two* unvalidated
  rules; this closes one of them, and saying so plainly is more useful than
  implying all of #191 is now proven.
- **`wiki-librarian`'s four behaviors are each only *half* validated — do not
  record them as verified as a block.** A hand-driven query run against the
  migrated bundle (the agent cannot be dispatched: `maintain-wiki` has never been
  released, so the installed cache has no copy) gave:
  - **Routing** — `tags` works, discriminating (a `lint` query shortlists one
    page) and generalizing (an `llm-wiki` query shortlists both). **`type` cut
    nothing**: both pages are genuinely `practice-note`, so at n=1 distinct value
    its discriminating power is untested, as is §11's never-reject-an-unknown-`type`
    rule. Routing is validated for `tags` alone.
  - **Trust tier** — correct, but only the **absent-key** path. Nothing declares
    `verified`, so the declared path and §11's bare-`verified`-as-one-element-list
    rule are unexercised.
  - **`status: deprecated`** — correct via a scratchpad fixture (exclude-or-flag
    plainly; on a single-source corpus the flag branch is what keeps the question
    answerable). But both real pages declare `status: stable` *explicitly*, so the
    **absent ⇒ `stable` default is unexercised**.
  - **Currency** — only the `generated.at` half; no page declares `stale_after`,
    so the mechanical `today >= stale_after` verdict never ran.

  Note the pattern: trust tier and `status` exercise **opposite** halves of their
  respective defaults, so "both work" would paper over complementary blind spots.
- **The query run surfaced two `wiki-librarian` gaps, filed as #222.**
  (1) It resolved this bundle's one bundle-absolute link against the *filesystem
  root* and reported a legal, §6.1-**recommended** form as a broken link — the
  agent never received the resolution rule #191 gave `lint`. (2) Nothing states
  which wins for currency when `generated.at` and `log.md` disagree, which they
  now deliberately do: decision 1 back-stamps `generated.at` to content
  production, while `log.md` records the migration touch. Both are true and mean
  different things; without a precedence rule a reader concludes the field is
  simply stale.
- **`raw/` was untouched — 0 files.** Per ADR-0022 decisions 2 and 4, `<rawDir>/`
  is outside the bundle, so §11.1 never reaches it and no frontmatter is owed
  there. No capture was edited, `git log --diff-filter=M -- raw/` stays empty,
  and the never-self-healing `lint` finding ADR-0022 anticipated for the rejected
  repo-root bundle does not arise. ADR-0022's open item (a) — whether
  `raw/README.md` is a capture or a scaffold artifact for immutability purposes
  — was routed to #192 "only if it ever needs to edit `raw/README.md`." It did
  not, so the question remains open and untouched.
- **`type` cannot discriminate for routing here; `tags` carry all of it.** Both
  pages are genuinely `practice-note` — that is what they are, and picking
  different values to make routing look better would be lying to the router. So
  the tag vocabulary was chosen to make routing **falsifiable**: a shared pair
  (`llm-wiki`, `maintain-wiki`) plus page-unique tags, such that a query about
  `lint` must shortlist one page and a query about the LLM-wiki pattern must
  shortlist both. If `wiki-librarian` returns some other shortlist, the routing
  behavior is wrong and the corpus can show it. This was a test-design choice,
  not a stylistic one.
- **Seven producer-side precedents now bind `ingest`.** Decisions 1, 3, 4, 6 and
  7 in particular describe what the *next* ingest must do, not just what this
  migration did — and none of them is mechanically enforced. `lint` checks link
  health, not whether `generated.at` was moved for the right reason or whether a
  `sources[]` entry earns its place. Drift here is invisible until someone reads
  a page closely; this record is the only thing a future author has to check
  against.
- **A permanent 2-advisory floor for `lint` on this bundle.** Any future
  "`lint` is clean" statement about this repo means *two known findings and
  nothing else*, not zero. Worth remembering when #150 lands: those two are the
  reference case for a finding that is correct, understood, and must not become
  an error — the strict-mode seam ADR-0025 decision 3 names.
