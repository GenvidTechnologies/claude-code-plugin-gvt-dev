# Capture: Beyond RAG — How Karpathy's LLM Wiki Pattern Builds Knowledge That Compounds

- **Source:** https://levelup.gitconnected.com/beyond-rag-how-andrej-karpathys-llm-wiki-pattern-builds-knowledge-that-actually-compounds-31a08528665e
- **Captured:** 2026-07-21
- **Immutable capture — do not edit; re-capture as a new file if the source changes.**

## Summary capture — not a full scrape

This is a faithful, attributed summary of the article's key claims plus a
handful of short quotes, prepared as the immutable-source citation for
this repo's wiki (see `docs/wiki-schema.md`). It is not a verbatim mirror
of the piece; consult the source URL above for the complete text.

## Core ideas captured

**RAG's retrieve-and-forget limit.** The article's starting point is a
critique of retrieval-augmented generation as commonly deployed: a vector
database of chunked documents is queried per-request, the most similar
chunks are stuffed into context, and the answer is produced — but nothing
learned in that exchange is written back anywhere. Every query starts
from the same static corpus; the system has no way to accumulate
judgment, corrections, or synthesis across sessions. The article's framing
of this contrast, echoing Karpathy, is that:

> RAG retrieves and forgets; a wiki accumulates and compounds.

**The LLM-wiki pattern as the alternative.** Instead of (or alongside)
retrieval over a static corpus, the article describes letting an LLM
agent maintain a small, plain-markdown wiki as its actual working memory:
the agent reads relevant pages before acting, and — critically — writes
back to those pages (or creates new ones) as part of its normal workflow,
the same way a human team keeps a living internal wiki up to date rather
than re-deriving institutional knowledge from raw notes every time.

**Maintenance discipline is the hard part.** The article emphasizes that
the pattern only compounds knowledge if the *maintenance* is disciplined:
pages need a consistent format, an index needs to stay accurate so pages
are actually findable, stale or superseded material needs to be pruned or
flagged rather than left to accumulate as noise, and a log of changes
keeps the wiki's evolution auditable. Without that discipline, a
"maintained" wiki degrades into the same kind of stale, hard-to-trust
corpus that RAG systems already suffer from — the compounding property
comes from the upkeep, not from the format alone.

**Why markdown, not a vector database.** A repeated point in the article
is that the pattern deliberately avoids any dedicated retrieval
infrastructure (embeddings, a vector store, a search index): the wiki is
plain markdown files an LLM can read, write, and reason about directly
using the same tools it already has for any other text file. That
simplicity is treated as a feature, not a limitation — it keeps the
knowledge base transparent, diffable, version-controlled, and directly
editable by both humans and agents, with no separate infrastructure to
keep in sync with the source of truth.

## Why this repo captured it

Cited alongside the companion article
(`raw/karpathy-llm-wiki-agent-memory.md`) in issue #143 as the source for
the `maintain-wiki` skill's design rationale — particularly the
markdown-only, no-vector-DB decision and the emphasis on maintenance
discipline (schema + lint) as what actually makes the wiki compound
rather than merely a wiki existing.
