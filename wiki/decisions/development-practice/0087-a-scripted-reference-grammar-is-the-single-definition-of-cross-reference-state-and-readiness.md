---
type: decision-record
title: 'A scripted reference grammar is the single definition of cross-reference state and readiness, shared by triage, ranking and planning'
description: 'A pure script under triage-issues owns the grammar, state resolution and readiness; the analyst gains a [refs] comparand, and three optional bulk keys stay out of actionQuery.'
tags: [decisions, development-practice]
status: stable
---
# 0087. A scripted reference grammar is the single definition of cross-reference state and readiness, shared by triage, ranking and planning

- **Status:** accepted
- **Date:** 2026-10-30
- **Issue:** #209 (#230, #607, #636, #775, #783 folded in)

## Context

ADR-0072 gave the analyst a verification step that checks an issue's claims against the artifact they name, with the `[artifact]` and `[comments]` comparands. It did not check what an issue says about other issues. Six issues share that gap:

- #209: a stated blocker or child can be stale, and nothing compared it with the referenced issue's live state.
- #230: an umbrella whose sub-issues are all closed is never offered a close.
- #636: the body scan for dependency lines had three owners (the analyst, `plan-next-issue` §1 and §2) and no shared definition.
- #775: `plan-next-issue` ranked a blocked candidate as ready because comments and native structure were never read.
- #783: a deferral trigger such as "pick this up when we have measured X" was ranked like any other issue.
- #607: a closed cross-repo blocker was read as cleared even when the fix was not yet released. That rule is recorded separately in ADR-0088.

ADR-0072 itself warned that prose copies of a rule drift ("Watch for"). Three surfaces, the analyst, `plan-next-issue` and `plan-task`, would each have needed their own copy of a grammar with eight measured hazards (fences, blockquotes, struck text, inline code, negation, line-initial labels, retraction, banners).

## Decision

### D1: where the grammar lives

**Chosen, D1 Option A:** "Option A: Scripted grammar under triage-issues, bulk native/comment reads, manifest-inferred release source".

A tested, pure node script is the single definition of the reference grammar, of reference-state resolution and of readiness. The files are `plugin/skills/triage-issues/scripts/issue-refs.mjs` with `lib/refs-grammar.mjs` (extraction) and `lib/refs-resolve.mjs` (state, readiness, lookup plan). It sits under `triage-issues` because the grammar implements that contract's `## Dependencies` section. Its node:test suite runs in `commands.test` and `commands.validate`.

**Purity.** The script imports only node:fs, node:path and node:util plus relative modules. It makes no network call and spawns no process. Every tracker or registry read is a command it prints; the caller runs it after a command check and saves the output. This keeps each read declared in the calling body, keeps the read-only boundary structural, and keeps every rule testable offline.

**Callers.** The analyst (step 8, the `[refs]` comparand), `triage-issues`, `plan-next-issue` (§2 ranking) and `plan-task` (Phase 0, through `extract --single`). Each body still states its own operative obligation inline (when to run the script, how to act on each outcome); only the mechanics are shared. This differs from the cite-and-repeat precedent, which exists because an agent may not load a shared document. A script is executed by path, so the agent needs it on disk, not in context.

**Rejected, D1 Option B:** "Option B: Prose-only grammar, per-surface copies, per-candidate reads (as #775 prescribes)", because three grammar copies drift, R6/R7 become untestable and per-candidate reads reintroduce the refill problem.

**Rejected, D1 Option C:** "Option C: Shared reference doc plus prose, widened actionQuery fields", because a dispatched agent may not load the doc and widening `actionQuery` couples failure.

### The `[refs]` comparand and its outcomes

`[refs]` is a third comparand under `### Verification findings`, beside `[artifact]` and `[comments]` from ADR-0072. It compares each stated reference with the other issue's live state. A live reference (an open blocker, an open and unticked child) is not a finding; it goes in the enrichment `deps:` slot, as an agreeing `[artifact]` check produces no entry.

Outcomes: `cleared`, `closed-unreleased`, `closed-release-unverified`, `ticked-open`, `unticked-closed`, `done-but-unclosed`, `banner-no-open-child`, `retracted` and `unresolvable` (with a kind such as `prose`, `repo-ambiguous`, `cross-repo-unread`, `absent`, `pr`, `nonexistent`, `heading-detached` or `truncated`). The two closed-but-unreleased outcomes are the subject of ADR-0088.

`triage-issues` acts on them with per-issue approval: annotate a cleared body line, annotate a checklist row (never tick or untick it), comment only for the release outcomes, offer to rewrite an unresolvable reference into `owner/repo#N` form, and offer a close for `done-but-unclosed`. Under `--non-interactive` a note is posted as a comment and a close is deferred.

### Grammar facts that shipped

- Only a line that begins with a blocker verb is a statement; a mid-line mention is narrative. Fenced, blockquoted, struck-through and inline-code occurrences are excluded.
- GitHub issue URLs count as references. Each reference carries a direction (`blocked-by`, `depends-on`, `blocks`, `relates-to`), and only the first two block.
- A fifth relation, `qualifier`, never blocks. On a `Blocked by` or `Depends on` line, a reference inside a parenthetical, or right after "sub-issue of", "part of", "child of", "see", "cf.", "per", "as in", "from" or "under", is a qualifier, as in "Blocked by the bundle-root decision (the ADR sub-issue of #183)". A blocker line left with no other reference is `unresolvable` kind `prose`. This was a review decision.
- Self-references are dropped. The `name #N` form applies only at the start of a reference item; before that fix, 25 of 25 such matches on the real backlog were false positives.
- A later comment naming the same target and withdrawing it makes the reference `retracted`.

### Three optional keys, kept out of `actionQuery`

`commentsQuery`, `structureQuery` and `refStateQuery` are new `bugTracker` keys, each skill-conditional (`required: false`). `commentsQuery` and `structureQuery` are bulk reads run once and saved; `refStateQuery` is the per-reference lookup template. They stay out of `actionQuery` so that a failed fetch is isolated: the run continues and reports "comments: no data" or "native structure: no data", never "no children". Widening `actionQuery` would have let an older `gh`, or a tracker without these fields, fail §1's only fetch and end the run. A bulk list cut at its `-L` is reported as truncated, never read as empty.

### The open-only precision rule

Absence from an untruncated open list means "not open", never "closed". That is enough to rank an issue unblocked. A lookup is spent only to name the state precisely (closed, PR, nonexistent), and a truncated list or a cross-repo reference needs the lookup before any conclusion. `ticked-open` is provable from the list; `unticked-closed` is not.

### Readiness

State comes from the tracker; membership comes from the union. A child's state is always read from tracker data and never from a tick. An issue is an umbrella if any source says so (open native sub-issues, a self-declared banner, an `epic:`/`tracking:` title prefix, or checklist child rows), and its routable children are the union of native open children and checklist rows whose child is open. Disagreements are shown in the rationale, never resolved silently.

Precedence: umbrella, then deferred, then blocked, then ready-caveat, then ready. `done-but-unclosed` and `banner-no-open-child` sit beside these states. A self-declared banner wins over a native all-closed summary, so no close is proposed for an issue whose author says it stays open on purpose.

### Lookups refill; the freshness check does not

Comment and structure data are bulk, so readiness is computed for every candidate before the cut. Lookups follow the ranked order, so a candidate that a lookup demotes is replaced by the next, which is looked up too, until the cap. The premise-freshness check from ADR-0085 keeps its single pass. The two differ on purpose: lookups are a cheap, bounded rank input, while the freshness check is a per-candidate premise read.

Caps: 50 lookups per analyst run, 40 per `plan-next-issue` run, 5 registry packages per run. The design estimated 20 for `plan-next-issue` from "at most 2 lookup-needing references per issue". Measured on the open backlog the maximum was 9 (the heavy ones are umbrella checklists), so the cap was raised to 40. Overflow is reported, never silent.

### Amendment to the single-fetch stance (ADR-0085, ADR-0028)

ADR-0085 states that one saved `actionQuery` feeds every §2 path and that this "keeps ADR-0028's single fetch". That stance is amended, not repealed. The saved `actionQuery` file stays the single source for the open backlog, and the git fetch is untouched. Beyond it, `plan-next-issue` and the analyst now run two further bulk reads and capped per-reference lookups. The earlier acceptance criterion "no extra tracker fetch" (#209, AC-209-4) is superseded: it could not hold alongside comment and native-structure reads. The replacement rule is that every read beyond the saved file must be declared in the calling body, bounded by a cap, deduplicated per distinct reference, and isolated so its failure degrades to "no data". ADR-0028 and ADR-0085 are not edited; this record carries the amendment.

### Other premise changes

- ADR-0072's constraint that the analyst's step numbering stay line-invariant has expired. The new check is a step 8 after step 7, which stays byte-intact.
- The analyst's reference check covers every open issue, action set and already-triaged alike (SD2). The cost is extra reads, bounded by the lookup cap.
- A deferral trigger line ("Pick this up when", "Revisit when", "Deferred until" and similar) makes an issue `deferred`, shown and not offered unless it is the only candidate. When the trigger names a count, measure, probe or threshold, the offer is to measure first through `build-probe`, run only on acceptance and never under `--non-interactive` (SD6). A trigger counts as fired when its reference is not open on an untruncated list, or cleared by lookup.
- A banner is a self-declaring line (SD9). A blockquote may carry it, because real banners are blockquotes. A child that names its parent as the analysis of record is not a banner. `done-but-unclosed` is reported when every native sub-issue is closed and no checklist row or banner names an open child.
- The tracker contract's mutation recipes gain a Close recipe, "Close as completed or not planned (only with approval)", with a `{closeReason}` placeholder (SD10). Nothing closes automatically. `plan-next-issue` writes nothing to the tracker; its close proposals are carried into `triage-issues`, which applies them with approval.

### Custom scanner, not a parser library

**Chosen, D4: custom line scanner.** **Rejected: `marked`**, and with it the `mdast-util-from-markdown` family.

A library would remove roughly 40 to 60 lines of fence, blockquote and heading-section tracking, and the whole of the grammar (labels, references, negation, retraction, banner, triggers, child rows) would still be custom on top. Against that, the library adds a runtime dependency to `plugin/package.json`, which ships to every consumer's install, beside `shell-quote` and audit-core under the ADR-0060 leaf posture. Every hazard measured is line-level. The library's footgun is mapping tokens back to source lines, and the analyst's report quotes the line.

## Compromise

- Options B and C were rejected for the reasons given with each.
- A scripted grammar is code to maintain, with a suite to keep wired into `commands.test` and `commands.validate`. That is accepted because the rules could not otherwise be tested.
- Three optional keys are config a consumer may add. They are skill-conditional, and on a github-kind tracker the caller uses the example command and prints the suggested key addition. Any other tracker kind gets "no data".
- The grammar is line-level. It does not parse nested structure, and a statement that does not begin a line is narrative and missed. That miss is named, not hidden.
- "No residual parent work" for a banner with no open child remains triage's judgement.

## Consequences

- One definition serves four callers. A grammar change is a change to the script and its suite, and the bodies do not copy the rules.
- The analyst's reference check scales with the open backlog, so its cost is capped (50) and a cut is reported.
- A consumer whose contract predates the Close recipe falls back to the existing duplicate recipe, since headings are unchanged and the required-headings check is unaffected.
- The script is verified by a mutation run: 47 rule mutations were applied, and all were killed once nine strengthening tests were added. A live run on the open backlog reproduced #374 against #453 as `unticked-closed` and #146 as blocked by #440.
- Cross-repo release semantics are decided in ADR-0088.

**Related records:** ADR-0072 (the verification step this extends; its line-invariant placement constraint has expired); ADR-0085 (tiered tie-break and the freshness gate that keeps its single pass; its single-saved-query statement is amended here); ADR-0028 (the single fetch, amended on the tracker side); ADR-0060 (the leaf-dependency posture behind the custom-scanner choice); ADR-0088 (closed versus released for cross-repo blockers).
