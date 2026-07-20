# 0014. Scan retired tokens in git-tracked config files, not by presence alone

- **Status:** accepted
- **Date:** 2026-07-20
- **Issue:** #134

## Context

The `audit-conventions` retired-token hygiene scanner
(`plugin/skills/audit-conventions/scripts/lib/hygiene.mjs`, `scanRetiredTokens`)
scanned only `docs/**.md` plus the repo-root `CLAUDE.md`. Issue #134 asks it to also
cover config files (`package.json`, `.gvt-agent.json`, `.claude/settings*.json`) — the
exact places a half-applied `genvid → gvt-dev` rename leaves dead tokens, per the
founding example behind #131, which named `package.json` and `settings.local.json`
explicitly.

The forcing constraint: a per-developer `.claude/settings.local.json` is
conventionally **untracked** (local overrides) and can legitimately contain literal
retired-token strings — e.g. in this very repo, a permission grep-pattern rule
contains `genvid-dev:`. Scanning config files purely by *presence on disk* would flag
that as a false positive on local junk and regress the "zero new findings on this
repo" acceptance bar this scanner's own precedent (0007, and the dogfooding note in
`CLAUDE.md` §Testing) holds it to.

## Decision

Scan a fixed allow-list of well-known repo-root config paths (`package.json`,
`.gvt-agent.json`, `.claude/settings.json`, `.claude/settings.local.json`)
**intersected with the git-tracked set** (`git ls-files`). The tracked filter makes
the effective boundary "shared / committed config" rather than "any file on disk" —
which is the semantically correct scope, because a half-applied rename that *matters*
is one committed to shared config, not one sitting in a developer's local overrides.

This applies to `scanRetiredTokens` only; `scanBrokenLinks` and `scanOrphanedDocs`
stay markdown-only, since links and TOC indexing are a Markdown-doc concern. The
existing `excludePaths` union semantics and the `http`-line skip (provenance/issue
URLs are correct-as-history) carry over unchanged to the config candidate set.

## Compromise

Alternatives rejected:

- **Presence-based scanning** (scan the allow-listed config files if they exist on
  disk, no git filter) — simpler, no `git` dependency, but reintroduces the
  local-junk false positive above and adopts the wrong boundary (local overrides
  instead of shared config) for what the scanner is actually trying to catch: a
  rename that didn't fully land in the repo's committed state.

## Consequences

Adds a `git ls-files` (`spawnSync`) call to the token-scan path. This degrades
gracefully: in a non-git repo, or wherever `git` is unavailable, the config scan is
skipped and the Markdown scan is unchanged — consistent with the scanners' existing
"return `[]` rather than throw" philosophy. A brand-new config file that hasn't been
staged or committed yet isn't scanned until it is — an acceptable gap for an
advisory, `info`-severity check.
