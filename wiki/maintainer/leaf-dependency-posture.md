---
type: practice-note
title: 'Leaf-Dependency Posture'
description: 'Which shared leaf libraries gvt-dev pins, where the mechanism/policy boundary sits, how code reaches a leaf, and the discipline for bumping an exact pin.'
tags: [maintainer, dependencies]
status: stable
---
# Leaf-Dependency Posture

How `gvt-dev` relates to the shared leaf libraries it pins. The rules here survive every version; per-version history lives in the [Leaf-Dependency Ledger](leaf-dependency-ledger.md).

## Scope

The leaf libraries `gvt-dev` pins are the entries under `dependencies` in `plugin/package.json`, which is the authority. This page never states the current pin version; read the manifest, and the lockfile beside it, for that.

## Boundary

Mechanism lives upstream in the leaf, and policy stays plugin-side ([ADR-0049](../decisions/audit-core/0049-audit-core-mechanism-policy-boundary.md)). Policy modules may depend on mechanism, never the other way round.

Do not force a partial fit. When a capability sits on the right side of the boundary but needs a different shape than the leaf offers, request the right shape upstream and wait, rather than wedging a workaround in locally (the anti-pattern ADR-0051 adopts by name, in its section on the boundary convergence: [ADR-0051](../decisions/audit-core/0051-npm-permitted-for-lockfile-gated-plugin-dependency.md)).

## How code reaches a leaf

- **Inside `plugin/`:** import through the `#audit-core` imports alias declared in `plugin/package.json` ([ADR-0060](../decisions/audit-core/0060-dependency-preflight-sequencing-leak-guard-exemption-and-dev-install.md)).
- **Outside `plugin/`** (for example an eval harness), the alias does not resolve. Import the plugin's own re-export seam, `audit-core-reexport.mjs` under the audit-conventions skill's `scripts/lib/` directory ([ADR-0071](../decisions/audit-core/0071-gvt-dev-adopts-audit-core-deletes-its-copies-and-closes-the-458-deferrals.md)). The seam lists its exports by name, never `export *`.
- **Never the scoped package name in code.** Leak-guard blocks it everywhere except `*.md` and the plugin's own `package.json` and lockfile (see [Release-Cycle Rules](release-cycle-rules.md)).

## Pin discipline

- The pin is exact and the lockfile is committed. A bump is an explicit, reviewed act.
- Read the ledger's newest entry, and its next-bump checks, before bumping.
- Export-surface drift is caught upstream, by the leaf's signature tests (audit-core PR 7) plus its dts-parity check. Under an exact pin that is sufficient, so `gvt-dev` runs no consumer-side drift check (ADR-0071, decision 2).
- Re-entry condition for building one: the pin becomes a range, upstream drops those tests, or a second consumer appears.

## Leaf work goes through issues

A change to a leaf is filed as an issue on the leaf's own repository, never committed from a `gvt-dev` session, even when the leaf is cloned locally. `gvt-dev` then waits for the release and bumps the pin.
