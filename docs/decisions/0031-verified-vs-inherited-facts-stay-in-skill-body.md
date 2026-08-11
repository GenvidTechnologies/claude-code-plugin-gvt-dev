# 0031. Verified-vs-inherited dispatch-brief labeling lands in `plan-task`'s skill body, not a new principle

- **Status:** accepted
- **Date:** 2026-08-10
- **Issue:** #196, #279

## Context

Neither issue's underlying gap has an automated check: a dispatch brief can
assert a derived fact (#196) or launder an inherited claim as verified (#279)
and every gate — lint, typecheck, tests, `code-reviewer` — stays green,
because none of them read prose. #196 proposed labeling each fact a dispatch
brief carries with its verification status rather than asserting fewer
facts; #279 observed the same failure one level up, in the handoff from
`plan-next-issue` into `plan-task`'s full-proposal shortcut, and asked that
the two-bucket format be defined once and shared between the two issues
rather than minted twice.

Putting the labeling rule into `plan-task/SKILL.md` raised the textbook
surface question this repo now asks routinely: shared `development-
principles.md` principle, or the skill body? `grep -c CLAUDE_PLUGIN_ROOT
plugin/agents/*.md` answers it on the same evidence `plan-task` cites for
itself: `analyst`, `designer`, `planner`, `ts-implementer`, `wiki-librarian`,
`validator`, and `issue-triage-analyst` — seven of the nine agents — never
load the shared doc at all, so a principle placed only there is unreachable
text for the agents that would most need it at dispatch time.

## Decision

**The canonical definition lives in `plan-task/SKILL.md`, in a new
`### Verified vs. inherited facts in a dispatch brief` section, not in
`plugin/docs/development-principles.md`.** The section states the narrow
test for "verified" (this run read the artifact), the label-don't-omit
reasoning, the correction-pass trap, and that tracker/PR state decays faster
than code facts, and it declares its own scope explicitly: it governs every
dispatch this skill makes, the same all-phases reach `### Dispatch
resilience` immediately above it already claims. This landed in commit
`7caedae`.

**Two sites cite that section by name rather than restating it.** The first
is `plan-task`'s own "issue is already a full proposal" shortcut — the point
where a dispatch brief is actually assembled from a triaged issue's claims,
so it is a point of consumption, not a second definition.

The second is **`plan-next-issue/SKILL.md` §3's "What the handoff carries"
paragraph.** That paragraph is a brief specification in its own right: it
enumerates what the `gvt-dev:plan-task` invocation states explicitly — every
selected issue number, the routing verdict, per-issue shortcut-eligibility,
and any already-shipped/residual finding from §2. Those four slots are
exactly where a verified fact and an inherited one currently arrive
indistinguishable, which is #279's whole premise. So `plan-next-issue` does
construct a brief, and it gets a citation of its own rather than inheriting
the discipline transitively through the delegation it names. The citation
points at this record's canonical section; it does not restate the buckets,
which keeps the definition singular.

**Beyond the two `plan-task` sites, the plan gives each of the five
brief-receiving agents — `analyst`, `designer`, `planner`, `ts-implementer`,
and `tech-writer` — a tailored inline copy of the receiving-side rule, in
that agent's own voice.** `tech-writer.md` is included even though it is one
of the two agents that *can* reach the shared doc (`grep -c
CLAUDE_PLUGIN_ROOT` returns 2, not 0), so it could in principle cite rather
than duplicate. It gets the inline copy anyway, on the same weakest-consumer
logic #243 already established for this family: the other four agents in
the group return 0 and force duplication regardless, and a uniform
receiving-side shape across all five is worth more than sparing the one
agent that happens to be able to reach a citation.

This fits the existing architecture without a new phase, gate, or config
surface: both `plan-task` additions extend sections the orchestrator already
reads on every dispatch, and the agent-side copies extend files the
implementer pipeline already reads standalone.

## Compromise

Alternatives considered and rejected:

1. **A new `development-principles.md` principle, cited from every
   consumer.** Rejected on the reachability evidence above: minting a
   principle would be reachable from the two *skills* but not from seven of
   nine agents, so the agent bodies would need inline copies regardless — a
   principle adds a citation surface without removing any duplication it
   would need to justify. The doc is append-only and its next open slot
   already has two pending claimants (a candidate parked in #196's own
   discussion, deferred specifically to avoid two issues racing for it, and
   one #243 already rejected on separate grounds); taking that slot here
   would foreclose both for no offsetting gain, so `development-
   principles.md` is left untouched by this decision.
2. **Restating the two buckets inside `plan-next-issue/SKILL.md` §3**, so
   that skill reads standalone. Rejected: it would mint the second divergent
   definition #279's own acceptance criteria exist to prevent, and unlike an
   agent body, `plan-next-issue/SKILL.md` *can* resolve
   `${CLAUDE_PLUGIN_ROOT}` and reach a citation — the weakest-consumer logic
   that forces inline copies into agent bodies simply does not apply to a
   skill. §3 therefore cites and does not restate. (Considered and rejected
   in the opposite direction as well: letting §3 inherit the discipline
   transitively through the delegation it already names, with no citation at
   all. That was rejected because §3's "What the handoff carries" paragraph
   is itself a brief specification — it enumerates the four things the
   invocation states — so it is a site that applies the rule directly, not
   merely one that hands off to a site that does.)
3. **One shared definition with no agent-side copies at all** (cite from
   every agent instead of restating). Rejected for the same reason #167,
   #210, and #218 rejected it before: `plugin/agents/tech-writer.md`'s own
   "link, don't duplicate" guidance is real and correct for content written
   for a reader who can follow a link, but an agent body is a prompt an
   agent must act on inside a possibly-standalone dispatch — a link it
   cannot load is not guidance, it is silence. This decision knowingly
   overrides that guidance for agent bodies specifically, the same override
   #240 already names as this repo's accumulated (but not yet durably
   recorded) pattern.

Cite-and-repeat is this repo's established answer to this exact shape of
question — reached independently before this record at least five times
(#167, #210, #218, #243, and ADR-0030) — so this decision is another
instance of a standing pattern, not a fresh design choice. The accepted cost
is duplication across seven sites: the canonical definition, the
self-citation inside `plan-task`'s own shortcut, and five tailored inline
copies. That is the same cost class #167 and ADR-0030 already recorded for
their own instances, carried here rather than paid down.

This record is narrower than what #240 asks for: #240 wants the *general*
rule — that cite-and-repeat is the plugin's de facto default for agent-body
guidance, with the reachability test and the tailored-copy boundary stated
once, independent of any single application — recorded durably. This ADR
decides and documents *this* application (the dispatch-brief labeling rule)
on the same reasoning; it does not state the general rule and does not
close #240.

## Consequences

A future editor of the verified/inherited rule has two `plan-task` sites and
five agent files to update, not one — the duplication cost named above is
now a maintenance fact, not just a risk. `plugin/docs/development-
principles.md` stays at thirteen principles, and its next open slot remains
unclaimed by this decision, available to whichever of its two pending
claimants is planned next. #240 remains open, and its acceptance criteria
are not discharged by this record; a future `create-adr`/`plan-task` pass
addressing #240 should treat this ADR (alongside #167, #210, #218, #243) as
one of the instances its general rule is generalizing over, not as the
record that already states it.
