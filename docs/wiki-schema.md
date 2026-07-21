# Wiki Maintenance Schema

> Project conventions consumed by `/gvt-dev:maintain-wiki`. This is the
> **maintenance schema** for this repo's three-tier wiki: `raw/` (immutable
> captured sources) → `wiki/` (LLM-maintained pages, `index.md`, `log.md`) →
> this schema (the rules that govern how the first two are kept in sync).

## What this wiki is

This is the gvt-dev plugin repo's own compounding knowledge base about **its
own practice** — how the plugin is built, why its conventions ended up the
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

## Page format

Every page under `wiki/` is a single Markdown file and follows this shape:

```markdown
# <Page title>

<One-line summary — the single sentence you'd say if asked "what is this page about?">

<Body — the accumulated knowledge on this topic, in prose, lists, or tables as fits>

## Sources

- `raw/<file>` — <what this source contributed>
- `raw/<file>` — <what this source contributed>

## Related

- [<Other page title>](<other-page>.md) — <why it's related>
```

- **Title** — one `#` heading, matching the page's `index.md` entry.
- **Summary** — exactly one line, immediately under the title. This is what
  gets surfaced in `index.md` and in query results, so keep it accurate and
  current even when the body grows.
- **Body** — the substance. No fixed structure beyond the summary and the
  closing `Sources`/`Related` sections; use whatever prose/list/table shape
  fits the topic.
- **Sources** — every `raw/` file this page draws from, with a short note on
  what it contributed. This is the provenance trail back to the immutable
  tier; it's what makes a page's claims checkable and re-ingestable.
- **Related** — wiki-links (see below) to other `wiki/` pages this one
  connects to. Optional if the topic is genuinely standalone.

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
  summary line if the topic's shape has changed, and refresh the `Sources`
  section. Append an entry to `wiki/log.md` either way.

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

**Decay is defined but not enforced here.** The `wiki.decay` key exists in
the config schema (see `plugin/CONVENTIONS.md`'s `wiki` block) as an optional
threshold a repo *can* set — but this repo's own `.gvt-agent.json` `wiki`
block deliberately omits it. There is no automation in this repo (or in the
`maintain-wiki` skill as shipped) that reads a staleness threshold and flags
pages on its own; `lint` can surface candidates by inspection, but deciding
what counts as stale is a judgment call the maintainer applies by hand each
time, not an engine running on a schedule.

This is a deliberate honesty choice for the dogfood: don't imply a decay
*capability* this repo doesn't actually have. If a numeric threshold is ever
wanted, it would be added under `wiki.decay` in `.gvt-agent.json` and
documented here — until then, treat every page's `Sources` dates as the only
freshness signal, reviewed by eye.

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
  wiki-links (a `Related` link to a page that no longer exists), pages
  orphaned from `wiki/index.md` (a page not listed in the index), `raw/`
  mutations (a `raw/` file that has been edited rather than re-captured), and
  stale pages per the (manual) decay policy above.

## Wiki-links

Relate pages to each other with ordinary intra-wiki Markdown links —
`[<title>](<other-page>.md)` — inside the `Related` section of a page (or
inline in the body, where a specific claim points at another page). Keep link
targets relative to `wiki/` so they resolve the same way the pages are read.
