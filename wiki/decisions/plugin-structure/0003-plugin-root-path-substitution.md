# 0003. `${CLAUDE_PLUGIN_ROOT}` for shared-reference docs

- **Status:** accepted
- **Date:** 2026-05-31
- **Issue:** none — established at the v2.0.0 public release (decision predates the public repo; pinned to its first recorded appearance)

## Context

Retroactive record. Several skills and agents cite the same reference content (e.g.
`development-principles.md`). That content needs one canonical home, and the citations must
keep resolving regardless of where the plugin is checked out or installed — including the
later move to a `plugin/` subdir (see [0005](0005-git-subdir-plugin-layout.md)) and the
installed-cache path consumers actually run from.

## Decision

Shared reference docs live once at `plugin/docs/<name>.md` and are referenced as
`${CLAUDE_PLUGIN_ROOT}/docs/<name>.md`. The harness substitutes `${CLAUDE_PLUGIN_ROOT}`
with the plugin's real root at runtime (it resolves to `plugin/`). Skill-specific sub-docs
that only one skill imports stay alongside that skill (e.g. `plan-task/multi-session.md`)
rather than in the shared `docs/`.

Architecture: a single substitution variable decouples every cross-component reference from
the plugin's physical location, so the same string works at the repo root, in a subdir, or
in an installed cache. The substitution applies in skill/agent markdown — but **not** in
`CLAUDE.md` `@`-imports, which must stay literal paths.

## Compromise

Alternatives rejected:

- **Absolute paths** — break the moment the plugin moves, is installed elsewhere, or shares
  a repo with another plugin.
- **Relative `../docs/` paths** — fragile against a component's directory depth and broken
  by the skills-as-directories layout where depth varies.
- **Duplicating the reference content into each consumer** — the copies drift, defeating
  the "documented once" intent (the failure principle #7 explicitly guards against).

The cost: two referencing dialects to remember — `${CLAUDE_PLUGIN_ROOT}/...` inside
skills/agents, plain `@`-imports inside `CLAUDE.md` — and the substitution only works in the
former.

## Consequences

Reference content can be centralized and linked rather than copied; this is the mechanism
the [five-dimension / decision-record convention](0007-five-dimension-doc-and-adr-convention.md)
and the numbered development principles rely on to stay single-sourced. It also made the
[`plugin/` subdir move](0005-git-subdir-plugin-layout.md) transparent to every existing
reference — `${CLAUDE_PLUGIN_ROOT}` simply re-resolved.
