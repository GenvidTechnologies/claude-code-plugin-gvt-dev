# 0033. Test-criteria authoring guardrails inline in `designer`/`planner`, #298 folded into #272, and #298's diff-checked invariant subordinated to a corpus floor

- **Status:** accepted
- **Date:** 2026-08-13
- **Issue:** #259 (canonical), with #270, #272, #298 as spanned siblings

## Context

`designer.md` item 8 already governed a criterion's *pattern* — an over-broad
token grep that can't tell a call from a mention (per its "Write the
criterion against the property instead" guidance), and an unfalsifiable
zero-hit result without a positive control (per its "zero hits proves
nothing until the pattern is shown able to match" bullet) — but said nothing
about a
criterion's *expected value* or its *evaluability*. Four issues surfaced three
distinct gaps in that space: #259 (a count criterion's baseline asserted from
reading rather than measured), #272 (a criterion's expected value made
unsatisfiable by the change's own deliverable — a corpus-wide zero broken by
the new citation the change itself adds), #298 (the same expected-value
hazard, filed independently, prescribing a `git diff` invariant check as the
fix), and #270 (a diff-evaluated control that is structurally unevaluable on
a purely additive diff — the exact shape #298's own two incidents were).
None of the four has an automated check: nothing in this plugin lints a
Test Criteria row's semantics, so a defective row ships silently and is
graded — or fails to be graded — by `gvt-dev:validator` and
`gvt-dev:code-reviewer` at execution time, per ADR-0017.

The guardrails themselves landed in `23739ae` (designer) and `45ea7f4`
(planner), with the version bumped to 4.12.0 in `47519bf` — the release
itself is a separate step and had not been cut when this record was
written. This record is the durable
home for the four decisions a future editor of that text would otherwise
have to re-derive from the diff and the issue threads: where the guidance
lives, whether #298 stays a separate bullet, how the cluster is structured,
and how #298's own prescribed fix was resolved against #270's finding.

## Decision

**(a) Surface: inlined in both agent bodies, not extracted to a shared
principle.** `grep -c CLAUDE_PLUGIN_ROOT plugin/agents/designer.md` and the
same against `planner.md` both return **0** — re-run for this record and
confirmed unchanged — so a `${CLAUDE_PLUGIN_ROOT}/docs/development-
principles.md` principle would be unreachable text for the exact two
consumers that need it. Repo-wide, the same check across all nine agents
returns 0 for seven of them (`analyst`, `designer`, `issue-triage-analyst`,
`planner`, `ts-implementer`, `validator`, `wiki-librarian`) and non-zero for
only two (`code-reviewer.md` = 1, `tech-writer.md` = 2) — re-measured for
this record, matching the count ADR-0031 and the #196/#279 CHANGELOG entry
already established for this family. A designer-local sub-doc is
structurally impossible, not merely unattractive: per `CLAUDE.md`, agents
are flat files and the plugin loader does not discover subdirectories under
`plugin/agents/`. A sub-doc would have to live at `plugin/docs/`,
reintroducing the same reachability zero — and ADR-0032 already rejected
that shape on behavior grounds ("a rule that costs a file-open is the rule
most likely to be improvised past"), which is the same profile here: mid-
step material an agent under time pressure needs inline, not one hop away.
This is the repo's established **cite-and-repeat** convention
(per `SKILL.md`'s "an agent dispatched standalone may never load the shared
doc, so each inline copy is load-bearing" clause), and the accepted cost is
real: the
designer and planner prose is tailored per agent voice (not a shared block),
so a future edit to the underlying rule is applied at two sites, not one.
`plugin/docs/development-principles.md` currently carries **13** principles
(numbered `N. **Title**`, not headings — `grep -c '^[0-9]\+\. \*\*'`,
re-measured for this record); per ADR-0031 its next open slot already has
two pending claimants, so this decision leaves it untouched and does not
compete for that slot.

**(b) Fold: #298 merged into #272's bullet as one hazard at two criterion
shapes, not shipped as its own bullet.** The merits alone would settle it —
both are the same expected-value hazard (a criterion pinned as an expected
value over a corpus the change itself writes into; a zero is just the N=0
case), and under ADR-0030's one-hazard-per-bolded-lead convention that is
*one* hazard, not two. But what actually settled it was that **#298's own
"sibling, not duplicate" argument for staying separate rests on a verified
mis-attribution**: its `## Relationship to #272` comparison table credits
#272's remedy as "exclude comment lines, anchor to call sites" —
designer.md's "Write the criterion against the property instead" bullet's
code-structural set — which #272 explicitly disclaims as
inapplicable to a token that is a mention everywhere by nature (#272's
actual remedy is enumerate the corpus → scope the criterion → carve out
newly authored prose, i.e. the zero-over-a-corpus form from designer.md's
"A zero over a corpus" bullet).
#272's own maintainer comment, dated 2026-08-12, had already offered the
fold in exactly this direction before this record was authored. #298's AC 5
asked for the two to be "legible as one family" — one bullet satisfies that
structurally; two bullets would satisfy it only by prose that can drift
apart, the same duplication risk (a) accepts deliberately at the
designer/planner boundary but would not accept *within* one agent's own
item 8.

**(c) Structure: chained bolded leads, not a shipped table or a
restructured item 8.** The three new bullets are ordered the way a row must
survive them — can it fail (#259), can it pass (#272/#298), can it be
evaluated (#270) — each opening with a back-reference to the bullet(s)
before it, the same chaining convention designer.md's "zero hits proves
nothing until the pattern is shown able to match" bullet and its "A grep
prescribed against prose this same design authors" sub-bullet already
establish for the token-grep/zero-hit pair. Two alternative structures
were considered and rejected in favor of this one; see Compromise. The width
decision is recorded in this same record rather than minting a second one
(the precedent ADR-0030 §"one shape at two widths" sets): `planner.md`
mirrors designer's three bullets with only **two**, cut by planner
capability — it can *execute* the baseline the designer could only assert,
and it *holds the task list* the designer never had — rather than one
mirror bullet per designer bullet, which would restate the same already-
uniform repair mechanism (item 10's re-derive-and-correct rule, plus item
12's first sub-bullet) three times over.

**(d) Subordination: #298's prescribed diff-checked invariant demoted
beneath the corpus floor.** As filed, #298 asked for "nothing removed and
nothing loosened, checked against `git diff`" (its body, line 50). #270 —
landing in the same change — proves that form unevaluable whenever the
diff carries no removals, and #298's own two motivating incidents were
themselves purely additive (its body, line 19: "the change was purely
additive"), so #298's own prescribed criterion could not have fired on the
very cases that motivated filing it. Shipped as four independent bullets,
the guidance would have recommended in one bullet the exact form it
declares worthless two bullets later. The corpus floor —
designer.md's "assert the **invariant**, not the total: a floor (`≥` the
measured baseline) so an added citation cannot fail it" — satisfies #298's
underlying intent (existing occurrences survive), is evaluable on any diff
shape including all-additive, and is what #270's own text calls out as the
form to prefer wherever it expresses the same intent. A diff-based control
remains available as a documented fallback (per designer.md's bullet noting
a diff-evaluated control "can be unevaluable at grading time") for cases the
corpus form genuinely cannot express, explicitly marked subordinate to it.

This fits the existing architecture as an extension of `designer.md` item 8
and `planner.md` item 12's already-established pattern-plus-evaluability
cluster, not a new phase, gate, schema, or scanner: three back-referencing
bullets on the designer side, two capability-cut bullets on the planner
side, both read by the existing pipeline on every dispatch.

## Compromise

Alternatives considered and rejected:

1. **A `development-principles.md` principle for the surface decision.**
   Rejected on the reachability evidence in (a) — 0 for both consumers,
   0 for 7 of 9 agents repo-wide — the same reasoning ADR-0030 and ADR-0031
   already recorded for this exact shape of question, reached
   independently each time rather than generalized once (#240 remains open
   and tracks that generalization; this record is another instance of the
   pattern it would state, not the record that states it).
2. **A five-row question table at the head of item 8**, as #270 offers.
   Rejected: every row would restate its bullet's own bolded lead — a
   duplication and drift surface in a file no scanner reads, the same
   objection ADR-0032 raised against restating rules across bullets rather
   than hoisting or chaining them. Chained back-references achieve the same
   anti-conflation reading at zero duplication.
3. **Restructuring item 8 into three named groups** ("Is the pattern
   right? / Is the expected value right? / Can it be evaluated?").
   Rejected as a *current* change, though it is the cleanest end state and
   would scale better as the cluster grows: it rewrites shipped text all
   four issues explicitly ask to leave intact, and it puts the byte-exact
   "Prefer the count" steer (from designer.md's "fails loudly on a broken
   pattern" clause) at churn risk for no
   behavioral gain today. Recorded as the tripwire: if a sixth member
   arrives for this cluster, regroup into named sections rather than
   appending a seventh bolded lead.
4. **Shipping #298 as its own bullet**, preserving its filer's "sibling,
   not duplicate" framing. Rejected per (b): the framing's own supporting
   argument mis-attributes #272's remedy, and #298's AC 5 asks for exactly
   the "legible as one family" outcome the fold delivers structurally.
5. **Shipping #298's `git diff` invariant as written.** Rejected per (d):
   #270, landing in the same change, proves the form unevaluable on an
   all-additive diff, which is the shape #298's own incidents were — so the
   guidance would contradict itself within one change. The corpus floor
   satisfies the same intent without that failure mode.
6. **Mirroring all three designer bullets one-for-one in `planner.md`.**
   Rejected: item 10's re-derive-and-correct mechanism and item 12's first
   sub-bullet are already uniform across all three hazards, so a per-bullet
   mirror would restate that one mechanism three times. Cutting to two
   bullets by planner capability (execute vs. read; holds the task list)
   says the same thing without the repetition.

## Consequences

No automated gate reads this class of guidance — the same premise ADR-0030
recorded for prose-claim verification: checking whether a Test Criteria row
is falsifiable, satisfiable, and evaluable is a judgment call no lint rule
makes, so this stays documentation for whoever (human or agent) authors or
receives a row, not a new scanner.

The rule could not be exercised by the run that authored it: this repo
dogfoods `designer`/`planner` from the installed plugin cache, which lags
source until a release (`CLAUDE.md`'s dogfooding caveat). `23739ae` and
`45ea7f4` landed the guardrail text directly by hand from the plan; a
future dispatch of `gvt-dev:designer` or `gvt-dev:planner` in this repo
exercises the new bullets only after a 4.12.0-or-later `/plugin update`,
the same limit ADR-0032's Consequences section records for its own change.

A future editor of the baseline/citation-floor/evaluability guardrails has
two sites to update — `plugin/agents/designer.md` item 8 and
`plugin/agents/planner.md` item 12 — not a shared block, per the accepted
duplication cost in (a). #298's `## Relationship to #272` table stays in
that closed issue's history as filed and not corrected retroactively; this
record is the durable pointer to what actually happened instead.
`development-principles.md` stays at 13 principles, its next open slot
still unclaimed by this decision.
