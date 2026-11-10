---
type: decision-record
title: 'The wiki practice ships as its own plugin, gvt-wiki, which depends on gvt-dev'
description: 'The maintain-wiki skill, the wiki-librarian agent and their templates and lint script move to a new plugin, gvt-wiki, which depends on gvt-dev by bare name; gvt-dev never depends on gvt-wiki.'
tags: [decisions, plugin-structure]
status: stable
---
# 0095. The wiki practice ships as its own plugin, gvt-wiki, which depends on gvt-dev

- **Status:** accepted
- **Date:** 2026-11-10
- **Issue:** #440 (part of #438)

## Context

#438 asks whether the wiki practice should leave `gvt-dev` and ship as its own
plugin. #440 is the gate: #441 (the move), #442 (the contract) and #443 (the
backlog) wait for its answer.

A park comment on #440, dated 2026-08-27, reached the decision "split". The
issue was then parked on #452. #452 closed on 2026-09-01 and #458 closed on 2026-10-11. Since
the park comment, the records 0049 to 0094 have landed, and several of them change the
facts the park comment rested on. This record re-confirms the split on
current grounds. It corrects the premises that changed, and it says so where
it does.

What exists today:

- the `maintain-wiki` skill: `SKILL.md`, four templates, and `scripts/` with `wiki-lint.mjs`, its `lib/` and its tests;
- the `wiki-librarian` agent;
- the `wiki` block of `.gvt-agent.json`, which `audit-conventions`, `create-adr`, `run-retro` and `triage-issues` also read.

At the authoring commit the skill and the agent are 16 of the 152 tracked
files under `plugin/` (`git ls-files`). Two consumers use the practice:
burbank-playfab, whose docs root is an OKF bundle (#421), and construct3-chef,
which adopted it (#348).

## Decision

**1. Split.** The wiki practice ships as `gvt-wiki`, from a new repository,
`GenvidTechnologies/claude-code-plugin-gvt-wiki`. The `gvt-plugins` catalog
publishes it from a `plugin/` subdirectory by git-subdir. It is the fourth
instance of the pattern in ADR-0005: ADR-0005 decided that layout for
`gvt-dev`, and the `gvt-construct3` and `gvt-fleet` repositories apply it in
their own repositories, each with a `plugin/` subdirectory. The park comment
called it the third. The `gvt-fleet` repository was
created on 2026-11-05.

It is not a second plugin inside this repository. Three things in the
tooling assume one plugin per repository:

- `release-plugin` resolves the newest `v*` tag, and every plugin in the repository would share that tag namespace;
- `release-plugin` reads `paths.plugin_root` once;
- the audit derives its author-time gate and its component walk from one plugin root.

**2. Why split, stated as four counterfactual grounds.**

- (a) *Release cadence.* A chain of wiki issues holds back the releases of unrelated work. `wiki/maintainer/release-cycle-rules.md` gives the worked example. The `maintain-wiki` chain that began with #143 left 32 `[Unreleased]` CHANGELOG bullets unreleasable on 2026-08-04. Only 2 of them were the unfinished feature. The other 30 were finished work on released components.
- (b) *Consumers who want one plugin only.* A `gvt-dev` consumer that does not keep a wiki carries no wiki surface. The limit: the reverse does not hold. A wiki consumer needs `gvt-dev` (decision 4), so only one of the two directions is delivered.
- (c) *Surface area.* #142 asks for a thin layer. The move takes 2 components and 16 files out of `gvt-dev`: 152 − 16 = 136 tracked files stay. The figure was measured at the authoring commit and decays.
- (d) *Independent ownership and versioning.* The wiki practice gets its own repository, tracker and tags. The limit: `gvt-wiki` cannot state a minimum `gvt-dev` version (decision 4).

**3. Consistency with #142.** The epic says:
"Depending on existing packages/plugins is expected and encouraged", and
"Don't invent new mechanisms". The split follows both. It adds a packaging
boundary and no engine. It reuses the layout of ADR-0005 and the manifest `dependencies`
mechanism that `gvt-fleet` already uses. This record reads #142 the way
ADR-0092 decision 4 does: a thin contract-and-scaffold layer over borrowed
runtimes, not a bespoke engine.

One departure. #142 describes `gvt-dev` as the practice layer. After the
split, the Environment pillar ships from a second plugin.

**4. `gvt-wiki` depends on `gvt-dev`; `gvt-dev` never depends on `gvt-wiki`.**
`gvt-wiki` declares `"dependencies": ["gvt-dev"]` in its `plugin.json`, by
bare name. `gvt-fleet` declares the same. The Claude Code documentation
defines `dependencies` as "Plugins that must be enabled for this one to work"
(plugin manifest reference). A plugin with an unmet dependency can install and
stay disabled, and `claude plugin list --json` reports it as
`dependency-unsatisfied` (plugin troubleshooting). The documentation describes
no optional mode.

The dependency is bare because a version range resolves against tags named
`<plugin-name>--v<version>` (plugin manifest reference), and the `gvt-dev`
tags are `vX.Y.Z`. So `gvt-wiki` cannot require a minimum `gvt-dev` version
today.

`maintain-wiki` keeps dispatching `gvt-dev:tech-writer` and keeps the shared
writing-style block. This reverses two commitments of the park comment: "own
writer agent" and "no `dependencies` either way". A second writer agent and a
copy of the writing-style rules would duplicate and then drift.

The `maintain-wiki` skill cites `${CLAUDE_PLUGIN_ROOT}/docs/writing-style.md`.
Inferred, not tested: after the move that variable resolves to the `gvt-wiki`
root, so the citation stops working. #441 supplies the mechanism.

**5. The gating premise is corrected.** #440 assumed that the marketplace
entry could gate single skills of a plugin, so that the split could land in
parts. The marketplace reference does not allow it for this repository. With
a `plugin.json` present, `strict: false` plus a component array in the entry
is a load conflict ("has conflicting manifests"). With `strict: true` the
entry's arrays are appended, not subtracted. The documentation also says that
Claude Code has no release-channel concept. `gvt-dev` ships a `plugin.json`.
So the split lands whole, in one `gvt-dev` major release.

The Claude Code pages that decisions 4 and 5 cite were read on 2026-11-10:

- plugin manifest reference: https://code.claude.com/docs/en/plugins/manifest-reference.md
- plugin troubleshooting: https://code.claude.com/docs/en/plugins/troubleshooting.md
- marketplace reference: https://code.claude.com/docs/en/plugins/marketplace-reference.md
- hosting a marketplace (release channels): https://code.claude.com/docs/en/plugins/host-marketplace.md

**6. Clean break.** One major version bump. No shim, and no redirect stubs.
`gvt-wiki` starts with fresh history. Its `MIGRATION.md` names the last
`gvt-dev` commit that holds the files. #441 required that `git log --follow`
resolve the history of the moved files. That cannot hold across two
repositories, so #441 replaces it with the `MIGRATION.md` criterion.

**7. The audit of `gvt-wiki` is `wiki-lint`, moved as it is.** `wiki-lint.mjs`
imports only `node:` built-ins and its own `lib/` (ADR-0054), so it moves
without change. No new audit is built on audit-core. ADR-0049 keeps hygiene
checks out of the core and sets a re-entry condition: a second plugin that
needs the same scan. ADR-0051 rejects `npx` and makes the core a library.

The split meets that condition in part. ADR-0049 names the fence-aware line
iterator as the shareable unit. ADR-0054 decision 1 records that `wiki-lint`
re-implements the fence and inline-code masking that `audit-conventions`
provides, and that a third consumer would prompt a reconsideration. After the
split, that second copy sits in a second plugin. This record accepts the copy:
it is one masking routine, and moving it into audit-core would make `gvt-wiki`
depend on audit-core for one function. The reconsideration point of ADR-0054
stands.

The `<wikiDir>/` retired-token scan stays in `audit-conventions`. **ADR-0041
is not changed by this record.** #442 decides its fate. ADR-0053 stands: a
repository that has `gvt-dev` and no `gvt-wiki` gets no dead-link or orphan
check of its bundle.

**8. The `wiki` block stays** in `.gvt-agent.json` until #442 decides. The
`gvt-dev` components that read it are #442's surface. #442 re-enumerates them.

**9. Path resolution is stated as it ships.** A skill or agent resolves a
declared path through the `paths` override (ADR-0062). The wiki schema
resolves through the `prefer` entry of ADR-0070. There is no wiki-first
auto-detection. #440 listed one as part of its scope. This record corrects
that, and it adds no mechanism. The open issues of the #374 cluster are not
reclassified as blockers.

**10. The Environment pillar moves with the practice.** Only `maintain-wiki`
and `wiki-librarian` declare `pillar: environment`. ADR-0027 builds the
Practice Coverage report from the components declared in `gvt-dev`. After the
move, that report must not show Environment as a gap. It names `gvt-wiki` as
the provider. This amends the census of ADR-0027 (its decisions 1 and 2). #441
implements it in the same `gvt-dev` release as the move: the report rendering,
the pillar test (11 declaring components become 9), and the amendment marker
on ADR-0027. No release ships a false gap line. Detection of Environment
adoption in a consumer repository stays in `gvt-dev` with the `wiki` block
until #442 decides.

This record carries no `Amends:` line. ADR-0027 is still true for the tree as
it stands. #441 adds the marker when the census change ships.

**11. Dogfood.** After the move, this repository installs `gvt-wiki` as a
maintainer-side tool.
ADR-0067 decision 1 relies on `wiki-lint` to keep the theme indexes reachable,
and ADR-0069 keeps maintainer notes in the bundle. `gvt-dev` has no runtime
dependency on `gvt-wiki`. #441 decides how `commands.validate` runs
`wiki-lint` after the move.

**12. Delegations.**

- #441 moves the files. It lists the couplings to cut: the shared-blocks drift test, the practice-detect test, `commands.test` and `commands.validate`, the pillar census and its test, the writing-style citation, and the git-state-guard prefix.
- #442 decides the `wiki` block contract and ADR-0041.
- #443 settles which tracker owns the wiki backlog. The target is `GenvidTechnologies/claude-code-plugin-gvt-wiki`.
- #228 stays blocked by #442.

## Compromise

- *Keep the practice in `gvt-dev`.* Rejected on the four grounds of decision 2.
- *A second plugin in this repository.* Rejected for the three tooling assumptions of decision 1.
- *No dependency: `gvt-wiki` with its own writer agent and a copy of the writing-style block.* Rejected. It duplicates content that then drifts, and it departs from the `gvt-fleet` precedent.
- *`gvt-dev` depends on `gvt-wiki`, or composes with it as an optional provider.* Rejected. The documentation has no optional mode. It also does not describe a cross-plugin agent dispatch when the provider is absent, so the behaviour would rest on observation only.
- *A new audit for `gvt-wiki` on audit-core.* Rejected for the reasons in ADR-0049 and ADR-0051 (decision 7).
- *Wiki-first auto-detection of the docs root.* Rejected. ADR-0062 chose an explicit `paths` override.
- *Per-skill gating in the marketplace entry.* Rejected. It conflicts with the `plugin.json` of `gvt-dev` (decision 5).
- *Environment pillar: accept the "Pillar gap: Environment" line and leave ADR-0027 as it is.* Rejected. It shows consumers a regression that is not one.
- *Environment pillar: leave the decision to #442.* Rejected. #441 would then ship the false gap line, or wait on #442.
- *An amendment marker on ADR-0027 now.* Rejected. It would claim a census change while the tree still declares 11 components. Never adding the marker is also rejected, because ADR-0027 would then be contradicted without a trace.

**Costs accepted.**

- There is no wiki without `gvt-dev`.
- `gvt-wiki` cannot state a minimum `gvt-dev` version until the `gvt-dev` tags change.
- After the move, this repository needs `gvt-wiki` installed to keep its own decision trail healthy.
- A repository with only `gvt-dev` loses the bundle checks (ADR-0053).
- Two consumers face a breaking move.
- The references to `maintain-wiki` and `wiki-librarian` are spread over many files. A count of 45 files was taken in this work and decays. #441 enumerates them again.

## Consequences

#441, #442 and #443 are updated to match this record. #441 adds the
`Amended by` marker to ADR-0027 when the census change ships. ADR-0041 is
unchanged. Once this record merges, the `needs-info` label on #438 is cleared
and the issue stays open until the move ships.

The git-state guard scopes its checks to agents whose `agent_type` starts with
`gvt-dev:`. Inferred, not tested: an agent of `gvt-wiki` falls outside the
guard. #441 decides how to cover it.

Consumers see one breaking change in the `gvt-dev` major release. They install
`gvt-wiki` to keep the practice, and `MIGRATION.md` tells them what moved.
