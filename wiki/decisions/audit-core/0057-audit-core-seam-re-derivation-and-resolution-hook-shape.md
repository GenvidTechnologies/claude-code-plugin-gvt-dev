# 0057. The audit-core seam survives its own re-derivation; the resolution hook returns three values, the library never throws for an expected condition, and it declines the `mcp` kind

- **Status:** accepted
- **Date:** 2026-09-18
- **Issue:** #457

## Context

ADR-0049 drew the mechanism/policy/contract boundary for a shared audit core across `audit-conventions` and
`gvt-construct3`'s `audit-c3-conventions`. ADR-0051 overturned ADR-0047's npm rejection for a lockfile-gated
leaf and ruled the shared core ships as a **library**, never a CLI, so a caller-supplied hook — not the
library — does path resolution. #457 is the next link: it publishes `@genvidtech/audit-core`. This record is
**decision-only** — it pins the mechanism/policy seam against today's tree so #457 has a written target. It
ships no code. The package itself, its repo, its CI, and the npm bootstrap are all out of scope; #457 stays
**OPEN**.

The trigger for re-opening rather than inheriting ADR-0049's mechanism category is concrete: commit `ed60c81`
(#535) taught this repo's `lib/frontmatter.mjs` YAML block-scalar consume-and-skip, growing it from 138 to 253
lines, while `gvt-construct3`'s copy of the same file is unchanged at 138 lines (confirmed directly against
`gvt-construct3`'s `origin/main` at commit `6ba383b1f` — see the pinned-commit note under Q1 below). ADR-0049's
own text anticipates exactly this: `0049-audit-core-mechanism-policy-boundary.md:377` ("this record's premise")
states that if the two copies "ever diverge *intentionally*, this record's premise — that they are the same
code — fails, and the mechanism category must be re-derived rather than inherited." This record performs that
re-derivation, and states the result rather than assuming it.

## Decision

### A — the trailing-slash directory marker is POLICY, not Contract, and the two "contracts" are different axes

`gvt-construct3`'s `evaluateFile` calls `fileExists` on every entry, with no directory-vs-file distinction at
all — confirmed directly against `origin/main` at `6ba383b1f`, where `evaluateFile` reads `const exists = await
fileExists(path);` unconditionally, never `dirExists`. This repo's own `evaluateFile` instead branches on
`resolvedPath.endsWith('/')` and calls `dirExists` or `fileExists` accordingly. The two implementations
**disagree** on how a directory expectation is probed, which is exactly the resolution divergence ADR-0049
already named: `0049-audit-core-mechanism-policy-boundary.md:61` ("Resolution is therefore a") reads in full
"Resolution is therefore a **policy hook the plugin supplies**; evaluation … is mechanism."

What this record adds is naming an equivocation on the word "contract" that ADR-0049 leaves latent. ADR-0049's
ratified **Contract** category (the finding shape, the exit-code contract, the `metadata.expects` grammar, and
Anthropic's plugin layout) is the gvt-dev↔audit-core axis — what the shared library and its two callers agree
on. `plugin/CONVENTIONS.md`'s trailing-slash directory-marker rule is a **different contract entirely** — the
gvt-dev↔consumer axis, governing how a *consuming repo's* `metadata.expects.files` entries are written. That
gvt-dev's own consumers use trailing slashes is not evidence for or against whether the shared library should
know about them: `gvt-construct3` has no consumers of its own trailing-slash convention to disagree with,
because it never adopted one, and the two "contracts" never described the same relationship in the first place.

**Consequence:** the caller-supplied resolution hook returns **three** outputs, not one — the absolute path to
probe, *which probe to run* (`fileExists` vs. `dirExists`), and the display `target` string. A hook returning
only a path would silently reintroduce `gvt-construct3`'s always-`fileExists` behavior as the library's only
option, which is the forced-partial-fit anti-pattern ADR-0051 names by name.

### B — the library's parameter is a plugin root, not a "components directory"

`skills/` and `agents/` are not the same shape: a skill is a directory containing `SKILL.md`; an agent is a flat
`.md` file. Collapsing both into one directory-shaped parameter would push a difference both audits already
handle correctly onto the policy side, where it does not belong — `walkComponents` is exactly the mechanism
function that already discriminates the two.

ADR-0051's own load-bearing clause uses "components directory" as an incidental noun in a sentence making a
different argument: `0051-npm-permitted-for-lockfile-gated-plugin-dependency.md:134` ("shared tool takes a
components directory as an argument and derives nothing from its own location") is there to establish that the
library takes an argument at all, rather than deriving anything from `import.meta.url` — not to specify the
argument's shape. Read narrowly for what it actually decided, the passage constrains *derivation*, not the
*parameter's type*. `walkComponents`/`loadComponent` take a **plugin root** (the directory containing `skills/`
and `agents/`), and the two components' differing traversal rules stay inside the library, where they are
already correctly implemented on both sides today.

### C — `detail` is MECHANISM, and it costs `gvt-construct3` nothing

Confirmed by direct comparison of all three evaluators against `gvt-construct3`'s `origin/main` at `6ba383b1f`:
`evaluateConfig`'s two failure `detail` strings (`` `${inFile} not found` ``, `` `${inFile} unreadable
(${err.message})` ``, and `` `key not found (path broke at "${result.missingAt}")...` ``) and `evaluateTool`'s
(`` `command not found on PATH...` ``) are **byte-identical** across both repos today. `evaluateFile`'s differs
only by the probe noun — this repo emits `` `${isDir ? 'directory' : 'file'} not found...` ``, `gvt-construct3`
emits the fixed `` `file not found...` `` — which is exactly the distinction verdict A's resolution hook
resolves: a hook returning which probe ran lets a shared `evaluateFile` render `` `${probe} not found...` `` and
reproduce `gvt-construct3`'s current string byte-for-byte on every file-shaped entry it has today.

Treat `detail` as ADR-0049 treated `target`: mandatory in the contract, its exact text unfixed, and consumers
must not parse it — `0049-audit-core-mechanism-policy-boundary.md:135` ("Both audits compute") sits in the
paragraph ratifying exit codes on the same "converged, ratify as-is" logic this record extends to `detail`'s
three already-matching strings.

### D — the shared loader returns `{type, name, expects, frontmatter}`

The leak the alternative (returning only `{type, name, expects}` and re-parsing frontmatter elsewhere) guards
against does not exist in this repo: `lib/pillars.mjs`'s `parsePillars` is a four-line, taxonomy-free
comma-splitter with no plugin-specific vocabulary, and `MAX_DESCRIPTION_CHARS` is compared inside `audit.mjs`'s
gated `desc-length` check — not inside `loadComponent` itself. Returning the already-parsed frontmatter from the
shared loader avoids a second read and a second parse of all 32 components, and neither downstream consumer of
that frontmatter needs to live inside the loader to stay policy-side.

### Q1 — the mechanism category is UPHELD by re-derivation; the duplication sub-decision EXPIRES

This is the most consequential content in the record, because ADR-0049 makes the instruction to re-derive
**unconditional** on an intentional divergence — not conditional on the divergence being large, or on it being
anything other than additive. Reasoning "the divergence is only additive, so the category survives unexamined"
would be exactly the shortcut the instruction at `0049-audit-core-mechanism-policy-boundary.md:377` ("this
record's premise") exists to forbid. So the re-derivation is performed and shown, not assumed:

`lib/frontmatter.mjs`'s +115 lines (138 → 253, per commit `ed60c81` / #535) add exactly one capability — YAML
block-scalar consume-and-skip with chomping-indicator handling — which is a property of the **YAML grammar**,
not of either plugin. The diff introduces no repo literal, no config key, no path, no severity level, and no
plugin name. **The mechanism category is UPHELD**: `extractFrontmatter` stays plugin-blind after the change,
exactly as it was plugin-blind before it.

**The duplication half of ADR-0049's decision does not survive the same test.** ADR-0049's "keep them
duplicated for now" rested on two named, conjunctive grounds: the copies are identical *right now*, and the
uncovered cost is *thinly-verified* drift rather than actual divergence. Both premises are now false. The
copies have **diverged** — this repo's `frontmatter.mjs` is 253 lines and `gvt-construct3`'s is still 138,
confirmed directly against `gvt-construct3`'s `origin/main` at commit `6ba383b1f2b3b6276ccbafa4757e0f06146ec4e3`
(the same commit a local checkout of that repo already had cached; a `git fetch` against it in this session
failed on the 1Password SSH-signing prompt named in this repo's own operating guidance, so `6ba383b1f` is the
newest confirmable point, not asserted as today's true `origin/main`) — and #460's mirrored `frontmatter.test.mjs`
and `config-resolve.test.mjs` are confirmed present in that same checkout. So the gap ADR-0049 named as
"thinly-verified" has already been closed on the coverage axis, and the identity premise it traded that gap
against is gone. **The duplication decision's own stated expiry has arrived**, and #457's extraction is now the
answer to a live divergence rather than one option weighed against a hypothetical one.

**ADR-0049's stale figures, corrected as decayed rather than defective** (its measurement was accurate for its
own point in time; the tree has since moved):

| Figure | ADR-0049 | Now | Basis |
|---|---|---|---|
| Duplicated lines | 164 | **26** | `frontmatter.mjs` no longer matches; only `config-resolve.mjs` (26/26 lines) remains byte-identical — confirmed by direct diff against `gvt-construct3`'s `origin/main` at `6ba383b1f` |
| This repo's mechanism-span total | 308 | **423** | `frontmatter.mjs`'s whole-file span grew +115 (138→253); 308 + 115 = 423, under ADR-0049's own whole-module accounting |
| `gvt-construct3` `audit.mjs` | 693 | **727** | confirmed by `git show origin/main:.../audit.mjs \| wc -l` against `6ba383b1f` |
| Self-contained diagnostic kinds | 18 | **20** | `SELF_CONTAINED_KINDS` in this repo's `audit.mjs` now lists 12 entries (was 10 — `pillar-unknown` and `path-override` were added since), plus the `pointer-` prefix rule's 8 kinds; 12 + 8 = 20 |
| "No dedicated test file for either module" (`gvt-construct3`) | — | **now false** | `plugin/skills/audit-c3-conventions/scripts/test/frontmatter.test.mjs` and `config-resolve.test.mjs` both exist there today (#460) |

The `gvt-construct3` `audit.mjs`'s **12 exports** were also confirmed directly (`grep -c '^export '` against the
same pinned commit), for completeness of the re-derivation, though no verdict in this record turns on that
count.

### Q2 — the library never throws for an expected condition

An absent file or directory, an unreadable or malformed config, an unresolvable key, or a command missing from
`PATH` all return an `expectation` finding — matching the three evaluators' current behavior on both sides,
confirmed above in verdict C. The single permitted throw is a **caller-contract violation**: an omitted or
non-string plugin root. That is a programmer error in the caller, not a fact about the audited repo, and the
distinction is exactly the one ADR-0049's two-class finding shape exists to preserve.

A **discriminated result type** (a `{ ok: true, value } | { ok: false, error }` wrapper around every call) was
considered and is **rejected**: it would introduce a second record class alongside `expectation`/`diagnostic`,
and ADR-0049 names the two-class shape as the invariant that makes the non-delegable author-time gate
enforceable structurally rather than by discipline.

`loadComponent`'s unguarded `fs.readFile` is a **latent inconsistency** with the no-throw rule, noted rather
than silently carried forward: it is unreachable in practice, since `walkComponents` has just confirmed the
file exists before `loadComponent` reads it, so the one place the no-throw property currently holds by accident
rather than by design. This is **explicitly deferred to #458**, which is where the library's actual consumption
wiring — and therefore the fix — belongs.

**Consequence:** the library has no process of its own and therefore no exit codes to own. The ratified
`0`/`1`/`2` exit contract — `0049-audit-core-mechanism-policy-boundary.md:135` ("Both audits compute")
`hasErrors` from `findings.some((f) => f.severity === 'error')` and exits accordingly — survives as an
obligation on the **calling entrypoint**, i.e. on `audit.mjs` in each plugin, never on the library.

### Q5 — the library does NOT carry the `mcp` expectation kind

Three independent, individually sufficient grounds:

1. **N=1.** `grep -ci 'mcp' audit.mjs` against this repo's own entrypoint returns **0** — this repo has no `mcp`
   expectation kind at all. Generalizing a kind against exactly one caller produces an interface shaped like
   that caller, the same failure `RESERVED_PATH_KEYS` already demonstrated in this codebase per ADR-0049.
2. `gvt-construct3`'s `evaluateMcp` shells out to `npx` for reachability — the exact process boundary ADR-0051
   rejects by name, at the exact granularity ADR-0051 calls out: `0051-npm-permitted-for-lockfile-gated-plugin-dependency.md:168`
   ("must never become a flag, argument, or environment variable") sits in the paragraph naming the standing
   directive against assertability creep, and the surrounding section is where `npx` is rejected as "a process
   boundary at the granularity of a single existence probe."
3. `gvt-construct3`'s `resolvePackageVersion` (feeding `evaluateMcp`'s satisfied-case `detail`) walks
   `node_modules` upward and encodes registry and package-naming assumptions specific to that plugin's domain.

**The distinction from `commandExists` must be stated explicitly, because both spawn a process.**
`commandExists` shells out to `where`/`which` via `spawnSync`, and ADR-0049 places it in **Mechanism** anyway.
The difference is **hermeticity**, not "the library never spawns a process" — a rule that would disqualify a
function ADR-0049 already ratified. `where`/`which` is local and network-free; `npx` reaches a package
registry. The refusal here rests on the network boundary, not on process-spawning in general.

**What remains true:** the kind set stays **open**. Declining to implement `mcp` in the shared library does not
narrow it — `0049-audit-core-mechanism-policy-boundary.md:176` ("never the enumeration of") makes this explicit
already: the contract "fixes the *shape* of an expectation finding, never the enumeration of kinds." A plugin
is free to add its own expectation kinds via its own evaluators; `gvt-construct3` keeps emitting `mcp` findings
from its own policy layer, and they remain fully contract-conformant.

## Compromise

**A single discriminated-result wrapper was rejected** in favor of the plain no-throw/return-a-finding rule
(Q2). It would have made every caller unwrap a result object on every call, for a benefit — distinguishing
"expected absence" from "genuine failure" — the existing `expectation`/`diagnostic` shape already provides.

**Generalizing `walkComponents`'s parameter into a single "components directory"** was rejected (verdict B)
even though it would have made the library's signature simpler to describe in one sentence. The simplification
would have required either forcing `skills/` and `agents/` through one traversal rule (wrong for one of them)
or smuggling a second implicit parameter back in — the forced-partial-fit anti-pattern ADR-0051 names.

**Carrying `mcp` as a fourth built-in expectation kind was rejected** (Q5), at real cost to `gvt-construct3`:
its adoption of the shared library (#459, itself still blocked on that repo acquiring a `package.json` per
ADR-0051) will have to keep `evaluateMcp` as local policy rather than inheriting it, and that repo's
`node_modules`-walking version-resolution logic gets no shared home. That is accepted because hermeticity is
the property the library exists to hold, per ADR-0051's `npx` rejection, and one caller's convenience does not
outweigh it.

**Treating the duplication decision as still open pending #457's actual extraction was rejected.** An
alternative reading would have kept ADR-0049's "duplicated for now" verdict standing until the library ships
code, on the theory that a decision-only record should not itself retire a prior decision. That reading is
rejected because ADR-0049 states its own expiry condition in the text this record cites
(`0049-audit-core-mechanism-policy-boundary.md:377`, "this record's premise") — the condition already fired, and
deferring its acknowledgment to a later, code-shipping record would mean carrying a premise everyone can see is
false for one more release cycle.

## Consequences

**#457** proceeds against a written target that now includes: the three-value resolution hook (A), a
plugin-root parameter rather than a components-directory one (B), `detail` rendered from the resolved probe
noun (C), `loadComponent` returning parsed frontmatter (D), no-throw-for-expected-conditions with the
caller-contract exception (Q2, `loadComponent`'s read deferred to #458), and no `mcp` kind (Q5).

**#458** inherits the deferred `loadComponent` throw-safety fix from Q2 as an explicit, named item rather than
a decision this record leaves implicit.

**#459** is unaffected in its blocking status (still gated on `gvt-construct3` acquiring a `package.json` and
lockfile per ADR-0051) but gains a concrete migration note: that repo's `evaluateMcp` and `resolvePackageVersion`
stay local policy under Q5, so adopting the shared library there does not retire either.

**#460's own value proposition is now partly realized rather than purely prospective.** ADR-0049 filed #460 to
close a *coverage* gap while the modules stayed duplicated; this record independently confirms, against
`gvt-construct3`'s `origin/main` at `6ba383b1f`, that the mirrored `frontmatter.test.mjs` and
`config-resolve.test.mjs` already exist there. What #460 has not done, and cannot do on its own, is stop the
*production* code from diverging further before #457 lands — mirrored tests catch a regression in behavior
they both exercise, not the addition of a capability to only one side.

**ADR-0049's Consequences section claim that "the duplication decision has an expiry, not a rule" is now
resolved rather than merely stated.** A future reader should treat the duplication decision as **retired** by
this record, not as still in force, and should look here — not there — for the current status of
`frontmatter.mjs`'s two copies.

This record ships no code and no behavior change, so it carries no version bump. Its comparative figures against
`gvt-construct3` are pinned to that repo's `origin/main` at commit `6ba383b1f2b3b6276ccbafa4757e0f06146ec4e3`,
confirmed directly in this session via a local checkout rather than merely inherited — but a `git fetch` against
that remote failed on an SSH-signing prompt during this same session, so a future reader extending this
comparison should re-fetch and re-run the commands above rather than treat `6ba383b1f` as necessarily current.
