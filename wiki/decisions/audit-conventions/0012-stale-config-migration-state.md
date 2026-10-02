# 0012. A distinct `stale-config` state for the pre-rebrand `.genvid-agent.json` filename

- **Status:** accepted
- **Date:** 2026-07-03
- **Issue:** #117, #118

## Context

The `audit-conventions` state detector recognized three states: `migrated` (a
`.gvt-agent.json` present), `legacy` (the submodule-era `claude-config.json` or the
`burbank-claude-config` submodule), or `greenfield` (neither). A consuming repo carrying
only `.genvid-agent.json` — the *former* filename of `.gvt-agent.json` from before the
genvid→gvt rebrand, with an identical schema — matched none of the three, so it fell
through to `greenfield`. The audit then recommended `--fix`, which scaffolded an empty
`.gvt-agent.json` alongside the real, populated `.genvid-agent.json`: a shadow config file
that orphaned the repo's actual settings and left two config files with overlapping
purpose in the repo.

## Decision

Introduce a fourth state, `stale-config`, detected when `.genvid-agent.json` is present
and neither of the higher-precedence states matches. Precedence is
`legacy > migrated > stale-config > greenfield` — `legacy` and `migrated` are checked
first because a repo mid-migration or already carrying the submodule marker takes those
paths regardless of a stray stale filename.

`--fix` reads the stale file's contents and branches on whether it still carries live
Construct3 markers (`features.c3` and/or `paths.c3project`):

- **Pure stale-name repo** (no C3 markers): offer a history-preserving
  `git mv .genvid-agent.json .gvt-agent.json` — a rename, not a translation, since the
  schema is already the current shape — plus scaffold-if-absent for the other convention
  files. Never write a shadow `.gvt-agent.json` beside the original.
- **Repo where `.genvid-agent.json` still carries C3 markers**: emit note-only
  port-and-keep guidance (copy `commands`/`repo` into a new `.gvt-agent.json`, keep
  `.genvid-agent.json` in place) and perform zero filesystem mutation, because the
  separate `genvid-construct3` plugin may still read the old filename directly.

Architecture: state detection stays a pure read-only classifier (`detectState()`) with one
new terminal state; the mutation logic lives entirely in `--fix`'s per-state branch, so
adding `stale-config` doesn't touch the `migrated`/`legacy`/`greenfield` code paths.

## Compromise

Alternatives rejected:

- **Reuse `STATE_LEGACY` for the stale filename** — `legacy` triggers the destructive
  submodule-teardown-plus-rendered-file-deletion migration path, which is the wrong
  operation for a repo that only needs a filename rename. Folding the two together would
  make the common case (a plain rename) go through a heavier, riskier migration.
- **Silently auto-rename without asking** — rejected in favor of git's plan of offering the
  `git mv` and confirming, consistent with this repo's general dry-run/confirm posture for
  filesystem-mutating `--fix` operations.

The cost: a fourth arm in every `switch (state)` and a discriminator (`features.c3` /
`paths.c3project`) that reads the stale file's contents rather than just its presence.

## Consequences

The audit report resolves config keys from `.genvid-agent.json` when in this state, so it
shows the repo's config as valid and isolates the filename itself as the sole finding.
Every future `switch(state)` in `audit-conventions` must add a `stale-config` arm or it
will silently fall through to `greenfield` behavior again.

**Known risk to record:** the C3-marker discriminator (`features.c3` / `paths.c3project`)
has zero occurrences in any repo available to test against — it is unvalidated against a
live `genvid-construct3` consuming repo. A non-blocking follow-up is recommended: smoke-test
this branch against a real `c3addon-*` / genvid-c3 consumer to confirm those two keys are
the correct discriminator before relying on it in production.
