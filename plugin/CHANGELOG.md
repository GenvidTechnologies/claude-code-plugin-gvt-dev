# Changelog

All notable changes to the `genvid-dev` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and follows [semantic versioning](https://semver.org/).

## [Unreleased]

### Changed

- **`plan-task` + `rebase-stack`: three skill refinements surfaced dogfooding (#83).**
  - **`plan-task` Phase 4 — never fabricate a backfilled ADR's date.** When the ADR records a decision made *earlier* than the PR (a backfill, or one predating the convention), the tech-writer dispatch must not invent a `Date:` (fabricated placeholders like `2024-01-01` are worse than none). Derive it from git history (`git log --diff-filter=A` / `git log -S`), hedge to month/year when it can't be pinned to a day, and distinguish **Originally decided** (real date) from **Recorded** (when the file was written).
  - **`plan-task` Phase 1 — prefer the project's domain explorer.** A domain-specific task (e.g. a Construct 3 event-sheet migration) needs the domain's MCP tools the generic analyst lacks; Phase 1 now prefers the recon agent named in `CLAUDE.md`'s agent dispatch guide (e.g. `genvid-c3:c3-explorer`), falling back to `genvid-dev:analyst` for general tasks or when none is named.
  - **`rebase-stack` — recover when merging the parent CLOSED the child PR.** Squash-merging the parent with branch deletion auto-CLOSES the stacked child, and a closed PR whose base branch was deleted cannot be reopened or retargeted. Documents the rebuild-only recovery (`--onto` rebase + fresh `gh pr create`) and the prevention: retarget the child to the default branch before merging the parent.
  - **`plan-task` execution — clarify that one-commit-per-task is a default, not an anti-batching rule.** When several tasks refine the same file (common for doc/skill edits), committing them together as one logical commit is cleaner than patch-staging to force a commit each.

  Companion to #81 (defer-scope discipline). Behavioral/reference-surface change → version bump at release.
- **`CONVENTIONS.md`: document the optional `Agent Dispatch Guide` CLAUDE.md section (#83).** Backs the new `plan-task` Phase 1 domain-explorer preference with a documented convention — a consuming repo names its domain-specific recon agent(s) (e.g. `genvid-c3:c3-explorer`) under this heading, and planning dispatches them instead of the generic analyst; omit it and planning falls back to the analyst. Optional like the other expected sections (skills tolerate its absence), so the aggregated contract isn't widened.

## [3.3.0] - 2026-06-16

### Changed

- **`development-principles`: new principle #8 — "consistency before features" (#81).** Makes the discipline of bringing touched code fully to its target convention a first-class, numbered principle — the single source of truth referenced by skills rather than restated in each. Principle #8 covers: the core rule (make all code do it right, then add the missing feature); a **finish-quality vs. additional-scope corollary** (finish-quality of the code a change touches is part of that change's definition of done and must not be carved into a deferred follow-up where the "make it consistent" ticket drifts or never lands — classify every deferral before deferring it); and a **stale-mechanism corollary** (a tracking item should record outcome + acceptance criteria, not a prescribed implementation mechanism — a prescribed mechanism drifts when a later change ships a different one, leaving the next planner to inherit a dead, never-adopted convention as if it were spec; re-verify any prescribed mechanism against live code before adopting it). `analyst.md`'s existing parenthetical is repointed to the canonical principle number. `plan-task` now gates deferrals against the finish-quality corollary and extends its already-shipped gate to superseded mechanisms; `triage-issues` flags mechanism-prescribing issues and suggests outcome+AC rewrites. All reference principle #8 rather than restating it. Behavioral and reference-surface change → version bump at release.
- **`tech-writer`: generalize "Link, don't duplicate" beyond docs↔CLAUDE.md to any
  canonical source.** The key-principle was scoped to "if content exists in `docs/`,
  `CLAUDE.md` links to it" — but the recurring failure is broader: when dispatched to
  add a *reference* to a canonical principle (a numbered `development-principles.md`
  entry) or a shared doc's enumeration, the agent copies the list/examples verbatim
  instead of pointing to it, then the copies drift (singular/plural, dropped members)
  and defeat the "documented once" intent — caught only at the code-review gate. The
  principle now covers any canonical source and cites the agent's own principle-#7
  reference (line 29) as the model to apply everywhere. Surfaced dogfooding the new
  `development-principles.md` principle #8. No contract change.

## [3.2.0] - 2026-06-16

### Added

- **`migrate-cordova-ci`: new skill — port a Cordova plugin's CI/CD from CircleCI
  to GitHub Actions (#79).** Ships the proven post-migration
  `cordova-plugin-marketplace` setup as bundled, parameterized templates
  (`android.yml`/`ios.yml` with a smoke + distribute tier, `version-guard.js`, and
  two config snippets) plus a 6-step one-commit-per-step runbook. The runbook
  encodes the 8 non-obvious CI traps that each cost a live round-trip (Xcode pin →
  simulator-runtime mismatch, AAB ≠ sideloadable, `op` CLI vs `load-secrets-action`
  for dynamic-named signing files, service-accounts-can't-read-personal-vaults, the
  `.p12`-must-contain-the-private-key gate, `os.Logger`/deployment-target floor, the
  `v*.*.*`-tag-also-fires-`publish.yml` hazard, and `/`-in-artifact-name
  sanitization), a per-repo parameter table, and a manual live-CI gate. iOS
  distribute ships enabled. The project-specific 1Password signing vault is **not**
  baked into the templates — it's read from a `cordovaCi.opVault` key in the
  consuming repo's `.genvid-agent.json` (two-surface pattern) and substituted for
  the `<OP_VAULT>` placeholder. All `metadata.expects` are `required: false`
  (skill-conditional). A new invocable skill is consumer-visible surface → version
  bump at release.

## [3.1.1] - 2026-06-15

### Changed

- **`plan-next-issue`: skip the triage offer when only one (or very few) untriaged
  issues exist.** Triage's value is dedup/linking, which needs ≥2 issues — for a lone
  untriaged issue the offer is pure friction. The skill now notes that and goes
  straight to ranking (§2), folding any single-issue enrichment into the §2 metadata
  fetch. Guidance refinement, no contract change.

### Fixed

- **`reconcile-mcp-pin`: Phase 2 tool-surface grep now scans every compiled module
  under `dist/mcp/`, not just `server.js` (#77).** A server that registers tools from a
  secondary module (e.g. a dynamic `opsRegistry.js`) would otherwise diff *empty* even
  though the surface grew — the counts stay plausible (non-zero, unchanged), so the
  existing silent-zero count check never trips, and a newly-added read tool silently
  never reaches a hard `tools:` allow-list (an uncallable tool — the exact regression the
  skill exists to prevent). The `surface()` grep is now recursive (`grep -r
  --include='*.js'` over `dist/mcp/`), `sort -u` de-dupes names across modules, and a new
  guard note covers the residual case (release notes mention new tools but the diff is
  empty → grep wider before trusting it). Skill-content fix → version bump.

## [3.1.0] - 2026-06-12

### Added

- **`audit-conventions`: `--apply` reconciles against the previewed `--fix` plan
  (#74).** The dry-run now persists its plan (to the OS temp dir, keyed by repo —
  nothing is written to your repo) and `--apply` diffs the freshly-recomputed plan
  against it, printing a reconciliation line — e.g. `Applied 53 of 54 previewed
  actions — 1 previewed action no longer applies (re-run --fix to see the current
  plan)`, plus a note when new actions appeared since the preview. Previously a
  previewed action that no longer applied (because the working tree changed between
  the two turns) dropped silently, visible only as an unexplained count change —
  the #70 mechanism. Defense-in-depth guard; it warns and proceeds, never blocks.
  Consumer-visible output change → version bump.

- **`reconcile-mcp-pin`: new maintainer skill — reconcile agent tool inventories
  after an MCP server pin bump (#68).** A plugin that pins MCP servers in
  `plugin.json` `mcpServers` and ships agents enumerating those servers' tools by
  hand must reconcile the inventories every bump — for an agent with a hard
  `tools:` allow-list a missed read tool becomes *uncallable*, a functional
  regression. The skill generalizes genvid-c3's proven
  `tool-surface-reconciliation` runbook: pull the authoritative surface from the
  pinned package (`npm pack` + `registerTool` grep with a count sanity-check), diff
  old vs new, reconcile read-side and mutation-side agents respecting the
  read/mutate split (two judgment calls kept as guided checkpoints), sweep stale
  `@<old>` version prose, bump the pin, and add a CHANGELOG entry. It stops short of
  the release and hands off to `release-plugin`. A new invocable skill is
  consumer-visible surface → version bump. Contract unchanged: declares only `paths.plugin_root`
  (`required: false`) and the `npm`/`git` tools, so the audit's aggregate
  expectations don't widen — genvid-dev, which bundles no MCP servers, is unaffected.

- **`tech-writer`: define decision-record `Date` semantics (#55).** The ADR
  template shipped `Date: YYYY-MM-DD` with no meaning attached, and the
  authoring step didn't mention the field — so a record (especially a
  *retroactive* one) could get a date that predated the decision, caught only in
  review. `tech-writer`'s ADR fill step and the template's guidance comment now
  define **Date** as when the decision was *accepted/finalized* (not when the
  record was written), with explicit handling for retroactive and diffuse
  decisions. Surfaced dogfooding the `docs/decisions/` convention in this repo.
  No contract change.

- **`designer`: validate filter/classify/dedup heuristics against real data (#64).**
  A design could propose a set-partitioning heuristic (allowlist/noise filter,
  dedup key, "skip if X" rule, auto-suppression) that reads as obviously-sufficient
  but matches nothing against the real corpus — the gap then surfaces mid-execution
  (the burbank-playfab case: a "pure-placeholder" suppressor auto-cleared 0 of 664
  localization gaps because every string had a leading word). The designer's friction
  audit (step 4) now carries a **Heuristic-vs-real-data validation** sub-bullet: run
  or hand-trace the rule over a representative real sample and report the actual
  reduction before recommending it, or flag the assumption as unvalidated when the
  corpus can't be cheaply sampled. The empirical analogue of the existing structural
  friction checks (recipe-vs-override, validation-pipeline duality, paired-array
  ordering). No contract change.

- **`designer`: re-derive a generalized runbook under its new parameter ranges (#68).**
  A design that generalizes a proven procedure (runbook, manual recipe, one-off
  script) into parameterized form can read as obviously-correct while a mechanical
  step silently breaks under the parameter ranges the generalization newly admits —
  the original's *fixed* inputs masked it. Surfaced authoring `reconcile-mcp-pin`:
  the genvid-c3 runbook `npm pack`ed two *different* packages into a shared dir, but
  the generalized "old vs new of the *same* package" case made both tarballs unpack
  to `package/` and clobber (caught by the code-reviewer gate, not the design). The
  designer's friction audit (step 4) now carries a **Generalize-a-runbook
  re-derivation** sub-bullet: walk the concrete steps with the boundary values the
  generalization opens up (same-name inputs, N=0/1, duplicates, collisions) and flag
  any the original's constants protected. No contract change.

- **`audit-conventions`: warn on `repo.host` drift vs the git remote (#54).** A
  stale `.genvid-agent.json` `repo.host` (e.g. `bitbucket` after a repo moved to
  GitHub) silently misleads host-specific skills (`create-pr`, `release-*`) at
  the start of a session. Validate mode now infers the host from the `origin`
  remote (`github.com` / `bitbucket.org`, https + ssh forms) and emits a new
  non-fatal **Warnings** section on mismatch, naming the value to set. An absent
  `repo.host` or an unresolvable/unrecognized remote stays silent, and warnings
  never affect the exit code or the required-expectations tally. Warn-only — no
  `--fix` auto-correct.

- **`plan-task`: a feature-already-shipped gate (#51).** Phase 1 had a
  bug-symptom-observable gate but no feature equivalent, so a long-lived "feat:"
  tracking issue whose core work already shipped could be routed straight into
  planning — risking re-implementing shipped code. Phase 1 now carries a symmetric
  feature gate (grep for the named capability, read the issue *body* not just its
  title/labels, scope to open checkboxes or propose closing), and the "issue is
  already a full proposal" shortcut warns that it assumes *unbuilt* work. Pairs
  with the `plan-next-issue` upstream guard (#52).

- **`plan-task`: five-dimension documentation enforcement + a decision-record
  convention (#46).** Documentation freshness was enforced only by one reactive,
  optional line at the end of execution. Now a new development principle (#7)
  defines five doc dimensions — implementation, design, architecture, purpose,
  compromise — as canonical vocabulary, and four surfaces enforce it: the
  `plan-task` planning self-audit gains a mandatory doc-coverage item (each
  dimension is covered or explicitly "N/A because …"), `code-reviewer` gains a
  five-dimension coverage check (Warning-level, guarded against trivial-diff
  false positives), and `tech-writer` gains the five-dimension criteria plus a
  "link the originating issue, don't transcribe" principle. Durable architecture
  and compromise rationale now lands in a committed **decision record**
  (`docs/decisions/NNNN-*.md`, MADR-lite template bundled with `plan-task`),
  authored by `tech-writer` and dispatched from `plan-task` Phase 4 only when a
  non-trivial design decision was actually made. The `docs/decisions/`
  expectation is declared `required: false`, so the audit treats it as optional
  and no consuming repo's contract is widened.
- **`condense-lessons`: scaling guidance + non-doc extraction homes (#44).** Adds a
  "Scaling to a large backlog" section for docs with many verbose entries: condense
  by fanning out agents that *return* text while the orchestrator writes the file
  once (one writer, no races), and partition extraction agents by target file (one
  owner per doc) so concurrent edits don't clobber. Also clarifies the brief format
  — the `Key insights extracted to:` line may reference a skill, an auto-memory, or
  an upstream issue (not only `docs/`), and reusable insights with no home yet are
  kept under "Remaining session-specific insights" rather than dropped.

### Changed

- **`ts-implementer` / `plan-task`: name JavaScript explicitly as in-scope.** The
  `ts-implementer` description and body said "pure-TypeScript tasks," and
  `plan-task`'s execution step routed only "TypeScript work" to it — leaving plain
  ESM JavaScript (e.g. this plugin's own `scripts/*.mjs` audit code) with no named
  implementer, so dispatching it was a judgment call. Both now state the agent is
  the default implementer for TypeScript **or** JavaScript (including `.mjs`).
  Routing/description refinement; no contract change.

- **`plan-task`: allow an inline validator gate for trivial changes.** The
  Shortcuts section now blesses running the project's `validate` command directly
  instead of dispatching a full `genvid-dev:validator` subagent when the change is
  trivial and deterministic (e.g. a single-line doc edit). The gate still runs
  before the commit — only the mechanism is lighter.

- **`publish-npm-package`: cover no-build packages (#53).** The skill assumed a
  buildable `tsc` package, and its "not for…" caveat implied a no-compilation
  package (a Cordova plugin, a vanilla-JS library) was out of scope — yet the
  node-gate runs `lint`/`typecheck`/`test`/`build` unconditionally and the recipe
  works once those four scripts are satisfied. A new "No-build packages"
  subsection documents the honest way to satisfy the gate (a real
  `typecheck = tsc --noEmit` over the hand-maintained `.d.ts` plus a minimal
  `tsconfig.json`; documented no-op `test`/`build`), notes that the `prepack`/
  `dist` entry-point and `publishConfig`-override guidance don't apply without
  build output, and shifts the `npm pack` check toward not *over*-shipping
  sources (tighten `.npmignore`). The caveat now reads "nothing to validate or
  publish," putting no-build packages explicitly in scope.

- **`plan-next-issue`: `git fetch` + an "open issue may already be shipped" guard
  before ranking (#52).** The skill ranked candidates from fresh server-side issue
  state but never fetched, so downstream `plan-task` ran against possibly-stale
  local `main` — and an open issue is not proof of pending work (a merged PR
  lacking a `Closes #N` link stays open). §1 now leads with a read-only `git fetch`
  of the default branch, and §2 ranking flags/de-prioritizes any candidate whose
  named target already appears on the default branch (a soft `git log` signal
  surfaced in the rationale, not a hard exclude). Pulls the staleness check before
  branch creation instead of relying on `plan-task`'s late Phase 4 check. Pairs
  with the `plan-task` planning-time gate (#51).

- **`plan-next-issue` / `triage-issues`: fall back to the host-native issue CLI
  when `bugTracker` is absent (#50).** Previously a missing `bugTracker` block was
  a dead-end — both skills only warned and asked the user to name an issue or add
  the block. `plan-next-issue` step 0 now leads with a host-derived fallback: when
  `repo.host` maps to a tracker with a usable CLI (`github` → `gh issue list` /
  `gh issue view`) it drives the backlog directly for that run, then prints a
  suggested `bugTracker` block for the user to add (it still performs no writes
  itself). `triage-issues` §0 step 2 now points at its existing §0a light-touch
  groom (already native-CLI) instead of treating the absent block as a hard stop.
- **`plan-next-issue`: warn when a label-scoped `actionQuery` hides untriaged
  issues (#47).** The triage-need check subtracts `triagedLabel` from
  `actionQuery`; if a repo scopes `actionQuery` to one label (e.g. `--label bug`),
  untriaged enhancements / docs / tech-debt are invisible and the skill wrongly
  reports "nothing to triage." Step 1 now sanity-checks the query first and warns
  when a label filter is present, recommending whole-backlog coverage; the
  `bugTracker` schema note in `CONVENTIONS.md` and the `triage-issues` example
  block now state the same scope requirement.
- **`plan-next-issue`: per-cluster routing for mixed multi-issue selections.**
  Step 3 previously offered an all-or-nothing choice — fold *every* selected issue
  into one combined plan, or run them *all* sequentially. A selection that mixes a
  related group (same skill/area, or a relates-to link) with independent issues had
  no clean route. Step 3 now checks whether the selection forms natural clusters and
  routes accordingly: all-related → one combined plan; all-independent → sequential
  runs; **mixed → per cluster** (each related group its own combined plan, each
  independent issue its own sequential run), presenting the grouping for
  confirmation first.
- **`triage-issues`: structured template now accommodates non-defect issues.**
  The structured `issue-triage.template.md` taxonomy was purely defect-shaped —
  `type:bug`/`crash`/`regression` only, a bug-only "Required fields" list (repro,
  expected-vs-actual, build/version), and a "Create split issue" recipe that
  hardcoded `type:{type}`. Triaging an enhancement/docs/chore backlog (every
  tooling, library, or plugin repo, including this one) therefore required ad-hoc
  fallbacks and risked wrongly flagging an enhancement `needs-info` for lacking a
  repro. The template now states that non-defect work is classified by its
  category label (`enhancement`/`documentation`/`chore`) with `type:*` reserved
  for defects, scopes the Required-fields bar to bugs (enhancements need a clear
  proposed change instead), and notes the non-defect split-label form.
- **`plan-task`: full-proposal shortcut now classifies open questions before
  resolving them (#45).** The "issue that's already a full proposal" shortcut
  previously funnelled *every* open question into a single `AskUserQuestion`.
  It now classifies each one first: **factual** questions (answerable from the
  code/repo) are resolved by dispatching the analyst or an `Explore`
  investigation — not asked of the user, who often doesn't know offhand and
  whose answer isn't authoritative — while only genuine **preference/scope**
  questions go to `AskUserQuestion`. Prevents the failure mode where a factual
  question (e.g. *"does the client read `result.success` here?"*) is put to the
  user and resolves to a no-op once the code is actually read, yielding a worse
  plan.

### Fixed

- **Commit ownership vs. the validator gate: `plan-task` now owns the commit
  (#63).** `ts-implementer`/`tech-writer` instructed "commit each task with
  `git commit -n`" while `plan-task` implied it validated *after* the implementer
  returned — so the commit landed *before* the gate, producing inconsistent
  commit authorship across a plan and letting a failing task land committed.
  The two surfaces now agree on a single convention: **the orchestrator owns the
  commit.** Implementer agents commit only when running standalone; when
  dispatched by an orchestrator that owns the commit + validation gate they stage
  their files, leave them uncommitted, and report what changed, and `plan-task`'s
  Execution section now states it instructs every dispatch to stage-but-not-commit,
  validates the staged changes, and commits only on pass. Consuming repos with
  their own implementer agents that copy this Commit Protocol should mirror the
  same standalone-vs-orchestrated conditional.

### Changed

- **`audit-conventions`: caution to re-preview `--fix` after cleaning a dirty
  tree (#70 follow-up).** The dry-run recomputes its plan from the current
  working tree while `--apply` requires a clean one, so a file changed between
  the two turns can silently alter which actions fire (a previewed cleanup
  becoming a no-op is the root-cause workflow hazard behind #70). The skill's
  safety rails now tell you to re-run the dry-run on the now-clean tree and
  confirm the plan still matches before applying. Skill-body guidance; no
  contract change.

- **`audit-conventions`: orphaned-sidecar follow-up now names a candidate
  `docs/` target and disposition (#72).** The migration's Manual-follow-up
  report flagged orphaned context sidecars with a generic "port to `docs/` or
  delete" that left the user to reverse-engineer which doc the knowledge
  belonged in. It now classifies each orphan: knowledge-bearing sidecars
  (`project-knowledge.md`) name a candidate doc (`docs/architecture.md`,
  `docs/domain.md`) and flag that the content may need splitting/reformatting;
  obsolete ones (`project-commands.md`, `project-docs-to-check.md`) say
  "delete — superseded by X". The judgment (reformat/split/discard) still
  rests with the reader. Report-only; no contract change.

### Fixed

- **`sync-config`: use the correct plugin name `genvid-dev` (#69).** The skill
  hardcoded `genvid` in its version-check `jq` filter and the
  `plugin update` command, but the published plugin is named `genvid-dev`, so
  the first documented step returned nothing / errored *"Plugin 'genvid' not
  found"*. Corrected the filter, the update command, and the body prose.

- **`audit-conventions`: migration cleans legacy array-shaped `settings.json`
  hooks (#70).** `planSettingsCleanup` only matched the newer object-shaped
  `hooks` block, so on a repo whose committed `settings.json` used the legacy
  array shape — the common case for repos being migrated — the
  `pre-commit-lint.js` hook entry was left behind pointing at the file the same
  migration had just deleted, breaking the `PreToolUse` hook on every later
  Bash call. The cleanup now handles both shapes, and `scanDanglingReferences`
  additionally warns if any leftover `settings.json` reference to the deleted
  hook slips through.

- **`audit-conventions`: migration removes stale `.gitmodules` / `.claudeignore`
  after submodule removal (#71).** `git rm` of the last submodule left an empty
  `.gitmodules` staged as modified, and a `.claudeignore` that existed only to
  ignore the submodule dir was left referencing a path that no longer exists.
  The migration now `git rm`s the now-empty `.gitmodules` (only when the removed
  submodule was the last entry) and strips submodule lines from `.claudeignore`,
  deleting that file if it empties.

## [3.0.0] - 2026-06-05

### Added

- **`docs/plugin-authoring.md`: cross-plugin authoring gotchas (#30).** A short
  note capturing two gotchas that cost real debugging time while authoring a
  sibling plugin (genvid-c3): ship MCP servers via `.claude-plugin/plugin.json`
  `mcpServers` rather than a root `.mcp.json` (which is read as project-scope and
  fires in the plugin's own dev repo), and invoke scoped packages by full package
  spec (`npx -y @genvid/<pkg>@<version> …`) because `npx` resolves by package
  name, not bin name. Linked from `docs/TOC.md`. Internal authoring guidance — no
  consumer-facing or behavioral change.
- **`docs/plugin-authoring.md`: numbered-step renumbering gotcha.** A note that
  inserting/removing a `## Process` step cascades every following number and
  invalidates cross-references to them — including refs *above* the insertion
  point and in sibling skills, which `claude plugin validate` can't catch. Ships
  a grep to reconcile them. Surfaced authoring the #41 `create-pr` change.
  Internal authoring guidance — no consumer-facing or behavioral change.
- **`triage-issues`: flat-label template variant (#34).** Repos using a simple
  category-label set (GitHub's defaults — `bug`, `enhancement`, `documentation`,
  `duplicate`, `question`, …) with no `type:`/`priority/`/`area:` scheme no longer
  have to hand-rewrite the structured convention template. A new bundled
  `issue-triage.flat.template.md` ships the flat shape (single category label, no
  priorities, `question` doubling as needs-info), and §0 step 1 now probes the
  repo's labels to default to the matching variant, confirms with the user, and
  scaffolds it. `--non-interactive` uses the detected default.
- **New `plan-next-issue` skill** — a small orchestrator that goes from a backlog
  to a plan: it auto-detects untriaged open issues and offers to run
  `triage-issues`, proposes a ranked shortlist of candidate issues for the user to
  pick one or more, then hands each choice to `plan-task` (one combined plan, or
  sequential per-issue runs). Pure orchestrator — no new agent or config; it reuses
  the existing `bugTracker` block (read-only, `required: false`) and the
  `issue-triage-analyst`. Interactive by default with the same
  `--non-interactive` / `--force` flag set as `triage-issues`.

### Changed

- **`create-pr`: link-and-close tracked issues (#41).** A new "Detect issues this
  PR closes" step scans the commit log and branch name for `#N` references and,
  after user confirmation, adds a `Closes #N` (or `Fixes #N`) line to the PR
  **body** under `## Summary` — one per fully-resolved issue, never auto-injected.
  Documents the gotcha that GitHub auto-closes only when a closing *keyword* is in
  the body (or a commit) *and* the PR merges into the default branch; a bare
  `(#N)` squash-title cross-reference links but does not close. Warns that a
  stacked PR's keyword won't fire until the stack reaches the default branch.
  GitHub flow only; the Bitbucket smart-commit equivalent is a follow-up.
- **`split-branch`: note the stacked-PR issue-closing caveat (#41).** Step 7
  ("Create PRs") now points out that `create-pr`'s `Closes #N` keyword won't fire
  on a stacked PR until the stack reaches the default branch, so the keyword
  belongs on the branch whose merge actually lands the fix.
- **Renamed `triage-bugs` → `triage-issues`** (and its agent `bug-triage-analyst`
  → `issue-triage-analyst`, conventions doc `docs/bug-triage.md` →
  `docs/issue-triage.md`, bundled template `bug-triage.template.md` →
  `issue-triage.template.md`). The skill was always tracker-agnostic and works for
  bugs, tickets, or any backlog item; the name now reflects that. The
  `.genvid-agent.json` `bugTracker` config block keeps its name to avoid a config
  break. **Consumer migration:** invoke `/genvid-dev:triage-issues` instead of
  `triage-bugs`, and rename your repo's `docs/bug-triage.md` to
  `docs/issue-triage.md` (the skill will otherwise offer to re-scaffold it).
- **`triage-issues`: light-touch groom path (#35).** §0 step 1 no longer dead-ends
  at scaffold-or-stop. When the user declines scaffolding `docs/issue-triage.md`, or
  a quick scan shows a tiny enhancement/chore backlog with no bugs, the skill now
  offers a **light-touch groom** (new §0a): propose label / priority / clarity /
  cross-reference fixes directly via the tracker's native CLI using only existing
  labels — no `docs/issue-triage.md` or `bugTracker` writes, no `triagedLabel`,
  bypassing §1–§5. Covers the common "just tidy these few issues" case without
  committing the repo to the full taxonomy.
- `plan-task`: the stale-gitignored-`plan.md` continuation guard (#36) now
  classifies *what kind* of stale before overwriting. An **already-shipped** plan
  (merged branch, tasks in `origin`'s log, no memory reference) is overwritten as
  before; an **unshipped / pending** plan (unmerged branch, tasks not yet in
  `origin`, or referenced by a project auto-memory) is **preserved first** (renamed
  to `plan-<topic>.md`) so a local-only artifact isn't silently destroyed.
- `release-plugin`: note that a self-referential release (one that changes this
  skill in a way a later release depends on) must be shipped and installed before
  the dependent release — the installed skill runs the release, not the working
  tree.

## [2.8.0] - 2026-06-04

### Changed

- `release-plugin`: subfolder-layout awareness. Reads `paths.plugin_root` from
  `.genvid-agent.json` (default `"."` → unchanged for every plugin-at-root repo)
  and resolves `.claude-plugin/plugin.json`, `CHANGELOG.md`,
  `claude plugin validate`, and the release-triangle `git show` paths relative to
  it. The marketplace step now supports the `git-subdir` source shape
  (`path` = `<plugin_root>`) alongside the whole-repo `url` shape, including the
  one-time `url`→`git-subdir` flip on a first subfolder publish. `paths.plugin_root`
  is documented in `CONVENTIONS.md` as a reserved key and declared
  `required: false` in the skill's `metadata.expects`.

### Added

- `triage-bugs`: new skill for interactive, tracker-agnostic bug-backlog triage.
  A main-thread orchestrator dispatches a read-only `bug-triage-analyst` agent to
  fetch the untriaged bugs (plus a wider comparison set for dedup) and propose
  duplicate clusters, overlaps, dependencies, split candidates, and per-bug
  field/label/priority/language fixes; the orchestrator then drives a two-phase
  approval and applies the writes, stamping a `triaged` label last for
  idempotent re-runs. Project specifics come from a new `bugTracker` block in
  `.genvid-agent.json` and a `docs/bug-triage.md` conventions doc (both
  skill-conditional / `required: false`; a template ships with the skill).

## [2.7.0] - 2026-06-04

### Changed

- `audit-conventions`: greenfield `--fix` no longer clobbers a pre-existing
  `CONVENTIONS.md` (and now reports `CLAUDE.md` / `docs/TOC.md` skips as visible
  `SKIPPED` notes in the dry-run). The `--fix` dry-run is allowed on a dirty
  working tree (only `--apply` refuses). Documented the grep/Windows-PATH
  shell-sensitivity caveat. (#25)
- `audit-conventions`: the greenfield scaffold now sources its placeholder files
  from a new `skeleton/` folder (`.genvid-agent.json`, `CLAUDE.md`,
  `docs/TOC.md`) instead of inline JS string literals — one reviewable,
  file-based source of truth, removing the drift hazard against `examples/`.
- `run-retro`: added an explicit fallback for when `docs/TOC.md` is absent
  (greenfield consumers, or the plugin repo itself) — discover docs by globbing
  `docs/**/*.md` and reading `CLAUDE.md` / `CONVENTIONS.md` instead of
  dead-ending, plus guidance for running the retro inside the plugin repo.

## [2.6.2] - 2026-06-03

### Added

- `code-reviewer` agent: a "Deletion completeness" checklist item — when the diff
  deletes a tracked file, grep docs (`*.md`) for the basename and classify each hit
  as a **live pointer** (markdown link or "see X"/"canonical example" prose → flag
  for fix, repoint at git history) versus **historical prose** (dated retro /
  changelog entry → leave as the record). Counters the under-flag where a broken
  markdown link gets rated "leave as educational record." (#23)

## [2.6.1] - 2026-06-03

### Changed

- `release-plugin` skill: added a Windows note to Phase 1 — under git-bash the
  `git show <ref>:<path>` state-assessment commands get path-mangled (`:`→`;`,
  `/`→`\`) and fail with "ambiguous argument"; prefix with `MSYS_NO_PATHCONV=1` or
  read the file after checkout.

## [2.6.0] - 2026-06-03

### Added

- `code-reviewer` agent: a "False-positive guardrails" subsection that runs before
  assigning critical severity — check whether the apparent bug is documented or
  deliberately supported behavior (grep `docs/`, `CLAUDE.md`, `CONVENTIONS.md`,
  nearby code/tests) and downgrade or drop it if so; reconcile any contradicting
  evidence (a passing run/test/cited output) before asserting a defect; and reserve
  🔴 Critical for findings traced to an actual failure (repro, failing test, or a
  concrete broken path), not "this looks wrong". (#18)

### Changed

- `plan-task` skill: added a "Dispatch resilience" note to the Pipeline — if a
  delegated agent returns empty, errors, or hits a session/token limit, resume it
  via `SendMessage` to reuse its context when that tool is available, otherwise
  complete the phase inline from the prior phase's artifact rather than retrying
  blindly or stalling. (#20)
- `plan-task` skill and `analyst` agent: added a runtime-observability gate for
  bug tickets — confirm the reported symptom is actually observable before design
  (reproduce it, or trace the read/render path end-to-end, not just the write path);
  if no reader observes the bad value, reclassify the task as tech-debt cleanup
  (`chore`/`refactor`) rather than a fix and say so explicitly. The analyst now
  distinguishes "defect present in code" from "symptom observable at runtime". (#19)

## [2.5.0] - 2026-06-03

### Changed

- `analyst` agent: added a "refresh refreshable artifacts before diffing" Key
  Principle — when the analysis premise depends on a checked-in snapshot or
  generated artifact that has a documented refresh/fetch/regenerate command, surface
  freshness as an explicit pre-analysis step instead of treating the committed copy
  as ground truth, and treat any mismatch set as provisional until the artifact is
  confirmed current. Advisory, with detection leaning on signals the analyst already
  gathers (`fetch-*`/`generate-*` scripts, `.prettierignore`/`.gitattributes`
  entries, fetched-verbatim doc notes). (#16)

## [2.4.0] - 2026-06-03

### Added

- `plan-task` skill: Shortcuts section now names a third compression case — a
  GitHub issue that's already a full proposal (rationale + proposed change +
  explicit open questions). Treat the issue as the requirements doc, resolve any
  open questions with a single `AskUserQuestion` call, and present a combined
  design + plan in one checkpoint. (#14)

## [2.3.0] - 2026-06-03

### Changed

- `release-plugin` and `release-npm-package` skills: Phase 1 now notes that the
  skill is usually invoked from the just-merged (and possibly squash-deleted)
  feature branch — check out an up-to-date default branch before classifying, so
  the release isn't prepared on the wrong ref.
- `planner` agent: added a "flag throwaway intermediate steps" heuristic — when a
  later task routes through a high-level upstream aggregate (`detect*`/`analyze*`/
  `build*`), read its implementation; if an earlier task installs parallel work
  into code the later task deletes wholesale, fold the deletions forward and
  de-risk with equivalence tests instead of a discarded intermediate refactor. (#6)
- `cleanup-initiative` skill: Step 0 now verifies a non-shipped phase status
  against git history before trusting it — `git log --grep` + a deliverable
  cross-check catch the "table says Planned/in-progress but the scope actually
  shipped" drift, which would otherwise skip cleanup of a done initiative. (#11)
- `cleanup-initiative` skill: Step 2 inbound-reference handling gained a third
  option — if a hit points at a live data/code artifact (not prose) the project
  still consumes, `git mv` it to a permanent home outside `initiatives/`, update
  references, and repoint any tool's default output before deleting, rather than
  redirect-or-strip which would remove a live dependency. (#12)
- `cleanup-initiative` skill: Step 4 gained a "convert to issue tracker"
  alternative to the successor-folder flow — when-to-use detection, granularity,
  preserving forward-looking specs by inlining + a pre-deletion `git show` SHA
  reference, filtering obsolete items, routing cross-repo items, and the
  full-URL link gotcha; with a Step 6 note that the delete intentionally removes
  design docs the new issues point at by SHA. (#10)

## [2.2.0] - 2026-06-03

### Added

- `release-npm-package` skill: routine release of an npm package on the OIDC `genvid-public-ci` `publish.yml` recipe — bump, tag, and trigger the publish workflow. (#5)
- `release-npm-package-evals/`: behavioral eval harness for the skill's Phase 1 state-classifier and OIDC-recipe gate (seven evals across six fixture classes). (#5)

### Changed

- `planner` agent: added a "mirror fidelity" principle — when a task clones an
  existing structure (eval harness, sibling skill, fixture set), enumerate the
  model's coverage and justify any omission in the plan, rather than silently
  shipping a reduced set that only surfaces at review.
- `analyst` agent: added a "sync before judging git/release state" principle —
  run `git fetch` and compare against `origin` before concluding a repo is in a
  broken/inconsistent state, since a merely-behind local checkout is a
  fast-forward, not a defect.
- `plan-task` skill: Phase 4 now handles a gitignored `plan.md` — if the repo
  keeps `plan.md` as a local-only artifact, skip the prep commit instead of
  force-adding it.
- `plan-task` skill: continuation shortcut now guards against a stale gitignored
  `plan.md` — a gitignored plan lingers after its branch merges, so confirm an
  existing plan maps to the current task (branch unmerged, tasks not already in
  the default branch) before resuming it; otherwise treat the work as a fresh
  plan and overwrite.
- `CLAUDE.md`: documented that this repo squash-merges PRs (merge commits
  disabled).

## [2.1.0] - 2026-06-02

### Added

- `release-plugin` skill: the producer-side analogue of `publish-npm-package`.
  Cuts a marketplace plugin release end to end across both repos — assesses and
  reconciles repo state (clean / local-stale-ff / genuine-inconsistency /
  first-release), bumps `plugin.json` + CHANGELOG, commits `release: vX.Y.Z`,
  pushes a plain annotated `vX.Y.Z` tag, bumps the marketplace `source.ref`, and
  hands off `/plugin update`. (#4)
- `release-plugin-evals/`: behavioral eval harness for the skill's Phase 1
  state-classifier (four fixture classes), including a regression test for
  misreading a stale local checkout as a broken release. (#4)

### Changed

- Corrected stale release-procedure claims in `CLAUDE.md`: release tags are
  plain `vX.Y.Z` (not `genvid-dev-v<semver>`) and the marketplace pins by
  `source.ref`, not a `sha` field. The "Releasing a new version" section now
  points at `/genvid-dev:release-plugin`. (#4)

## [2.0.2] - 2026-06-02

### Added

- `designer` agent: a knowledge/code **placement audit** gate. When a design
  extracts or relocates shared knowledge/code into a new home (plugin, package,
  MCP `docs://` resource, or the consuming repo), the designer now routes each
  asset by what it changes-together with, prefers a move over a copy, and uses
  redirect stubs over deletion when a relocated doc has many referrers. (#2)

### Fixed

- `leak-guard` workflow: excluded the workflow's own file from its scan. Its
  pattern definition listed the leak patterns literally, so it self-matched and
  failed on every branch (including `main`), blocking all PRs. (#3)

## [2.0.1] - 2026-06-02

### Fixed

- Trimmed the `publish-npm-package` skill description from 1609 to 1481 chars so
  it fits under the default `skillListingMaxDescChars` cap (1536) and is no longer
  silently truncated in the session skill listing. All positive and negative
  triggers preserved. (#1)

## [2.0.0] - 2026-05-31

### Changed

- **BREAKING:** Split the combined marketplace + plugin repo. The marketplace
  catalog now lives in `genvid-holdings/claude-code-marketplace`; this repo is
  the plugin only, renamed to `claude-code-plugin-genvid-dev`.
- **BREAKING:** Renamed the plugin namespace from `genvid` to `genvid-dev`.
  Skills are now invoked as `/genvid-dev:<name>` and agents dispatched as
  `genvid-dev:<name>`. Install handle is `genvid-dev@genvid-plugins`.
- Flattened the plugin tree to the repo root (was `plugins/genvid/`).

## [1.1.0] - 2026-05-31

## [1.0.0] - 2026-05-31
