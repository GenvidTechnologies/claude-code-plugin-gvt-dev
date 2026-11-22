---
name: run-retro
description: Analyzes the current session for patterns, pain points, missing documentation, and workflow gaps, then proposes concrete updates to CLAUDE.md, project docs, skills, agents, hooks, or the genvid plugin itself. Use at the end of a session that produced useful lessons, after merging a significant PR, or whenever the user wants to capture what worked and what didn't.
metadata:
  expects:
    files:
      - path: CLAUDE.md
        required: false
        reason: Read to identify which project-specific guidance already exists and what's missing
      - path: docs/TOC.md
        required: false
        reason: Used to surface which documentation files exist and could be updated
---

# Run Retrospective

Analyze the current session to identify improvements for documentation and processes.

## 0. Project-Specific Pre-Conditions

Some projects have multi-phase workflows or initiative tracking that need a specific cleanup step before the retro is meaningful (e.g., flipping a phase row in an initiative doc). If the project's `CLAUDE.md` documents such pre-conditions for retros, satisfy them first. Otherwise proceed.

## 1. Session Analysis

Review the conversation and identify:

- **Patterns discovered** — new coding patterns or conventions learned this session
- **Pain points** — where confusion or friction occurred
- **Repeated questions** — context that was asked for multiple times
- **Missing documentation** — information that would have shortened the session
- **Workflow gaps** — manual steps that could be automated (skills, hooks, scripts)

**In the plugin repo, verify every finding against source before proposing it.** The skills and agents you just exercised ran from the **installed cache** (`~/.claude/plugins/cache/…/<version>/`), which lags `plugin/` between releases — so friction you observed may already be fixed. Before writing up any skill/agent finding, read the **working-tree** `plugin/skills/<name>/SKILL.md` or `plugin/agents/<name>.md` — not the text you were invoked with — and drop the finding if source already addresses it. Compare `plugin/.claude-plugin/plugin.json`'s `version` against the newest release tag (`git tag -l 'v*' | sort -V | tail -1`) to gauge whether a gap is even possible: equal means cache and source agree; ahead means every observation is suspect. **When a finding survives the check, record the source version it was verified against** (the commit sha and the `plugin.json` `version`), so a later reader can tell a stale proposal from a live one. Do not add a release state such as "unreleased" or a branch name such as "the integration branch": both go stale when the release ships, and triage then corrects the issue body.

The stakes exceed a wasted cycle: source may have been rewritten into wording *stricter* than your finding proposes, so adopting it verbatim would be a **regression**, not a no-op — and a retro-authored issue carries retro authority into triage and planning. (Sibling to the plugin-repo note in §2: that one scopes *which files* a plugin-repo retro edits; this one gates *whether a finding is real* before it's written up. Both are plugin-repo-conditional — a consuming-repo retro is unaffected, since there the plugin genuinely is an upstream dependency.)

## 2. Documentation Improvements

Start from the documentation index (the file that `CONVENTIONS.md` "Runtime path resolution" resolves for `docs/TOC.md`) and the repo's `CLAUDE.md`. Resolve the index before you look for it. The **docs root** is the directory that holds the documentation index, for example `wiki/` when the documentation index is `wiki/index.md`. It is the root that `audit-conventions` walks. When the documentation index is at the repo root (for example `INDEX.md`), the docs root is `docs/`, so the glob below does not walk the whole repository.

**If the documentation index is absent** (a greenfield consumer that hasn't scaffolded the contract), don't dead-end — discover the doc surface directly instead: glob `<docs root>/**/*.md`, and read `CLAUDE.md` and `CONVENTIONS.md` at the repo root. The index is a shortcut to the docs, not a precondition for the retro.

For each doc that's adjacent to what this session worked on, decide:

- Does it need a correction (something was wrong)?
- Does it need an addition (something missing)?
- Does it need a clarification (something ambiguous)?

Common files to check (vary by project — consult the documentation index, or the glob above when there's no index):

- `CLAUDE.md` — project-specific facts the plugin's skills reference
- the architecture doc — system architecture and component boundaries
- the design-patterns doc — design patterns and conventions
- the coding-conventions doc — naming, style, language-specific patterns
- the runbook — operations procedures
- the lessons-learned doc — accumulated insights, if the project keeps one

`CLAUDE.md` is at a fixed path. The other five are the project's own docs, so their location is the project's choice: find each one through the documentation index, not at a fixed path. They are commonly at `docs/architecture.md`, `docs/design-patterns.md`, `docs/coding-conventions.md`, `docs/runbook.md` and `docs/lessons-learned.md`. A repo that keeps its docs in a wiki can have them under `<wikiDir>/` (`wiki.wikiDir` in `.gvt-agent.json`, default `wiki`), under other names. Look at those common locations only when there is no index, or when the index lists no such doc. Find the lessons-learned doc the way `condense-lessons` §1 does: look in the documentation index first; when the index lists none, check the common paths, then ask the user. A file missing at `docs/lessons-learned.md` does not show that the project keeps no lessons-learned doc. One repo keeps it at `wiki/session-history.md`, listed in its index.

**Running the retro inside the plugin repo itself?** Then the plugin *is* the repo, not an upstream dependency — the "documentation" a retro updates is the contract and the components themselves: `plugin/CONVENTIONS.md`, `CLAUDE.md` and the `wiki/maintainer/` pages its `## Knowledge base` list routes to, `plugin/docs/development-principles.md`, and the `plugin/skills/*/SKILL.md` / `plugin/agents/*.md` bodies. A lesson that refines a rule already on a `wiki/maintainer/` page is edited on that page, not added back to `CLAUDE.md`. Treat the "Genvid plugin" subsection in §3 as the *primary* target rather than a separate upstream PR, and skip the consuming-repo-only files (`docs/architecture.md`, etc.) that don't apply.

## 3. Claude Configuration Improvements

Consider enhancements at each layer:

### Project-local `.claude/`

- New skill needed for a repeated workflow specific to this project?
- Project-local agent for a specialized review?
- Settings changes (permissions to auto-allow, files to protect)?
- Hooks for workflows that should run automatically (pre-commit, post-edit)?

### Auto-memory

Auto-memory captures preferences and patterns Claude discovers across sessions. If a correction kept recurring this session, the underlying preference should be saved as a feedback memory. If a project-state observation kept being re-derived, save it as a project memory.

### Genvid plugin

If a skill improvement applies to **all consuming repos** (not just this one), it should be made in the `genvid` plugin, not the project-local `.claude/`. Examples:

- A skill body is missing a step that every project would benefit from
- A new shared skill is needed for a workflow common across repos
- An expectation declaration should be tightened or relaxed
- `CONVENTIONS.md` itself needs a refinement

When you file such an issue against the plugin's repository, write every reference to an issue or pull request of this repository in full, as `owner/repo#N`. On the plugin's tracker, a bare `#N` names the plugin's own issue `#N`. Its triage reference check reads it that way, so a bare reference on a `Blocked by` line can block the issue on an unrelated open issue. A quoted body inside a code block can stay as it was.

When the filed change must wait for another issue, for example a change in another plugin that must reach that plugin's default branch first, write the wait as a `Blocked by owner/repo#N` line. The reference check reads a wait stated in prose, such as "land no earlier than", as no blocker, so the issue reads as ready. Before you file, wrap the draft as a JSON object (`number`, `title`, `body`, `comments: []`) in a scratch file and run `node ${CLAUDE_PLUGIN_ROOT}/skills/triage-issues/scripts/issue-refs.mjs extract --single <file> --repo <owner/repo>`, with the tracker's own repository as `--repo`. Check the repository and the relation of each reference it prints. A bare `#N` that it reads as the tracker's own issue, or a wait with no `blocked-by` reference, is a defect in the draft.

Note the change as a proposed plugin PR and follow the workflow in the plugin repo's CONTRIBUTING/README.
If the repo maintains a wiki (a schema doc resolves: `paths['docs/wiki-schema.md']`, else `<wikiDir>/schema.md`, else `docs/wiki-schema.md`, the order `CONVENTIONS.md` defines), `/gvt-wiki:maintain-wiki ingest` (the gvt-wiki plugin) is the wiki tier's ingest — route durable, compounding insights there instead of (or alongside) a structured doc.

## 4. Output Format

```markdown
## Documentation Updates

### <filename>
- What to add/change
- Why it helps

## Claude Configuration Updates

### New skill: /<scope>:<name>
- Purpose
- Key instructions

### Settings change
- What to add to allow/deny/ask, and why

### New hook
- Event trigger
- What it should do

### Auto-memory
- What to save as user / feedback / project memory, with the why

### Genvid plugin
- Specific file in the plugin to change, with the rationale
```

## 5. Implementation

For each improvement:

1. **Prioritize** — high impact + low effort first
2. **Draft changes** — write the actual content
3. **Review** — ensure consistency with existing docs
4. **Commit** — follow the project's commit format from `CLAUDE.md`

---

**Ask the user which improvements they want to implement.** Don't apply everything by default — the retro produces proposals, the user approves them.

## Writing style

**Write technical text in the gvt-dev writing style.** Use short, direct sentences. Give each component one name and use it every time. Keep what you observed apart from what you infer and from what you checked. Put one action in each procedural step. Keep every condition, warning and statement of uncertainty. Say what each check can establish. Do not invent a measurement or a diagnosis. Text that ships (a doc, a code comment, a test name, a commit, an issue or PR body) is written in its own voice: it carries no instruction to its writer and no plan task id such as "T3". The style is inspired by ASD-STE100 and is not compliance with it. The full rules are in `${CLAUDE_PLUGIN_ROOT}/docs/writing-style.md`.
