# 0030. Verify authored prose claims against their structured source, guarded inline in the skill body

- **Status:** accepted
- **Date:** 2026-08-10
- **Issue:** #265, #271

## Context

Nothing in the plugin verifies **prose claims in durable artifacts** — a
docstring, a comment, an ADR, a commit body. No test, linter, or typechecker
reads comment prose, so every automated gate stays green regardless of what
the prose actually asserts. Two distinct triggers share that one blind spot:

- **#265 — false at authoring.** A dispatch supplies structured facts (a
  probe table, measured figures, an enumerated case list); the implementer
  inverts one while prosifying it into a docstring/ADR/commit body. Observed
  as `construct3-chef#160`: a probe-verified table gave `entry.isFile()` as
  `false` for a junction, and the shipped docstring said `isDirectory():
  true` — inverting the paragraph's own argument. Lint, typecheck, 1512
  tests, and a code-reviewer pass that explicitly graded "docstring factual
  accuracy" were all green.
- **#271 — false after authoring.** A comment is accurate when written, and
  a *later task in the same plan* falsifies it. Observed in
  `c3-domain-manager`: task 3 documented that two surfaces were "not yet
  reconciled"; task 4 reconciled them (the whole point of the plan), and the
  comment was false one commit later while the suite held at 350 passing / 0
  failing.

Triage kept the two as separate issues because the trigger differs (a
transcription error vs. a plan-internal drift), even though the underlying
gap — no gate reads prose — is the same one.

## Decision

**Surface: the guidance lands in `plan-task`'s skill body, not the shared
`development-principles.md`.** `plugin/skills/plan-task/SKILL.md` itself
names *"Should this guidance live in the skill body or in the shared
`development-principles.md`?"* as the textbook surface decision, and the
answer here is forced by who reads what: `grep -c CLAUDE_PLUGIN_ROOT`
returns **0** for `plugin/agents/designer.md`, `plugin/agents/planner.md`,
and `plugin/agents/ts-implementer.md` — none of those agents ever loads the
shared doc, so a principle placed there is unreachable text for the very
consumers that need it. Cite-and-repeat is this repo's established answer to
that shape of question, reached independently four times now (the
`plugin/CHANGELOG.md` entries for #167, #218/#210, and #243, joined by this
record on fresh evidence).

**Structure: two adjacent paragraphs, one per trigger, not one merged
block.** `plan-task/SKILL.md`'s Execution section already carries a cluster
of related hazards that share a premise, written this way: consecutive
paragraphs each with one bolded lead, chained by an opening back-reference —
the paragraph beginning *"A co-dispatched agent's reading of the index is a
snapshot mid-race"* opens by saying "The hazard above is about writes; this
one is about reads," and the paragraph beginning *"The union also
invalidates any whole-suite absolute number"* opens by naming the same
shared "union" premise again. The prose-claim guidance follows that shape:
one paragraph for #265 (false at authoring — a transcription check against
the dispatch's structured source), one for #271 (false after authoring — a
re-check triggered by a later task's own diff), with the second opening by
referencing the shared premise ("no gate reads comment prose") so that
sentence is stated once, not twice. Two paragraphs keep the two triggers
distinguishable, which is also why they stayed two issues rather than being
merged at triage.

**Second site: `plugin/agents/ts-implementer.md` is in scope, alongside
`plan-task/SKILL.md`.** The orchestrator-side paragraphs above are
*detection* — they let a human or a later gate notice a prose claim gone
wrong. The implementer-side rule is *prevention*, and it belongs where the
paraphrase actually happens: inside the agent turning a structured fact into
prose. `plan-task/SKILL.md`'s Phase 3 handoff already states this same
shape one step earlier in the pipeline — *"Pass the designer's `## Test
Criteria` table through verbatim — do not summarize or paraphrase it"* — for
the planner receiving a table from the designer. The `ts-implementer`
addition is that rule's mirror one handoff later, at the implementer turning
a task's structured input into a comment or docstring. Without a matching
entry in `ts-implementer.md`, that site stays ungoverned no matter how
carefully the orchestrator-side detection is worded, because detection runs
after the prose is already written and committed. This is one shape
expressed at two widths — detection in the orchestrator, prevention in the
implementer — not two separate surface decisions, so it is recorded here
rather than split into its own record; that surface-vs-width read is what
decides whether a second ADR is warranted at all.

This fits the existing architecture without a new phase, gate, or config
surface: the orchestrator-side paragraphs extend the Execution section's
existing hazard cluster, and the `ts-implementer.md` addition extends the
existing numbered Process list — both are additive text in files the
validator and code-reviewer already read on every run.

## Compromise

Alternatives considered and rejected:

1. **A new `development-principles.md` principle, cited from all three
   agents.** Attractive — one definition, no duplication. Rejected on the
   same evidence as the surface decision above: `designer.md`, `planner.md`,
   and `ts-implementer.md` carry zero `CLAUDE_PLUGIN_ROOT` references
   between them, so a principle living only in the shared doc is invisible
   to a standalone dispatch of any of them. The accepted cost is deliberate
   duplication across the two artifacts this touches — each inline copy is
   load-bearing for a dispatch that never loads the shared doc.
2. **One merged paragraph covering both triggers.** More compact than two,
   and was considered for that reason. Rejected because it breaks the
   one-hazard-per-bolded-lead convention the neighbouring cluster already
   establishes, and a reader scanning bolded leads would see one hazard
   where there are two genuinely different ones — the same reasoning that
   kept #265 and #271 as separate tracker issues rather than one.
3. **Orchestrator-side detection only, no `ts-implementer.md` change.**
   Simpler — one file touched instead of two. Rejected because detection
   fires after the fact (at validator/code-reviewer time, or later still),
   while the actual paraphrase happens inside the implementer turning a
   table or figure into prose; leaving that site ungoverned means every
   instance is caught late rather than avoided, and the Phase 3
   verbatim-handoff rule already establishes that this plugin polices this
   exact failure mode at the point of paraphrase when it can.
4. **Two separate ADRs, one per surface (`plan-task` and
   `ts-implementer`).** Considered because the two files are genuinely
   different consumers. Rejected: the orchestrator and implementer changes
   are one shape (verify prose against its structured source) applied at
   two widths (detect vs. prevent), not two independent decisions — the
   same tiebreak the Decision section above states explicitly.

## Consequences

Detection and prevention now have a defined home each, so a future change
touching this behavior knows where to look: the two-trigger hazard cluster
in `plan-task/SKILL.md`'s Execution section for detection, and the
`ts-implementer.md` Process list for prevention. The cost is the accepted
duplication named above — the "no gate reads comment prose" premise and the
verbatim-vs-paraphrase framing now live in prose in two files rather than
one, and a future edit to the underlying rule needs to be applied at both
sites, the same maintenance burden the #167/#218/#210 precedents already
carry elsewhere in this plugin. Neither addition introduces a new automated
gate — both are guidance for whoever (human or agent) is already reading
these files, not something `audit-conventions` or the validator can check
mechanically, since checking prose against its structured source is exactly
the kind of judgment call no lint rule can make. That limit is the reason
this stays a documentation change rather than a tooling one.
