# 0058. `audit-core` stands up as a no-build `.mjs` package with `yaml` declared at standup; the CI-workflow acceptance criterion is amended in the open once the shared templates prove to carry a dead `uses:` path

- **Status:** accepted
- **Date:** 2026-09-19
- **Issue:** #539

## Context

ADR-0049 drew the mechanism/policy boundary for a shared audit core. ADR-0051 permitted a real npm dependency
for the leaf and ruled it ships as a library, never a CLI. ADR-0057 re-derived and pinned the mechanism/policy
seam — the caller-supplied resolution hook's three-value shape, the plugin-root parameter, `detail` as
mechanism, the parsed-frontmatter return, the no-throw rule, and the declined `mcp` kind — as a written,
decision-only target for #457, `audit-core`'s eventual extraction commit. #539 is the link before that: it
stands up `GenvidTechnologies/audit-core` itself — the repo, its package shape, its CI, its first dependency —
so #457 has somewhere to land code. This record is the standup's own decision record; #457 remains open and out
of scope here.

`GenvidTechnologies/audit-core` now exists (public), with an initial commit `e69d3f0` and a green CI run on
Node v22.23.2.

## Decision

### A — a no-build `.mjs` package, diverging from both leaf peers

`@genvidtech/c3source` and `@genvidtech/mcp-utils` are both TypeScript packages: a `tsc` build step, a shipped
`dist/`, a `prepack` hook. `audit-core` instead ships plain `.mjs` sources with a hand-maintained `src/index.d.ts`
and no build step at all.

The rationale is the shape of the code being extracted, not a general preference against TypeScript. The
modules ADR-0057 pins as Mechanism live today at `plugin/skills/audit-conventions/scripts/lib/` as plain
`.mjs`. Matching the leaf peers' TypeScript shape would mean rewriting that code into TypeScript as part of
#457 — a materially larger change than either ADR-0049 or ADR-0057 describes, and one that would make the
extraction commit a rewrite rather than a move. Shipping `.mjs` keeps #457 a extraction-plus-adaptation of the
resolution-hook seam ADR-0057 already specified, not a language migration bundled invisibly into it.

**Consequence, named rather than left implicit:** a no-build package's risk shifts from *under-shipping*
(TypeScript's own failure mode — a build step that quietly omits a file `tsc` didn't compile) to
**over-shipping** — nothing stops an editor scratch file or a local config from being packed if the manifest
doesn't say otherwise. The mitigation is a `files` allow-list, `["src", "LICENSE", "README.md"]`, verified by
`npm pack --dry-run` producing exactly 5 files.

### B — `yaml` declared at standup rather than deferred to #457

ADR-0051 ratifies `yaml` as the leaf's dependency set in full: its only runtime dependency, with no
`@genvidtech` dependency of its own. That verdict was already settled; what this record decides is *timing*.
Declaring `yaml` now, at standup, rather than waiting for #457 to add it means the committed lockfile is
generated once, with the real dependency graph already in it — #457 then only needs to *use* `yaml`, not
regenerate the lockfile to add it. Verified: the package's `dependencies` field is exactly `{"yaml": "^2.9.0"}`,
matching ADR-0051's ratified shape with nothing extra.

### C — the shared CI/publish templates carry a stale `uses:` path, worked around as one enumerated deviation per file

This is the standup's most consequential finding. `GenvidTechnologies/public-github-actions` publishes
`templates/ci.yml` and `templates/publish.yml` for exactly this situation — a new leaf joining the diamond
ADR-0051 describes. Both templates name `genvid-holdings/genvid-public-ci` in their `uses:` line. That
org/repo no longer exists under that name: `gh api repos/genvid-holdings/genvid-public-ci --jq .full_name`
returns `GenvidTechnologies/public-github-actions`. **The API silently follows the rename redirect; a GitHub
Actions `uses:` line does not.** A repo copying the templates verbatim — exactly as their README instructs,
"drop-in with zero per-package edits" — gets a workflow that fails instantly with no jobs started.

Two pieces of evidence say this is a template defect, not a per-repo customization choice. First, both existing
leaf repos (`c3source`, `mcp-utils`) independently carry the identical one-line correction already — two
consumers silently converging on the same fix to the same template is evidence the template itself is wrong,
not that each chose to diverge. Second, this exact trap is already documented in this plugin's own
`release-npm-package` skill, under its "Verify `uses:` references resolve to canonical paths (post-rename
redirect guard)" heading — the guidance existed, and the shared templates still shipped stale. That the
guidance predates this standup and did not prevent it is worth recording plainly rather than glossing over.

The fix is submitted upstream, `GenvidTechnologies/public-github-actions#2`. Until it merges, `audit-core`
carries exactly **one** enumerated deviation per workflow file — the corrected `uses:` line — verified against
the templates by `diff`, with nothing else touched.

### D — the CHANGED acceptance criterion (ADR-0017 amendment)

#539's filed acceptance criteria contained two rows that could never both pass, once verdict C above is true.
One row required the two workflow files be **byte-identical** to the upstream templates. Its sibling required
**CI green, verified by an actual run**. Byte-identity to a template carrying the dead `uses:` path guarantees
a workflow that fails before any job starts — so satisfying the first row makes the second impossible, and no
amount of care in execution could have satisfied both as filed.

This is a **defective** criterion, not a decayed one: it was wrong the moment it was written, since the
templates already carried the stale path when #539 was filed, not sometime after. Per ADR-0017's amend-in-the-open
discipline, the byte-identity row is amended, in the open, to:

> matches the templates at a recorded fetch commit, with every deviation enumerated and justified; the only
> permitted deviation is the `uses:` canonical-path correction, permitted only while the upstream fix
> (`public-github-actions#2`) is unmerged — once it merges, the permitted deviation count is zero.

The amendment adds an **independent check**, not just a relaxed literal: that each `uses:` line names a
path equal to its own `full_name` as returned by `gh api repos/<uses-path> --jq .full_name`. This preserves the
requirement the original byte-identity row was actually protecting — that the workflows are the org's
canonical shared ones, not hand-rolled locally — via a check that does not depend on the literal text the
templates happen to contain today.

### E — `test` runs a real smoke test, not an empty set

The shared CI template pins Node 22 and runs `npm run test` unconditionally, with no per-consumer skip. Whether
`node --test` behaves identically across Node majors on an **empty** test directory was an open question this
standup could not resolve locally — no Node 22 runtime was available on the machine (no `nvm`/`fnm`/`volta`,
no working container runtime), so the behavior could not be probed before the first real CI run.

Rather than gate the standup on resolving that unknown, the dependency on it was **removed**: `audit-core`
ships one real smoke test, so at least one test file always exists and the empty-set question never has to be
answered to trust the gate. This is a scope note, not a finding — the decision here is "don't depend on the
unknown," not "the unknown resolves one way or the other." It was subsequently confirmed on CI itself: Node
v22.23.2, `tests 2 / pass 2 / fail 0`.

### F — a minor scaffold gap, worth naming so it doesn't recur

The initial ESLint flat config omitted Node's global identifiers, so `no-undef` fired on `URL`. Fixed by
declaring `globals.node` in the config. On its own this is a one-line fix; it is recorded here because the
same gap would otherwise have surfaced for the first time during #457, once real source starts using
`process` or `Buffer` — a worse moment to discover a scaffold defect than an empty-repo smoke test.

## Compromise

**TypeScript was not adopted for the leaf**, even though it would have matched both existing leaf peers and
given `#457`'s eventual consumers (`gvt-dev`, `gvt-construct3`) a declaration file generated from source rather
than hand-maintained. Rejected per verdict A: the cost is a rewrite of the code ADR-0057 already scoped as a
move, bundled invisibly into an extraction that isn't meant to also be a language migration.

**Waiting for #457 to add `yaml`, rather than declaring it at standup, was rejected** per verdict B: it would
mean regenerating the lockfile mid-extraction instead of once, for no benefit — the dependency itself was
already ratified by ADR-0051, so there is no remaining question standup could defer that #457 would answer
differently.

**Resolving the `node --test`-on-empty-set unknown by installing or containerizing a Node 22 runtime locally
was rejected** per verdict E, in favor of removing the dependency on the answer entirely. A real smoke test
costs less than standing up a second Node runtime on this machine and answers the only question that actually
mattered — does the gate run at all — without answering (or needing to answer) the narrower one about empty
sets.

**Hand-fixing the templates locally and moving on without filing upstream was rejected.** Two leaf repos already
carry the same silent correction; a third silent correction would make it three consumers independently
patching around the same defect with no path to it ever being fixed at the source. Filing
`public-github-actions#2` and enumerating the deviation as temporary, with a stated permitted-count-zero
condition once it merges, keeps the workaround visibly temporary rather than another undocumented fork.

## Consequences

**#457** now has a standing-up repo to extract into, with its package shape (no-build `.mjs`, hand-maintained
`.d.ts`, `files` allow-list) and its one ratified dependency (`yaml@^2.9.0`, lockfile already committed) fixed
by this record, in addition to the mechanism/policy seam ADR-0057 already pinned. Neither of those was an open
question #457 still needs to resolve.

**`GenvidTechnologies/public-github-actions#2`** is a live external dependency of `audit-core`'s CI hygiene:
once it merges, the workflow files' permitted-deviation count drops to zero, and re-verifying that (re-`diff`
against the templates, re-check `uses:` `full_name`) is a small, self-contained follow-up — not filed as a
separate issue here, since it is mechanical and low-risk, but worth noting so a future reader isn't surprised
to find the deviation still enumerated after the upstream fix ships.

**#539's filed acceptance criteria are corrected going forward** per verdict D: any grading of #539 should use
the amended byte-identity-plus-enumerated-deviations row and its independent `uses:`-resolves-to-`full_name`
check, not the original unsatisfiable pair.

This record ships no plugin code and no behavior change to `gvt-dev` itself — the `audit-core` repo it
describes is a separate, independently-versioned leaf, per ADR-0051's "third leaf" framing. Its `uses:`-path
finding (verdict C) is point-in-time: a future reader should re-check `public-github-actions#2`'s merge status
before treating the enumerated deviation as still necessary.
