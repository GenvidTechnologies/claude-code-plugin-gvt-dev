---
name: release-npm-package
description: >-
  Cut a ROUTINE release of a package that ALREADY publishes to npmjs.com via the
  shared public-github-actions publish.yml OIDC recipe — bump, commit, tag, and
  trigger the publish workflow. The TAG push is what triggers publishing; there
  is no manual npm publish step. Reach for it whenever someone wants to ship a
  new version of an npm package that is already wired for OIDC publishing. Trigger
  on requests like "release the package", "cut a new version", "ship 0.2.0",
  "ship a patch", "bump and tag", "publish the new version to npm", or "push the
  release tag". It owns the whole job — state assessment and classification,
  version decision, the version bump commit, CHANGELOG move, tag creation, CI
  gate, and publish-run hand-off. Do NOT use it for: one-time publish setup where
  publish.yml is absent or not the v*.*.* OIDC recipe (use publish-npm-package
  instead; it owns that setup); releasing a marketplace plugin (use
  release-plugin); publishing to a private or internal registry (Azure Artifacts,
  GitHub Packages, etc.); or non-release work like adding a feature without
  shipping a version.
metadata:
  expects:
    tools:
      - command: git
        reason: Reads remote state, creates the release commit and version tag, and pushes branch and tag to origin
      - command: gh
        reason: Checks CI status on the release commit, fetches the live publish.yml shape from public-github-actions, and lists workflow runs after the tag push
      - command: npm
        reason: Reads published versions, bumps package.json version (npm version --no-git-tag-version), and verifies the release with npm view
    files:
      - path: package.json
        required: false
        reason: The package manifest being released — only this skill needs it, so it is not a universal contract requirement
      - path: .github/workflows/publish.yml
        required: false
        reason: The OIDC publish workflow that fires on the tag push — only this skill needs it, so it is not a universal contract requirement
    config:
      - key: commands.validate
        in: .gvt-agent.json
        required: false
        reason: Full validation suite run before the release commit — only invoked when present; not a universal requirement
---

# Release an npm package (public-github-actions OIDC recipe)

This skill cuts a **routine** release of a package that already publishes to
npmjs.com via the shared `GenvidTechnologies/public-github-actions` GitHub Actions
`publish.yml` recipe. "Routine" means the OIDC wiring is already in place — the
package has a `.github/workflows/publish.yml` triggered on `v*.*.*` tags with
`id-token: write` and no stored npm token.

The **tag push — not the branch push — is the publish trigger.** There is no
manual `npm publish` step; the skill's job is to get the in-repo git work right
(version bump, commit, tag), push the tag, and hand off watching the resulting
workflow run. A branch push alone does nothing to npm.

## When this applies / when it doesn't

Use it when a package is already wired for OIDC publishing and a new version
needs shipping. Signals: "release the package", "cut a version", "ship 0.2.0",
"push the release tag", "bump and tag".

It is **not** for:

- **First-time publish setup** — `publish.yml` absent, not in the v*.*.*-triggered
  OIDC shape, or the package name was never published. Use `publish-npm-package`.
- **Marketplace plugin releases** — use `release-plugin`.
- **Private/internal registries** — Azure Artifacts, GitHub Packages, etc.
- **Non-release work** — adding a feature or fixing a bug without shipping a
  version. Do the work; release later when asked.

## Confirm the repo is on the OIDC recipe (hard gate)

Before doing anything else, assert that `.github/workflows/publish.yml` exists
**and** matches the public-github-actions OIDC shape: triggered on `push: tags:
v*.*.*`, has `id-token: write`, and has **no** step that reads an npm token
secret.

Fetch the canonical template to compare shape (trigger + OIDC block only — not
a byte diff):

```bash
gh api repos/GenvidTechnologies/public-github-actions/contents/templates/publish.yml \
  --jq .content | base64 -d
```

If `publish.yml` is absent or does not match this shape → **STOP**. Tell the
user this is a setup task, not a routine release, and redirect to
`publish-npm-package`.

### Verify `uses:` references resolve to canonical paths (post-rename redirect guard)

`gh api repos/<owner>/<repo>` silently follows repo-rename and org-transfer
redirects — but GitHub Actions `uses:` does **not**. A `uses:` line pointing
at a renamed or moved shared-CI repo's old path passes every `gh api`-based
check yet fails the Actions run instantly (0 seconds, "This run likely failed
because of a workflow file issue", no jobs started).

Extract the repo-slug references — only `<owner>/<repo>/...@<ref>` forms count;
local (`./`) and `docker://` `uses:` values name no repo and are correctly
skipped:

```bash
grep -rhoE 'uses:\s+[^./][^ ]+/[^ ]+/[^ ]+@' .github/workflows/ci.yml .github/workflows/publish.yml
```

For each `<owner>/<repo>` found, assert that the API returns the same path as
written:

```bash
gh api repos/<owner>/<repo> --jq .full_name
```

The returned `full_name` **must equal** the `<owner>/<repo>` written in the
`uses:` line, **compared case-insensitively** (GitHub slugs are
case-insensitive, and so is Actions' lookup — so a casing-only difference is
*not* a stale ref, just non-canonical casing). A genuine mismatch means the
reference points at a redirect alias — the repo was renamed or moved — **STOP**
and update the `uses:` line to the canonical `full_name` before releasing.

A **failed** `gh api` call is a different condition, not a mismatch: a `404`
means the path is wrong or the repo is gone entirely (a rename with no
redirect, or a typo), a `403` means it's private/inaccessible. Resolve the
access/path problem first rather than reading it as a clean rename.

Example: `uses: genvid-holdings/genvid-public-ci/...` returning `full_name`
`GenvidTechnologies/public-github-actions` → stale ref, fix it.

## Invariants this skill protects (the npm release triangle)

A correct release keeps these facts consistent — the **npm release triangle**:

1. The git tag is `vX.Y.Z` and the tag string minus its leading `v` **equals**
   `package.json` `version` at the tagged commit. Assert this BEFORE pushing
   the tag — catching a mismatch here costs nothing; catching it after costs a
   version number.
2. The **three manifest spots** agree: `package.json` `version`, and both
   occurrences in `package-lock.json` (`version` at root and
   `packages[""].version`). All three must carry the same value.
3. The target version is **not already published** and `vX.Y.Z` is not an
   existing tag. A half-failed prior publish → bump to next patch, never retry
   the same version.
4. Top-level `main`/`types`/`exports` stay top-level (not moved into
   `publishConfig`). Run `npm pack` and inspect the packed manifest only if the
   commit range touched `package.json` `main`/`types`/`exports`/`files`/
   `publishConfig` or `tsconfig` — otherwise skip and say so.
5. If the package has a `CHANGELOG.md`, it must have a dated `[X.Y.Z]` section
   for the version being released before the tag is pushed.

## Phase 1 — Assess state (fetch first)

**Never reason about release state from a local checkout you haven't synced.**
Start every run with:

```bash
git fetch origin --tags --prune
```

**You were probably invoked from the just-merged feature branch.** Releasing
right after a PR merges is the common case, so the working checkout is often the
feature branch — which a squash-merge may have already deleted on the remote
(`git status` shows `[gone]`). Get onto an up-to-date default branch *before*
classifying: `git checkout <default> && git merge --ff-only origin/<default>`.
Otherwise Phase 3 prepares the release on the wrong ref.

Then gather these signals:

- Remote default-branch tip: `git rev-parse origin/<default>`; local tip: `git
  rev-parse HEAD`; working tree: `git status -sb`.
- Remote `package.json` version: `git show origin/<default>:package.json | node
  -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>console.log(JSON.parse(d).version))"`.
- Latest `v*` tag: `git for-each-ref --sort=-creatordate --count=1
  --format='%(refname:short)' 'refs/tags/v*'`; whether it is on the default
  branch: `git merge-base --is-ancestor <tag> origin/<default>`.
- Published versions: `npm view <name> versions --json`; latest: `npm view
  <name> version`.
- Whether `CHANGELOG.md` has an `[Unreleased]` section.

Classify into exactly one state and echo it to the user:

| State | How to recognize it | Action |
|---|---|---|
| **needs-bump** | Clean, up to date; remote `package.json` version == latest tag (and published on npm) | Normal path: Phase 2 picks next version, Phase 3 bumps + commits, Phase 5 tags |
| **version-already-landed** | Remote `package.json` version is ahead of the latest `v*` tag AND that version is not yet published on npm | SKIP Phase 3; confirm 3 manifest spots carry the bumped version; Phase 5 tags the existing commit |
| **local-stale-ff** | Working tree clean; local is behind `origin/<default>` with no divergent commits (fast-forwardable) | Not a broken release. Offer `git merge --ff-only origin/<default>`; re-run Phase 1 |
| **first-release** | No prior `v*` tags AND (name unpublished OR current version unpublished) | Skip prior-tag diffs; default lightweight tag + note it. BUT if the name was **never** published at all → STOP, redirect to `publish-npm-package` |
| **already-published** | Target version already in `npm view <name> versions --json` OR already has a matching `vX.Y.Z` tag | REFUSE. Tell user to pick the next free version. A half-failed prior publish → bump to next patch |

## Phase 2 — Determine version and release type

**Refusal guard:** before accepting any `X.Y.Z`, assert that `vX.Y.Z` is not an
existing tag **and** `X.Y.Z` is not in `npm view <name> versions --json`. State
the chosen version explicitly.

Version decision (in priority order):

1. **Explicit override wins.** If the user named a version, validate it against
   the refusal guard, then use it.
2. **Infer from the commit range:**

   ```bash
   git log --oneline <last-tag>..origin/<default>
   ```

   New feature → **minor**. Fixes or internal changes → **patch**. Breaking
   change → **major**.

3. **0.x advisory.** At 0.x a breaking public-API change (removing or renaming
   an export from the entry point) takes a **minor** bump, not a major — surface
   it, confirm with the user, never auto-decide a 0.x major.

4. **In `version-already-landed`:** read the version from the merged
   `package.json`; do not infer.

## Phase 3 — Prepare the repo (one commit; conditional)

SKIP this entire phase in the `version-already-landed` state.

Steps:

1. **Bump `package.json` version.** On a confirmed single-package repo (no
   `workspaces` field in `package.json`, no `pnpm-workspace.yaml`), run:

   ```bash
   npm version <bump-type-or-explicit-version> --no-git-tag-version
   ```

   `--no-git-tag-version` prevents npm from committing or tagging. Re-read
   `package.json` after to confirm all **three manifest spots** carry the new
   version.

   **Workspace guard:** if `workspaces` is present in `package.json` or
   `pnpm-workspace.yaml` exists, do NOT run `npm version` — fall back to
   manually editing the three spots in the root manifest and ask the user to
   confirm member manifests. Do not auto-traverse workspace members.

2. **CHANGELOG.** If the package has a `CHANGELOG.md` with an `[Unreleased]`
   section, move its content into a new dated `## [X.Y.Z] - <today>` section
   (Keep a Changelog format), leaving an empty `## [Unreleased]` above it.

3. **Validate.** If `commands.validate` is present in `.gvt-agent.json`, run
   it now.

4. **Release commit.** Show the diff; collect a single review confirmation. Read
   the consuming repo's `CLAUDE.md` for commit format; default to
   `chore: Release X.Y.Z`. Stage `package.json`, `package-lock.json`, and
   `CHANGELOG.md` (if modified).

Present ONE "here's the plan, proceed?" gate covering all non-irreversible steps.
The tag push gets its own separate hard confirm.

## Phase 4 — CI gate (graceful)

- No `.github/workflows/` files → report "no CI configured, skipping" and
  continue.
- PR was opened (protected-branch path) → `gh pr checks <pr>` must be green
  before tagging.
- Otherwise check the release commit directly:

  ```bash
  gh api repos/<org>/<repo>/commits/<sha>/check-runs \
    --jq '.check_runs[] | {name, status, conclusion}'
  ```

  Require every concluded run to be `success`, `neutral`, or `skipped`. Treat
  "no checks reported" as pass-with-warning, not failure. **Tag only after the
  release commit's checks are green.**

A **0-second "workflow file issue" failure with no jobs started** — especially
right after a repo move or rename — almost always means a stale `uses:`
reference, not a code problem. Do not bump the version chasing it; run the
canonical-path check from the hard gate above and fix the workflow ref first.

A red default branch is a stop sign; absence of CI is not.

## Phase 5 — Tag-convention detection and release runbook (ordered)

### Detect the tag convention

```bash
git for-each-ref --sort=-creatordate --count=1 \
  --format='%(refname:short)' 'refs/tags/v*'
```

Then check whether the most recent `v*` tag is annotated or lightweight:

```bash
git cat-file -t <tag>   # "tag" → annotated, "commit" → lightweight
```

No prior `v*` tags → default to **lightweight** and note it. Echo the detected
convention to the user.

### Release runbook (perform in this order)

1. **Land the release commit on the default branch.**
   - Unprotected branch: `git push origin <default>`.
   - Protected branch: push a branch, delegate to the `create-pr` skill, and
     tag the squash-merge commit after the PR lands.

2. **CI gate** (Phase 4, on the landed commit).

3. **Assert tag == version BEFORE tagging.** Confirm the tag string minus `v`
   equals `package.json` `version` at the tip of `origin/<default>`.

4. **Create and push the tag.** This step gets its own hard confirm.

   ```bash
   # Annotated (if that is the detected convention):
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z

   # Lightweight (if that is the detected convention):
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   Push the branch FIRST, then the tag. The tag push — not the branch push —
   triggers `publish.yml`.

5. **Watch the publish run and verify.**

   ```bash
   gh run list --workflow=publish.yml --limit=5   # find the triggered run
   gh run view <run-id>                            # monitor progress
   npm view <package-name> version                 # confirm after the run
   ```

   Do NOT block-poll the async publish. Report the `gh run` command and the
   `npm view` verification command; the user can run them to track progress.

6. **Optional packaging verification.** Run `npm pack` and inspect the packed
   manifest only if the commit range touched `package.json` `main`/`types`/
   `exports`/`files`/`publishConfig` or `tsconfig`. Otherwise skip and say so.

## Rollback

- **Pre-tag-push:** nothing has been published. No rollback needed — fix and
  continue.
- **Post-publish failure** (workflow run failed after the tag push): bump to the
  next patch version and start from Phase 1. **Never retry the same version** —
  even a failed OIDC publish may have left a partial record.

## Why these choices

- **Fetch-first.** A local branch behind `origin` is the most common false
  "broken release". Phase 1 fetches and classifies before judging anything.
- **Tag == version caught before push (fail cheap).** A mismatch between the tag
  and `package.json` version is the most common release error. Catching it before
  the tag push costs nothing; catching it after costs a version number.
- **Refuse-already-published.** npm versions are immutable. A half-failed prior
  publish leaves the version in a bad state; the only safe path is to bump to the
  next patch.
- **Detect-don't-assume tag convention.** Some repos use annotated tags, some
  use lightweight. The skill detects which convention is in use rather than
  imposing one.
- **`npm version --no-git-tag-version` only on confirmed single-package repos.**
  Running `npm version` in a workspace repo bumps only the root manifest and
  produces a wrong or misleading state. The workspace guard keeps the skill safe
  in monorepo setups.
- **Keep entry points top-level.** `publishConfig` overrides for `main`/`types`/
  `exports` are not applied by npm 11.x; packaging verification catches this
  before it reaches consumers.
- **`uses:` redirect guard at the hard gate.** `gh api` follows repo-rename
  redirects silently; Actions `uses:` does not. Checking that each `uses:`
  path's `full_name` matches what's written catches a stale shared-CI reference
  before it causes a 0-second run failure that looks like a code problem.
