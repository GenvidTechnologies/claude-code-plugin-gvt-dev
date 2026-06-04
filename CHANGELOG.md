# Changelog

All notable changes to the `genvid-dev` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and follows [semantic versioning](https://semver.org/).

## [Unreleased]

## [2.8.0] - 2026-06-04

### Changed

- `release-plugin`: subfolder-layout awareness. Reads `paths.plugin_root` from
  `.genvid-agent.json` (default `"."` → unchanged for every plugin-at-root repo)
  and resolves `.claude-plugin/plugin.json`, `CHANGELOG.md`,
  `claude plugin validate`, and the release-triangle `git show` paths relative to
  it. The marketplace step now supports the `git-subdir` source shape
  (`path` = `<plugin_root>`) alongside the whole-repo `url` shape, including the
  one-time `url`→`git-subdir` flip on a first subfolder publish. `paths.plugin_root`
  is documented in `CONVENTIONS.md` as a reserved key and declared
  `required: false` in the skill's `metadata.expects`.

### Added

- `triage-bugs`: new skill for interactive, tracker-agnostic bug-backlog triage.
  A main-thread orchestrator dispatches a read-only `bug-triage-analyst` agent to
  fetch the untriaged bugs (plus a wider comparison set for dedup) and propose
  duplicate clusters, overlaps, dependencies, split candidates, and per-bug
  field/label/priority/language fixes; the orchestrator then drives a two-phase
  approval and applies the writes, stamping a `triaged` label last for
  idempotent re-runs. Project specifics come from a new `bugTracker` block in
  `.genvid-agent.json` and a `docs/bug-triage.md` conventions doc (both
  skill-conditional / `required: false`; a template ships with the skill).

## [2.7.0] - 2026-06-04

### Changed

- `audit-conventions`: greenfield `--fix` no longer clobbers a pre-existing
  `CONVENTIONS.md` (and now reports `CLAUDE.md` / `docs/TOC.md` skips as visible
  `SKIPPED` notes in the dry-run). The `--fix` dry-run is allowed on a dirty
  working tree (only `--apply` refuses). Documented the grep/Windows-PATH
  shell-sensitivity caveat. (#25)
- `audit-conventions`: the greenfield scaffold now sources its placeholder files
  from a new `skeleton/` folder (`.genvid-agent.json`, `CLAUDE.md`,
  `docs/TOC.md`) instead of inline JS string literals — one reviewable,
  file-based source of truth, removing the drift hazard against `examples/`.
- `run-retro`: added an explicit fallback for when `docs/TOC.md` is absent
  (greenfield consumers, or the plugin repo itself) — discover docs by globbing
  `docs/**/*.md` and reading `CLAUDE.md` / `CONVENTIONS.md` instead of
  dead-ending, plus guidance for running the retro inside the plugin repo.

## [2.6.2] - 2026-06-03

### Added

- `code-reviewer` agent: a "Deletion completeness" checklist item — when the diff
  deletes a tracked file, grep docs (`*.md`) for the basename and classify each hit
  as a **live pointer** (markdown link or "see X"/"canonical example" prose → flag
  for fix, repoint at git history) versus **historical prose** (dated retro /
  changelog entry → leave as the record). Counters the under-flag where a broken
  markdown link gets rated "leave as educational record." (#23)

## [2.6.1] - 2026-06-03

### Changed

- `release-plugin` skill: added a Windows note to Phase 1 — under git-bash the
  `git show <ref>:<path>` state-assessment commands get path-mangled (`:`→`;`,
  `/`→`\`) and fail with "ambiguous argument"; prefix with `MSYS_NO_PATHCONV=1` or
  read the file after checkout.

## [2.6.0] - 2026-06-03

### Added

- `code-reviewer` agent: a "False-positive guardrails" subsection that runs before
  assigning critical severity — check whether the apparent bug is documented or
  deliberately supported behavior (grep `docs/`, `CLAUDE.md`, `CONVENTIONS.md`,
  nearby code/tests) and downgrade or drop it if so; reconcile any contradicting
  evidence (a passing run/test/cited output) before asserting a defect; and reserve
  🔴 Critical for findings traced to an actual failure (repro, failing test, or a
  concrete broken path), not "this looks wrong". (#18)

### Changed

- `plan-task` skill: added a "Dispatch resilience" note to the Pipeline — if a
  delegated agent returns empty, errors, or hits a session/token limit, resume it
  via `SendMessage` to reuse its context when that tool is available, otherwise
  complete the phase inline from the prior phase's artifact rather than retrying
  blindly or stalling. (#20)
- `plan-task` skill and `analyst` agent: added a runtime-observability gate for
  bug tickets — confirm the reported symptom is actually observable before design
  (reproduce it, or trace the read/render path end-to-end, not just the write path);
  if no reader observes the bad value, reclassify the task as tech-debt cleanup
  (`chore`/`refactor`) rather than a fix and say so explicitly. The analyst now
  distinguishes "defect present in code" from "symptom observable at runtime". (#19)

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
