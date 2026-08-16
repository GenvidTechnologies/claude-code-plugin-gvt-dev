# 0036. Three general rules, three distinct owners, in one criterion cluster

- **Status:** accepted
- **Date:** 2026-08-16
- **Issue:** #187 (canonical), with #226, #305, #311, #316, #321 as spanned siblings

## Context

`designer.md` item 8's Test Criteria cluster had, across a prior chain (ADR-0033,
ADR-0034), grown into a set of chained bolded leads answering "can it fail /
can it pass / can it be evaluated, and when." Six new issues asked for three
more general rules to be added to that cluster, each independently proposing
where its rule should live: a counterfactual claim's unreachability by reading
the tree (#226), a rule that a claim about a named subject must be verified by
reading it rather than inferred from a nearby signal (#187, #321), and a rule
that a row settleable only by execution — not by reading — must be executed
once and reverted (#316, #311). #316's own acceptance criteria state "do not
ship two parallel rules," and #321's restate the same constraint at the
grader-facing site: "exactly one issue states the general rule and the others
cite it — no two parallel rules ship in `designer.md`'s criterion cluster."
Three separate ownership questions therefore had to be resolved, not one, and
resolving them changed the cluster's shape twice more: #305's cross-row axis
fired the regrouping tripwire ADR-0034 had explicitly left unfired, and the
named-subject rule's true owner turned out to be an emitting-time step that
didn't exist yet, not any of the three candidate bullets first proposed for it.

The decisions landed in six commits on this branch: `c27fb5c` (designer,
regroup item 8 into five named question-groups), `4183fdb` (designer,
counterfactual figure/row rules, empty-collection remedy, set-level read,
named-subject verification step), `ea1860a` (analyst, mirror the named-subject
principle), `dbb60b0` (planner, widen the premise cross-check, add mutation and
set-coherence checks), `0c016f1` (plan-task, widen the premise cross-check and
self-audit item, note the known-red blind spot), and `554f0c8` (docs,
re-anchor prior ADR file:line citations to quoted-text form). This record is
the durable home for the ownership decisions a future editor of that cluster
would otherwise have to re-derive from six issue threads and six commits: which
issue's text is the rule's one home, why that issue won over its rivals, and
what was deliberately left out of scope.

## Decision

**(1) Three general rules, three distinct owners — decided on the merits of
each, not as one policy.**

| General rule | Owner | Citers |
|---|---|---|
| A counterfactual claim is unreachable by reading the tree | **#226**, at the `verify-at-implementation` bullet | #316 |
| Verify a claim against the named subject; don't infer it from a nearby signal | **#187**, at the new emitting-time step | #321, at three sites |
| A row the tree cannot settle is settled by executing it once and reverting | **#316**, in the Test Criteria item | #311 |

**#226 owns the counterfactual class** because its bullet — the
`verify-at-implementation` bullet, which already carries the asserted-figure
guard the class extends — is the existing home for exactly this failure shape,
and a counterfactual is that guard's limiting case: there is no current state
to re-derive against, so the remedy narrows from "re-run the check" to "state
the derivation inline." The item-8 row-level rule that follows cites this
bullet for the class and adds only the remedy specific to a *row* (execute
once, observe, revert) rather than restating the class.

**#187 owns the named-subject rule** because it is the only one of the three
claimants grounded in an already-shipped principle — development principle
**#12**, "A pointer is a claim about its target — verify the target before
writing the pointer" (`plugin/docs/development-principles.md`). The rule this
cluster needed — verify a claim about what a named subject does by reading
that subject, not by pattern-matching its name or a nearby signal — is an
application of #12's own reasoning (a claim about a target is only as good as
having actually looked at the target) rather than a new invention, so #187
owns it at a new step the designer's Process section gained for this purpose:
"Verify what you name before emitting." #321 cites it at three sites rather
than restating it: the analyst's mirrored Key Principles bullet, the
`plan-task` Phase-3 premise cross-check's new behavioural-claim paragraph, and
`approval-and-audit.md`'s premise self-audit item.

**#316 owns execute-don't-assert as the more general framing.** Its rule in
`designer.md`'s Test Criteria item states the general remedy for a row that
predicts a state the tree does not yet contain: have it executed once during
the task that makes the prediction real, observe whether it held, then revert
so the branch doesn't carry a throwaway probe as its actual implementation. A
false prediction routes to a finding, not a silent correction. #311 cites this
framing and adds what #316's general form does not itself supply: the specific
empty-collection *shape* (an assertion expecting no results can't distinguish
"correctly absent" from "structurally incapable of being non-empty"), the
mutation *procedure* for that shape (name the forbidden state, construct it,
observe the row fail), and the mandatory non-constructible *fallback* (rewrite
as a direct structural assertion when no forbidden state exists to construct).

**(2) Two bolded leads for #316 and #311, not one merged lead.** Both issues,
filed independently, wrote the same sentence almost verbatim — "there is no
pattern to positively control and no baseline to re-measure" — which reads at
first as the two issues sharing one hazard. It is not: that sentence is a
shared **negative diagnosis** (neither zero-hit remedy transfers), not a
shared hazard. #316's row can silently be *false* — a counterfactual
prediction that never gets checked reads as though it held. #311's row can
never be false *at all* — an unmutated empty-collection assertion has no
failure mode to discover; it isn't wrong, it's untested. Under the plugin's
one-bolded-lead-per-hazard convention (ADR-0030) that is two hazards, so two
leads ship. The group label the regrouping in decision (3) introduces —
"*Can it be settled by reading at all — or must it be executed?*" — supplies
the unification a single merged lead would otherwise have had to carry inside
its own prose.

**(3) Item 8 regrouped into five named question-groups, firing ADR-0034's
deferred tripwire.** ADR-0033 recorded the tripwire ("if a sixth member
arrives for this cluster, regroup into named sections rather than appending a
seventh bolded lead"); ADR-0034 evaluated it once and declined, naming #305's
cross-row axis in writing as the actual fire condition. #305 is in scope in
this change, so the tripwire fires: `designer.md` item 8 is now five named
groups — *Is the pattern right?*, *Is the expected value right?*, *Can it be
evaluated, and when?*, *Can it be settled by reading at all — or must it be
executed?*, and *Do the rows cohere as a set?* — inserted as group headers
between the existing bolded leads with every one of those leads left
byte-identical. This is a companion decision to this record, not this
record's subject: a separate ADR (0037) is the durable home for the
regrouping itself and for #305's placement as the fifth group's rule.

**(4) `approval-and-audit.md`'s premise item was widened for the behavioural
axis only, not the executable-command axis #239 also needs.** Open issue
**#239** asks for the same sentence to be widened again, along a different
axis: a verification command that can never pass. Left untouched here
deliberately — #239's design phase has not run, and pre-empting it would mint
scope no issue in this change asked for. The commit that widened the
behavioural axis (`0c016f1`) states this carve-out in its own message; this
record is the durable pointer to it by issue number.

**(5) `[point-in-time]` is cited by both new execute-shaped rules with a
conditional trigger, not required unconditionally.** Requiring it
unconditionally would be wrong for #311's shape specifically: a mutation is
often re-runnable after merge (the forbidden state can be reconstructed
again), so such a row typically asserts a *state*, not a one-time
*transition* — and marking it `[point-in-time]` regardless would itself be
the exact mismarking the planner's own marking-correctness sub-bullet
(item 12) polices. Both rules cite the existing `[point-in-time]`/
`[not-yet-due]` tokens by name rather than redefining them, and note the
asymmetry explicitly where it applies.

**(6) No shared `development-principles.md` principle for the named-subject
rule.** `grep -c CLAUDE_PLUGIN_ROOT plugin/agents/designer.md` and the same
against `plugin/agents/planner.md` both return **0**, so a
`${CLAUDE_PLUGIN_ROOT}/docs/…` principle would be unreachable text for exactly
the two consumers that need it — the same reachability argument ADR-0030,
ADR-0031, and ADR-0033 already reached independently for this shape of
question. Agents are flat files (`CLAUDE.md`), so an agent-local sub-doc is
structurally impossible. The standing answer stays cite-and-repeat: the
analyst's mirrored bullet is a tailored inline copy citing designer.md's step
9 by quoted title and principle #12 by number, not a pointer. Separately,
`development-principles.md` currently carries 13 entries with two pending
claimants already named for its next open slot (per ADR-0031/ADR-0033); this
decision does not compete for that slot, and **#240 is open and owns stating
this cite-and-repeat pattern as a general rule** — this record does not
pre-empt it.

This fits the existing architecture as a further extension of `designer.md`
item 8 / `planner.md` item 12's already-established Test Criteria cluster —
now formalized into five named groups per decision (3) — and as a new
emitting-time Process step (designer step 9) mirrored into the analyst's Key
Principles and cited, not restated, at the planning-side premise checks
(`planner.md` item 10's sub-bullet, `plan-task`'s Phase-3 cross-check,
`approval-and-audit.md`'s premise item). No new phase, gate, schema, or
scanner is introduced.

## Compromise

Alternatives considered and rejected:

1. **One shared bolded lead for #316 and #311**, rather than two. Rejected
   per decision (2): the two rows' shared sentence is a negative diagnosis,
   not a shared hazard — one row can be silently false, the other can never
   be false at all — and collapsing them into one lead would erase a
   distinction a future reader needs to act on differently for each.
2. **Housing the named-subject rule inside item 8** alongside the other Test
   Criteria rules, rather than at a new Process-section step. Rejected: the
   rule is not scoped to Test Criteria rows at all — it governs every claim
   the design's prose makes, including paths named outside the table and the
   citations the design itself writes (per #12's "a pointer is a claim about
   its target" reasoning, self-applied to the design's own pointers). A step
   in the Process section, run once at emission time across the whole
   document, states the general rule in one place that item 8's row-specific
   language would have had to either duplicate or narrow.
3. **A `development-principles.md` principle for the named-subject rule
   instead of an inline citation.** Rejected on the same reachability
   evidence ADR-0030/0031/0033 already established for this exact shape of
   question (decision 6) — 0 for both consumers that need it, and the two
   pending claimants for the next open slot are unrelated to this change.
   #240 remains open and owns generalizing the cite-and-repeat pattern
   itself; this record does not pre-empt it.
4. **Widening `approval-and-audit.md`'s premise item for both the
   behavioural and executable-command axes in this change.** Rejected per
   decision (4): the executable-command axis belongs to open issue #239,
   whose design phase has not run — pre-empting it here would mint scope no
   issue in this change asked for, and would leave #239 with nothing left to
   design.
5. **Firing ADR-0034's regrouping tripwire and #305's placement in this same
   record.** Rejected as a matter of record scope, not substance: the
   regrouping is its own decision with its own alternatives (see decision 3),
   and a companion record (0037) is the correct durable home for it and for
   #305's placement as the fifth question-group's rule, rather than folding a
   structural decision about the *whole cluster* into a record about which
   *three new rules* got which owner.

## Consequences

A future editor extending this cluster with a new general rule checks this
table first: is the new rule a limiting case of an existing owner (extend that
owner's bullet, as #316 extended #226's class statement), or a genuinely new
axis (open a new owner, as #187's step 9 and #316's Test Criteria rule both
did)? Citing an existing owner rather than restating its rule is the default;
minting a new owner is the exception, reserved for a rule with no existing
home that fits it.

The three-rule mapping and the two-bolded-lead-not-one decision both depend on
`designer.md` item 8's five-named-group structure from decision (3), whose own
alternatives and durable rationale live in the companion record this record
does not duplicate. A reader who needs the regrouping's own reasoning — why
five groups now rather than a sixth bolded lead, and why #305 is the fifth
group's rule rather than folded into an existing one — follows that pointer
rather than finding it repeated here.

`approval-and-audit.md`'s premise item carries an open widening (#239) this
record deliberately did not pre-empt; a future editor touching that item
again should check #239's status before assuming the behavioural-axis
widening in `0c016f1` is the item's final shape.

`plugin/agents/validator.md` and `plugin/agents/code-reviewer.md` still
enumerate exactly two `unverifiable-as-written` cases — a zero-hit pass
condition with no positive control, and a `[point-in-time]` row whose moment
has passed — confirmed unchanged as of this record. #311's empty-collection
shape is the same class of defect (a row that cannot fail cannot pass either)
and is not in that enumeration: this change ships an authoring-side rule
whose violation the graders still cannot name as a grading-time verdict. Out
of scope here because grader-side vocabulary belongs to a different issue
family than authoring-side rule placement; a follow-up issue naming this gap
is being drafted separately.
