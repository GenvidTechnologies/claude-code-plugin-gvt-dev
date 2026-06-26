---
name: validate-changes
description: Dispatches the gvt-dev:validator agent to run the project's full validation suite (lint, tests, build, custom checks) and surfaces a pass/fail summary with actionable fixes. Use when the user wants to verify pending changes pass all project checks before committing or pushing — the agent dispatch keeps raw validator output out of the main conversation.
metadata:
  expects:
    tools:
      - command: git
        reason: Summarizes what changed before dispatching the validator
---

# Validate Changes

Dispatches the validator agent to run the project's full validation suite and reports results. The agent does the actual work — this skill is the user-facing entry point.

## Process

1. **Summarize what changed** (before dispatching, so the user knows the validation scope):
   ```bash
   git diff --name-only HEAD
   git diff --name-only --staged
   ```
   List the files briefly.

2. **Dispatch the validator** via the Agent tool with `subagent_type: "gvt-dev:validator"`. The agent reads `commands.validate` from `.gvt-agent.json`, runs it, parses output, and returns a structured pass/fail report. Raw command output stays inside the subagent context.

3. **Surface the validator's report** to the user. If the validator returned failures, walk through each with a suggested fix. If everything passed, confirm success.

## After validation

- If checks pass and the user's next step is committing, suggest `/gvt-dev:commit-changes`.
- If checks fail, ask whether the user wants you to attempt fixes — this skill itself only reports.
- If the validator reports that `commands.validate` is missing from `.gvt-agent.json`, the convention isn't satisfied — point the user at `CONVENTIONS.md` and `/gvt-dev:audit-conventions`.
