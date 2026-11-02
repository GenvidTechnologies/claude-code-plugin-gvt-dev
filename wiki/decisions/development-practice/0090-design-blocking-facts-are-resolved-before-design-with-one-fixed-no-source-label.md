---
type: decision-record
title: 'Design-blocking facts are resolved before design, with one fixed no-source label'
description: 'plan-task Phase 1 resolves a design-blocking fact against an authoritative source before Phase 2; a question no source can settle carries one fixed label, and four bodies carry the rule.'
tags: [decisions, development-practice]
status: stable
---
# 0090. Design-blocking facts are resolved before design, with one fixed no-source label

- **Status:** accepted
- **Date:** 2026-11-02
- **Issue:** #217

## Context

Issue #217 came from GenvidTechnologies/c3source#68. Three questions that establish a fact were scheduled as an execution task after design. Each answer revised a design decision. One design justified its choice with "the corpus could not discriminate", although one fetch of the vendor source would have settled the question.

#45 had already shipped a split between factual and preference questions. It sits under `plan-task`'s `## Shortcuts`, which the full pipeline never reaches. So the full pipeline had no rule on when a factual question is answered, and none on which factual questions must be answered before design.

## Decision

### Phase 1 resolves fact-establishing questions before Phase 2

`plan-task` Phase 1 gains the rule "Resolve fact-establishing questions before Phase 2, not during execution." It does not define "factual" again. It cites the `## Shortcuts` bullet "Classify each open question before resolving it", so the classification stays defined in one place.

The rule makes a second cut inside factual questions.

- **design-blocking**: the answer changes which options the design chooses between. It is resolved before the requirements checkpoint, against an authoritative source. The orchestrator re-dispatches the recon agent or runs `gvt-dev:build-probe`.
- **execution-detail**: the answer fills in a value inside an option already chosen. It becomes a planner task, ordered before the task that needs the value.

### One fixed label for a question no source can settle

A design-blocking question that no authoritative source can settle carries one fixed label: `design-blocking, no authoritative source`. The analyst, `plan-task` Phase 1 and the designer write it. The `plan-task` Phase 2 check reads it, before the user is asked to choose:

- A design-blocking question that the design names with a source goes back to Phase 1. The orchestrator resolves it and re-dispatches the designer with the answer.
- A question that carries the label comes to the checkpoint as it is, with the options that depend on its answer. This holds whether Phase 1 carried it in or the designer found it.
- A design that justifies a recommendation with "cannot discriminate" but names no open design-blocking question goes back to Phase 1. There the undecided point is stated as a question and classified, so it is resolved or labelled before the designer runs again.

The dispatch briefs carry these questions between phases. The Phase 2 designer brief carries each question Phase 1 labelled, because the requirements document is never edited after the analyst writes it. The Phase 3 planner brief carries the execution-detail open questions from `plan.requirements.md`, which become tasks.

### The rule reaches four sites

The rule lives in `plan-task`, the analyst, the designer and the planner. Each agent carries a short rule in its own voice and a pointer to the `plan-task` rule. This is cite-and-repeat, the repo default that [ADR-0034](../acceptance-criteria/0034-criteria-timing-markers-and-grader-verdicts.md) records: an agent dispatched standalone may never load the shared text, so each inline copy is load-bearing (#167).

- The analyst labels each open question with exactly one of `design-blocking`, `design-blocking, no authoritative source`, `execution-detail` or `preference`, and names the source when it knows one.
- The designer, when its reasoning reaches "the evidence cannot discriminate", checks whether an authoritative source could settle the question. If one could, it names the question and the source instead of recommending around the gap.
- The planner schedules an execution-detail fact as a task and flags a design-blocking question that reaches it still open, under `## Risks` or as a blocker for the checkpoint.

### The Shortcuts Factual definition now includes external sources

The `## Shortcuts` **Factual** sub-bullet used to say "answerable from the code/repo" and "only the code is authoritative". That left out the external facts that #217 is about. It now reads "answerable from the code/repo, or from an authoritative source such as vendor docs, a shipped bundle, a schema or a spec", and it names `gvt-dev:build-probe` for a source outside the repo. The widening was decided during execution. It revised the planning-time statement that the #45 block would stay unchanged.

## Compromise

The three choices below were put to the user at checkpoints. The option labels are quoted as they were offered.

**Where the definition lives.**

- Chosen: "Keep in Shortcuts, cite it". Phase 1 gains the timing rule and cites the Shortcuts bullet by its quoted text. This is the smallest diff.
- Rejected: "Move it into Phase 1". Phase 1 would own the definition and the shortcut would point back. That rewrites the shipped #45 block, which is phrased for the shortcut and would have to be split.

**How far the rule reaches.**

- Chosen: "All four, incl. planner". It catches the failure at its source, where the designer writes the tell, and where execution-detail facts become tasks, in the planner.
- Rejected: "plan-task + analyst + designer". There would be no planner rule for scheduling execution-detail facts.
- Rejected: "plan-task + analyst only". This is the issue's own scope. The tell would be caught only by the orchestrator at the Phase 2 check.

**The Factual definition.**

- Chosen: "Widen Shortcuts". There is one canonical definition.
- Rejected: "Widen locally in Phase 1". It makes a second, partial definition, which is the drift the issue warned about.
- Rejected: "Narrow analyst instead". External facts would then fall outside "factual" everywhere, which undercuts #217.

**Four copies of the label meanings.** Each of the four sites states the label meanings in its own voice. This is a deliberate cost. During the change, a validator re-read found a contradiction between the sites six times before the four rules agreed. Each time the fault was in how the no-source case is handed off. The faults included:

- a designer rule that designed around a gap the `plan-task` rule said not to reason around;
- a loop between the Phase 1 rule and the Phase 2 check;
- a question found by the designer that had no route;
- the analyst's template, which said all design-blocking questions block design;
- a label written in two forms.

Keying the Phase 2 check on one fixed string, and not on loose wording, is what made the handoff hold. Any later edit to one site must keep the exact string `design-blocking, no authoritative source`.

## Consequences

- A change to the label string is a three-site edit: `plan-task`, the analyst and the designer. The planner does not carry the string; it acts on any design-blocking question that reaches it still open. A change to the label meanings is a four-site edit. No drift test covers these copies. Unlike the block in ADR-0089, they are in each body's own voice, so a hash check does not apply.
- Known seams, not decided here:
  - The designer's Output Format has no fixed open-questions section, so the Phase 2 check reads the whole design, and an execution-detail question the designer finds has no fixed place to be listed for the planner.
  - The full-proposal and simple-task shortcuts have no design-blocking and execution-detail split.
  - A question sent back to Phase 1 after Phase 2 does not say whether the requirements checkpoint is entered again.
- The analyst insertion moved a sentence that ADR-0021 cites by line number (the analyst body's line 60 became line 61). The citation was repointed in the same change.
- Dogfooded agents run from the installed plugin cache. They see the rule only after a release and a cache update.
- Related records: [ADR-0004](0004-agent-pipeline-with-user-checkpoints.md), [ADR-0021](0021-proposal-artifact-cross-check.md), [ADR-0031](0031-verified-vs-inherited-facts-stay-in-skill-body.md), [ADR-0089](0089-a-shipped-writing-style-doc-owns-style-and-voice-with-an-identical-block-and-a-drift-test.md).
