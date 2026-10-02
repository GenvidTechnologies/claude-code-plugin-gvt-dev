# 0005. Publish the plugin from a `plugin/` subdir via git-subdir

- **Status:** accepted
- **Date:** 2026-06-05
- **Issue:** #42

## Context

Retroactive record. The plugin originally lived at the repo root. The repo must also carry
maintainer-only material that should not ship to consumers — the dogfood contract
(`.genvid-agent.json`, `docs/TOC.md`), `*-evals/` harnesses, `examples/`, and authoring
notes. The marketplace catalog previously pinned this plugin via a `url` source. A layout
was needed that publishes only the plugin surface while keeping maintainer material in the
same repo.

## Decision

Keep a single repo. The plugin lives under `plugin/` (`plugin/.claude-plugin/plugin.json`,
`plugin/skills/`, `plugin/agents/`, `plugin/hooks/`, `plugin/docs/`). The marketplace
catalog (`genvid-holdings/claude-code-marketplace`) consumes it via a **git-subdir** source
with `"path": "plugin"`, pinned by a plain annotated `vX.Y.Z` tag. `${CLAUDE_PLUGIN_ROOT}`
resolves to `plugin/`.

Architecture: only `plugin/` is the published consumer surface; the repo root holds the
dogfood contract and maintainer tooling, invisible to consumers.

## Compromise

Alternatives rejected:

- **Plugin at repo root + a separate published mirror/repo** — duplicate-and-sync burden,
  two sources of truth.
- **Git submodule** — extra clone/init step and friction for consumers.
- **Publish the whole monorepo root as the plugin** — ships maintainer cruft (evals,
  examples, dogfood files) to every consumer.

The git-subdir + `plugin/` layout was chosen as the only option that keeps one source of
truth AND a clean consumer surface. The cost: the release flow must keep three things in
lockstep — the annotated tag, `plugin/.claude-plugin/plugin.json` `version`, and the
marketplace `source.ref`.

## Consequences

Clean split of published vs. maintainer surface; the repo can dogfood its own contract
without leaking it to consumers. Shipped in v3.0.0, which was a breaking marketplace change
(the `url`→`git-subdir` flip; consumers re-add/update). Releases now go through
`/genvid-dev:release-plugin`, which owns the tag/version/ref sync. Reference docs imported
by skills must use `${CLAUDE_PLUGIN_ROOT}/...` paths.
