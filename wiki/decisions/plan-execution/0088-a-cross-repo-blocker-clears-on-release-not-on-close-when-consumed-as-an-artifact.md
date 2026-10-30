---
type: decision-record
title: 'A cross-repo blocker consumed as a released artifact clears on release, not on close; consumption is inferred from tracked manifests and the registry is authoritative'
description: 'A closed cross-repo blocker clears only for a source-consumed repo or after a registry publish; otherwise it is closed-unreleased or release-unverified, and the content check runs at plan-task adoption.'
tags: [decisions, plan-execution]
status: stable
---
# 0088. A cross-repo blocker consumed as a released artifact clears on release, not on close; consumption is inferred from tracked manifests and the registry is authoritative

- **Status:** accepted
- **Date:** 2026-10-30
- **Issue:** #607 (planned with #209, #230, #636, #775, #783)

## Context

`plan-next-issue` and `plan-task` read a blocker as cleared once its issue closed. For a blocker in the same repo that is right: the fix is in the tree. For a blocker in another repo it is not always right. When this repo consumes that repo as a published package, the fix reaches this repo only when a version is released. #607 is the case where a cross-repo issue was closed and merged upstream, the dependent work was ranked ready, and the released package still lacked the fix.

The reference grammar, the `[refs]` comparand and the readiness states are decided in ADR-0087. This record decides one rule inside them: what "cleared" means for a closed cross-repo reference, how the consumption mode is found, and where the checks run.

## Decision

### A closed cross-repo blocker clears on release when consumed as an artifact

The consumption mode is inferred from tracked manifests, in this order:

1. A github `.gitmodules` URL names the repo, or a tracked `package.json` dependency spec is a git or GitHub URL naming it. This repo consumes the source directly, so closed means cleared, and the outcome is `cleared` with `via: source-consumed`.
2. A tracked `package.json` dependency whose name's last path segment equals the repo name, confirmed by the package's `repository.url` naming `owner/repo`. The blocker is a released-artifact (npm) blocker. If the registry shows a version published after the upstream issue's close, it is `cleared` with `via: released (version check only)`. Otherwise the outcome is `closed-unreleased`, with "latest is X".
3. Anything else is `closed-release-unverified`, named: another ecosystem (pip, cargo, a marketplace `source.ref`, a vendored blob) or a package whose name differs from its repo name.

A same-repo blocker is unchanged: closed means cleared.

### D3: manifest inference, no config

**Chosen: "manifest inference, no config".** The script reads only the repo's tracked `package.json` and `.gitmodules`, and it prints the registry commands for the caller to run, consistent with its purity in ADR-0087.

**Rejected, "D3-B: a declared `bugTracker.releaseSources` map"** (`{"owner/repo": {"kind": "npm", "package": ...}}`). It is explicit and would cover every ecosystem by declaration. It was rejected because leak-guard blocks the scope-prefixed npm package name inside `.gvt-agent.json`, which is exactly the value this repo would have to declare, and because it adds config every consumer must maintain.

**Named miss.** A package whose name differs from its repo name lands in `closed-release-unverified`. That is safe: it is never silently cleared.

### The registry is authoritative; GitHub Releases are rejected

The "released" source is the npm registry: `npm view <dep> time --json --prefer-online` and `npm view <dep> repository.url --prefer-online`. GitHub Releases were rejected as a proxy because they lag the registry. Measured while designing: one repo had no GitHub Releases at all, and another showed a Releases "Latest" of 2.0.0 while the registry's latest was 3.0.0. A check keyed to Releases would call a published fix unreleased.

The cost is two registry calls per checked package, capped at 5 packages per run, with the overflow reported.

### SD8: where the two checks run

- **The version check** runs at triage and at ranking, in the script's lookup plan. A cleared result is labelled `released (version check only)`, because a publish after the close proves a release happened, not that it contains the fix.
- **The artifact content check** (download the published artifact and confirm the fix is in it) runs in `plan-task` at adoption, in its own new empty directory, because the downloaded content is untrusted data. `plan-next-issue` hands the `released (version check only)` fact to `plan-task` in its readiness findings, labelled by whether it was verified this run.

### Readiness effect and `--non-interactive`

- `closed-unreleased` is `blocked`, with the rationale "blocker merged upstream, not yet released, latest is X". No label is removed automatically; the remedy is a comment.
- `closed-release-unverified` is `ready-caveat` when interactive, so the user sees the caveat and decides.
- Under `--non-interactive`, a release-unverified blocker counts as blocked. Nobody is present to confirm the caveat, which mirrors the rule that an inherited deadline is shown but not acted on there.

## Compromise

- **D3-B** was rejected for the reasons above.
- **GitHub Releases as the signal** was rejected for the measured lag.
- **The version check alone is weaker than the content check.** A later publish does not prove the fix shipped in it, so the label says "version check only" and the content check is owed before adoption. Doing the content check at ranking was rejected because it downloads and reads untrusted content for every candidate, where adoption does it once for the one issue chosen.
- **Inference misses by design.** Non-npm ecosystems and renamed packages are reported as unverified rather than guessed, so a user sees a caveat in cases a declared map would have settled.

## Consequences

- A cross-repo dependency on a published package no longer clears the moment its issue closes, so the "ready" shortlist stops offering work whose upstream fix is unreleased.
- Triage and ranking both call the registry, bounded by the 5-package cap, and a `plan-task` adoption of a version-checked blocker owes one content check.
- A consumer whose dependency is consumed from source (a github `.gitmodules` URL or a git spec) sees no change: closed still means cleared.
- Tracker kinds other than github, and ecosystems without a registry command, get `closed-release-unverified` rather than a false clear.

**Related records:** ADR-0087 (the scripted grammar, the `[refs]` outcomes and the readiness precedence this rule sits inside; it lists `closed-unreleased` and `closed-release-unverified` among the outcomes); ADR-0085 (the `plan-next-issue` ranking and the inherited-versus-verified treatment of dates that this rule mirrors under `--non-interactive`).
