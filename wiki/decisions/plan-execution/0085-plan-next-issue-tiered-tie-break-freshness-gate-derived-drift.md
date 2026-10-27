---
type: decision-record
title: '`plan-next-issue` breaks priority ties in tiers, gates old candidates on premise freshness, and derives drift instead of storing a stamp'
description: 'plan-next-issue ranks within a priority band by deadline then age, checks old candidates before handoff, and recomputes surface drift each run rather than storing a freshness marker.'
tags: [decisions, plan-execution]
status: stable
---
# 0085. `plan-next-issue` breaks priority ties in tiers, gates old candidates on premise freshness, and derives drift instead of storing a stamp

- **Status:** accepted
- **Date:** 2026-10-27
- **Issue:** #257 (#746, #754 folded in)

## Context

`plan-next-issue` §2 ranked candidates by priority and readiness, then stopped. On this repo's backlog that leaves a very large tie: a live hand-trace found a 210-way P2 tie, so the order inside the band was arbitrary. #257 asked for a rule that breaks it. #746 and #754 asked for related behaviour (contention-aware ranking; ranking old issues higher) and were folded in.

Two earlier positions conflicted. #257's 2026-08-15 comment said to rank stale issues *lower*; #754 said to rank old issues *higher*. Both are reacting to the same fact: an old issue's premise may have decayed, since the target changed after the issue was filed. ADR-0072 already established that triage verifies an issue's claims against the target artifact, and recorded the verification in-session as `read at <sha>`. It left the question of a cross-session marker (how a later run knows a claim was checked, and whether the target moved since) to #257. ADR-0031 recorded the handoff as "four slots", each a verified or inherited fact.

## Decision

**Tiers, not a rubric.** Within a priority band, ties break in order, each tier applying only when all above it are tied:

1. Readiness, as before.
2. **Deadline proximity.** A dated event inside a 14-day horizon ranks above an undated candidate, nearer first. A deadline never crosses a priority band. A past date is shown, not raised. A date match alone never raises: an issue-text date counts only where the sentence ties work to it.
3. **Age.** The older issue ranks first, by creation date, never by issue number.
4. **Fallback.** Interactively the tied candidates are presented as tied; under `--non-interactive` the lowest issue number wins, declared arbitrary.

The rationale line names the deciding signal, the first tier that separated a candidate from the next.

**Freshness is a gate before handoff, not a rank term.** This resolves the conflict above: age raises rank, and old candidates are checked. "Old" means the inferred surface has commits since filing, or the surface cannot be resolved. There is no calendar threshold, because staleness here is about merges, not elapsed days. The shortlisted candidates that meet the test get a premise-freshness check: the target is read and `read at <sha>` recorded (ADR-0072's in-session form). A false or stale premise moves the candidate to the end with a flag; a partly shipped one keeps its rank and names the residual. The gate makes one pass with no refill, and a replacement is shown as "freshness not checked". The reason is stated in the skill: a decayed premise makes planning wasted work.

**Cross-session marker: derived drift, not a stored stamp.** Each run recomputes "N commits to its surface since filed (date)" from git. There is no stored freshness stamp. This extends ADR-0072, which left the marker to #257. Stored homes considered and rejected:

- A body stamp: rejected under ADR-0072 and #286.
- A tracker comment: a tracker write, and the same surface as #723.
- A `verified-*` label: a stamp and a write.
- A gitignored local cache: a write, and per-machine, so a second machine or session cannot see it.
- Triage's cited body rewrite: it exists only for non-agreement findings, so an agreeing premise leaves no marker.

**Surface contention is an annotation, not a rank term.** The rationale names the inferred surface and up to three tied siblings ("file collision, not a dependency"). It never removes or reorders a candidate. It is separate from hard dependency, which the unblocker rule owns, and §3 cluster detection consumes it.

**The handoff carries five items.** The new one is any deadline, labelled verified (a milestone due date) or inherited (issue text). ADR-0031 records "four slots"; that record stays as history and this one notes the change. The skill's wording is now count-free, so a future item does not falsify it.

**`--non-interactive` auto-picks the full-rule winner**, the first candidate after the gate, and the closing summary names the deciding signal. Only verified (milestone) deadlines raise rank there; an inherited date does not, since nobody is present to confirm it.

The fetch gains the creation date and the milestone due date; full bodies stay off the thread. This keeps ADR-0028's single fetch. The analyst's per-issue enrichment gains an `age:`/`deadline:` slot for the report path.

## Compromise

```
Option A (recommended): tiered tie-break, freshness as pre-handoff gate, contention as annotation
Option B (rejected): contention tier ahead of age
splits P2 159 v 58, starves 58 isolated old issues; value was in seeing grouping (kept by A's annotation)
Option C (rejected): weighted rubric
arbitrary weights, can cross priority band (#746 AC3), no single deciding signal (R2), #257 asks no computed score
```

A is chosen. B's grouping signal survives as the annotation. C is the only option that cannot name why one candidate beat another.

**What this costs.** The gate reads a target file for each qualifying shortlisted candidate, bounded by the shortlist size. The 14-day horizon and the drift-based meaning of "old" are judgment calls, not measured thresholds. Dropping the stored marker means the check repeats every run.

## Consequences

- The milestone path is unexercised in this repo, which has 0 milestones. Verified deadlines have not been seen working against real data; inherited (issue-text) dates are the only live case here.
- `actionQuery` must request `milestone` for verified deadlines. The `triage-issues` example query and this repo's own config now do; a consumer whose query omits it gets only inherited dates, and the skill says so.
- A live hand-trace over the open backlog on 2026-10-27 found the age tier resolved the top 4 of a 210-way P2 tie, two of them only 8 seconds apart. The `plan-task` surface annotation reads "+66 more", which is low signal. All four drifted candidates' premises held.
- Ranking neighbours stay separate: #630 (candidates triage has not covered, downstream blockers), #636 and #607 ("unblocked"), #543 (multi-hop dependency), and #319 (backlog staleness).
- ADR-0031's "four slots" is now historical; the handoff has five items.
