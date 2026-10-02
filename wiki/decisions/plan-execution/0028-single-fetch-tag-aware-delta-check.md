# 0028. `plan-next-issue`'s unreleased-delta check reuses §1's fetch by making it tag-aware, not by adding a second fetch

- **Status:** accepted
- **Date:** 2026-08-07
- **Issue:** #251

## Context

#251 asked `plan-next-issue` to surface an unreleased delta (finished work
sitting untagged) beside its candidate shortlist, so the user can choose to
release before planning more work. The issue specified the check should
*reuse §1's existing fetch* and add no second network round-trip.

§1's fetch was written as an explicit refspec — *"`git fetch` the default
branch"*. An explicit refspec suppresses git's tag auto-following, so that
form never refreshes the local tag list. Verified by a direct probe against
this repo (a throwaway clone, default `remote.origin.tagOpt`, discarded
after — a `build-probe`-style probe, not kept):

| Command | Downloaded the tagged commit? | Tags fetched |
|---|---|---|
| `git fetch origin main` (explicit refspec) | yes — 5 commits, `ba28150..4b105b6` | **0** |
| `git fetch origin` (no refspec) | — | **all 29** |

The first row is decisive: it downloaded `4b105b6`, the exact commit
`v4.6.0` points at, and still fetched zero tags. A first probe attempt used
`git clone --no-tags`, which persists `remote.origin.tagOpt=--no-tags` and
confounds the result; it was re-run on a normal clone with `tagOpt` empty.
That correction is recorded here because it's the reason the table above is
trustworthy, not an incidental detail.

A stale local tag list makes the newest known tag look *older* than reality,
so `origin/<default-branch>` appears ahead of it and the skill would report
commits that have already shipped. The failure direction is a false positive
on an advisory line — worse than silence, because it asks the user to
consider a release that isn't needed, and the line stops being believed.

## Decision

Make §1's fetch tag-aware by dropping the explicit refspec (`git fetch
origin` instead of `git fetch origin <default-branch>`), and compute the
unreleased-delta check in §2 against the now-current tag list. One network
round-trip total, satisfying #251's constraint by construction rather than
by working around a stale fetch.

This fits the architecture as follows: §1 already exists to establish
freshness before the skill reasons about candidates; tag freshness is the
same kind of fact §1 already owns (branch freshness), not a new concern
belonging to §2. §2 stays a pure consumer of state §1 already refreshed —
consistent with the rest of the skill's fetch-once-then-reason shape.

**Consequence not fixed by this decision.** On §1's existing no-SSH `gh api`
fallback path (from #97), no `git fetch` runs at all, so tags cannot be
refreshed by any flag on that path. The delta check skips silently there
rather than report a possibly-stale number — consistent with the check being
advisory, and requiring no new fallback logic of its own.

**Scope boundary.** The skill surfaces the *fact* of a delta; it does not
judge whether a release is warranted (CHANGELOG shape, whether a feature
chain is mid-flight, cadence) — that judgment stays `release-plugin`'s.

Implemented in `plugin/skills/plan-next-issue/SKILL.md`: `9a0b5af` (§1's
whole-remote fetch, with the rationale stated inline so the command isn't
later "tidied" back to an explicit refspec, plus the no-fetch-fallback
carve-out) and `a18e27e` (§2's conditional advisory block).

## Compromise

| Option | Network round-trips | Verdict |
|---|---|---|
| **(a) Make §1's fetch tag-aware — drop the explicit refspec** | **1** | **Chosen** |
| (b) Add a separate `git fetch --tags` in §2 | 2 | Rejected — violates #251's own no-second-round-trip criterion |
| (c) Accept local tags as-is | 1 | Rejected — literally satisfies the round-trip criterion while emitting the false positives described above |
| (d) Read tags over the host API (`gh api repos/:owner/:repo/tags`) | 2 (1 network) | Rejected as primary — host-specific, cutting against the skill's release-mechanism-agnostic stance |

**What this costs.** A bare `git fetch origin` updates all remote-tracking
refs, not just the default branch — marginally slower on a large repo, and
it moves refs a caller might not have expected from a "fetch the default
branch" comment. Accepted because this skill only *reads* refs afterward and
§1's stated purpose is freshness, not a scoped update.

(d) is not rejected outright — it remains the natural shape for a fallback,
matching §1's existing no-SSH `gh api` fallback from #97, should a future
change need tag data on a path where `git fetch` itself is unavailable.

## Consequences

- §1's fetch command is now load-bearing for tag freshness as well as branch
  freshness; a future edit that "simplifies" it back to an explicit refspec
  would silently reintroduce the false-positive failure mode this record
  exists to prevent. The inline rationale in `9a0b5af` is the guard against
  that.
- The delta check has no signal on the no-SSH `gh api` fallback path and
  degrades to silence there, by design — this is an accepted gap, not an
  oversight, and should not be "fixed" by adding a second fetch on that path
  without revisiting the round-trip constraint that motivated (a) over (b).
- If a future check needs tag data on a path where `git fetch` is
  unavailable, option (d)'s host-API read is the precedent to reach for
  rather than inventing a new mechanism.
