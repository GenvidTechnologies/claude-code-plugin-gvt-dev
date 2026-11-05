---
type: decision-record
title: 'build-probe keeps and generalizes probes by default, with a library and a catalogue'
description: 'build-probe keeps and generalizes a probe by default, discards only with a stated reason, holds shared building blocks inside the plugin, and catalogues kept tools.'
tags: [decisions, skill-shapes]
status: stable
---
# 0092. build-probe keeps and generalizes probes by default, with a library and a catalogue

- **Status:** accepted
- **Date:** 2026-11-05
- **Issue:** #738 (part of #737)
- **Supersedes:** [ADR-0018](0018-build-probe-pure-discipline.md), decision 3 and its deferral of a kept-tools home. Decisions 1 and 2 of ADR-0018 stay in force.

## Context

ADR-0018 (2026-07-24, #144) shipped `build-probe` as one `SKILL.md`. The skill
discards a probe by default, ships no library, and bundles no probes. ADR-0018
deferred a kept-tools home "given `build-probe` has not yet been exercised
against a real promotion".

#737 argues that the discard default is backwards when there is no substrate.
Without shared building blocks, each probe is rebuilt from scratch: file
walking, frontmatter parsing, git-ref reads, and the Windows path and shell
traps. Generalizing a probe is then expensive, so discarding looks reasonable.
Moldable development works because a new tool is a few lines of composition on
shared blocks.

The backlog now carries real promotion candidates:

- #605: a sequential mutation-control runner.
- #690: a mutation-control harness built from a declarative spec (prototype in burbank-playfab #310).
- #700: a types-only emit-diff check (prototype in burbank-playfab #310).
- #244: scratchpad probes cannot import repo modules.

This is the condition ADR-0018 named for revisiting the deferral.

## Decision

**1. Default: keep and generalize.** When a probe has answered its question,
the next step is to generalize it and keep it. Generalizing means
parameterizing hardcoded paths and refs and extracting the logic into a
tested module. The result goes in the kept-tools home (decision 3).

Discarding stays allowed. It needs a reason stated on-thread, next to the
Step 4 report. The accepted reasons are a closed list:

- (a) The question cannot recur: a one-time migration, or curiosity while drafting. ADR-0018's worked example is this case.
- (b) An existing kept tool or a standing check, such as `audit-conventions`, already answers it. Extend that tool and do not keep a second.
- (c) The answer depends on context that cannot be parameterized out.

A probe is still first written in the scratchpad. Step 2's rule is not
changed by this record; only its wording about discard is. #244 is decided
separately. Keeping is a
deliberate move out of the scratchpad. It is not a file left in the tree.

**2. Library location: inside the plugin first.** Building blocks live under
`plugin/skills/build-probe/scripts/lib/`. Runnable kept tools, such as the
#605/#690 runner and the #700 check, live under
`plugin/skills/build-probe/scripts/`. Tests live under
`plugin/skills/build-probe/scripts/test/`. The precedent is
`plugin/skills/audit-conventions/scripts/`.

Primitives that `@genvidtech/audit-core` already provides, such as frontmatter
reading and the walker, are imported through the `#audit-core` alias and never
copied. A missing primitive that belongs on audit-core's side of the
mechanism/policy boundary (ADR-0049) is requested by an issue on
`GenvidTechnologies/audit-core`. It is not written here.

A consumer runs a kept tool as
`node ${CLAUDE_PLUGIN_ROOT}/skills/build-probe/scripts/<tool>.mjs …`. A
scratchpad probe imports a building block by file URL from the plugin root.

Re-entry condition for extracting a separate `@genvidtech` leaf package: a tool
committed in a consuming repo needs to import the library, or a second package
needs it. The plugin cache path changes with each version, so a committed
import of it is not stable.

**3. Home and catalogue for kept tools, and what stops rot.** There are two
tiers.

- **Plugin tier.** Generic tools ship in build-probe's `scripts/` (decision 2). Each has tests that `commands.validate` runs. Each is catalogued in a "Kept tools" section of `build-probe/SKILL.md`, one row per tool: the question it answers, the command, and its negative control.
- **Consuming-repo tier.** Repo-specific kept tools live under `tools/probes/` by default. A `.gvt-agent.json` `paths` override can relocate the directory. They are catalogued in `tools/probes/index.md`, one line per tool: the question, the command, and the test.

Three rules prevent rot:

- Every kept tool has a test or a recorded negative control that shows it can report the bad case.
- Every kept tool has a catalogue entry.
- The tests run in the repo's test command.

A tool whose test cannot be kept green is deleted, with that as its stated
reason.

The audit's Moldable detector (a sibling sub-issue of #737, related #146) can
detect the catalogue once it ships. Declaring `tools/probes/index.md` as a
`required: false` expectation is that sub-issue's work.

**4. Provenance of the "never a probe library" constraint: it cannot be
traced.** ADR-0018 attributes "ship discipline plus maybe generic probes,
never a probe library" to epic #142 as an explicit constraint. This was checked
on 2026-11-05:

- None of the 10 recorded revisions of #142's body (2026-07-21 to 2026-08-25, read through the GitHub `userContentEdits` API) contains "never" or "probe library".
- #144's body was never edited. It says the plugin ships the skill "plus maybe **2–3 genuinely generic probes**". It says the repo owns "its thousands of contextual, throwaway probes (the moldable premise; they can't be centralized)".
- PR #165 has no comments or reviews.
- `git log -S"probe library"` finds the phrase first in commit 34ef760, the commit that added ADR-0018 itself.

The closest real sources are #144's "maybe 2–3 genuinely generic probes" and
#142's "a thin contract-and-scaffold layer over borrowed runtimes, not a
bespoke engine".

Inference, not an observation: the phrase is ADR-0018's own paraphrase,
written while drafting, and not a quotation.

This record does not overturn a constraint it cannot point to. It records that
the constraint has no source. #142's real constraint, a thin layer and no
bespoke engine, still holds. The library is small composable blocks plus a few
tools, not an engine. #144's "thousands of contextual probes can't be
centralized" is also respected: the plugin tier holds only generic tools, and
contextual tools stay in the consuming repo's tier.

## Compromise

Alternatives rejected, by decision:

**Decision 1 (default).**

- *Keep ADR-0018's discard default with the recurring-and-generic bar.* Rejected. The bar is judged at the moment generalizing is most expensive, so it is rarely met, and nothing gets cheaper.
- *Keep everything with no exit.* Rejected. It gives unbounded rot, and some questions are truly one-off.
- *Chosen:* keep by default, and discard with a stated reason from the list.

**Decision 2 (library location).**

- (a) *In the plugin.* Chosen. It needs no new repo, publish pipeline or pin, and the API is not known yet. audit-core itself matured in the plugin before it was extracted (ADR-0058, ADR-0071).
- (b) *A new `@genvidtech` leaf package now.* Rejected for now. It costs a repo, an OIDC publish, exact pins and cross-repo issue latency, for an API with zero shipped tools.
- (c) *Add the blocks to audit-core.* Rejected. audit-core is the audit's mechanism. Probe runners (mutation, differential) are not audit mechanism, and changes there go through its own tickets anyway.

**Decision 3 (home and catalogue).**

- *No prescribed home* (ADR-0018's deferral). Rejected. There is nothing to find and nothing for the audit to detect.
- *`scripts/` at the repo root.* Rejected. It mixes kept tools with build and release scripts, so the catalogue cannot be the directory listing.
- *A dedicated `tools/probes/` with an index.* Chosen.

**Cost accepted.** Keeping costs more per probe than deleting a scratchpad
file, because a kept tool needs a test and a catalogue entry. Consuming repos
gain a directory.

## Consequences

ADR-0018 decisions 1 and 2 are not changed. `build-probe` still has no
five-part apparatus and no off-thread probe subagent, and Step 4 still
reports on-thread. Only ADR-0018 decision 3 (no bundled probes) and its
deferral of a kept-tools home are superseded.

Until the library sub-issue ships, `plugin/skills/build-probe/` holds only
`SKILL.md`. The audit's Moldable row still reads "n/a by design" and cites
ADR-0018. The detector sub-issue updates that row, not this record.

The `build-probe` skill, `plugin/docs/development-principles.md` and
`docs/TOC.md` state the new default and cite this record.
