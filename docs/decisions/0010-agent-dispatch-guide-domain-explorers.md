# 0010. Agent-Dispatch-Guide for domain-specific explorers

- **Status:** accepted
- **Date:** 2026-06-17
- **Issue:** #83

## Context

Retroactive record. The [analyst → designer → planner
pipeline](0004-agent-pipeline-with-user-checkpoints.md)'s Phase 1 always dispatched the
generic `genvid-dev:analyst`. But a domain-specific task — e.g. a Construct 3 event-sheet
migration — needs the domain's MCP tools that the generic analyst lacks, so its recon comes
back shallow. Consuming repos that ship their own domain explorer (e.g.
`genvid-c3:c3-explorer`) had no way to tell `plan-task` to prefer it.

## Decision

A consuming repo MAY name its domain-specific recon agent(s) under an optional **`Agent
Dispatch Guide`** section in `CLAUDE.md`. `plan-task` Phase 1 **prefers** the named explorer
for domain-specific recon and **falls back** to `genvid-dev:analyst` for general tasks or
when no guide is present. The convention is documented in `CONVENTIONS.md` as an optional
expected section.

Architecture: domain knowledge stays in the consuming repo's own agent (with its own MCP
tools), while the generic pipeline stays domain-agnostic; the dispatch decision is data in
`CLAUDE.md`, not a hardcoded branch. Optional, so the audit's aggregated contract isn't
widened — repos without the section silently keep the analyst.

## Compromise

Alternatives rejected:

- **Bake domain assumptions into the generic analyst** — couples the framework to one
  domain and loses portability.
- **Always use the generic analyst** — analysis quality drops for specialized codebases
  whose tools it can't reach.

The cost: a third optional `CLAUDE.md` section for a repo to maintain, and Phase 1 logic
that must probe for the guide before dispatching.

## Consequences

A backward-compatible refinement of the pipeline — existing repos are unaffected by the
fallback. Shipped in v3.4.0 alongside the ADR-dating guidance that shaped how *this* backfill
chose its dates. `genvid-c3:c3-explorer` is the reference domain explorer the guide points to.
