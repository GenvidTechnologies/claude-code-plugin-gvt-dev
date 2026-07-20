---
name: sync-config
description: Brings the consuming repo up to date with the latest genvid plugin release — instructs the user to update the plugin via Claude Code's /plugin command, then runs the audit to surface any new expectations or convention changes the new plugin version requires. Use when the user wants to "update the shared config", "pull the latest skills", or after the plugin maintainers ship breaking changes.
metadata:
  expects:
    files:
      - path: .gvt-agent.json
        required: false
        reason: Used to detect whether the repo has migrated to the convention contract — if missing, the repo may still be on the legacy template-rendered setup
---

# Sync Config

Brings the consuming repo up to date with the latest version of the `gvt-dev` plugin.

The actual update can't be invoked from a skill — `/plugin update` is a Claude Code command, not a shell command. This skill walks the user through the steps and runs the post-update audit.

## Process

### 1. Check current plugin version

```bash
claude plugin list --json | jq '.plugins[] | select(.name == "gvt-dev")'
```

Note the installed version (a semver string or git commit SHA).

### 2. Check for updates

Run `claude plugin update gvt-dev@gvt-plugins`. If it reports "already at the latest version", report that and stop.

If an update is applied, the command prints `Updated from X to Y. Restart to apply changes.` Tell the user to restart Claude Code so the new plugin contents are loaded into context.

### 3. After the user restarts

Run `/gvt-dev:audit-conventions` to surface any new expectations the updated plugin requires. The audit reports:

- New required files the plugin's skills now expect (e.g., a new `docs/X.md` convention was added)
- Changed `.gvt-agent.json` schema (e.g., a new required key)
- `CONVENTIONS.md` drift if the plugin's canonical version changed — the plain audit WARNS (non-fatal); `--fix` previews the resync in a dry-run for you to review before `--apply` applies it (same two-turn discipline as any other `--fix` path)
- Any installed skills or agents whose declared expectations are unmet

### 4. Apply audit findings

If the audit reports unmet expectations:

- For schema additions, edit `.gvt-agent.json` to add the new keys with appropriate values.
- For file additions, create the missing files (`docs/<X>.md`, etc.) with project-appropriate content.
- For `CONVENTIONS.md` drift, run `/gvt-dev:audit-conventions --fix` to preview the resync (it shows a `+N/−M` diff hint), then `--apply` once you've reviewed it. Review the diff before committing.

### 5. Commit

Stage and commit the updates. Follow the project's commit format from `CLAUDE.md`.

## When this skill doesn't help

If the repo hasn't migrated to the convention contract yet (no `.gvt-agent.json`, still has the legacy submodule), the right move is `/gvt-dev:audit-conventions --fix` (its legacy-state branch handles the full migration). This sync skill assumes the repo is already on the new model.
