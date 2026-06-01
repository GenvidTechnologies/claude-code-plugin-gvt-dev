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

Once all reusable insights from a session are captured in structured docs, replace the verbose entry with the brief format:

```markdown
### Session-Name (YYYY-MM)

**Task:** One-line description of what was done.
**Outcome:** One-line description of the result.
**Key insights extracted to:** [doc1](path) (topics), [doc2](path) (topics)
```

If some insights are **not extractable** (too session-specific but still useful as reference), keep them under the condensed entry:

```markdown
Remaining session-specific insights:

- Insight that doesn't belong in any structured doc
```

## 6. Commit

Commit the changes following the project's commit format (see `CLAUDE.md`). Group related changes:

- Structured doc updates in one commit per doc (if substantial).
- Condensed lessons-learned entries in a final commit.
