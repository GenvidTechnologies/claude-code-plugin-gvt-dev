---
type: decision-record
title: 'Triage verifies issue claims against the target artifact in a new analyst step 6'
description: 'issue-triage-analyst gains a read-only verification step with a six-outcome taxonomy; triage-issues offers cited rewrites, downgraded to comments when unattended.'
tags: [decisions, development-practice]
status: stable
---
# 0072. Triage verifies issue claims against the target artifact in a new analyst step 6

- **Status:** accepted
- **Date:** 2026-10-12
- **Issue:** #193 (#430 folded in)

## Context

ADR-0021 added principle #13 (a proposal is a claim about the artifact it
modifies, verified before adoption) and wired it into `plan-task`. It
explicitly scoped `triage-issues` / `issue-triage-analyst` out as "a plausible
follow-up, not this change". #193 is that follow-up. Triage is where issues
are first read against their targets, yet it only checked mechanism-prescription
and comparison-set overlap; it never read the target a body makes claims about.
The motivating case is unchanged: `gvt-construct3#59` proposed a map where the
target doc said array, and the proposal was right (`artifact-wrong`). #430
(evidence-authority: a file in the repo proves what is on disk, not what
production uses) is the same obligation seen from the evidence side, so the two
were combined with #193 as canonical.

#193's original checklist had three outcomes (stale, premise false, absent).
Principle #13 says both conflict directions are live, which three
proposal-side outcomes cannot express.

## Decision

**Placement (Option A).** Verification is a new step 6 in
`issue-triage-analyst`, after the existing step 5. The analyst stays
read-only and reports; `triage-issues` §3 consumes the report and owns every
write. It is bounded: only action-set issues that name a concrete target and
assert something about its current content, only the claims concerned, never
"read every file"; everything else reports `verify: n/a`.

**Six outcomes plus a flag.** `agreement`, `partly-shipped`, `proposal-stale`,
`premise-false`, `target-absent`, `artifact-wrong`; `stricter-shipped` flags a
stale or partly-shipped finding whose target text is tighter than the
proposal, so verbatim adoption would regress. This amends #193's three
outcomes in the open, per principle #13's both-directions rule. For
`artifact-wrong` the step names what settled it, or reports the conflict
unresolved rather than picking a side. #430's caveat lives inside the step:
prefer the authoritative source, trace runtime claims to the consuming code,
name any proxy as a proxy.

**Unattended safety.** Interactively, a finding yields a cited, per-issue-approved
body rewrite (folded into the mechanism rewrite when both apply). Under
`--non-interactive`, the rewrite is downgraded to a comment; the body is
rewritten only under `--force` (new §4 row). Rationale: #13's "never silently
pick a side" — an unattended body edit is a silent pick.

**Consumers.** `plan-next-issue` §2 reuses the report's Verification findings
rather than re-reading targets; a `premise-false` or `partly-shipped` finding
*is* its already-shipped check, already done.

**Durable marker lives in the report only** (`read at <sha>` per finding).
There is no standalone "verified" stamp in issue bodies: #260 Half B, and
#286's point that a stamp is a claim about a commit that has since moved.

**Cite-and-repeat split (AC5).** The operative obligation (trigger,
procedure, outcomes) is stated inline in the analyst body, because a
dispatched agent may not load `development-principles.md`; principle #13 is
cited for the rationale, and the motivating case is not reproduced in the
skill or agent files. Precedent: `plan-task/SKILL.md` (#167) and ADR-0021.

**Line-invariant placement.** Nothing is inserted above the baselined analyst
pointer line (step 5's **Per-issue enrichment** bullet, which carries the
mechanism-prescription flag), and the `triage-issues` span anchored on "dropping the prescribed
mechanism" stays byte-identical with no net shift above it. ADR-0039's
citations and `.pointer-baseline.json` are untouched. The new §3 bullet lands
after that span, and the optional §3-intro edit is net-zero lines.

**Contract recipes.** The Comment and Create split issue recipes were
replaced in place with `--body-file {tmpfile}` in both templates and this
repo's contract, and `{text}` / `{body}` dropped from the placeholder lists.
They were replaced, not added as siblings: a sibling would leave the
hazardous inline form as the default on the needs-info path (a backtick in an
inline `--body` command-substitutes and the call still succeeds). Recipe
names and headings are unchanged, so this is not breaking; older consumer
contracts keep their old lines, and the §3 bullet tells the skill never to
send a backticked note through the inline form.

## Compromise

**Rejected: restructure step 5 (Option B).** Folding verification into the
existing mechanism step shifts a baselined pointer line cited by ADR-0039;
demonstrated to trip two `pointer-baseline-drifted` errors and break the audit.

**Rejected: verify in §3 on the main thread (Option C).** Contradicts §1's
split — the main thread does not fetch issue bodies itself, the analyst
does — and verifying claims there would mean reading those bodies and their
targets on the main thread, spending main-context on exploration.

**Rejected: a standalone "verified @ sha" stamp in the issue body.** Cheap
for later readers, but a stamp asserts a commit that has moved on, and it
reads as a guarantee it cannot give.

**Rejected: rewrite bodies unattended by default.** Convenient for batch runs;
rejected per #13.

**Accepted residual:** `--title "{title}"` stays inline in the Create split
recipe, since `gh` has no title-file flag. A title with a backtick remains
exposed. Also accepted: existing consumer contracts keep the inline Comment
recipe until they migrate (optional, noted in the CHANGELOG), so the §3 guard
sentence carries that gap in prose.

## Consequences

Triage now costs targeted reads for action-set issues that assert something
about a named target, bounded per claim. In exchange the 2026-07-29 class of
miss (three of eight issues written against a stale or wrong reading) is
caught at triage rather than by luck at planning.

Landing slots for dependents, each attaching without restructuring:

- #260: ordering and scope rules attach to step 6 and its verification note.
- #286: a citation sub-check extends step 6.
- #426: a pre-rewrite gate on the §3 bullet.
- #257: its "premise freshness" discriminator waits on #193 for a contracted
  signal; the outcome and `read at <sha>` each finding records are that
  signal's in-session form (the cross-session marker stays #257's to design).
- #203 (body vs. its own comments) and #209 (cross-references vs. the other
  issue's live state): new comparands, each a new tag under
  `### Verification findings` beside step 6's `[artifact]`.
- #372 (the analyst verifies what *it* emits, corrections included): a separate
  obligation on the analyst's own output, not a comparand; it touches the same
  file but not this section's shape.

Watch for: the analyst's inline obligation drifting from principle #13's
wording, since the two are deliberately duplicated.
