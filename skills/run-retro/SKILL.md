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

## 2. Documentation Improvements

Check the project's documentation index (`docs/TOC.md`) and the consuming repo's `CLAUDE.md`. For each doc that's adjacent to what this session worked on, decide:

- Does it need a correction (something was wrong)?
- Does it need an addition (something missing)?
- Does it need a clarification (something ambiguous)?

Common files to check (vary by project — consult `docs/TOC.md`):

- `CLAUDE.md` — project-specific facts the plugin's skills reference
- `docs/architecture.md` — system architecture and component boundaries
- `docs/design-patterns.md` — design patterns and conventions
- `docs/coding-conventions.md` — naming, style, language-specific patterns
- `docs/runbook.md` — operations procedures
- `docs/lessons-learned.md` — accumulated insights (if the project uses one)

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

Note the change as a proposed plugin PR and follow the workflow in the plugin repo's CONTRIBUTING/README.

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
