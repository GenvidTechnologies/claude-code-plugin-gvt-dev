---
name: migrate-cordova-ci
description: >
  Migrate a Cordova plugin's CI/CD from CircleCI to GitHub Actions: per-platform
  android.yml/ios.yml with a smoke tier (emulator/simulator compile-link, no
  secrets, on PRs + main) and a distribute tier (signed sideload artifact on
  workflow_dispatch + vX.Y.Z tags, signing material from 1Password via a single
  OP_SERVICE_ACCOUNT_TOKEN). Removes .circleci/config.yml and updates docs. Use
  when porting a Cordova plugin off CircleCI, or replicating the
  cordova-plugin-marketplace CI setup onto a sibling cordova-plugin-* repo (e.g.
  cordova-plugin-eos). Not for C3 addons (c3addon-* repos, e.g.
  c3addon-genvid-epic-online-services), which use a different CI toolchain.
metadata:
  expects:
    files:
      - path: package.json
        required: false
        reason: The Cordova plugin manifest the skill adds :sim / version-guard scripts to — only this skill needs it, so not a universal contract requirement
      - path: .circleci/config.yml
        required: false
        reason: The CircleCI config being replaced and removed — present only in not-yet-migrated repos
    config:
      - key: cordovaCi.opVault
        in: .gvt-agent.json
        required: false
        reason: The 1Password vault holding this plugin's signing material (Android keystore, iOS cert/profile) — project-shared and scoped to the OP_SERVICE_ACCOUNT_TOKEN service account; the migration substitutes it for <OP_VAULT> in the distribute workflows. Only this skill needs it, so it is not a universal contract requirement
    tools:
      - command: gh
        required: false
        reason: Drives the live-CI gate (draft PR, workflow_dispatch) and can fetch the reference workflows from cordova-plugin-marketplace
      - command: git
        required: false
        reason: One small commit per migration step
      - command: node
        required: false
        reason: Runs the version-guard script the migration adds
      - command: op
        required: false
        reason: The 1Password CLI the distribute workflows use to fetch dynamically-named signing files (keystore, .p12, .mobileprovision)
---

# Migrate Cordova CI from CircleCI to GitHub Actions

This skill migrates a Cordova plugin's CI/CD pipeline from CircleCI to GitHub
Actions, delivering two per-platform workflows (`android.yml`, `ios.yml`) each
with a **smoke tier** (compile/link on PRs and pushes to main, no secrets) and a
**distribute tier** (signed sideload artifact triggered by `workflow_dispatch` or
a `vX.Y.Z` tag, signing material fetched from 1Password via a single
`OP_SERVICE_ACCOUNT_TOKEN` secret).

The workflows are bundled as parameterized templates under this skill's
`templates/` directory, lifted from
`GenvidTechnologies/cordova-plugin-marketplace@9b6721b`. Copy them into the target
repo, substitute the per-repo placeholders listed below, and — if significant time
has passed since that commit — diff against `cordova-plugin-marketplace@main`
before use:

```bash
gh api repos/GenvidTechnologies/cordova-plugin-marketplace/contents/.github/workflows/android.yml \
  --jq .content | base64 -d
gh api repos/GenvidTechnologies/cordova-plugin-marketplace/contents/.github/workflows/ios.yml \
  --jq .content | base64 -d
```

Work in small, reviewable commits — one logical change per commit — so the diff
reads as a clear migration sequence.

## Configuration: the signing vault

The 1Password vault that holds the plugin's signing material (Android keystore,
iOS cert/profile) is **project-specific**, so it lives in the target repo's
`.gvt-agent.json` rather than being baked into the templates:

```json
{
  "cordovaCi": {
    "opVault": "Project-Burbank"
  }
}
```

`opVault` is the vault the repo's `OP_SERVICE_ACCOUNT_TOKEN` service account is
scoped to. The migration substitutes its value for the `<OP_VAULT>` placeholder
throughout `android.yml`/`ios.yml`. **If the block is absent, don't guess** — ask
the operator which vault holds the signing assets and offer to add the
`cordovaCi.opVault` key to `.gvt-agent.json` before substituting. The signing
**item** names within that vault still vary per plugin and stay as the per-repo
placeholders in the table below.

## Per-repo parameter table

These are the ONLY values you change in the templates. Everything else is
copy-paste from the bundled files.

| Placeholder | What it is | Template(s) |
|---|---|---|
| `<DEMO_BUNDLE_ID>` | Demo app bundle id (e.g. `com.genvidtech.marketplacedemo`) | `config.xml.snippet`, `ios.yml` |
| `<PLUGIN_TGZ_STEM>` | Plugin tarball name stem (e.g. `genvid-cordova-plugin-marketplace-`) | `version-guard.js`, `config.xml.snippet` |
| `<TESTS_TGZ_STEM>` | Tests tarball name stem (e.g. `cordova-plugin-marketplace-tests-`) | `version-guard.js`, `config.xml.snippet` |
| `<ARTIFACT_PREFIX>` | Uploaded-artifact name prefix (e.g. `marketplace`) | `android.yml`, `ios.yml` |
| `<IOS_DEPLOYMENT_TARGET>` | iOS deployment-target floor (e.g. `14.0`; raise if the plugin uses `os.Logger` or other newer APIs) | `config.xml.snippet` |
| `<VERSION>` | Current package version (e.g. `1.2.3`); must equal `package.json` / `tests/package.json` / `demo/config.xml` widget version | `config.xml.snippet` |
| `<OP_VAULT>` | 1Password signing vault — **sourced from `cordovaCi.opVault` in `.gvt-agent.json`**, not hand-picked (see Configuration above) | `android.yml`, `ios.yml` |
| `<OP_KEYSTORE_ITEM>` | 1Password item name holding the Android keystore (within `<OP_VAULT>`) | `android.yml` |
| `<OP_IOS_CERT_ITEM>` | 1Password item holding the iOS dev signing cert id, password, and `.p12` | `ios.yml` |
| `<OP_IOS_TEAM_ITEM>` | 1Password item holding the Apple development `team_id` (DISTINCT from the cert item) | `ios.yml` |
| `<OP_IOS_AUTHORITY_ITEM>` | 1Password item holding the WWDR / authority cert | `ios.yml` |
| `<OP_IOS_PROFILE_ITEM>` | 1Password item holding the provisioning profile | `ios.yml` |
| `<OP_IOS_PROFILE_FILENAME>` | Filename of the provisioning profile attachment within that item | `ios.yml` |

> All `op://` references resolve under the **configured shared vault**
> (`<OP_VAULT>` = `cordovaCi.opVault`) — the vault the `OP_SERVICE_ACCOUNT_TOKEN`
> service account is scoped to. Assets in personal or Employee vaults are
> unreadable by service accounts (see the vault gotcha in Step 3).

## Pre-flight: iOS distribute gate

Before starting, confirm the iOS signing `.p12` stored in 1Password contains the
**private key** alongside the certificate. A cert-only `.p12` imports as "1
certificate" rather than "1 identity", and `xcodebuild` will fail with "No signing
certificate ... with a private key was found". If the `.p12` in the vault is
cert-only, export a new one from Keychain Access with the private key included and
update the vault item before running the distribute tier.

> **🔴 This check is a gate, not a footnote.** The `ios.yml` template ships
> with the distribute job enabled. A cert-only `.p12` will cause that job to
> fail at the keychain-import step with a cryptic error. Verify now, not after
> the live-CI run.

---

## Step 1 — `package.json` scripts (one commit)

Add four scripts to `package.json`:

- **`setup:demo:sim`** — Cordova project init only (creates `demo/`, no platform
  add, no signing config). This is the entry point for both smoke jobs; skipping
  signing avoids unnecessary credential exposure in the smoke tier.
- **`setup:demo:sim:ios`** — `cordova platform add ios` with no device shims.
  Used by the iOS smoke and distribute jobs (both build for simulator/device using
  the same platform setup).
- **`build:demo:ios:sim`** — `cordova build ios` without `--device` or
  `--release`. Compiles and links for the simulator; no signing required.
- **`version-guard`** — `node scripts/version-guard.js`. Copy
  `templates/version-guard.js` into `scripts/` and substitute `<PLUGIN_TGZ_STEM>`
  and `<TESTS_TGZ_STEM>`. The guard asserts that `package.json` version,
  `tests/package.json` version, `demo/config.xml` widget version, and both pinned
  `.tgz` filenames all match — `npm run setup:demo` silently installs the wrong
  package if any of these drift.

Also apply `config.xml.snippet` to `demo/config.xml`: substitute
`<DEMO_BUNDLE_ID>`, `<PLUGIN_TGZ_STEM>`, `<TESTS_TGZ_STEM>`,
`<IOS_DEPLOYMENT_TARGET>`, and `<VERSION>` (must equal the current
`package.json` version).

Verify locally: `npm run version-guard` must exit 0.

Commit: `ci: add sim setup scripts and version-guard`

---

## Step 2 — `android.yml` (one commit)

Copy `templates/android.yml` to `.github/workflows/android.yml`. Substitute:
- `<ARTIFACT_PREFIX>` in the Upload APK artifact step's `name:` field
- `<OP_VAULT>` (from `cordovaCi.opVault`) and `<OP_KEYSTORE_ITEM>` in all four
  `op://<OP_VAULT>/<OP_KEYSTORE_ITEM>/...` references (the three `load-secrets`
  fields and the `op read` command)

**Smoke job** — runs on `ubuntu-latest` with `android-actions/setup-android`.
Builds the debug APK (compile/link). No emulator is started: the smoke tier runs
no on-device tests, so booting one adds flake with zero signal.

**Distribute job** — builds a signed release APK. Keystore coordinates (`alias`,
`password`, `filename`) are loaded as static fields via `1Password/load-secrets-action`;
the keystore file itself (dynamic filename) is fetched with `op read`. Produces a
sideloadable APK (`--packageType=apk`).

> **🔴 AAB ≠ sideloadable.** The `cordova build android --release` command
> defaults to an AAB (Android App Bundle). The template passes `--packageType=apk`
> explicitly. Do not remove it — `adb install` requires an APK; testers cannot
> sideload an AAB.

> **🔴 Artifact names cannot contain `/`.** `github.ref_name` on a branch
> `workflow_dispatch` is the branch name, which may include `/` (e.g.
> `feature/foo`). The template sanitizes with `${GITHUB_REF_NAME//\//-}` in the
> "Compute artifact label" step. Keep this step intact.

> **🔴 `load-secrets-action` resolves static `op://ref → value` only.** Cert,
> profile, and keystore are file attachments with dynamic filenames — they cannot
> be fetched via the action's `env:` map. Fetch them with the `op` CLI
> (`1Password/install-cli-action` + `op read`), as the template does. Removing the
> `op read` step and substituting a static secret will fail for any attachment
> whose filename is not hard-coded.

Commit: `ci: add android.yml (smoke + distribute)`

---

## Step 3 — `ios.yml` (one commit)

Copy `templates/ios.yml` to `.github/workflows/ios.yml`. Substitute:
- `<ARTIFACT_PREFIX>` in the Upload .ipa artifact step
- `<DEMO_BUNDLE_ID>` in the profile fetch comment
- `<OP_VAULT>` (from `cordovaCi.opVault`), then `<OP_IOS_CERT_ITEM>`,
  `<OP_IOS_TEAM_ITEM>`, `<OP_IOS_AUTHORITY_ITEM>`, `<OP_IOS_PROFILE_ITEM>`,
  `<OP_IOS_PROFILE_FILENAME>` throughout the distribute job

**Smoke job** — runs on `macos-15`. Uses `maxim-lobanov/setup-xcode` with
`xcode-version: latest-stable`. Builds the simulator target; no secrets or signing
config required.

> **🔴 Never pin a specific Xcode version for the simulator build.** A pinned
> Xcode (e.g. `16.2`) may select an SDK whose simulator runtime is not installed
> on the runner image, causing asset-catalog compilation to fail with "No simulator
> runtime version available" (`actool` error). `latest-stable` always selects an
> Xcode that has a matching runtime installed.

**Distribute job** — builds a Development-signed `.ipa`. Signing coordinates
(team id, cert id/password, authority cert id) are loaded via
`1Password/load-secrets-action`; the `.p12`, provisioning profile, and optional
authority `.cer` are fetched with `op read`. Trigger gating is via per-job `if:`
conditions (not `on:`) because `on:` is workflow-level and both jobs share the
same triggers.

> **🔴 Service accounts cannot read personal or Employee vaults.** All signing
> assets must live in the shared vault configured as `cordovaCi.opVault` — the one
> the `OP_SERVICE_ACCOUNT_TOKEN` is scoped to. The `ios.yml` template's
> `op://<OP_VAULT>/...` paths resolve there. If a 1Password item is currently in a
> personal or Employee vault, move it into the shared vault before the distribute run.

Remind the user: the signing block (keychain import, profile UUID extraction,
manual `build.json`, `.ipa` export path) can only be fully validated on a live
macOS runner — expect to iterate during the first `workflow_dispatch` run.

Commit: `ci: add ios.yml (smoke + distribute)`

---

## Step 4 — Live-CI gate

Push the branch and open a **draft PR**. Confirm both smoke jobs (`Android /
Smoke build` and `iOS / Smoke build`) go green before proceeding.

Once smoke is green, verify the distribute tier via **`workflow_dispatch`** on the
branch — do NOT use a `vX.Y.Z` tag for this verification step.

> **🔴 A `v*.*.*` tag fires `publish.yml` as well as the distribute jobs.** If
> the repo has a `publish.yml` (e.g. for npm publishing), a throwaway tag triggers
> an accidental publish. Verify distribute via `workflow_dispatch` only.

Both distribute jobs must complete successfully (signed APK artifact downloadable;
signed `.ipa` artifact downloadable) before moving on. If the iOS distribute job
fails at the keychain-import step, revisit the Pre-flight gate above — the `.p12`
is likely cert-only.

---

## Step 5 — Remove `.circleci/config.yml` (one commit)

```bash
git rm .circleci/config.yml
# If the directory is now empty:
git rm -r .circleci/
```

Do not leave a dual pipeline. Commit: `ci: remove CircleCI config`

---

## Step 6 — Docs (one commit)

Update the target repo's documentation to reflect the new CI setup:

- **README** — update the CI/badge section to point at the new GitHub Actions
  workflows. Remove any CircleCI badge or build-status reference.
- **CLAUDE.md** — update any CI-related notes or script references.
- **Grep for stale references** — do not assume specific headings; scan the whole
  repo:

  ```bash
  grep -r "circleci\|circle-ci\|CircleCI" --include="*.md" --include="*.json" -l
  grep -r "setup:demo:android\|build:demo:android" --include="*.md" -l
  ```

  Fix any stale script names or CI provider references found. Also grep for any
  references to the old scripts being replaced by the new `:sim` variants.

Commit: `docs: update CI references after CircleCI → GitHub Actions migration`

---

## Done criteria

The migration is complete when:

- Both smoke jobs are green on PRs and pushes to `main`.
- Both distribute jobs completed successfully via `workflow_dispatch` (not a tag).
- `.circleci/config.yml` is removed; no dual pipeline exists.
- README, CLAUDE.md, and any other docs no longer reference CircleCI.
- `npm run version-guard` exits 0 locally.

If substantial time has passed since `cordova-plugin-marketplace@9b6721b`,
diff the bundled templates against `@main` (commands in the intro above) to catch
any upstream workflow improvements before closing the PR.
