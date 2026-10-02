# 0059. Three deferrals from #457's prep-refactor: the `reconcile-mcp-pin` gap stays accepted, the YAML swap stays in #458, and the remaining duplicate probes stay unmerged

- **Status:** accepted
- **Date:** 2026-09-21
- **Issue:** #457

## Context

ADR-0057 re-derived and pinned the mechanism/policy seam for the future `@genvidtech/audit-core` library —
the three-value resolution hook, the plugin-root parameter, `detail` as mechanism, the parsed-frontmatter
return, the no-throw rule, and the declined `mcp` kind. ADR-0058 stood up the leaf repo itself. #457 is the
extraction commit those two records target, and this repo's own prep-refactor — moving `audit.mjs`'s inline
mechanism functions into `lib/` modules ahead of the cross-repo move — surfaced three questions that are
deferrals or accepted gaps rather than mechanism choices. This record does not restate ADR-0057's mechanism
verdicts; it settles what #457's prep leaves out, and why.

## Decision

### A — the `reconcile-mcp-pin` gap is accepted, not closed

`reconcile-mcp-pin`'s own applicability section states it *"Applies when a plugin pins MCP servers in
`plugin.json` `mcpServers` AND ships agents that enumerate those servers' tools by hand"* and *"Does not
apply to a plugin with no bundled MCP servers (e.g. gvt-dev itself)."* #457 pins a new dependency —
`@genvidtech/audit-core` — and that pin inherits the general drift problem (a version bump can change the
published surface) without triggering the specific failure `reconcile-mcp-pin` exists to catch.

**Decided: accepted, not extended.** `reconcile-mcp-pin` is not widened to cover a pinned npm library. The
failure that skill guards against is an agent's hard `tools:` allow-list silently losing a callable tool when
an MCP server's surface changes underneath it — a static enumeration going stale. A library's surface has a
different, already-covered detector: `tsc` typechecks the consuming code against the installed declaration
file, and the leaf's own `dts-parity` test (ADR-0057's Q2 area, exercised by #457's own acceptance criteria)
keeps the `.d.ts` honest against the `.mjs` it describes. Extending an agent-tooling reconciliation skill to
a typechecked dependency would duplicate a check that already runs on every build.

Named honestly: nothing today detects that `@genvidtech/audit-core`'s exported surface changed under a
version bump except the consumer's own typecheck, and #458 — which actually wires `gvt-dev` onto the
published package — is where that detection lands or doesn't. `reconcile-mcp-pin/SKILL.md` is left
byte-unchanged by this decision; #457's acceptance criteria pin that with a sha256 survival assertion.

### B — the hand-rolled frontmatter parser moves verbatim; the `yaml` swap stays in #458

ADR-0051's Consequences section sequences #458 in five ordered steps, and step (4) is *"swap the hand-rolled
parser's internals to `yaml`."* ADR-0058 verdict B declared `yaml` as the leaf's dependency at standup,
reasoning that doing so early means *"#457 then only needs to use `yaml`, not regenerate the lockfile to add
it."* Read on its own, that sentence could be taken as instructing #457 to consume the dependency; it isn't,
and this record is where that gets settled explicitly rather than left to be inferred differently by whoever
next reads the two records side by side.

**Resolved: ADR-0051's step ordering governs.** #457 moves `lib/frontmatter.mjs` to the leaf verbatim,
unchanged. ADR-0058 verdict A's entire rationale for shipping a no-build `.mjs` package rather than matching
the TypeScript leaf peers is that doing otherwise would *"make the extraction commit a rewrite rather than a
move"* — and swapping the parser's internals mid-extraction is the same category of error, a rewrite
smuggled into what is supposed to be a move. ADR-0058's phrasing describes the dependency being *available*
to the leaf once it exists there, not a mandate that #457 be the commit that starts consuming it.

Consequence, stated so a future reader does not "fix" it: the published leaf carries `yaml@^2.9.0` as a
**declared but unused** runtime dependency from #457 through to #458 step (4). That is deliberate and
slightly untidy, and it is deliberate specifically so the extraction stays a move.

### C — the remaining duplicate probes are not unified here

#457's prep extracted `audit.mjs`'s `fileExists`, `dirExists`, and `commandExists` into `lib/probes.mjs`.
Measured after that extraction: five duplicate definitions remain, across four other files —
`fileExists` in `lib/migrate.mjs`, `lib/practice-detect.mjs`, `lib/state-detect.mjs`, and
`hygiene-probe.mjs`; `dirExists` in `lib/practice-detect.mjs`.

**Filed as issue #550**, rather than folded into #457 or left unrecorded.

Three grounds, any one sufficient on its own:

1. All four callers are **policy** modules under ADR-0049's boundary — `migrate.mjs` and `state-detect.mjs`
   drive the audit's legacy/migration state machine, `practice-detect.mjs` drives practice-coverage
   detection, and `hygiene-probe.mjs` is the hygiene scanner family ADR-0049 named as explicitly out of
   scope for the shared tool. Unifying them onto the extracted `lib/probes.mjs` today would make gvt-dev's
   state machine and migration planner acquire a dependency on the *published* leaf once #458 lands — a
   coupling decision #458 should take deliberately, not one that arrives as a side effect of this prep pass.
2. `migrate.mjs` and `state-detect.mjs` feed the `--fix` path, which carries its own exit semantics distinct
   from validate mode. #457's byte-identity acceptance gate compares the audit *report* against a pinned
   worktree and structurally does not exercise `--fix` at all, so unifying those two modules' probes would
   widen the change past what its own gate can verify.
3. ADR-0049's Consequences section states the general caution this instance falls under: *"A proposal that
   comes back materially larger has almost certainly absorbed policy."* Sweeping four policy-side files'
   internal helpers into a mechanism extraction, on the grounds that the helpers happen to share a name and
   a body with the just-extracted ones, is exactly that absorption.

## Compromise

**Extending `reconcile-mcp-pin` to cover a pinned npm dependency was rejected** (A) at the cost of leaving a
real, named gap: nothing but a typecheck currently protects against `@genvidtech/audit-core`'s exported
surface silently narrowing under a version bump before #458 wires up consumption. Accepted because the
failure mode `reconcile-mcp-pin` exists for — a hand-maintained enumeration going stale — has no counterpart
here; a typechecked import is not a hand-maintained enumeration.

**Swapping the frontmatter parser to `yaml` during #457 was rejected** (B), even though the dependency is
already declared and available in the leaf, at the cost of shipping a temporarily unused dependency. Accepted
because the alternative bundles a rewrite into a move, which is the exact failure mode ADR-0058 verdict A
was written to avoid one step earlier in the same chain.

**Unifying the five remaining duplicate probe definitions was rejected** (C), at the cost of leaving
`fileExists`/`dirExists` defined in five places instead of the two (`lib/probes.mjs` and its callers) the
extraction leaves behind. Accepted because all five remaining copies sit in policy-side modules whose
coupling to the published leaf, and whose `--fix`-path exposure, are decisions #458 should take with the
whole picture in view rather than inherit from a mechanism-only prep pass.

## Consequences

**#457** proceeds having recorded, rather than silently carried, three items a future reader might otherwise
mistake for oversights: an unextended `reconcile-mcp-pin`, a `yaml` dependency the leaf declares but does not
yet use, and five duplicate probe definitions the extraction deliberately left untouched.

**#458** inherits two explicit, named items from this record rather than rediscovering them: the parser swap
(ADR-0051 step 4, reaffirmed here as unmoved by ADR-0058's early declaration), and the coupling question
issue #550 raises for the four remaining policy-side probe callers.

**#550** is the tracked follow-up for verdict C; resolving it is a #458-or-later decision, not a #457 one.

Also worth recording, briefly, since it is a seam ADR-0057 did not name and a correction the prep pass made
along the way:

- **`REPO_ROOT` was a free variable inside `evaluateFile`/`evaluateConfig`** before this prep pass — read
  from `process.cwd()` at the point of use rather than passed in. ADR-0057 verdict A's three-value resolution
  hook absorbed it along with the probe-selection and display-target values; the root now lives only in the
  caller-supplied closures `lib/evaluate.mjs` returns. A future reader comparing ADR-0057's verdicts against
  the shipped code will find this one extra moving part, which is why it is named here rather than left
  implicit.
- **`loadComponent`'s unguarded `fs.readFile` ships as-is** in `lib/component-walk.mjs`, per ADR-0057 Q2's
  explicit deferral of that fix to #458.
- **The `pillarCensus` construction was corrected in passing.** It now passes each component's raw
  `metadata.pillar` scalar through to `computePluginCoverage`, rather than a pre-parsed array, matching
  `lib/pillars.mjs`'s documented input contract for that function. The prior code parsed the scalar once
  itself and then passed the result through a second `parsePillars` call inside the coverage grouper; it
  produced the same output only because `parsePillars` happens to be idempotent on an already-parsed array,
  not because the double call was intentional.

This record ships no code beyond what #457's prep already carries — it is decision-only, in the same sense
ADR-0057 and ADR-0058 are, and its own version-bump verdict follows the CHANGELOG entry for #457's prep
commits, not this record on its own.
