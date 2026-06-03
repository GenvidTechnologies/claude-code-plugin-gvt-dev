# Changelog

All notable changes to the `genvid-dev` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and follows [semantic versioning](https://semver.org/).

## [Unreleased]

## [2.2.0] - 2026-06-03

### Added

- `release-npm-package` skill: routine release of an npm package on the OIDC `genvid-public-ci` `publish.yml` recipe — bump, tag, and trigger the publish workflow. (#5)
- `release-npm-package-evals/`: behavioral eval harness for the skill's Phase 1 state-classifier and OIDC-recipe gate (seven evals across six fixture classes). (#5)

### Changed

- `planner` agent: added a "mirror fidelity" principle — when a task clones an
  existing structure (eval harness, sibling skill, fixture set), enumerate the
  model's coverage and justify any omission in the plan, rather than silently
  shipping a reduced set that only surfaces at review.
- `analyst` agent: added a "sync before judging git/release state" principle —
  run `git fetch` and compare against `origin` before concluding a repo is in a
  broken/inconsistent state, since a merely-behind local checkout is a
  fast-forward, not a defect.
- `plan-task` skill: Phase 4 now handles a gitignored `plan.md` — if the repo
  keeps `plan.md` as a local-only artifact, skip the prep commit instead of
  force-adding it.
- `plan-task` skill: continuation shortcut now guards against a stale gitignored
  `plan.md` — a gitignored plan lingers after its branch merges, so confirm an
  existing plan maps to the current task (branch unmerged, tasks not already in
  the default branch) before resuming it; otherwise treat the work as a fresh
  plan and overwrite.
- `CLAUDE.md`: documented that this repo squash-merges PRs (merge commits
  disabled).

## [2.1.0] - 2026-06-02

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
