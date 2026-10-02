# 0043. Grader verdict vocabulary: third unverifiable case, measured-value reporting, and scope-match

- **Status:** accepted
- **Date:** 2026-08-22
- **Issue:** #325 (canonical), with #342, #352, #267, #371 (grading half) as spanned siblings

## Context

Five issues landed grader-side changes in the same pair of commits — `9681544` (`validator.md`) and
`f0ac604` (`code-reviewer.md`) — all touching the acceptance-criteria grading vocabulary ADR-0034
established and ADR-0035/ADR-0036 refined. Each issue asked a narrower question than the last, and
each answer turned on a piece of evidence gathered before writing, not on preference:

- **#325** asked whether `unverifiable-as-written` reaches the empty-collection-expected-value shape
  ADR-0036 decision (1)/#311 gave `designer.md` a mutation remedy for. It didn't — the grading-side
  definition still only named the two ADR-0034 cases.
- **#342** asked whether a graded row can report `satisfied` over a measurement that contradicts it.
  Neither file said anything about reporting the measured value at all.
- **#352** asked whether the criteria denominator is derived by eye or by command — and found the same
  gap independently present in both files.
- **#267** asked whether a reviewer's own findings are checked against the checklist it just graded
  before filing — and, distinctly, whether that gap is shared with `validator.md` or is
  `code-reviewer`-only.
- **#371**'s grading half asked whether the resolved corpus is checked against the scope a row asserts
  over, as a second axis orthogonal to which diff comparison resolves it (ADR-0035 decision 1).

This record is the durable home for four decisions a future editor of either file would otherwise have
to re-derive from two commits and five issue threads: why #342 got two statements instead of one
owner-plus-citer, why #267 landed in one file only, how #352's new command reconciles with an
existing prohibition two paragraphs above it, and what #325 actually changed given its issue body's
own count of the term was wrong.

## Decision

**(1) #342 required two independent statements, not an ADR-0036-shaped owner and citer — because the
citation route was unavailable on evidence.** ADR-0036 decision (1)'s pattern is that a general rule
gets one canonical statement and other consumers cite it. The naming-symmetric application here would
have been: state the measured-value rule once (in `validator.md`, say) and have `code-reviewer.md`
cite it. That route needed an existing owner to cite, and there wasn't one to find. Measured at
`3914516` (the tip both commits branch from): `grep -ic measured plugin/agents/validator.md` returns
**0** — the validator's own text never used the word, so the "report the measured value" behaviour was
emergent at best, not stated anywhere either file could point to. With no owner to cite, both files
carry their own statement of the rule, independently worded to the shape of their own surrounding
prose (`validator.md`'s bolded lead vs. `code-reviewer.md`'s own bolded lead two sentences later).
This is the ADR-0036 exception clause applying **on evidence** — the same `grep`-before-you-cite
discipline development principle #12 asks of a pointer applies just as much to a *decision not to*
point, and the negative result is what's recorded here so a future reader doesn't mistake the
duplication for an oversight of the one-owner convention.

**(2) #267 is `code-reviewer`-only, and the asymmetry is structural rather than an oversight to
harmonize.** `validator.md` emits `Overall: PASS / FAIL` with per-row verdicts — it has no Warnings or
Suggestions output section at all, so a rule requiring "check your own proposed changes against the
rows you just graded" has nothing to attach to there; there is no proposal-shaped output for it to
gate. `code-reviewer.md` alone gained the new paragraph: a finding proposing a change to a file the
graded checklist asserts against is checked against the graded rows before filing, and a proposal that
would flip a graded `satisfied` to something it would no longer earn surfaces as an explicit conflict
for the orchestrator to arbitrate, not a bare Warning or Suggestion. #267's own scope note guessed this
asymmetry before the fix landed — "the validator emits pass/fail rather than suggestions, so the shape
may not transfer" — and the guess held on inspection, not just plausibility.

**(3) #352's new commanded-denominator paragraph reconciles with the file's existing `- [ ] `-count
prohibition because the two bind different corpora, and the shipped text says so.**
`code-reviewer.md` already forbade counting the denominator as "a count of literal `- [ ]` checklist
syntax (this file's own body carries 20 unrelated checklist rows above; that's a different thing being
counted)" — verified: `git show f0ac604~1:plugin/agents/code-reviewer.md | grep -c '^- \[ \] '`
returns exactly **20**. #352's remedy *is* a command counting `- [ ] `/`- [x] ` syntax
(`grep -c '^- \[[ x]\] '`) — read two paragraphs apart, that would look like the file contradicting
itself within one screen. It doesn't, because the prohibition binds the syntax **in this file's own
instructions** (the 20 unrelated rows sit above the checklist-verification section, an artifact of the
file's own authoring format) and the new command binds the syntax **in the fetched issue body** — a
corpus entirely outside the file being read. The shipped paragraph states this explicitly rather than
leaving it implicit, which is the reconciliation this record confirms rather than invents.

`#352`'s own worked example is itself the evidence that motivated the fix: its stated baseline had
decayed for the exact reason the fix exists. Verified against issue #198's fetched body: the
unticked-only pattern `grep -c '^- \[ \] \*\*R'` returns **1**, while the checkbox-agnostic
`grep -c '^- \[[ x]\] '` returns **26** over the same body — the gap is rows that were ticked after
grading, which an unticked-only count silently drops. That measurement now ships in `code-reviewer.md`
as the worked example for why both checkbox states must be matched in one pattern.

**(4) #325 extends the verdict vocabulary's `unverifiable-as-written` definition from two cases to
three; ADR-0034 is amended in effect at the enumerating site, not in place.** The third case: a row
whose expected value is an empty collection and which carries no mutation record — no evidence the
state the row forbids was ever constructed and observed to make the row fail. ADR-0034 decision (1)
confines each half's *definition* to its own file (authoring-side in `designer.md`, grading-side in
`validator.md`/`code-reviewer.md`), so both graders now carry the third case at their own enumerating
bullet, each citing `designer.md`'s mutation-remedy bullet (quoted above in Context, "A behavioural
assertion whose expected value is an empty collection…") by name and quoted lead rather than restating
the mutation procedure or its mandatory non-constructible fallback. Verified: `git grep -c
'unverifiable-as-written' plugin/agents/validator.md plugin/agents/code-reviewer.md` (post-change)
returns **5** for each file, and only the enumerating bullet was edited in either — the other four
occurrences per file are an output-format template, the contrast against the authoring-side
`unevaluable` term, a checkbox-routing rule, and (in `code-reviewer.md`) the N-of-N tally line. **#325's
issue body states the definition appears "twice per file"; that is incorrect** — it appears five times
per file, once enumerating. This record carries the correction so it isn't reintroduced by a future
reader trusting the issue body over the file.

**Architecture — how this fits ADR-0034, ADR-0035, ADR-0036, ADR-0017.**

- **ADR-0034**'s verdict vocabulary (`satisfied` / `not satisfied` / `unverifiable-as-written` /
  `out of scope` — four states, `out of scope` added by that record) is **unchanged in count**, only
  widened at one case within one state. `#342`'s own issue title (in ADR shorthand, not transcribed
  here) referred to "three verdicts"; the shipped commit message notes this is stale, since ADR-0034
  added the fourth (`out of scope`) after that count was first written, and writing three into the file
  now would have regressed it. Both files carry four states, unchanged by this record.
- **ADR-0035 decision (2)** — the two graders' corpus-resolution defaults deliberately differ
  (`validator.md` defaults to staged, dispatched per-task before commit; `code-reviewer.md` does not,
  dispatched once at the end when staged is typically empty) and must not be harmonized — is
  **honoured, not touched**. #371's scope-match clause is orthogonal to that default: it constrains
  *which scope a row is graded against*, given whatever comparison the default (or an explicit dispatch
  override) already resolved. Both files' existing default paragraphs are left as written; the
  scope-match clause was appended as its own bullet in each, citing `designer.md`'s authoring-side
  mirror ("A baseline measured over a narrower corpus…") rather than restating it.
- **ADR-0036**'s Consequences section is closed by this change: #325 was its named open item, and is
  now shipped.
- **ADR-0017** (pre-committed acceptance criteria) is the reason #267 matters more than an ordinary
  false positive: the checklist is a target the critic checks against and must not silently move.
  #267's remedy neither forbids the reviewer from proposing a change to the checked file nor requires
  it to re-derive or edit the criteria — it closes the *silence*, surfacing a would-flip proposal as an
  explicit conflict instead of a buried Suggestion.

## Compromise

Alternatives considered and rejected:

- **State #342's rule once and have the other file cite it, matching ADR-0036's shape by default.**
  Rejected on the measured evidence in decision (1): there was no existing owner in either file to
  cite, and manufacturing one — writing the rule into `validator.md` first for the sole purpose of
  giving `code-reviewer.md` something to point at — would have been citation theater, not a real
  one-owner relationship. Two independently-worded statements, each fit to its file's own surrounding
  prose, was the honest shape.
- **Harmonize #267 into `validator.md` too, for symmetry with `code-reviewer.md`.** Rejected per
  decision (2): `validator.md` has no Suggestions/Warnings output for the rule to gate; adding the
  paragraph there would bind nothing and read as dead prose.
- **Fold #352's commanded-denominator paragraph into the existing prohibition sentence, as one merged
  rule.** Rejected: the two bind different corpora (this file's own instructions vs. the fetched issue
  body), and merging them into one sentence would have hidden that distinction rather than stating it —
  exactly the ambiguity a reader two paragraphs later would then have had to resolve unaided.
- **Rewrite #325's remedy inline in each grader**, restating `designer.md`'s mutation procedure and
  fallback rather than citing it. Rejected per ADR-0034 decision (1)'s file-confinement rule: the
  grading side reports the verdict, the authoring side owns the remedy; restating it in two more places
  would be a third and fourth copy of text ADR-0036 already fixed at one authoring-side owner.

## Consequences

- **#325 is closed**, and ADR-0036's Consequences item naming it as open should be read as resolved by
  this record.
- **A future reader trusting #325's issue-body count ("twice per file") over the file itself would
  reintroduce a wrong premise** — this record states the verified count (five per file, one
  enumerating) so that doesn't happen.
- **A future reader trusting #342's issue title ("three verdicts") would regress the vocabulary** —
  both files carry four states; this record and the shipped commit message both carry the correction.
- **`validator.md` and `code-reviewer.md` now each state the measured-value rule independently.** A
  later change to that rule must be applied at both sites by hand; there is no single owner to edit
  once. If a genuine shared owner becomes available later (e.g., a `development-principles.md`
  principle), collapsing to ADR-0036's one-owner shape is available as a follow-up, not performed here.
- **The `- [ ] `-count prohibition and #352's commanded-denominator paragraph now sit two paragraphs
  apart in `code-reviewer.md`, bound to different corpora.** A future edit to either paragraph should
  preserve the explicit corpus-distinction sentence — removing it would make the two paragraphs read as
  contradicting again.
- **#267 remains unimplemented for `validator.md`** by design, not oversight, per decision (2) — this
  is the durable record of that scope boundary should a later issue ask why the asymmetry wasn't
  closed.
