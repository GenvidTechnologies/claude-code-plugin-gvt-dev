# Changelog

All notable changes to the `genvid-dev` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and follows [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `release-plugin` skill: the producer-side analogue of `publish-npm-package`.
  Cuts a marketplace plugin release end to end across both repos — assesses and
  reconciles repo state (clean / local-stale-ff / genuine-inconsistency /
  first-release), bumps `plugin.json` + CHANGELOG, commits `release: vX.Y.Z`,
  pushes a plain annotated `vX.Y.Z` tag, bumps the marketplace `source.ref`, and
  hands off `/plugin update`. (#4)
- `release-plugin-evals/`: behavioral eval harness for the skill's Phase 1
  state-classifier (four fixture classes), including a regression test for
  misreading a stale local checkout as a broken release. (#4)

### Changed

- Corrected stale release-procedure claims in `CLAUDE.md`: release tags are
  plain `vX.Y.Z` (not `genvid-dev-v<semver>`) and the marketplace pins by
  `source.ref`, not a `sha` field. The "Releasing a new version" section now
  points at `/genvid-dev:release-plugin`. (#4)

## [2.0.2] - 2026-06-02

### Added

- `designer` agent: a knowledge/code **placement audit** gate. When a design
  extracts or relocates shared knowledge/code into a new home (plugin, package,
  MCP `docs://` resource, or the consuming repo), the designer now routes each
  asset by what it changes-together with, prefers a move over a copy, and uses
  redirect stubs over deletion when a relocated doc has many referrers. (#2)

### Fixed

- `leak-guard` workflow: excluded the workflow's own file from its scan. Its
  pattern definition listed the leak patterns literally, so it self-matched and
  failed on every branch (including `main`), blocking all PRs. (#3)

## [2.0.1] - 2026-06-02

### Fixed

- Trimmed the `publish-npm-package` skill description from 1609 to 1481 chars so
  it fits under the default `skillListingMaxDescChars` cap (1536) and is no longer
  silently truncated in the session skill listing. All positive and negative
  triggers preserved. (#1)

## [2.0.0] - 2026-05-31

### Changed

- **BREAKING:** Split the combined marketplace + plugin repo. The marketplace
  catalog now lives in `genvid-holdings/claude-code-marketplace`; this repo is
  the plugin only, renamed to `claude-code-plugin-genvid-dev`.
- **BREAKING:** Renamed the plugin namespace from `genvid` to `genvid-dev`.
  Skills are now invoked as `/genvid-dev:<name>` and agents dispatched as
  `genvid-dev:<name>`. Install handle is `genvid-dev@genvid-plugins`.
- Flattened the plugin tree to the repo root (was `plugins/genvid/`).

## [1.1.0] - 2026-05-31

## [1.0.0] - 2026-05-31
