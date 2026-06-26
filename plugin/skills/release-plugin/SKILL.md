---
name: release-plugin
description: >-
  Cut a versioned release of a single Genvid marketplace plugin (a Claude Code
  plugin published through the GenvidTechnologies/claude-code-marketplace catalog),
  end to end across both repos: bump .claude-plugin/plugin.json, move the
  CHANGELOG Unreleased section, commit, push an annotated vX.Y.Z tag, and bump
  the plugin's marketplace source.ref. This is the rare, nobody-remembers-the-
  steps maintainer workflow, so reach for it WHENEVER someone wants a plugin
  release shipped — even when they don't name the steps. Trigger on requests
  like "release the plugin", "cut a new gvt-dev / genvid-c3 version", "bump
  the plugin version and ship it", "tag and publish the plugin", "push this to
  the marketplace", "make the new skill available to consumers", "publish the
  first version of this plugin", or "the tag / plugin.json version / marketplace
  ref are out of sync, fix the release". It owns the whole job — state
  assessment and reconciliation, the version + CHANGELOG bump, the annotated
  tag, the marketplace ref update, and the /plugin update handoff. Do NOT use it
  for: the consumer side of pulling a newer plugin into a repo (use sync-config);
  publishing an npm / TypeScript package to npmjs.com (use publish-npm-package);
  or routine non-release work like adding a skill without shipping a release.
metadata:
  expects:
    config:
      - key: paths.plugin_root
        in: .gvt-agent.json
        required: false
        reason: Path from the repo root to the directory containing .claude-plugin/plugin.json; defaults to "." (plugin at repo root). Set to e.g. "plugin" for a subfolder layout, which also selects the git-subdir marketplace source shape.
    tools:
      - command: git
        reason: Reads remote state, creates the release commit and annotated tag, and pushes the branch and tag to origin
      - command: gh
        reason: Reads the live marketplace.json from the catalog repo, checks CI status on the release commit, and clones the marketplace repo to bump the ref
---

# Release a marketplace plugin

This skill cuts a release of a single Genvid Claude Code plugin and points the
shared marketplace catalog at it. A plugin release is **git-tag-pinned, not
npm-published**: the catalog `GenvidTechnologies/claude-code-marketplace` pins each
plugin to a plain annotated `vX.Y.Z` tag via a `source.ref`, and consumers
resolve that ref on `/plugin update`. There is **no `npm publish`** — do not
confuse this with `publish-npm-package`.

It executes the in-repo work directly, with verification gates, then hands off
the one step a skill cannot perform: the consumer-facing `/plugin update`.

Work in small, ordered steps. The release is a **two-repo, multi-push**
operation — get the ordering right (tag before marketplace ref) so a partial
failure never points the catalog at a tag that doesn't exist yet.

> **Self-referential releases.** When a release changes *this* skill in a way a
> **later** release depends on (e.g. adding subfolder support before a repo moves
> its plugin into a subfolder), ship that release and `/plugin update` it **before**
> cutting the dependent one. The *installed* skill runs the release, not the
> working tree — so the enabling change must already be installed.

## Resolve the plugin root first

Most plugins live flat at the repo root — for them `<plugin_root>` is `.` and
every command below is exactly the historical command. A plugin MAY instead live
in a **subfolder** (so one repo can hold several plugins, or a plugin plus a
dev/consumer workspace). Read `paths.plugin_root` from `.gvt-agent.json` once,
up front; use `.` when the key is absent or empty.

Everywhere below, `<plugin_root>/` prefixes the shipped paths —
`<plugin_root>/.claude-plugin/plugin.json`, `<plugin_root>/CHANGELOG.md`,
`claude plugin validate <plugin_root>`. When `<plugin_root>` is `.` the prefix
collapses to the bare path and the flat-at-root case is unchanged. When it is,
say, `plugin`, the manifest is at `plugin/.claude-plugin/plugin.json`, the
changelog at `plugin/CHANGELOG.md`, and the marketplace entry uses the
**`git-subdir`** source shape (`path` = `<plugin_root>`) instead of the
whole-repo `url` shape (see Phase 5).

## When this applies / when it doesn't

Use it when a plugin in this marketplace needs a new version shipped, or when an
earlier hand-done release left the tag, `plugin.json` version, and marketplace
`ref` out of sync and needs reconciling. Signals: "release", "cut a version",
"bump and ship the plugin", "tag and push", "update the marketplace ref".

It is **not** for:

- **Consumer-side updates** — pulling a newer plugin into a project. Use
  `sync-config`.
- **npm / TypeScript packages** — publishing to npmjs.com via OIDC. Use
  `publish-npm-package`.
- **Non-release work** — adding a skill, fixing a hook, editing docs *without*
  shipping a version. Do the work; release later when asked.

## The invariants this skill protects

A correct release keeps these four facts equal and consistent — call it the
**release triangle** (tag ↔ `plugin.json` ↔ marketplace `ref`, plus CHANGELOG):

1. The git tag is a **plain annotated `vX.Y.Z`** (e.g. `v2.1.0`) — *not* a
   prefixed name like `<plugin>-v2.1.0`, *not* a lightweight tag, *not* a SHA.
2. The tag string minus its leading `v` **equals**
   `<plugin_root>/.claude-plugin/plugin.json` `version` at the tagged commit.
3. The marketplace pins the plugin by **`source.ref` = that exact tag** (never a
   SHA, never a branch).
4. `<plugin_root>/CHANGELOG.md` has a dated `## [X.Y.Z]` section for the released
   version.

The tagged commit must be reachable on `origin`'s default branch. Most "broken
release" reports are really just a **stale local checkout** — assess before you
believe anything is wrong (Phase 1).

## The marketplace is the source of truth — read it live

The catalog file is `.claude-plugin/marketplace.json` in
`GenvidTechnologies/claude-code-marketplace` (catalog `name: gvt-plugins`).
**Read it live; never assume its contents** — entries and refs change:

```bash
gh api repos/GenvidTechnologies/claude-code-marketplace/contents/.claude-plugin/marketplace.json \
  --jq .content | base64 -d
```

Each plugin entry has one of two source shapes, chosen by `<plugin_root>`:

```json
// plugin at repo root (<plugin_root> = ".") — whole-repo "url" source
{
  "name": "<plugin>",
  "source": { "source": "url", "url": "https://github.com/GenvidTechnologies/<repo>.git", "ref": "vX.Y.Z" },
  "description": "..."
}

// plugin in a subfolder (<plugin_root> = "plugin") — "git-subdir" source with a path
{
  "name": "<plugin>",
  "source": { "source": "git-subdir", "url": "https://github.com/GenvidTechnologies/<repo>.git", "path": "<plugin_root>", "ref": "vX.Y.Z" },
  "description": "..."
}
```

For a `git-subdir` source the subdirectory key is **`path`** (`url` and `path`
are both required; `ref` pins the version). The triangle's fact #3 reads the same
`source.ref` in either shape.

## Phase 1 — Assess state (fetch first, then classify)

**Never reason about release state from a local checkout you haven't synced.**
The single most common false alarm is a local branch that is simply behind
`origin` — it looks like a "broken release" but is just stale.

```bash
git fetch origin --tags --prune
```

**You were probably invoked from the just-merged feature branch.** Releasing
right after a PR merges is the common case, so the working checkout is often the
feature branch — which a squash-merge may have already deleted on the remote
(`git status` shows `[gone]`). Get onto an up-to-date default branch *before*
classifying: `git checkout <default-branch> && git merge --ff-only origin/<default-branch>`.
Otherwise Phase 3's "work on the default branch" lands you mid-flow on the wrong
ref.

Then gather the facts (read the remote/authoritative side, not just local):

- Default branch tip: `git rev-parse origin/<default-branch>`; local tip:
  `git rev-parse HEAD`; and `git status -sb`.
- `plugin.json` version at the remote default branch:
  `git show origin/<default-branch>:<plugin_root>/.claude-plugin/plugin.json`
  (when `<plugin_root>` is `.`, this is the bare
  `git show origin/<default-branch>:.claude-plugin/plugin.json`).
- Highest existing tag: `git tag -l 'v*' --sort=-v:refname | head -1`, and
  whether its commit is on the default branch:
  `git merge-base --is-ancestor <tag> origin/<default-branch>`.
- The plugin's marketplace `ref` (read it live, above).
- Whether `<plugin_root>/CHANGELOG.md` has a `## [<version>]` section for that
  version.

> **Windows note.** Under git-bash (the Bash tool on Windows), the
> `git show <ref>:<path>` forms above get mangled — the `:` becomes `;` and `/`
> becomes `\` (the `<plugin_root>/` prefix is part of that colon-path), so
> `git show origin/main:plugin/.claude-plugin/plugin.json` fails with an
> "ambiguous argument" error. Prefix the command with `MSYS_NO_PATHCONV=1`, or
> read the file after checking out the branch (PowerShell is unaffected).

Classify into exactly one state and act accordingly:

| State | How to recognize it | Action |
|-------|---------------------|--------|
| **clean** | Triangle consistent: latest tag ↔ remote `plugin.json` version ↔ marketplace `ref` all equal, tag commit on default branch, CHANGELOG has the section | Proceed to Phase 2 |
| **local-stale-ff** | Working tree clean and local is *behind* `origin/<default-branch>` with no divergent commits (`git rev-list --count HEAD..origin/<default-branch>` > 0, `...origin/<default-branch>..HEAD` == 0) | This is **not** a broken release. Offer `git merge --ff-only origin/<default-branch>`, then **re-run Phase 1** |
| **first-release** | The plugin has **no entry** in `marketplace.json` (and usually no `vX.Y.Z` tag yet) | Skip prior-tag comparisons; Phase 2 builds the *first* entry |
| **genuine-inconsistency** | Any of: tag commit not on default branch (orphaned tag); marketplace `ref` ≠ remote `plugin.json` version; tag string ≠ `plugin.json` version; CHANGELOG missing the released version's section | Enter the reconcile path below |

### Reconcile path (genuine-inconsistency only)

Print the full triangle and **which specific facts disagree** before touching
anything. Treat the **remote default branch's `plugin.json` version** as the
source of truth for "what is released". Offer one fix at a time, each behind an
explicit yes/no, and re-print state after each:

| Disagreement | Offered reconcile |
|--------------|-------------------|
| Marketplace `ref` ≠ released tag | Set `ref` to the tag that *is* on the default branch with a CHANGELOG entry (the true last good release) |
| Tag commit not on default branch (orphaned) | Report it; only with explicit confirmation, delete + recreate the tag on the correct commit. **Never silently move a tag** |
| Tag ↔ `plugin.json` mismatch | Align the lagging side to the released version on the default branch |
| Missing CHANGELOG section | Add the dated section for the already-tagged version from the commit range since the prior tag |

If the only problem is a stale local checkout, you are in **local-stale-ff**,
not here — do not "reconcile" a fast-forward.

## Phase 2 — Determine the version and release type

**Release type.** If the plugin has no entry in `marketplace.json`, this is a
**first release**; otherwise it is a **version bump**.

**Version.** Infer the bump from the changes since the last tag, then confirm
with the user (accept an explicit override):

- A new `skills/<name>/` or `agents/<name>.md`, or any user-visible feature →
  **minor**.
- Only fixes/internal changes → **patch**.
- A breaking contract change (frontmatter/`metadata.expects`, removed skill) →
  **major**.

```bash
git log --oneline <last-tag>..origin/<default-branch>   # what's shipping
```

**Enforce: the version must not already be taken.** Before accepting `X.Y.Z`,
assert `vX.Y.Z` is not an existing tag **and** is not already any plugin's
marketplace `ref`:

```bash
git tag -l vX.Y.Z          # must be empty
```

A version already consumed by a tag or a `ref` cannot be reused — pick the next
free one. State the chosen first-publishable / next version explicitly.

## Phase 3 — Prepare the plugin repo (one commit)

Make all in-repo edits, then a single release commit. Work on the default branch
(or a short-lived branch if it is protected — see Phase 5).

1. **Version.** Set `<plugin_root>/.claude-plugin/plugin.json` `version` to `X.Y.Z`.
2. **CHANGELOG.** In `<plugin_root>/CHANGELOG.md`, move the `## [Unreleased]`
   content into a new dated section `## [X.Y.Z] - <today>` (Keep a Changelog
   format), leaving an empty `## [Unreleased]` above it. Use the session's
   current date. If `<plugin_root>` has no `CHANGELOG.md`, create one (first
   release) seeded from the history.
3. **Validate** before committing (point validate at the plugin root):

   ```bash
   claude plugin validate <plugin_root>      # bare `.` when plugin is at the repo root
   ```

4. **Commit** both files together with the subject `release: vX.Y.Z`. Show the
   diff and confirm first.

## Phase 4 — CI gate (graceful)

A red default branch is a stop sign; absence of CI is not.

- If `.github/workflows/` has no workflow files → report "no CI configured,
  skipping CI gate" and continue.
- If a PR was opened (protected-branch path) → `gh pr checks <pr>` must be
  green/neutral before tagging.
- Otherwise check the release commit directly:

  ```bash
  gh api repos/<org>/<repo>/commits/<sha>/check-runs \
    --jq '.check_runs[] | {name, status, conclusion}'
  ```

  Require every concluded run to be `success` (or `neutral`/`skipped`). Treat
  "no checks reported" as pass-with-warning, not failure. **Tag only after the
  release commit's checks are green.**

## Phase 5 — Release runbook (ordered; tag before marketplace)

Confirm before each irreversible push. The ordering is mandatory: the tag must
exist and be pushed **before** the marketplace points at it, or every consumer's
`/plugin install` breaks against a missing ref.

1. **Land the release commit on the default branch.**
   - *Unprotected branch (maintainer release):* `git push origin <default-branch>`.
   - *Protected branch:* push a branch, open a PR, merge it. (Try the direct
     push first; if it is rejected by protection, fall back to a PR.)
2. **CI gate** — Phase 4, on the landed commit.
3. **Create the annotated tag** on the landed release commit and push it:

   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

   Plain `vX.Y.Z`. Confirm `vX.Y.Z` (minus `v`) equals
   `<plugin_root>/.claude-plugin/plugin.json` `version`.
4. **Update the marketplace `ref`.** Clone the catalog shallowly into a temp
   dir, edit only the one ref value, review the diff, commit, push:

   ```bash
   git clone --depth 1 https://github.com/GenvidTechnologies/claude-code-marketplace.git <tmp>
   ```

   In `<tmp>/.claude-plugin/marketplace.json`, the edit depends on the case —
   each keeps the JSON byte-stable except the lines it must touch (**never
   re-serialize the JSON**: re-serializing reorders keys and reindents, producing
   a noisy, unreviewable diff):

   - **Version bump (steady state).** Change **only** the target plugin's
     `"ref": "vOLD"` to `"ref": "vX.Y.Z"` — a single-value string replace.
     Same for either source shape (`url` or `git-subdir`).
   - **First release at the repo root** (`<plugin_root>` = `.`). Add a new
     `plugins[]` entry with `name`, `source.source: "url"`, `source.url`,
     `source.ref: "vX.Y.Z"`, `description`.
   - **First release from a subfolder** (`<plugin_root>` ≠ `.`). Add a new
     `plugins[]` entry whose source is the `git-subdir` shape:
     `source.source: "git-subdir"`, `source.url`, `source.path: "<plugin_root>"`,
     `source.ref: "vX.Y.Z"`, `description`.
   - **🔻 First *subfolder* publish of a plugin that already has a `url` entry**
     (the one-time migration moment). This is the **single named exception** to
     "one string, one edit": the existing entry transitions from `url` to
     `git-subdir` — change `source.source` `"url"`→`"git-subdir"`, **add**
     `source.path: "<plugin_root>"`, and bump `source.ref`. Touch nothing else;
     the `git -C <tmp> diff` below must show only those lines.

   Then:

   ```bash
   git -C <tmp> diff                 # only the ref line (bump); or, on a first
                                     # subfolder publish, only source/path/ref
   git -C <tmp> commit -am "release: <plugin> vX.Y.Z"
   git -C <tmp> push
   ```

5. **🔴 Hand off `/plugin update` (human only).** `/plugin update` is a Claude
   Code slash command, **not a shell command** — a skill cannot run it. Tell the
   user to run, in their Claude Code session:

   ```
   /plugin update <plugin>@gvt-plugins
   ```

   and then restart / reload so the new contents load. Optionally verify with
   `claude plugin details <plugin>` (shows the new version + components).

## Rollback

The ordering makes the failure windows safe:

- **Release commit pushed, tag not yet pushed.** Nothing references the new
  version. Continue from tagging; if the wrong commit got the work, add a
  corrective commit — never force-push the default branch.
- **Tag pushed, marketplace push failed.** The tag exists but the catalog still
  points at the previous good `ref` — **consumers are unaffected** (they resolve
  the old version). Recovery is just re-pushing the marketplace edit. This is
  exactly why tag precedes marketplace.
- **Wrong version tagged and marketplace already updated.** Repoint the
  marketplace `ref` back to the last good tag first (consumer-facing fix), then
  delete + recreate the bad tag with confirmation.

## Why these choices

- **Fetch and classify before judging.** A local branch behind `origin` is the
  most common false "broken release". Phase 1 fetches first and treats
  fast-forward as a non-event, never a defect.
- **Tag before marketplace `ref`.** The `ref` is what consumers resolve;
  pointing it at a real, pushed tag is the commit point, and a marketplace push
  that fails after tagging leaves consumers untouched.
- **Single-value string replace on `marketplace.json`.** Re-serializing JSON
  reorders keys and changes indentation, turning a one-line bump into an
  unreviewable diff. Every steady-state release is one string; keep it one
  string. The lone exception is the first subfolder publish (`url`→`git-subdir`),
  which touches exactly `source`, `path`, and `ref` — still a hand-checked,
  minimal diff, never a re-serialization.

- **`plugin_root` defaults to `.`.** A plugin at the repo root resolves every
  path to its historical form and keeps the whole-repo `url` source, so existing
  plugins are unaffected; only a repo that opts into a subfolder (via
  `paths.plugin_root`) gets the `git-subdir` shape.
- **Plain annotated `vX.Y.Z`, ref-pinned (not SHA).** A readable tag that equals
  `plugin.json` `version` is the contract the marketplace and consumers share; a
  SHA pin hides which version is live and breaks the triangle.
- **Refuse an already-taken version.** A tag or `ref` that already exists cannot
  be reused; catching it in Phase 2 prevents a failed `git tag` mid-release.
