# 0060. #477/#478 land as de-risking ahead of #458; the leaf pin needs no direct `yaml`; `leak-guard` gets a two-file exemption; the audit gains a bootstrap split and an exit-2 preflight

- **Status:** accepted
- **Date:** 2026-09-24
- **Issue:** #477, #478 (see also #458, GenvidTechnologies/audit-core#4)

## Context

ADR-0051 permitted a real, lockfile-gated npm dependency inside `plugin/` and sequenced #458 in five
ordered steps: (1) the `node_modules` skip fix #476, (2) `plugin/package.json` plus a committed lockfile
declaring `yaml`, (3) the preflight #477, (4) the swap of the hand-rolled parser to `yaml`, and (5) leaf
adoption, which #478 blocks. The preflight and the leak-guard question both needed design work that
ADR-0051 deferred to their own issues. Two things forced that design work to happen as its own
branch rather than inside #458 itself: the preflight cannot be written before a manifest exists to preflight
(#477's own "Note on ordering"), and `leak-guard.yml`'s scope pattern goes red the moment `plugin/package.json`
names a `@genvidtech`-scoped package, which is a policy call about a CI guard, not part of the rewiring
(#478's "Blocking" section). This record settles both, plus two sequencing questions that surfaced only once
the design was actually built: whether the leaf pin needs `yaml` as a direct dependency, and whether landing
#477/#478 ahead of #458 changes who owns the preflight's failure mode in the meantime.

## Decision

### A — the leaf pin depends on `@genvidtech/audit-core` only; the `yaml` swap moves into the leaf, sequenced after #458

`plugin/package.json` declares exactly one dependency, `@genvidtech/audit-core` at the exact pin `0.2.0` — no
direct `yaml` dependency in `plugin/`. This **reverses** the step order ADR-0051 wrote and ADR-0059 verdict B
reaffirmed: ADR-0051's Consequences section sequenced #458 as five steps, step (4) being *"swap the hand-rolled
parser's internals to `yaml`"*, and ADR-0059 verdict B held that ordering deliberately, naming the leaf's `yaml`
dependency as *"declared but unused … from #457 through to #458 step (4)."*

**Resolved: the swap does not happen in `gvt-dev` at all.** It is filed as `GenvidTechnologies/audit-core#4`,
sequenced *after* #458, not as a #458 step. The reason is `audit-core`'s own CLAUDE.md constraint, not a new
preference: the leaf requires its five `src/` modules (including `frontmatter.mjs`, the parser in question) to
stay byte-identical to `gvt-dev`'s `lib/` copies for as long as both exist. The five were verified identical
by `git hash-object` on 2026-09-23. A parser swap inside `gvt-dev`'s copy while the leaf still
carries the old one would break that identity immediately; the swap can only land in the leaf once #458 deletes
`gvt-dev`'s copies and the byte-identity obligation lapses. Once that happens, `gvt-dev` consumes the swapped
parser transitively through the leaf and never needs a direct `yaml` dependency of its own.

This does not reopen ADR-0059 verdict B's reasoning — a parser swap bundled into a move is still the same
category of error ADR-0058 verdict A was written to avoid — it relocates the swap's *home* now that the leaf
exists as a place for it to land cleanly, after the byte-identity constraint that made an earlier swap
premature has itself expired.

### B — `leak-guard.yml`'s scope pattern is amended with a full-path exemption of exactly two files (option L1)

Measured on this branch once the real files existed: `plugin/package.json` produces **2** matches against the
`code_only` pattern (`@genvidtech|genvidtech/`), the dependency entry and the `#audit-core` imports alias, and
the npm-generated lockfile produces **3** (the root dependency entry, the `node_modules/…` key, and the
`resolved` tarball URL), **5** in total. Before the manifest existed, the tree-wide count of non-`.md` tracked
files matching the pattern was **0**. With the exemption applied it is **0** again. The 13 other tracked
`package(-lock).json` files (1 under `audit-conventions-evals/` and 12 under `release-npm-package-evals/`)
are still scanned, since the exemption names two specific paths.

**Decided: exempt `plugin/package.json` and `plugin/package-lock.json` by full path, on the `code_only` line
only** — the `always` pattern (`C:/repos/|C:/Users/|fninoles`) is untouched, since it is a different concern
run over all tracked files. A bare `':!package.json'` pathspec was considered and rejected: a git pathspec
literal matches only the root-level path, so it would not exempt the nested `plugin/package.json` at all
(measured). A wildcard exemption (e.g. `':!**/package.json'`) was also considered and rejected, because it
would additionally exempt the 13 eval-fixture manifests, along with any manifest added later, and take them
out of the guard's view without anyone deciding that they should be.

**Forward rule for #458:** code reaches the leaf through the `#audit-core` `imports` alias declared in
`plugin/package.json`, never the scoped literal `@genvidtech/audit-core` written directly into a `.mjs`/`.ts`
file. The exemption covers the manifest and lockfile only; a code file that hardcodes the scoped name is still
caught by the unmodified `code_only` pattern, exactly as intended.

### C — `commands.validate`/`commands.test` running `npm ci --prefix plugin` is an accepted, narrow hermeticity exception

ADR-0051's ground-(b) overturning rests on `commands.validate` staying hermetic for **consumers**: the host
performs the dependency install once per cached version, and a consumer's audit run makes no registry call.
That property is unaffected by this record. What changes is this repo's *own* `.gvt-agent.json`
`commands.validate`/`commands.test`, which now both run `npm ci --prefix plugin --ignore-scripts --no-audit
--no-fund` before the rest of the command chain — a real registry call (or a cache hit) every time either
command runs from a git checkout.

**Decided: accepted as a scoped exception, not a reopening of ADR-0051's hermeticity ground.** ADR-0051's
argument was about the audit's *published, consumer-facing* invocation path — the plugin cache, where Claude
Code has already installed the dependency and `commands.validate` never needs to. This repo's own dev-loop
commands are a different invocation path with a different actor: a maintainer's git checkout, which has no
Claude-Code-managed `node_modules` at all. **Caveat, stated so it does not need rediscovering:** anyone running
`audit.mjs` from a git checkout of this repo — not the Claude Code plugin cache — in CI or locally must run
`npm ci --prefix plugin` first; a cache-based invocation (a consumer's audit, or this repo's own dogfooded
skills once released) needs nothing extra.

`metadata.expects.tools` is unaffected — see ADR-0051's own closing paragraph (*"`metadata.expects.tools` is
unchanged. That is a decision, not an omission"*): the audit still shells out only to `node` and `git`, never
`npm`, so this record adds no tool expectation.

### D — the preflight lands as a bootstrap split, ahead of #458, as deliberate de-risking; the CI workflow and exact pin round it out

**Design considered and rejected:** running the preflight check *inside* `audit-main.mjs`'s existing `main()`
(option B) cannot protect what it exists to protect — ESM links every static import before any module-level
code runs, so a broken `@genvidtech/audit-core` import anywhere in the body's import graph would already have
thrown, as a raw `ERR_MODULE_NOT_FOUND` stack, before a preflight check inside that same body ever got a chance
to run. A warn-only preflight (option C) was also rejected: an unavailable dependency would then exit 0 or 1,
which CI reads as a pass or as an unmet expectation, rather than 2, which means the audit could not run.

**Adopted (option A):** `audit.mjs` becomes a thin bootstrap — node: built-ins and
`./lib/dependency-preflight.mjs` only, deliberately excluding any import that could itself pull in the
dependency under test — that runs `checkPluginDependencies` and, only once that passes, dynamically imports
the former body, now relocated unchanged to `audit-main.mjs`. A dynamic `import()` is late-bound, so it is the
only seam that lets a check run *before* the linker has already decided the body's fate. On failure the
bootstrap prints a message naming the dependency, the likely cause, and the fix, and exits **2** — never 1,
which the contract reserves for an unmet `metadata.expects` finding, and never a bare stack trace.

The preflight's verdict set — `ok`, `no-manifest` (a pass; `plugin/package.json` absent means no dependency was
ever declared), `no-lockfile`, `lockfile-drift`, `absent`, `unusable`, `tree-incomplete`, `version-mismatch` —
is checked in that order (see `lib/dependency-preflight.mjs`'s own header comment), because each step only runs
once the previous one has nothing more specific to report, so the returned verdict is always the earliest,
most actionable cause. Directory presence alone is deliberately insufficient to pass: a timed-out host install
can leave a partial `node_modules` tree that is directory-present but non-functional, so `unusable` is decided
by probing importability with a dynamic `import()`, not by `fs.stat`.

A GitHub Actions workflow, `.github/workflows/plugin-deps.yml`, runs `npm ci --prefix plugin`, the audit's own
test suite, and `audit.mjs` itself on every PR — filling the gap that `release-plugin` runs only `claude plugin
validate`, never `commands.validate`, so nothing else in the existing pipeline would otherwise catch a
manifest/lockfile drift before merge.

**Accepted consumer-facing cost of the sequencing (#477/#478 landing before #458):** the preflight now runs on
*every* audit invocation, in the release this ships in, before anything in `audit-main.mjs` actually depends
on `@genvidtech/audit-core` — #458 is what makes the dependency load-bearing. A consumer whose host install of
this plugin's dependency failed (the two accepted-but-unmitigated risks ADR-0051's Consequences section names:
a lockfile-less skip, or a timed-out partial install) gets exit 2 from an audit that does not yet use the
dependency it is complaining about. No environment-variable or flag bypass was added, consistent with ADR-0051's
own standing directive against assertability creep and with ADR-0049's flag-rejection precedent. If field
reports surface consumers hitting this before #458 lands, the mitigation on the table is a patch softening the
verdict to warn-only for that one release — not an escape-hatch flag.

## Compromise

**Landing #477/#478 as their own de-risking release, ahead of #458,** was chosen over folding the preflight
into #458 itself. The cost is the accepted consumer-facing gap named in verdict D above — a real, if
low-probability, exit-2 with no present payoff for one release cycle. Accepted because the alternative is
shipping #458's actual import rewire with no guard against the exact silent-failure shape #477 exists to catch,
which is a strictly worse failure mode (an undiagnosable `ERR_MODULE_NOT_FOUND` stack, arbitrarily later) than
a legible, if premature, exit 2.

**Depending on `@genvidtech/audit-core` only, with the `yaml` swap deferred into the leaf and resequenced after
#458** (verdict A), was chosen over keeping `yaml` as a direct `gvt-dev` dependency per ADR-0051's original step
order. That reverses ADR-0059 verdict B's explicit reaffirmation of the original order. Accepted because the
leaf's byte-identity constraint makes an earlier swap not merely inconvenient but actively breaking — a rewrite
smuggled into a move, the failure that ADR-0058 verdict A and ADR-0059 verdict B both named as unacceptable.

**Exempting exactly two files on `leak-guard`'s `code_only` line** (verdict B, option L1) was chosen over
narrowing the pattern itself or accepting the guard is now categorically wrong for this repo (#478's second
candidate direction). A wildcard exemption was rejected for widening the exemption to the 13 fixture manifests
the guard should keep scanning; a bare root-level pathspec was rejected for not matching the nested file at all.
The forward alias rule (code never writes the scoped literal) is what keeps the exemption from quietly becoming
a blanket pass for any future `@genvidtech`-scoped hardcoding.

**Running `npm ci --prefix plugin` inside this repo's own `commands.validate`/`commands.test`** (verdict C) was
accepted as a narrow exception rather than treated as evidence ADR-0051's hermeticity argument needs revisiting.
The two invocation paths — a consumer's cached-plugin audit, and a maintainer's git-checkout dev loop — are
different enough that the exception does not erode the property ADR-0051 was protecting.

## Consequences

**#458** inherits, as explicit named items rather than rediscovered ones: the bootstrap split now exists and
its body lives in `audit-main.mjs`; the dependency it will wire `audit-main.mjs` onto is pinned at exactly
`0.2.0`; the `yaml` swap is no longer a #458 step at all, having moved to `GenvidTechnologies/audit-core#4`,
sequenced after #458 deletes `gvt-dev`'s local copies; and the leak-guard exemption already covers the manifest
and lockfile #458's leaf-adoption step will exercise for real.

**`GenvidTechnologies/audit-core#4`** is the tracked follow-up for the parser swap ADR-0051 originally placed at
#458 step (4); it is now explicitly sequenced after #458, not before or concurrent with it.

**Consumers** gain nothing new from this record on its own — `@genvidtech/audit-core` is declared but not yet
imported by `audit-main.mjs` — except the accepted exit-2 exposure named in verdict D, which resolves once
#458 ships.

This record's own commits carry a version bump at release, per the CHANGELOG entry covering #477/#478.
