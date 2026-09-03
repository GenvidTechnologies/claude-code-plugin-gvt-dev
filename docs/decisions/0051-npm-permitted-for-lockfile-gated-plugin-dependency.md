# 0051. ADR-0047's npm rejection is overturned for a lockfile-gated leaf; the shared audit core ships as a library, never a CLI

- **Status:** accepted
- **Date:** 2026-09-03
- **Issue:** #456

## Context

ADR-0049 ratified a mechanism/policy boundary for a shared audit core but deliberately declined to grant
permission to package it, stating that ADR-0047 "is DISTINGUISHED, not overturned, and its standing directive
is NOT triggered by this record." It added a forward-binding clause: if packaging proceeds, ADR-0047's
directive is *pre-triggered* — the severity question for `pointer-anchor` and `principle-citation` reopens
before any code moves, not after.

#456 is that reopening. It is link 1 of the chain #456 → #457 → {#458, #459} and is its sole open gate: #457
cannot proceed to publish anything, and #458/#459 cannot rewire a consumer onto it, until this record settles
whether a real npm dependency is permitted inside `plugin/` at all, and if so in what shape.

## Decision

### ADR-0047's three grounds, each overturned, each argued separately

ADR-0047's Compromise packed three separable grounds into one sentence rejecting an npm dependency. Each is
addressed by name below; a single-word verdict on "ADR-0047's npm rejection" would be wrong either way, because
the three grounds do not stand or fall together.

**Ground (a) — "introducing a dependency *system* to a project that has deliberately never had one."**
**Overturned.** ADR-0047 was written with no shared-library graph in view. The org now runs one in production:
four `@genvidtech` packages in a diamond — two published tools (`construct3-chef`, `c3-domain-manager`), both
depending on two leaf libraries (`c3source`, `mcp-utils`) — across four separate public repos with no
monorepo, four independent release streams, a byte-identical generic `publish.yml` in three of them delegating
to a shared reusable workflow with OIDC provenance publishing, plus a documented ownership boundary and a
version-by-version adoption ledger. `gvt-dev` already ships `publish-npm-package`, the skill that builds that
pipeline. The accurate description of what #457 proposes is joining a system the org already operates, not
inventing one.

**Ground (b) — "imposing it on every consumer's install path."** **Overturned, on a probe.** Claude Code
performs the install itself, once per cached version, gated on a committed lockfile. The consumer runs no
command and adds no tooling, and the audit makes no run-time registry call — so `commands.validate` stays
hermetic, which is the property ground (b) existed to protect. The earlier reasoning ("the resolver isn't
there") was a true observation about a tree with no lockfile in it, and one committed file away from being
false:

```
TEST arm    (package.json + package-lock.json) → node_modules/ CREATED, dependency present
CONTROL arm (package.json, no lockfile)        → no node_modules — silently skipped
import('<dep>') from the test arm's cached dir → resolves and loads
```

The control is what makes this conclusive: it separates "the feature does not exist" from "the feature exists
but nothing here has ever needed it."

**Ground (c) — the remark cost/benefit ("perhaps 40-60 lines, and none of the logic").** **Overturned.** That
was a ratio argument about `remark`, and the ratio inverts for the dependency actually under consideration
here. Measured: `yaml@2.9.0` installs as **1** package with **zero** transitive dependencies, against
`remark`'s 54. And the hand-rolled frontmatter module it would replace is not merely verbose but **defective**
— it mis-parses YAML folded block scalars on **5 of 32** plugin components, returning the scalar indicator
(`>` / `>-`) as the description and inventing **7** junk top-level keys by splitting folded prose on colons,
while four independent commodity parsers agree unanimously on all 32 files. Filed as #470.

**An earlier split-by-locus verdict on ground (c) is WITHDRAWN.** Its only justification was that `plugin/`
could not resolve a bare specifier; the ground-(b) probe falsified that premise, so keeping the split would
have meant preserving a conclusion after its reasoning had already collapsed.

### The permitted shape

A real npm dependency inside `plugin/`, **lockfile-gated**, installed by the host once per cached version. Both
the manifest and the committed lockfile are load-bearing artifacts — and the lockfile is load-bearing rather
than mere hygiene: without it the install is silently skipped and nothing reports that (see `node_modules`
corpus exposure and the two accepted risks below).

**`npx` is rejected by name.** #457 and #458 were written around it, and silence here would license it by
default. The decisive argument is granularity, not cost: ADR-0049 places `fileExists`/`dirExists`/
`commandExists` in *Mechanism* and puts the policy boundary **inside** the evaluators that call them. An `npx`
invocation would be a process boundary at the granularity of a single existence probe — a shell-out standing in
for what should be a function call, adding a process spawn, a stdout parse, and an offline-failure mode to
every check it replaced. ADR-0049's own mechanism/policy boundary therefore forces the shared core to be a
**library**, not a CLI.

### The third leaf: `@genvidtech/audit-core`

A published, independently-versioned library, peer to `c3source` and `mcp-utils`, with **no `@genvidtech`
dependency of its own** and `yaml` as its only runtime dependency. Its contents are exactly ADR-0049's
*Mechanism* category: `extractFrontmatter`, `resolveKey`, `walkComponents`/`loadComponent`, the existence
probes, and the **evaluation half** of the three evaluators, with path resolution left as a caller-supplied
hook. It emits `expectation`-class findings only — no tally, no rendered report, no diagnostics — matching
ADR-0049's two-class finding shape and its ruling that the shared tool emits none of the per-plugin surface.

### Buy-vs-build, per module

| Module | Verdict |
|---|---|
| YAML parsing | **Buy `yaml`** — 1 installed package, 0 transitive deps, and it fixes a live defect (#470) |
| `resolveKey` (26 lines) | **Build**, and move it upstream as-is. Its `missingAt` field tells the caller *where* the path broke — a finding-shape concern no generic accessor library returns |
| `walkFiles` from `mcp-utils` | **Decline.** Measured **95** installed packages (it pulls in the MCP SDK, hence an HTTP server stack) against a 45-line local walker; it is sync/absolute-path where ours is async/repo-relative; error semantics differ; and it carries the *same* unconditional-recursion defect ours has |
| `loadProjectConfig` / `resolveRootFolder` | **Decline** — they return MCP `CallToolResult` error objects and drag in the SDK |

`mcp-utils` has **no** frontmatter or YAML capability at all, verified against its published tarball, so there
was no in-house source for the capability actually needed — the `yaml` decision above is not a preference
against an available in-house alternative, there wasn't one.

### The boundary reconciliation, and the convergence

`construct3-chef` carries its own upstream-ownership rule — domain facts upstream, generic plumbing upstream,
**rendering/presentation stays local** — recorded in that repo's own `wiki/decisions/` directory (the record
titled *upstream ownership boundary and adoption posture*; **that repo**, not this one — this repo's own
`docs/decisions/0006-…` is an unrelated two-surface external-system pattern and the two must not be conflated).

That rule and ADR-0049's Contract/Mechanism/Policy split are the same boundary, derived independently from
different premises: ADR-0049 from "decidable without knowing which plugin is asking," `construct3-chef`'s from
"platform fact vs. this tool's invented read surface." Recording that convergence matters as evidence the
boundary is a property of the problem being split, not an artifact of either author's preference — two
independent designs landing on the same line is a stronger signal than either design alone.

One rule from that convergence is adopted here by name because ADR-0049 lacks it: the **forced-partial-fit
anti-pattern** — when a needed primitive is on the correct side of the boundary but the wrong *shape*, request
the right shape upstream and wait, rather than forcing a partial fit locally. `resolveKey`'s `missingAt` field
above is the boundary case this guards: it stays local specifically because forcing it into a generic accessor
would be exactly the anti-pattern this names.

Two of that repo's other conventions — its adoption-posture write-up and its leaf-dependency ledger — are
**deferred**, not adopted, with a stated re-entry condition: adopt them when `gvt-dev` first actually pins a
leaf (i.e., when #458 lands). Each is given a future home now so the deferral is not open-ended: the posture
belongs in `plugin/docs/` (it ships, so it version-bumps); the ledger belongs in the repo-root `docs/`
(maintainer-facing, no bump).

### The standing directive, re-asked and discharged

ADR-0047's directive fires on two clauses: any future widening of the citing corpus, **or** any change that
makes the check runnable outside `AUDITING_PLUGIN_SOURCE`. Both are addressed.

**Two `import.meta.url` dimensions, and they are separate.** The *tool's* plugin-root traversal is not at
stake — a library invoked from a package cache cannot walk up to an audited repo, which is exactly why the
shared tool takes a components directory as an argument and derives nothing from its own location. The
*plugin's* gate predicate, `AUDITING_PLUGIN_SOURCE`, is the second `import.meta.url` derivation and a
different thing: computed from whether the plugin
root sits inside the audited repo, and the entrypoint stays in `plugin/`, so this keeps its meaning. Verified:
the predicate's value is unchanged by the presence of `plugin/node_modules/`, because it reads only the two
paths being compared, never the filesystem contents between them.

**ADR-0019's two questions, re-asked.** Does an unenforced `warning` leave a real gap? Yes, unchanged — the
exit code counts `error`-severity only, and the decay these checks catch is silent by construction. Is the
blast radius confined? Yes, and for **different reasons per check**: `pointer-anchor`'s confinement rests on
the gate itself (ADR-0047's own argument); `principle-citation`'s is *inherent* — its citing corpus is
`plugin/`, which a consuming repo does not have, gated or not.

**Verdict: `error` REAFFIRMED for both — conditional on the skip fix (#476) landing.** The second clause of the
directive is not met: installing a dependency into a dogfooding source tree widens the citing corpus, measured:

```
citing files, clean tree                          162
citing files, one third-party file injected       163   ← the file enters the corpus
```

The asymmetry that makes this non-obvious: `.gitignore` does cover `node_modules/`, so nothing can be
*committed* there — but the scanner does not consult git for this half of its walk. Only the repo-root citing
files are git-scoped; the `plugin/` and `docs/` subtrees are walked whole, ignoring `.gitignore` entirely.
**Gitignore protects the index, not the corpus.** The reaffirmation therefore holds *because* #476 (which makes
the walker skip `node_modules/`) is a prerequisite, not in spite of needing one — the answer is conditional and
the condition is named, not waved past.

The directive fired **precautionarily**, in the sense that ADR-0049's forward-binding clause pre-committed the
re-asking before any code moved. That the answer comes out the same as ADR-0047's original one does not make
the re-asking a formality — see the new dimension of confinement named in Consequences below, which the
re-asking is what surfaced.

**A new standing directive, on assertability creep.** `audit.mjs`'s plugin root must remain **derived** and
must never become a flag, argument, or environment variable. ADR-0049 rejected an `--author-time` flag because
a flag is assertable by anyone; with a real dependency now in play, giving the entrypoint its own root flag
"for consistency with the library's caller-supplied directory" is a plausible-looking refactor that would
reinstate exactly that defect. Anyone touching `audit.mjs`'s root derivation should read this as the same
prohibition, not a new one.

### The measurement: design only, and why it is scoped down

Under the permitted shape there is **no per-run registry call** — the install happens once, host-side, at
cache time — so a cold/warm × pinned/floating × offline/online latency matrix over `npx` would measure a
mechanism this record declines to adopt. Stating that up front is why the measurement below is scoped down to
three things rather than the full matrix: the **resolution probe**, with its mandatory positive control (a
specifier that must succeed from the same path, so a failure there cannot be confused with a broken probe); the
**once-per-install cost**, which is the actual cost this shape pays; and an **archival `npx` measurement**, kept
so the rejection above stays falsifiable rather than asserted.

Three constraints govern how that measurement is read, should anyone extend it. `npm_config_offline=true` sets
`only-if-cached` and fails **fast**; genuine unreachability instead burns a retry budget and can hang for tens
of seconds — these are **two distinct cells**, never one, and reporting them as a single "offline" number
conflates a fast, deterministic failure with a slow, timeout-bound one. A **fresh cache directory is required
per cell**, because a probe that succeeds mutates the very state it was testing for absence — running the
"uncached" cell twice against the same cache directory silently turns it into the "cached" cell. And an
**uncached control** belongs on every absence cell, for the same reason a control belongs on any probe that can
only fail once honestly.

**Adopt `build-probe`'s framing, and say explicitly that it supersedes the earlier wording.** `build-probe`'s
own documented case is this exact `npx`/offline scenario, and its conclusion is stated precisely: "the
behaviour is fully determined *given* the state, not random. Reporting it as 'intermittent' would teach the
opposite of what this step exists to teach, which is that the state decides the answer." ADR-0049 used
"intermittent" for the same phenomenon; that word is retired here. It implies randomness and invites a retry
mitigation, where "state-determined" correctly identifies the actual variable — cache state — and rules a retry
out as a fix, since retrying does not change whether the package was ever cached on that machine.

### One honest limit

During investigation, `require.resolve` and a dynamic `import()` disagreed from one probe directory. An earlier
explanation attributed this to the package under test being ESM-only; **that explanation was wrong** — `yaml`
declares `"type": "commonjs"`, and `require.resolve` works for it wherever it is actually installed. The
finding that matters survives — from the plugin cache today, *both* methods fail to resolve the package, with a
Node builtin used as a control passing on the same path — but **the cause of the `require`/`import`
discrepancy was never established, and this record says so rather than substituting a new mechanism for the
one that turned out to be wrong.** What generalises past the unresolved discrepancy is a preflight principle:
probe usability with a dynamic `import()`, because it works regardless of whether the target is CommonJS, ESM,
or dual-mode, and because `.mjs` callers have no native `require` to fall back to.

## Compromise

What this decision costs: `plugin/` gains a manifest and a lockfile it must now keep honest; the install
depends on host behaviour `gvt-dev` does not control and cannot disable; and two failure modes (below) are
accepted untested rather than closed.

What was considered and rejected, alongside the permitted shape:

**`npx`** — rejected on granularity, not cost. See "The permitted shape" above: ADR-0049 already draws the
mechanism/policy boundary *inside* the evaluators, at the granularity of a single existence check, and a
process-boundary shell-out sits at the wrong grain for that split.

**Vendoring the dependency** — copying `yaml`'s source into the tree rather than depending on it. Rejected
because it would ship third-party code into two places at once: the published git-subdir that consumers
install, and both gated scanners' own citing corpora (`principle-citation`'s `plugin/` scope and
`pointer-anchor`'s `plugin/` + `docs/` scope), multiplying exactly the corpus-widening concern this record
spends most of its length managing for the dependency-manifest case, with none of the lockfile-gating that
makes that case tractable.

**Capability-sharing via MCP** — exposing the shared audit logic as an MCP tool rather than an npm package.
Rejected as structurally unreachable: `commands.validate` runs as a plain `node` process outside any Claude
session, so it has no MCP client to call through, and this is true regardless of how the mechanism/policy
boundary is drawn.

## Consequences

**Chain dispositions**, each with a verdict:

- **#457** — rescoped: publishes a **library, not a CLI**; unblocked by this record; still needs a human npm
  bootstrap for the first publish, since nothing here automates that step.
- **#458** — deliverable in ordered steps, only the last two of which need a leaf dependency at all: (1) the
  skip fix **#476**; (2) `plugin/package.json` plus a committed lockfile declaring `yaml` — **this step carries
  a version bump on its own merits**, being the first time `plugin/` gains a dependency; (3) the preflight
  **#477**; (4) swap the hand-rolled parser's internals to `yaml`; (5) leaf adoption, which additionally needs
  **#478**. Its earlier claim that `metadata.expects.tools` must gain `npx` no longer holds, since the permitted
  shape uses no CLI.
- **#459** — still blocked, on a prerequisite nobody has filed yet: the `construct3` repo (the audit-c3 side of
  this chain, distinct from `construct3-chef`) has no `package.json` anywhere and no CI, so it must first
  acquire a manifest, a lockfile, and a way to keep them honest before it can pin anything. File that
  separately rather than absorbing it into #459 itself. That repo's shipped `CONVENTIONS.md` states it does not
  depend on `gvt-dev` being installed; a neutral third leaf preserves that guarantee, where a direct dependency
  on `gvt-dev` would break it.
- **#460** — unchanged and independent of this record; the two duplicated modules are still byte-identical, so
  the sibling repo carries the same parser defect, unmeasured there.
- **#470** — unblocked, and should land **first** among the dependent work: it merges two independently-written
  frontmatter parsers into one and turns #458 step (4) into a single-site swap instead of two.

**The `node_modules` corpus exposure (#476) is a named prerequisite, not a latent trap.** Three causal sites
combine to produce it: the citing-file walker has no skip parameter for a directory name; the top-segment-only
skip test it does have does not catch a nested `node_modules/`; and the root-only directory filter used
elsewhere in the audit does not apply to this walk. Scoped correctly, this affects only a **dogfooding
developer working in this repo's own source tree** — a consumer's audit is unaffected because its corpus is
rooted at the audited repo and the plugin cache is never scanned, and hygiene is unaffected because its
candidate set never reaches into `plugin/`.

**Extend ADR-0047's confinement argument, and own the extension rather than treating it as inherited.**
ADR-0047 justified `error` severity by *inherent* confinement: the scanners are scoped to `plugin/` and
`docs/`, which a consumer lacks. That argument is about what a **consumer** can be exposed to. It says nothing
about third-party prose landing **inside** `plugin/` itself, where the scanner fires at `error` against text
the plugin does not own and never wrote. That is a genuinely new dimension of an old distinction, surfaced only
because this record re-asked the directive rather than inheriting its answer — and it is the concrete reason
#476 must land before the reaffirmation above is unconditional rather than a formality.

**The leak-guard partition is a partition, and the amendment is scoped to the leaf only.** A `yaml`-only
manifest and lockfile produce **0** matches against the leak-guard's patterns; a manifest naming the *scoped*
leaf (`@genvidtech/audit-core`) does not — **1** in the manifest, **3** in the lockfile — against a tree-wide
baseline of **0** matching non-`.md` tracked files today. So step (2) above (`yaml` alone) needs no leak-guard
amendment; step (5) (leaf adoption) does. **#478 blocks only the leaf step**, not the dependency-manifest step
that precedes it by three steps. This record names the gap; it does not resolve it.

**Two accepted risks, each with a mitigation, each explicitly marked untested / accepted rather than closed:**

1. A `package.json` with **no lockfile is skipped with no log entry** — mitigated by #477's committed lockfile,
   a sync check between the two files, and a preflight that names the specific unmet dependency rather than
   failing silently downstream.
2. A host install that times out can leave a **partial `node_modules` tree**, which presents identically to an
   absent one to a naive existence check — mitigated by the preflight probing **usability** (a dynamic
   `import()`) rather than directory presence, per the honest limit above.

Both failure modes surface as `ERR_MODULE_NOT_FOUND` far from their actual cause if the mitigations are ever
removed. They are recorded here as operating costs of a host mechanism `gvt-dev` does not control, rather than
as things traded away — the Compromise section above covers what was actually given up.

**`metadata.expects.tools` is unchanged. That is a decision, not an omission, and the reason is stated so it
does not need re-deriving:** no tool expectation is added, because the audit invokes only `node` and `git`
directly and the **host** performs the dependency install, not a command the audit shells out to. Separately,
`npm` is already declared `required: true` in three existing components (`publish-npm-package`,
`reconcile-mcp-pin`, `release-npm-package`), so even a hypothetical declaration here would not widen the
aggregated required-tool contract any consuming repo already satisfies.

**Relationship to ADR-0047.** ADR-0047 remains **accepted** and is not superseded by this record. Its
non-delegable-gate reasoning and its `error`-severity call for `pointer-anchor`/`principle-citation` are
**reaffirmed**, conditionally, above. Only its Compromise's npm-rejection conclusion — grounds (a), (b), and
(c) — is overturned, on the evidence in "ADR-0047's three grounds" above. A future reader should not read this
record as replacing ADR-0047; it replaces one conclusion inside it while leaving the rest of its reasoning
intact and, on the severity question, restated with a condition attached.

This record ships no code and no behavior change on its own — #458 step (2) is what carries the version bump,
when it lands. Its figures are point-in-time; a reader extending the measurement above should re-run the probes
rather than cite the numbers here as still current, particularly the corpus-widening count, which depends on
the citing corpus at the moment it was measured.
