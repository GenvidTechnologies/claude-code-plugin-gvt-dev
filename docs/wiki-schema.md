# Wiki Maintenance Schema

> Project conventions consumed by `/gvt-dev:maintain-wiki`. This is the
> **maintenance schema** for this repo's three-tier wiki: `raw/` (immutable
> captured sources) → `wiki/` (LLM-maintained pages, `index.md`, `log.md`) →
> this schema (the rules that govern how the first two are kept in sync).

## What this wiki is

This is the gvt-dev plugin repo's own compounding knowledge base about its
own practice — how the plugin is built, why its conventions ended up the
way they did, and the recurring gotchas maintainers hit working on it. It is
distinct from `docs/decisions/` (the ADR trail, which records individual
architecture/compromise decisions) and from `CLAUDE.md` (the maintainer
guide) — the wiki is where cross-cutting, accumulating knowledge that
doesn't belong to one decision or one guide's section lives.

Three tiers, in order:

1. **`raw/`** — immutable captured sources: retro transcripts, incident
   notes, doc snapshots, anything captured verbatim at a point in time.
2. **`wiki/`** — LLM-maintained pages built from `raw/`, plus `wiki/index.md`
   (the page listing) and `wiki/log.md` (an append-only ingest log).
3. **This schema** (`docs/wiki-schema.md`) — the rules the `maintain-wiki`
   skill follows to keep the first two in sync.

Pages under `wiki/` follow the [Open Knowledge Format (OKF) v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), pinned at upstream commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96` (see [ADR-0022](decisions/0022-okf-bundle-root-is-the-wiki-tier.md)). A later spec revision obliges different things depending on its scope:

- **MINOR / backward-compatible revision** — update the declared version and the pinned commit SHA above; no migration owed.
- **MAJOR / breaking revision** — a tracked migration, a `plugin/CHANGELOG.md` entry, and a plugin `version` bump.

OKF has already shipped one breaking revision within v0.x: v0.1's body `# Citations` list was superseded by frontmatter `sources`, and `timestamp` became `generated.at`. Upstream declares v0.x provisional, so without a declared pin the next revision would be silent drift.

**Bundle root.** The OKF bundle root is `wiki/`. `raw/` is **outside** the
bundle — captures are not concept documents, so §11's frontmatter
requirement never reaches them and the `raw/` immutability convention
(below) stands unamended.

> **The `wiki/` bundle is OKF v0.2 conformant** — every page under `wiki/`
> carries parseable frontmatter with a non-empty `type`, and `wiki/index.md`
> and `wiki/log.md` follow §8 and §9 (#192, ADR-0026). Per ADR-0022 decision 4
> the claim is scoped to the **bundle**, never to this repo — nothing outside
> `wiki/` is in scope, including `raw/`. Nothing mechanical enforces it yet:
> #150 is the tracked conformance walk, and until it ships the claim rests on
> the discipline of whoever last edited a page.

## Page format

Every page under `wiki/` is a single Markdown file that opens with YAML
frontmatter, then prose, and follows this shape:

```markdown
---
type: practice-note                  # the ONLY always-required key (§4.1); must be non-empty (§11.2)
title: <Page title>
description: <One-line summary — the single sentence you'd say if asked "what is this page about?">
tags: [<topic>, <topic>]
status: stable                       # draft | stable | deprecated; absent implies stable (§5.4)
stale_after: <YYYY-MM-DD>            # absolute date; stale when today >= this (§5.5)
generated: { by: process:maintain-wiki, at: <YYYY-MM-DDTHH:MM:SSZ> }
usage_window: { from: <YYYY-MM-DD>, to: <YYYY-MM-DD> }
sources:
  - id: <short-id>
    resource: ../raw/<capture>.md
    title: <what this source is>
    last_modified: <YYYY-MM-DD>
  - id: <short-id>-upstream
    resource: <https://original-source-url>
    title: <the upstream article/source the capture is drawn from>
---

# <Page title>

<Body — the accumulated knowledge on this topic, in prose, lists, or tables as
fits. A claim drawn from a source carries a footnote keyed to that source's
`sources[].id`, e.g. "...claim text[^<short-id>]", with a matching definition
`[^<short-id>]: <label>` further down.>

## Related

- [<Other page title>](<other-page>.md) — <why it's related>
```

- **`type`** — the only always-required key (§4.1); must be non-empty
  (§11.2). This repo currently uses a single type: **`practice-note`** —
  every page here is accumulated practice knowledge about building and
  maintaining the plugin itself (see `## What this wiki is`, above). If a
  future page is better described as a reference doc, a decision-context
  page, or an incident writeup, extend this list rather than force-fitting
  it into `practice-note` — §11 forbids a consumer rejecting an unknown
  `type` value, so extending it is safe.
- **`title`, `description`, `tags`** — recommended keys (§4.1). `description`
  is the one-line summary surfaced in `wiki/index.md` entries and query
  results — keep it accurate and current even when the body grows.
- **Top-level `resource`** — deliberately **omitted**. §4.1: "Absent for
  concepts that describe abstract ideas rather than physical resources." A
  synthesized wiki page is an abstract concept, not a resource — don't add it.
- **`status`** — §5.4; absent implies `stable`.
- **`stale_after`** — §5.5, an absolute date. A page is stale when
  `today >= stale_after` (see `## Decay / staleness policy` below for how
  this repo chooses it).
- **`generated`** — §5.2. `by` is **required** within the block. Value is
  `process:maintain-wiki` (the `process:<id>` actor form) — this names the
  durable producer (the skill's ingest contract), not a model or agent name
  that changes underneath the page.
- **`verified`** — §5.3, **never auto-emitted**. Approving an `ingest` at its
  interactive checkpoint is *not* `human:` verification — verification is a
  separate, deliberate act. A page therefore reads as `unverified` (§5.3's
  default when the key is absent) until someone genuinely checks it. This is
  the truthful state; inflating it would destroy the trust tier's signal.
- **`sources[]`** — §5.1. `resource` is **required** within each entry. `id`
  is the join key for per-claim footnotes. Write **two** entries per capture:
  one citing the immutable capture at `../raw/<capture>.md`, one citing the
  upstream URL. The relative path dangles if the bundle is ever extracted on
  its own, and §6.1's broken-link tolerance covers links, not path-valued
  fields — the second entry is what keeps provenance resolvable.
- **`usage_window`** — §5.1, written once as a sibling of `sources`, framing
  every `usage_count` in the page.
- **Per-claim footnotes** (§5.1) — a claim carries `[^<id>]` in the body and a
  matching `[^<id>]: <label>` definition, where `<id>` matches a `sources[].id`
  entry. The footnote label is the join key; attribution resolves through the
  matching `sources` entry, not by parsing the footnote prose.
- **`Related`** — wiki-links (see below) to other `wiki/` pages this one
  connects to. Optional if the topic is genuinely standalone.

**Tolerated, never rejected** (§11 consumer clauses): a conformant consumer
MUST NOT reject a bundle for missing optional frontmatter fields, a missing
optional family (§5.3), unknown `type` values, unknown additional
frontmatter keys, broken cross-links, or a missing `index.md` — and MUST
treat a bare `verified` mapping as a one-element list. This bounds what a
future mechanical linter (`lint`, below, and #150) may flag. The **binding**
statement for `lint` and #150 lives in the skill body's `lint` section
(plugin-owned, so it survives edits to this file); this paragraph is the
format's own statement of the same clauses.

## Page lifecycle: create vs. update

A wiki **accumulates and compounds** — unlike a RAG index, which retrieves
and forgets, a wiki page is the durable, growing record of everything known
about one topic. Two situations, two different actions:

- **New topic → new page.** If the ingested source describes a topic with no
  existing page, create one under `wiki/<topic-slug>.md`, add it to
  `wiki/index.md`, and append an entry to `wiki/log.md`.
- **New facts about an existing topic → update the page in place.** Don't
  create a second page for the same topic, and don't just append raw
  paragraphs — integrate the new facts into the existing prose, updating the
  `description` if the topic's shape has changed, and refresh the frontmatter
  `sources` list. Append an entry to `wiki/log.md` either way.

When it's ambiguous whether a source is a new topic or a refinement of an
existing one, prefer updating the closer existing page — a wiki with one
strong page beats a wiki with two thin overlapping ones.

## The `raw/` immutability convention

`raw/` is the **provenance tier**: every file under it is a captured source —
a transcript, a doc snapshot, a decision record, a data dump — exactly as it
was when captured.

- **Never edit a file under `raw/`.** A `raw/` file is a historical capture,
  not a living document.
- **If a source changes, re-capture it as a new file** (e.g. suffix with a
  date or revision), leaving the prior capture in place. The wiki page that
  cites it gets updated (see above); the old capture stays as the record of
  what was true when it was captured.
- This is what makes `wiki/` pages re-verifiable: every claim traces back to
  an immutable file, not a source that may have moved on since.

## Decay / staleness policy

Staleness is modelled **per page** by the frontmatter `stale_after` key
(§5.5) — an absolute `YYYY-MM-DD` date, not a relative TTL. A page is stale
when `today >= stale_after`; `lint` (below) surfaces stale candidates, a
human or the skill's judgment decides what to do with them. Decay is a
**policy the maintainer applies**, not an automated engine.

§5.5 prefers an absolute date over a relative TTL precisely so the staleness
decision is a plain date comparison with no reference to when the page was
last read.

This repo's judgment rule: most pages here document settled practice about
the plugin's own conventions (see `## What this wiki is`) and change only
when the underlying convention changes, so **`stale_after` is typically
omitted**. Set one only when a page describes something actively in flux —
e.g. a workflow still being iterated on, or a tool/version pin — a few
months out, reviewed and pushed forward (or removed) at the next `ingest`
that touches the page.

## The verb contract

`/gvt-dev:maintain-wiki` operates through three verbs:

- **`ingest`** — read new or changed files under `raw/`, write new `wiki/`
  pages or update existing ones per the lifecycle rule above, and append one
  entry per source to `wiki/log.md`.
- **`query`** — answer a question **from the wiki**, with citations back to
  the pages (and, transitively, the `raw/` sources) that support the answer.
  Query is served by the `gvt-dev:wiki-librarian` agent so exploration stays
  off the main thread.
- **`lint`** — an advisory health check, not a mutation. It flags: dead
  wiki-links (a `Related` link to a page that no longer exists), out-of-bundle
  links (a link that resolves outside `wiki/` — legal, but unresolvable to a
  consumer that receives only the bundle), orphaned pages (a page listed in
  **no** index — neither `wiki/index.md` nor its own subdirectory's
  `index.md`), `raw/` mutations (a `raw/` file that has been edited rather
  than re-captured), and stale pages per `stale_after` (above). The skill body
  carries the full rules.

## Wiki-links

Relate pages to each other with ordinary intra-wiki Markdown links —
`[<title>](<other-page>.md)` — inside the `Related` section of a page (or
inline in the body, where a specific claim points at another page). Two link
forms are legal (§6.1):

- **Bundle-absolute** — `/other-page.md`, rooted at `wiki/` (the bundle
  root). §6.1 **recommends** this form: it stays correct even if the linking
  page moves to a different subdirectory within the bundle.
- **Ordinary relative** — `./other-page.md` for a sibling page in the same
  directory, `../<subdir>/other-page.md` for a page in another subdirectory.

A link that escapes the bundle root entirely — e.g. to `../docs/wiki-schema.md`
or `../docs/decisions/0001-*.md` — remains legal per §6.1 as an ordinary
relative link, but it is **unresolvable to an external OKF consumer** that
only receives the `wiki/` bundle on its own. Treat this as a deliberate,
documented trade-off for the rare page that genuinely needs to point outside
the bundle (e.g. to this schema doc or an ADR) — not as a pattern to reach
for by default.

This bundle has **two** such links, both deliberate and both permanent: each
concept page cites `../docs/decisions/0015-…`, the record that draws the
`audit-conventions` / `maintain-wiki lint` boundary the pages analyse, and no
in-bundle page states that boundary. They surface as two `lint` out-of-bundle
advisories on **every** run — a known and accepted floor, not a backlog item
(ADR-0026). They are also the only real-data exercise of that check.

Consumers **must tolerate broken links** (§6.1): a link whose target doesn't
exist yet is not malformed — it may simply be knowledge not yet written.

A `raw/` capture is **not** cited as a body wiki-link. It's cited via
`sources[].resource` in a page's frontmatter (`../raw/<capture>.md`, §6.2's
own worked-example relative-path form) — wiki-links relate living `wiki/`
pages to each other; `sources` records provenance back to the immutable
tier.
