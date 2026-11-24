---
type: decision-record
title: 'A body heading that names a wait, with nothing the grammar reads, is a possible unparsed gate'
description: 'The reference grammar reads four more deferral phrases and extract lists each body heading that names a wait the grammar cannot read, as possibleGates; resolve gives a ready-caveat interactively and blocked unattended.'
tags: [decisions, development-practice]
status: stable
---
# 0105. A body heading that names a wait, with nothing the grammar reads, is a possible unparsed gate

- **Status:** accepted
- **Date:** 2026-11-23
- **Issue:** #895 (an issue gated by a "Not before" line under a `## When` heading read as ready)

## Context

ADR-0087 made the reference grammar the single definition of what an issue says about other issues, and of readiness. #895 found a hole in it. An issue held a `## When` heading with a line that began "Not before …". The grammar had no trigger for that phrase, and the line named no blocker, so `extract` returned no trigger and no reference for it. Every reader took an empty result to mean "ready".

A false "ready" is the expensive direction. It sends an unattended run to start work that its author had put off. The user decided to fix the hole in the grammar, in two parts, and decided that a gate blocks an unattended run.

## Decision

### Part 1: four more deferral phrases

The deferral-trigger rule gains four phrases at line start: "Not before", "Not until", "Blocked until" and "On hold until". Every rule that already holds for a trigger holds for them. A list marker, a checkbox and emphasis may come before the phrase. Text in a fence, a blockquote or inline code is excluded. A reference on the line becomes a `deferral` reference. The trigger line is read before any blocker-statement rule, so "Blocked until" never reads as a "Blocked by" statement, and `Not blocked by #5` still reads as a negated statement.

The phrases reach every reader of `extract` with no change in that reader, gvt-fleet included.

### Part 2: `possibleGates` from `extract()`

`extract()` returns a fourth key, `possibleGates`. It is always an array, and empty when there is no entry.

**What an entry is.** An entry is a body heading that names a wait, whose section gives the grammar nothing it can read as one. The heading is matched by a word at the start of its cleaned title, with a word boundary: "When unblocked" matches and "Whenever" does not. The grammar holds the word list. The section runs to the next heading of the same or a higher level.

**What answers a gate.** A section is answered, and the heading is not listed, when a line in it does any of these:

- gives a deferral trigger;
- gives a `Blocked by` or `Depends on` reference, a prose blocker included, or a deferral reference, or a row-annotation reference such as `- [ ] #5 blocked by #6`;
- states that nothing blocks (`Blocked by: none`);
- opens a nested `Blocked by` or `Depends on` section.

A `Blocks` or `Relates to` statement does not answer a gate, and neither does a checklist child row.

**What never opens a gate.** A heading in a comment, in a fence or in a blockquote. A heading nested under an Acceptance section. A heading that is exactly `Blocked by` or `Depends on`, which stays a blocker section. A heading that itself says there is no blocker, such as `## Blocked by: none`.

**The entry.** `possibleGates: [{ heading, line, origin: 'body' }]`. `heading` is the heading line as written, trimmed. `line` is the first prose line of the section, trimmed, or `null` when the section has none. Nothing else of the section leaves the script, so the rule that the output carries extracted lines and never body text still holds. A gate has its own tracker beside the blocker and Acceptance section tracker, so a `### Blocked by` or `### Acceptance` nested under a gate heading keeps its own meaning.

### `resolve`

Each record carries `possibleGates`, and `decidedBy` gains one `{ source: 'gate', provenance: 'in hand', outcome: 'unparsed' }` entry for each gate. A gate gives no new state:

- Interactively, a gate makes the issue `ready-caveat`. The reason reads `ready with a caveat: possible unparsed gate under heading "<heading>"`.
- Under `--non-interactive`, a gate makes the issue `blocked`. The reason reads `blocked by possible unparsed gate under heading "<heading>"`. `blockedBy` holds reference targets only, so a gate-blocked issue can be `blocked` with an empty `blockedBy`.
- The precedence is `deferred`, then `blocked`, then `ready-caveat`, then `ready`. An unfired trigger or an uncleared blocker wins over a gate, and a gate never lifts an issue. The structure states (umbrella, banner with no open child, every sub-issue closed) are decided after, as they are for blockers.
- This is the treatment of a closed cross-repo blocker whose release is unverified (ADR-0088): a caveat interactively and a block unattended.

`extract --single` prints `{refs, triggers, banner, possibleGates}` from an explicit list of keys, so the output stays a deliberate contract and a new key in `extract()` does not appear by accident. The record that `resolve` prints is built field by field, so it names the key too.

### Prose: a fix path through triage

The bodies that print or act on these records describe the new key. `plan-task` shows each entry to the user before Phase 1, beside an unfired trigger. `plan-next-issue` never auto-picks a gate-blocked issue and names it in the closing summary. The analyst reports each entry as an issue-level `[refs]` finding, `possible unparsed gate`, with the heading and the line.

`triage-issues` offers a body rewrite of the section, per issue and with approval: a deferral trigger line, a `Blocked by` line naming the blocker, or `Blocked by: none` when nothing blocks. It never writes a rewrite unattended, also under `--force`. Under `--non-interactive` the entry is reported only.

The trigger phrases are not named in these bodies, because the grammar owns them and a copy would drift.

### Amendment to ADR-0087

ADR-0087 names its compromise "a statement that does not begin a line is narrative and missed". This record narrows it for a headed section. A statement under a heading that names a wait is still not read when it does not begin a line, but the heading now surfaces as a possible gate, so the miss is no longer silent.

ADR-0087 says one definition serves four callers. gvt-fleet, the coordinator, is a fifth reader of `extract`. It reads `refs`, `triggers` and `banner` only. ADR-0087 is not edited; this record carries the amendment, as ADR-0087 did for ADR-0085.

## Compromise

**Vocabulary and match rule.** The three options were measured over the cached issues of 20 repositories of the managed set: 1,848 issues, all states, with 4,294 texts (bodies plus comments), on 2026-11-23.

- **V-A (recommended).** Chosen. A word at the start of the cleaned heading title, body only, not opened inside an Acceptance section, and an exact `Blocked by` or `Depends on` heading stays a blocker heading. It gives 37 entries, 7 of them on open issues. Read by hand, each of the 7 is a real wait or ordering constraint.
- **V-B.** Rejected. It adds the word `deferred` to the list and has no Acceptance rule. It gives 42 entries, still 7 on open issues. The 5 more entries are all false flags: two gate headings nested under an Acceptance section and three "Deferred …" headings. The count of 5 was re-measured; the list of the five comes from the prototype run that preceded the design.
- **V-C.** Rejected. It matches the whole title only. It gives 20 entries, 3 on open issues. It drops 4 of the 7 open entries, and with them real closed gates headed "Gated on" or as a precondition.

**Output key and entry shape.**

- **K-A (recommended).** Chosen: `possibleGates: [{ heading, line, origin: 'body' }]`. The name says "possible" because the rule has known false flags. A plain `gates` would collide with this repository's use of "gate" for validation gates. `origin` has the shape that `banner` has.
- **K-B.** Rejected. It folds the entries into `triggers` with a `kind` field. gvt-fleet would read every entry as an unfired deferral at once, which disagrees with `resolve`'s caveat.
- **K-C.** Rejected. It uses one object for the first gate only, as `banner` does. A body can hold several gate sections.

**Prose scope.** The scope that was chosen is S2: describe the key, and add a fix path through triage. S1 would only describe the key. Under the unattended block, the 7 open entries read `blocked` and an unattended run never picks them. Without a fix path the only way out is a manual body edit. S2 adds triage's report and its approved rewrite, and it reopens neither decision of the user.

**Also rejected.**

- Making "blocked until" a blocking statement. A line with no reference would then be a prose blocker, which never clears without an edit. It is also the opposite of the decision for a trigger, and gvt-fleet would read it as a blocker and not as a deferral.
- A new `gated` state. Every reader would need another state.
- Clearing a gate by a later "trigger fired" comment. gvt-fleet does not honour firing comments, so the two readers would disagree. The unparsed text is rewritten in a form the grammar reads.

**Costs accepted.**

- The rule has false flags. By reading, 8 of the 37 entries are not gates, or 9 with one borderline case. They are "Unblocked now" or "Independent of" lines, a struck and cleared line, a "not blocked" line and a "Blocks" line. All are on closed issues. This count is a judgement, not a measurement.
- A false flag on an open issue blocks it under `--non-interactive` until its author clears the flag. That is the cost of the user's choice, and the safer side of it.
- The phrases and the vocabulary are heuristics. A wait written under a heading outside the vocabulary, or in a sentence that does not begin a line, is still missed.

## Consequences

- To clear a possible gate, the author writes the wait in a form the grammar reads, inside that section: a deferral trigger line, a `Blocked by` or `Depends on` line, or `Blocked by: none` when nothing blocks. Triage offers this rewrite with approval.
- The new phrases fire twice over the measured texts, both on one closed issue, so no open issue's readiness changes from Part 1 on that corpus.
- A heading's text reaches a readiness reason, and so the output of `plan-next-issue` and the analyst. It is issue text, as a reference line already is. A reader that acts on a reason treats it as data.
- Until GenvidTechnologies/claude-code-plugin-gvt-fleet#158 lands, gvt-fleet reads a gate-only issue as ready, while an unattended `plan-next-issue` reads it as blocked. The two readers disagree on those issues. That follow-up is the change that closes the divergence.
- A change to the vocabulary or to the answer rule is a change to the grammar and its suite. The bodies do not copy either.

**Related records:** [ADR-0087](0087-a-scripted-reference-grammar-is-the-single-definition-of-cross-reference-state-and-readiness.md) (the grammar and readiness this extends, and the compromise this narrows); [ADR-0088](../plan-execution/0088-a-cross-repo-blocker-clears-on-release-not-on-close-when-consumed-as-an-artifact.md) (the closed-but-unreleased blocker, whose caveat-or-block treatment a gate follows).
