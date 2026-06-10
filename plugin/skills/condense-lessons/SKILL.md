---
name: condense-lessons
description: Extracts reusable insights from verbose session entries in the project's lessons-learned doc into structured project docs, then condenses each fully-extracted session entry to a brief Task/Outcome/Key-insights format. Use when the lessons-learned doc has grown large with verbose session-by-session entries that should be distilled into permanent reference material.
metadata:
  expects:
    files:
      - path: docs/TOC.md
        reason: Used to identify which structured doc each insight belongs in
      - path: CLAUDE.md
        required: false
        reason: Read for the project's commit format
---

# Condense Lessons Learned

Extract insights from verbose session entries in the project's lessons-learned doc into the appropriate structured docs, then condense each fully-extracted session to a brief format.

**Convention dependency:** this skill assumes the project keeps a lessons-learned doc that accumulates session-by-session insights (often at `docs/lessons-learned.md`). If the project doesn't use one, this skill doesn't apply.

## Scaling to a large backlog

The steps below read as a single sequential pass. That's fine for a handful of sessions, but a doc with **many** verbose entries (dozens or more) is slow and context-heavy done serially — parallelize, with two rules that keep writes safe (see `superpowers:dispatching-parallel-agents` for the fan-out pattern):

- **Condensing (step 5): fan out, but keep one writer.** Dispatch agents that **return** the condensed text for a *slice* of sessions; the orchestrator assembles the results and **writes the lessons-learned file once**. Concurrent writers to the same file race and clobber each other — a single writer avoids it.
- **Extraction (step 4): partition agents by target file — one owner per file.** When dispatching `genvid-dev:tech-writer` agents to edit structured docs, give each agent **exclusive ownership of its target doc(s)**. Two agents editing the same doc concurrently can lose edits. Avoid "use doc X if a topic fits" fallbacks that can silently point two agents at the same file.

## 1. Locate the lessons-learned doc

Consult `docs/TOC.md` to find the project's lessons-learned doc. If `docs/TOC.md` doesn't list one, ask the user (or check obvious paths like `docs/lessons-learned.md`).

If no lessons-learned doc exists, stop.

## 2. Identify verbose sessions

Read the doc and find sessions that are **not yet condensed** — they have full bullet-point details rather than the brief Task/Outcome/Key-insights format from step 4.

## 3. Cross-reference each insight

For each insight in a verbose session, consult `docs/TOC.md` to identify the structured doc where the insight would naturally live (architecture, design patterns, coding conventions, runbook, etc.). Check whether the insight is already captured there.

Skip session-specific details that only apply to one task (e.g., "the bug was on line 42") — only extract **reusable patterns**.

## 4. Extract unextracted insights

For each insight **not yet captured** in a structured doc:

1. Determine the best target doc from `docs/TOC.md`.
2. Find the right section within that doc (or create one if needed).
3. Write the insight in the style and format of the surrounding content — match existing conventions.
4. Note which doc and section received the insight.

Consider dispatching the `genvid-dev:tech-writer` agent for the actual doc edits, especially when the extraction touches multiple structured docs.

## 5. Condense fully-extracted sessions

Once all reusable insights from a session are captured in a durable home, replace the verbose entry with the brief format:

```markdown
### Session-Name (YYYY-MM)

**Task:** One-line description of what was done.
**Outcome:** One-line description of the result.
**Key insights extracted to:** [doc1](path) (topics), [doc2](path) (topics)
```

**A durable home is not only a structured doc.** Reusable insights are also durably homed in a **skill**, an **auto-memory**, or an **upstream issue** — the `Key insights extracted to:` line may reference any of those (e.g. `the genvid-dev:plan-task skill (added the ADR threshold)`, `auto-memory squash-merge-only`, `#123`), not just `docs/`.

If some insights aren't yet captured in any durable home — either **too session-specific** to generalize, or **reusable but with no home yet** — keep them under the condensed entry rather than dropping them:

```markdown
Remaining session-specific insights:

- Insight that doesn't (yet) belong in any structured doc, skill, memory, or issue
```

## 6. Commit

Commit the changes following the project's commit format (see `CLAUDE.md`). Group related changes:

- Structured doc updates in one commit per doc (if substantial).
- Condensed lessons-learned entries in a final commit.
