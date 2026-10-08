# Plugin structure

Decisions about how the plugin is laid out, packaged, and configured for consuming repos.

## Records

* [Skills as directories, agents as flat files](0001-skills-as-directories-agents-as-flat-files.md) - Skills live as directories while agents stay single flat files, matching the plugin loader's discovery rules.
* [Self-declaring skill contract via `metadata.expects`](0002-self-declaring-skill-contract.md) - Skills and agents declare their prerequisites in metadata.expects, and the audit aggregates them with a required-false lever.
* [`${CLAUDE_PLUGIN_ROOT}` for shared-reference docs](0003-plugin-root-path-substitution.md) - Shared reference docs are cited via a plugin-root substitution path instead of absolute or relative paths.
* [Publish the plugin from a `plugin/` subdir via git-subdir](0005-git-subdir-plugin-layout.md) - The plugin lives under plugin/ and ships to the marketplace via git-subdir rather than at the repo root.
* [Two-surface pattern for external-system config](0006-two-surface-external-system-pattern.md) - External-system config splits across a JSON block, a prose doc, a bundled template, and an exploration agent.
* [Two-sided pillar coverage via an opt-in scalar `metadata.pillar`](0027-pillar-declaration-and-two-sided-coverage-report.md) - Pillar coverage uses an opt-in metadata.pillar scalar on named components, reported as a zero-finding section that never moves the exit code.
* [Skills, agents and scripts resolve declared expectation paths through the existing `paths` override](0062-runtime-path-resolution-for-declared-expectations.md) - Skills and agents resolve a declared expectation path through the same paths override the audit already uses.
* [Prose conventions doc default is relocatable; maintainer notes move into the wiki bundle](0068-prose-conventions-doc-default-is-relocatable.md) - The ADR-0006 prose-conventions doc defaults to docs/ but resolves through a paths override, and maintainer notes now live under wiki/maintainer/.
* [CLAUDE.md maintainer sections move to wiki/maintainer, split by change driver, behind a routing list](0069-claude-md-maintainer-sections-move-to-wiki-maintainer.md) - CLAUDE.md long maintainer sections move verbatim into six wiki/maintainer pages split by change driver; a routing list replaces stubs and amends ADR-0023.
