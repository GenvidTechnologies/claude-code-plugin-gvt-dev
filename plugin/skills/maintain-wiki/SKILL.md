---
name: maintain-wiki
description: Maintains an LLM-wiki compounding-memory knowledge base for a project through three verbs — ingest (read immutable raw/ captures, write or update wiki/ pages, append wiki/log.md), query (answer a question from the wiki with citations, via the read-only wiki-librarian agent), and lint (advisory health check of an existing wiki — dead links, orphaned pages, staleness, optional raw/ immutability). Scaffolds the three-tier raw/wiki/schema layout on first use from bundled templates. Markdown-only — no vector DB, no retrieval engine — a wiki accumulates and compounds where RAG retrieves and forgets. Use when standing up a project knowledge wiki, ingesting sources into it, querying it, or checking its health.
metadata:
  expects:
    files:
      - path: docs/wiki-schema.md
        required: false
        reason: The wiki's maintenance-rules schema (page format, create-vs-update lifecycle, raw/ immutability, decay policy, verb contract); the skill offers to scaffold it from the bundled template if absent
      - path: docs/TOC.md
        required: false
        reason: The §0 scaffold step adds a one-line index entry for the scaffolded docs/wiki-schema.md when docs/TOC.md is present
    config:
      - key: wiki.wikiDir
        in: .gvt-agent.json
        required: false
        reason: The directory holding the wiki's pages, index, and log (defaults to wiki)
      - key: wiki.rawDir
        in: .gvt-agent.json
        required: false
        reason: The directory holding immutable source captures cited for provenance (defaults to raw)
      - key: wiki.decay
        in: .gvt-agent.json
        required: false
        reason: Optional staleness thresholds (e.g. staleAfterDays) that lint applies when flagging stale pages
    tools:
      - command: git
        required: false
        reason: Powers the optional raw/ immutability check in lint (git log --diff-filter=M against rawDir)
---

# Maintain Wiki

Maintain a project's **LLM-wiki**: a three-tier, markdown-only compounding-memory
knowledge base — `raw/` (immutable captured sources) → `wiki/` (LLM-maintained
pages, `index.md`, `log.md`) → `docs/wiki-schema.md` (the maintenance rules that
keep the first two in sync). No vector DB, no retrieval engine, no render step:
**a wiki accumulates and compounds; RAG retrieves and forgets.** The skill
exposes three verbs — `ingest`, `query`, `lint` — and scaffolds the layout on
first use.

## How the work splits

- **`query` → subagent.** Reading and synthesizing an answer runs in the
  read-only `gvt-dev:wiki-librarian` agent, off this thread, so the wiki's
  content never has to be pulled fully into the orchestrating conversation.
- **`ingest` writes → `gvt-dev:tech-writer`.** Authoring or updating a `wiki/`
  page is a write, dispatched to `tech-writer` under the single-writer-per-file
  discipline (see `condense-lessons` for the precedent) rather than performed
  ad hoc on this thread.
- **`lint` → here.** The health check reads across `wiki/` and (optionally)
  `raw/` history directly; it's advisory and read-only, so there's no
  write-safety reason to delegate it.

## 0. Preconditions & scope

1. **Resolve the wiki's directories** from the `wiki` block in `.gvt-agent.json`:
   `wikiDir` (default `wiki`), `rawDir` (default `raw`). These names are used
   throughout the rest of this skill.
2. **Probe for the three-tier layout:**
   - `<wikiDir>/` and `<rawDir>/` directories
   - `<wikiDir>/index.md` and `<wikiDir>/log.md`
   - `docs/wiki-schema.md`

   **If any piece is absent, offer to scaffold it** from the bundled templates
   — do not guess conventions:
   - `${CLAUDE_PLUGIN_ROOT}/skills/maintain-wiki/wiki-schema.template.md` →
     `docs/wiki-schema.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/maintain-wiki/wiki-index.template.md` →
     `<wikiDir>/index.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/maintain-wiki/wiki-log.template.md` →
     `<wikiDir>/log.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/maintain-wiki/raw-readme.template.md` →
     `<rawDir>/README.md`

   Interactively, **offer** the scaffold (`AskUserQuestion`); in
   `--non-interactive`, scaffold **automatically**. **This step is idempotent**:
   re-running it only creates the pieces that are still missing — a directory,
   file, or index entry already present is left untouched and skipped silently.
   A partially-scaffolded wiki (e.g. `wiki/` exists but `docs/wiki-schema.md`
   doesn't) is a normal, supported state, not an error.

   **Index the scaffolded schema doc in `docs/TOC.md`.** After copying
   `wiki-schema.template.md` to `docs/wiki-schema.md`, add a one-line entry for
   it to `docs/TOC.md` under a **Knowledge Base** heading (create the heading
   if absent) — mirroring how `plan-task` indexes a scaffolded `docs/decisions/`
   record and `triage-issues` indexes `docs/issue-triage.md`. An unindexed
   contract doc is invisible to the skills that discover docs via the index.
   Interactively, **offer** it; in `--non-interactive`, add it **automatically**.
   Make it **idempotent** (skip if the entry already exists) and **skip
   gracefully if `docs/TOC.md` is absent** — the doc still exists and works,
   it's just undiscoverable through the index.
3. **Confirm mode:** interactive by default. `--non-interactive` (alias
   `--auto`) runs unattended, applying the scaffold and TOC index automatically
   per the rules above.
4. **Resolve the verb.** The user (or dispatching skill/command) names one of
   `ingest`, `query`, `lint`. If none is given, ask which is wanted — the three
   verbs have different inputs and safety profiles, so don't guess.

## `ingest`

The wiki tier's ingest motion: turn durable insight — freshly captured, or
already sitting in `<rawDir>/` — into compounding `wiki/` content.

1. **Gather what's being ingested.** This can be: the current session's
   insight(s) handed in directly, a specific source or insight named by the
   caller, or one or more files already captured under `<rawDir>/` that
   haven't been ingested yet (cross-reference `<wikiDir>/log.md` to find
   which `<rawDir>/` files have no corresponding log entry).
2. **Resolve the target page** using the create-vs-update rule in
   `docs/wiki-schema.md`'s "Page lifecycle" section: a genuinely new topic
   gets a new page under `<wikiDir>/<topic-slug>.md`; new facts about a topic
   already covered get folded into the existing page in place — never a
   second thin page for the same topic.
3. **Dispatch `gvt-dev:tech-writer`** to author (new page) or update
   (existing page) per the page format and lifecycle rules in
   `docs/wiki-schema.md`, add a new page to `<wikiDir>/index.md`, and append
   one entry per source to `<wikiDir>/log.md`. Keep the single-writer-per-file
   discipline: one `tech-writer` dispatch owns a given page for that run.
4. **Report** what was created/updated and the log entries appended.

**This is a new, thin verb — it does not replace or rewrite `run-retro` or
`condense-lessons`.** Those remain the session-retro and lessons-doc ingest
surfaces respectively; `ingest` is the wiki tier's own entry point, and
`condense-lessons` already cross-references it as one durable home an
extracted insight can land in.

## `query`

1. Resolve `<wikiDir>`/`<rawDir>` (§0 step 1).
2. **Dispatch `gvt-dev:wiki-librarian`** with the question and the resolved
   paths. The agent is read-only: it consults `<wikiDir>/index.md`, reads the
   relevant page(s), traces provenance into `<rawDir>/` when needed, and
   returns one structured, cited answer (see the agent's Output Format).
3. **Present the agent's answer** as returned — this skill routes the query,
   it doesn't re-synthesize or second-guess the librarian's citations.
4. If the librarian reports the wiki can't answer, say so plainly rather than
   falling back to general knowledge, and suggest an `ingest` if a relevant
   source exists.

## `lint`

An **advisory**, on-demand content-health check of an existing wiki — it never
mutates anything. Checks, run against `<wikiDir>/` (and optionally `<rawDir>/`):

- **Dead wiki-links** — a `Related` link (or inline wiki-link) pointing at a
  `<wikiDir>/` page that doesn't exist.
- **Orphaned pages** — a page under `<wikiDir>/` not listed in
  `<wikiDir>/index.md`.
- **Stale pages** — pages whose `Sources`/last-touched signal exceeds the
  optional `wiki.decay` thresholds (e.g. `staleAfterDays`) from
  `.gvt-agent.json`, per the decay policy documented in `docs/wiki-schema.md`.
  Without a configured threshold, this check is judgment-based rather than
  numeric — flag candidates, don't invent a default cutoff.
- **`raw/` immutability (optional)** — `git log --diff-filter=M -- <rawDir>/`
  to flag any file under `<rawDir>/` that has been modified after its initial
  commit (a `raw/` file should only ever be added or re-captured as a new
  file, never edited in place — see `docs/wiki-schema.md`). Skipped gracefully
  if `git` isn't available or the repo has no history for the path.

Report findings as a list; `lint` never fixes anything itself — a finding that
warrants a fix is a candidate for a follow-up `ingest` or a manual edit.

**`lint` no-ops gracefully when `<wikiDir>/` is absent** — there's nothing to
check, so it reports that no wiki exists yet (pointing at §0's scaffold) rather
than erroring.

**`lint` is never invoked from `audit-conventions`.** It is a `maintain-wiki`
skill verb only, run on demand by the user or a dispatching skill — it is not
wired into `audit.mjs` and must not be. This keeps a consuming repo's audit
exit code independent of wiki content health (a wiki-content problem is not a
plugin-contract violation), and respects the boundary with the audit's own
wiki *detection/migration* scope (a separate concern, tracked under #146):
`audit-conventions` may one day detect that a repo has a wiki and offer to
migrate its scaffold, but it does not — and will not — run `lint`'s content
checks itself.
