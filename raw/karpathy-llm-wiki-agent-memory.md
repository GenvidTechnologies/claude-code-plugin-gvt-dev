# Capture: Karpathy's LLM Wiki as Agent Memory

- **Source:** https://aaif.io/blog/karpathys-llm-wiki-as-agent-memory/
- **Captured:** 2026-07-21
- **Immutable capture — do not edit; re-capture as a new file if the source changes.**

## Summary capture — not a full scrape

This is a faithful, attributed summary of the article's key claims plus a
handful of short quotes, prepared as the immutable-source citation for
this repo's wiki (see `docs/wiki-schema.md`). It is not a verbatim mirror
of the piece; consult the source URL above for the complete text.

## Core ideas captured

**The wiki as agent memory.** The article frames Andrej Karpathy's proposal
for an LLM-maintained wiki as a form of durable, external memory for an
agent — a place where an agent (or a team of agents working over many
sessions) writes down what it has learned so that future sessions don't
have to rediscover it. The framing the article repeats, attributed to
Karpathy, is roughly:

> "a wiki accumulates and compounds, [while] RAG retrieves and forgets."

**Three-tier structure.** The pattern the article describes organizes the
wiki into three tiers:

1. **Raw/immutable sources** — the original material an agent ingests
   (transcripts, articles, decisions, logs), captured once and never
   edited afterward. Later disagreements are resolved by re-capturing,
   not by rewriting history.
2. **Maintained wiki pages + an index + a log** — the living, agent-edited
   layer: individual topic pages, a top-level index that lets an agent (or
   a human) find the right page quickly, and a log recording what changed
   and when, so the wiki's own history is auditable.
3. **A schema of maintenance rules** — a small, explicit contract
   (page format, when to create vs. update a page, when a page is stale
   enough to prune) that keeps the wiki's growth disciplined rather than
   accumulating cruft indefinitely.

**Three verbs.** The article characterizes the agent's interaction with
the wiki through three operations:

- **ingest** — folding new material (a session's findings, a decision, a
  retro) into the wiki, updating or creating pages as warranted.
- **query** — reading the wiki to answer a question or ground a task,
  without mutating it.
- **lint** — checking the wiki's own health: broken links, orphaned pages,
  stale content, schema violations.

**The compounding thesis.** The article's central contrast is between this
wiki pattern and retrieval-augmented generation (RAG): a RAG system
re-retrieves relevant chunks from a static corpus on every query and
discards them once the answer is produced — nothing about the corpus
itself gets better over time. A maintained wiki, by contrast, is rewritten
by the agent as it learns, so each session can leave the memory in a
slightly better state than it found it — knowledge compounds instead of
being retrieved and forgotten.

## Why this repo captured it

Cited in issue #143 as the founding source for the `maintain-wiki` skill's
three-tier `raw/` → `wiki/` → schema design and its `ingest`/`query`/`lint`
verb split.
