---
type: practice-note
title: 'Running the Audit on Windows'
description: 'Why the audit and commands.validate must run under Bash rather than PowerShell on Windows, and how to recognise the false grep-not-found failure.'
tags: [maintainer, windows]
status: stable
---
# Running the Audit on Windows

Shell requirements for running the audit and the full validate command on a Windows machine.

**On Windows, run the audit via the Bash tool, not PowerShell.** The audit checks each skill's declared tools against `PATH`; `cleanup-initiative` expects `grep`, which isn't on the PowerShell `PATH`, so a pwsh run falsely reports `1 required expectation unmet: cleanup-initiative expects grep — not found on PATH` (exit 1). git-bash has `grep`, so the same audit exits 0 there. If you see only that `grep` line as "unmet", it's an environment artifact, not a widened contract — re-run under bash to confirm.

**`commands.validate` chains the audit, so run the *whole* `validate` under Bash on Windows.** `.gvt-agent.json` `commands.validate` runs `claude plugin validate` + the skill test suites **and** `audit.mjs` — the audit is the gate that catches contract-widening, so it belongs in the full check rather than as a separate step someone can forget. The consequence of folding it in: the entire `validate` command (and any `gvt-dev:validator` / `validate-changes` dispatch that runs it) trips the same false `grep` failure above if run under PowerShell. Run `commands.validate` via the Bash tool on Windows, and treat a green `validate-changes` as the complete contract check only when it ran under Bash.
