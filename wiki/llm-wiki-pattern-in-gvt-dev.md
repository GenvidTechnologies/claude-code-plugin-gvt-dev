# The LLM-Wiki Pattern in gvt-dev

How Karpathy's LLM-maintained-wiki pattern maps onto surfaces that already
existed in the gvt-dev plugin before `maintain-wiki` was built.

**Scope:** this page maps the LLM-wiki pattern specifically — the three-tier
`raw/` → `wiki/` → schema structure and the `ingest`/`query`/`lint` verbs —
onto gvt-dev's existing surfaces. It deliberately does **not** attempt the
plugin's overall design philosophy or the four-pillar practice-layer framing
(Spec / Verify / Environment / Moldable); that broader overview belongs in
issue #147's future `plugin/docs/design-philosophy.md`. Treat this page as
one pattern applied, not the plugin's design story.

## The pattern, briefly

Karpathy's proposal (see Sources) contrasts a maintained wiki with
retrieval-augmented generation: RAG re-retrieves from a static corpus and
forgets, while a wiki is rewritten by the agent as it learns, so knowledge
compounds session over session. The pattern has three tiers (immutable raw
captures, LLM-maintained pages + index + log, and a maintenance schema) and
three verbs (`ingest`, `query`, `lint`).

## What gvt-dev already had that maps onto it

Before `maintain-wiki` (#143) existed as its own skill, the plugin already
had pieces that play a similar role, though none of them were built with the
wiki pattern in mind:

- **`docs/TOC.md` ≈ the wiki's `index.md`.** Both are a single, curated
  entry point that lists what documentation exists and where to find it, so
  a reader (human or agent) doesn't have to rediscover the doc set from
  scratch. The difference: `docs/TOC.md` indexes curated, relatively stable
  reference docs; `wiki/index.md` indexes pages that churn as new sources are
  ingested.
- **ADRs (`docs/decisions/`) ≈ canonical curated pages — with a key lifecycle
  difference.** Both an ADR and a wiki page are a durable write-up of
  accumulated understanding on a topic. But an ADR is **immutable** once
  accepted — later changes get a new ADR that supersedes it, per this
  repo's own `docs/decisions/` convention — while a `wiki/` page is
  explicitly a **living** document: `docs/wiki-schema.md`'s create-vs-update
  rule says new facts about an existing topic update the page in place
  rather than spawning a new one. An ADR is a snapshot of one decision; a
  wiki page is the compounding record of everything known about one topic.
- **`run-retro` / `condense-lessons` ≈ the ingest+decay motion, in spirit.**
  `run-retro` extracts lessons from a session and `condense-lessons` folds
  accumulated lessons-learned entries into something more durable — both are
  a fold-new-material-into-existing-knowledge motion, which is what
  `ingest` formalizes for the `raw/` → `wiki/` tier. Per
  [ADR 0015](../docs/decisions/0015-maintain-wiki-design-boundaries.md),
  `ingest` is a distinct, thin verb rather than a rewrite of either skill:
  they operate on different tiers (the live session and
  `docs/lessons-learned.md`, respectively) and stay in place, gaining only an
  additive cross-reference to `ingest` as another durable home an extracted
  insight can land in.
- **`audit-conventions` content-scanners ≈ a proto-lint tier.** The hygiene
  scanners (`scanRetiredTokens`, `scanBrokenLinks`, `scanOrphanedDocs`)
  already check for exactly the kind of content-health issues the wiki
  pattern's `lint` verb is meant to catch — dead links, orphaned pages, stale
  tokens — just scoped to `docs/**` and `CLAUDE.md` rather than to `wiki/`.
  See [`audit-conventions` as proto-lint](audit-conventions-as-proto-lint.md)
  for the detail and where the boundary between the two now sits.

## Why this mapping matters

None of these surfaces were built as an LLM-wiki implementation — they
predate #143 and solve their own, narrower problems. The value of the
mapping is that it shows the pattern wasn't adopted wholesale from nothing:
`maintain-wiki` slots a genuinely new `raw/` → `wiki/` tier in next to
surfaces the plugin already had, rather than duplicating what `docs/TOC.md`,
ADRs, or the existing hygiene scanners already do well.

## Sources

- `raw/karpathy-llm-wiki-agent-memory.md` — the three-tier structure and
  three-verb (`ingest`/`query`/`lint`) split, and the "compounds vs.
  retrieves and forgets" framing used above.
- `raw/beyond-rag-llm-wiki-pattern.md` — the RAG-contrast framing and the
  point that maintenance discipline (schema + lint), not the markdown format
  alone, is what makes the pattern actually compound knowledge.

## Related

- [`audit-conventions` as proto-lint](audit-conventions-as-proto-lint.md) —
  the narrower, factual companion page on the existing hygiene scanners and
  where the `lint` verb boundary sits.
