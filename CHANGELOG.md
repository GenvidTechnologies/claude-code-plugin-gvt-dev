# Changelog

All notable changes to the `genvid-dev` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and follows [semantic versioning](https://semver.org/).

## [Unreleased]

## [2.5.0] - 2026-06-03

### Changed

- `analyst` agent: added a "refresh refreshable artifacts before diffing" Key
  Principle — when the analysis premise depends on a checked-in snapshot or
  generated artifact that has a documented refresh/fetch/regenerate command, surface
  freshness as an explicit pre-analysis step instead of treating the committed copy
  as ground truth, and treat any mismatch set as provisional until the artifact is
  confirmed current. Advisory, with detection leaning on signals the analyst already
  gathers (`fetch-*`/`generate-*` scripts, `.prettierignore`/`.gitattributes`
  entries, fetched-verbatim doc notes). (#16)

## [2.4.0] - 2026-06-03

### Added

- `plan-task` skill: Shortcuts section now names a third compression case — a
  GitHub issue that's already a full proposal (rationale + proposed change +
  explicit open questions). Treat the issue as the requirements doc, resolve any
  open questions with a single `AskUserQuestion` call, and present a combined
  design + plan in one checkpoint. (#14)

## [2.3.0] - 2026-06-03

### Changed

- `release-plugin` and `release-npm-package` skills: Phase 1 now notes that the
  skill is usually invoked from the just-merged (and possibly squash-deleted)
  feature branch — check out an up-to-date default branch before classifying, so
  the release isn't prepared on the wrong ref.
- `planner` agent: added a "flag throwaway intermediate steps" heuristic — when a
  later task routes through a high-level upstream aggregate (`detect*`/`analyze*`/
  `build*`), read its implementation; if an earlier task installs parallel work
  into code the later task deletes wholesale, fold the deletions forward and
  de-risk with equivalence tests instead of a discarded intermediate refactor. (#6)
- `cleanup-initiative` skill: Step 0 now verifies a non-shipped phase status
  against git history before trusting it — `git log --grep` + a deliverable
  cross-check catch the "table says Planned/in-progress but the scope actually
  shipped" drift, which would otherwise skip cleanup of a done initiative. (#11)
- `cleanup-initiative` skill: Step 2 inbound-reference handling gained a third
  option — if a hit points at a live data/code artifact (not prose) the project
  still consumes, `git mv` it to a permanent home outside `initiatives/`, update
  references, and repoint any tool's default output before deleting, rather than
  redirect-or-strip which would remove a live dependency. (#12)
- `cleanup-initiative` skill: Step 4 gained a "convert to issue tracker"
  alternative to the successor-folder flow — when-to-use detection, granularity,
  preserving forward-looking specs by inlining + a pre-deletion `git show` SHA
  reference, filtering obsolete items, routing cross-repo items, and the
  full-URL link gotcha; with a Step 6 note that the delete intentionally removes
  design docs the new issues point at by SHA. (#10)

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
