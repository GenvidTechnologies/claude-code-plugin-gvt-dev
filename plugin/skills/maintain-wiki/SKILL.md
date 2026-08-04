---
name: maintain-wiki
description: Maintains an LLM-wiki compounding-memory knowledge base for a project through three verbs — ingest (read immutable raw/ captures, write or update <wikiDir>/ pages, append <wikiDir>/log.md), query (answer a question from the wiki with citations, via the read-only wiki-librarian agent), and lint (advisory health check of an existing wiki — dead links, orphaned pages, staleness, out-of-bundle links, optional raw/ immutability). Scaffolds the three-tier raw/wiki/schema layout on first use from bundled templates. Markdown-only — no vector DB, no retrieval engine — a wiki accumulates and compounds where RAG retrieves and forgets. Use when standing up a project knowledge wiki, ingesting sources into it, querying it, or checking its health.
metadata:
  expects:
    files:
      - path: docs/wiki-schema.md
        required: false
        reason: The wiki's maintenance-rules schema (page format, create-vs-update lifecycle, raw/ immutability, staleness policy via stale_after, verb contract); the skill offers to scaffold it from the bundled template if absent
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
    tools:
      - command: git
        required: false
        reason: Powers the optional raw/ immutability check in lint (git log --diff-filter=M against rawDir)
---

# Maintain Wiki

Maintain a project's **LLM-wiki**: a three-tier, markdown-only compounding-memory
knowledge base — `raw/` (immutable captured sources) → `<wikiDir>/` (LLM-maintained
pages, `index.md`, `log.md`) → `docs/wiki-schema.md` (the maintenance rules that
keep the first two in sync). No vector DB, no retrieval engine, no render step:
**a wiki accumulates and compounds; RAG retrieves and forgets.** The skill
exposes three verbs — `ingest`, `query`, `lint` — and scaffolds the layout on
first use.

## How the work splits

- **`query` → subagent.** Reading and synthesizing an answer runs in the
  read-only `gvt-dev:wiki-librarian` agent, off this thread, so the wiki's
  content never has to be pulled fully into the orchestrating conversation.
- **`ingest` writes → `gvt-dev:tech-writer`.** Authoring or updating a `<wikiDir>/`
  page is a write, dispatched to `tech-writer` under the single-writer-per-file
  discipline (see `condense-lessons` for the precedent) rather than performed
  ad hoc on this thread.
- **`lint` → here.** The health check reads across `<wikiDir>/` and (optionally)
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
   A partially-scaffolded wiki (e.g. `<wikiDir>/` exists but `docs/wiki-schema.md`
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
already sitting in `<rawDir>/` — into compounding `<wikiDir>/` content.

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
   `docs/wiki-schema.md`. The **same** dispatch also owns the two bookkeeping
   writes for that run — registering a new page in `<wikiDir>/index.md` and
   appending one entry per source to `<wikiDir>/log.md` — so the page and its
   index/log entries land as one consistent unit. Keep the
   single-writer-per-file discipline: one `tech-writer` dispatch owns the page,
   the index, and the log for a given run; don't parallelize two ingests that
   both touch `index.md`/`log.md`.
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

- **Dead wiki-links** — a `## Related` link (or inline wiki-link) pointing at
  a `<wikiDir>/` page that doesn't exist. (`## Related` is **this page
  format's** own section, not one of OKF §4.2's conventional headings — don't
  look for a spec section blessing the name.) Resolve link targets as §6.1
  specifies, against the bundle root:
  - **`/other-page.md`** — *bundle-absolute*: resolve against `<wikiDir>/`,
    **not** the filesystem root. §6.1 recommends this form, so a naive
    resolver that treats it as filesystem-absolute is the failure to avoid.
  - **`./x.md`, `x.md`, `../<subdir>/x.md`** — ordinary relative: resolve
    against the linking page's own directory.
  - Skip external URLs (`http:`, `https:`, `mailto:`) and bare `#anchor`
    fragments — neither is a wiki-link.

  A resolved target that lands **outside** `<wikiDir>/` is not a dead link —
  see the out-of-bundle check below. Broken links are **advisory only**
  (§6.1: a link may point at knowledge not yet written) — never a rejection.
- **Out-of-bundle links (advisory)** — a link whose resolved target escapes
  `<wikiDir>/` (e.g. `../docs/decisions/…`). Legal per §6.1 and resolvable on
  local disk — so a plain dead-link check passes it silently — but
  **unresolvable to an external OKF consumer** that receives only the bundle.
  Report it as a note, not a defect: the schema doc calls this a deliberate,
  documented trade-off for the rare page that must point outside the bundle,
  not a pattern to reach for by default.
- **Orphaned pages** — a concept page under `<wikiDir>/` (at any depth) listed
  in **no** index. Candidates are `<wikiDir>/**/*.md` **minus `index.md` and
  `log.md` at any level** — the same reserved-file exclusion the conformance
  walk uses, so `lint` and the mechanical checker agree on the page set.
  A page counts as listed if it appears in `<wikiDir>/index.md` **or** in the
  `index.md` of its own subdirectory (§8 contemplates subdirectory indexes;
  those carry **no** frontmatter — only the bundle-root index may carry
  `okf_version`).
  Separately (also advisory): a `<wikiDir>/<subdir>/index.md` that is itself
  not linked from `<wikiDir>/index.md` — an unreachable subtree, which the
  per-page rule above would otherwise miss.
  **If `<wikiDir>/index.md` is absent, skip this check entirely** and report a
  single informational note that no bundle-root index exists (§0 can scaffold
  one). §11 forbids rejecting a bundle for a missing `index.md`, and reporting
  every page as an orphan would be a rejection in all but name.
- **Stale pages** — pages whose frontmatter `stale_after` date has passed
  (`today >= stale_after`), per the staleness policy documented in
  `docs/wiki-schema.md`. Without a declared `stale_after`, this check is
  judgment-based rather than numeric — flag candidates, don't invent a
  default cutoff.
- **`raw/` immutability (optional)** — `git log --diff-filter=M -- <rawDir>/`
  to flag any file under `<rawDir>/` that has been modified after its initial
  commit (a `raw/` file should only ever be added or re-captured as a new
  file, never edited in place — see `docs/wiki-schema.md`). `<rawDir>/` is
  **outside** the OKF bundle — the bundle root is `<wikiDir>/` — so this check
  is a local convention of this three-tier layout, **not** an OKF requirement.
  Skipped gracefully if `git` isn't available or the repo has no history for
  the path.

Report findings as a list; `lint` never fixes anything itself — a finding that
warrants a fix is a candidate for a follow-up `ingest` or a manual edit.

**`lint` no-ops gracefully when `<wikiDir>/` is absent** — there's nothing to
check, so it reports that no wiki exists yet (pointing at §0's scaffold) rather
than erroring.

**What `lint` may never reject on.** The wiki bundle is OKF v0.2; `lint` reads
it as an OKF **consumer**, so §11's consumer clauses bound it. A conformant
consumer **MUST NOT** reject a bundle for:

1. missing optional frontmatter fields;
2. **missing any optional family** (§5.3 — e.g. no `verified` block at all);
3. an unknown `type` value;
4. unknown additional frontmatter keys;
5. broken cross-links (§6.1 — a link may simply be knowledge not yet written);
6. a missing `index.md`.

…and **MUST** treat a bare `verified` mapping as a one-element list. §11
further **SHOULD**s that trust tiers and staleness be derived **only** from the
fields specified in the spec — so a *mechanical* staleness verdict comes from
`stale_after` alone (never file mtime, never an invented default cutoff). An
LLM-mode judgment flag stays legal precisely because it refuses to compute a
cutoff and is labelled a candidate rather than a "stale" determination.

`docs/wiki-schema.md`'s **"Tolerated, never rejected"** paragraph is the page
format's own statement of these same clauses; **this** block is the binding one
for `lint` and for the mechanical checker (#150).

**Advisory is not rejection.** Reporting an orphan, a dead link, or an
out-of-bundle link is fully conformant — §11 bounds what a consumer may
*reject a bundle for*, and `lint` rejects nothing: it never fails, never
refuses to read a page, never exits non-zero. **This is the bound on the
mechanical checker (#150):** it may *report* any of the six cases above, but
must never turn one into an error, a hard failure, or a non-zero exit — and if
it offers an opt-in strict/exit-code mode, a §11-tolerated finding must not be
what fails it. A consuming repo may hold itself to a stricter *local* policy in
its own `docs/wiki-schema.md`; that is project policy, never an OKF requirement
and never a plugin default.

**Boundary with #150 — `lint` does not check §11.1–11.2 conformance.** Whether
every non-reserved `.md` under `<wikiDir>/` (at any depth, excluding `index.md`
and `log.md` at any level) carries parseable frontmatter with a non-empty
`type` is the **mechanical checker's** walk, not this verb's. It is
deliberately deferred, not forgotten: skill-mode `lint` owns the checks listed
above; #150 owns the conformance walk and inherits the constraint stated here.
Neither side should assume the other already does it.

**`lint` is never invoked from `audit-conventions`.** It is a `maintain-wiki`
skill verb only, run on demand by the user or a dispatching skill — it is not
wired into `audit.mjs` and must not be. This keeps a consuming repo's audit
exit code independent of wiki content health (a wiki-content problem is not a
plugin-contract violation), and respects the boundary with the audit's own
wiki *detection/migration* scope (a separate concern, tracked under #146):
`audit-conventions` may one day detect that a repo has a wiki and offer to
migrate its scaffold, but it does not — and will not — run `lint`'s content
checks itself.
