# Wiki Log

Record of every `ingest` run: what changed, why, and which `raw/` source
drove it, grouped under `## YYYY-MM-DD` date headings (ISO 8601) with the
**newest date group first**. Entries are prose bullets, e.g. `* **Update**:
…`, `* **Creation**: …`, `* **Deprecation**: …` — the leading bold word is a
convention, not a requirement.

**Add newest first, never edit or remove a prior entry.** "Newest first"
means a new entry (and, if today isn't already the top group, a new
`## YYYY-MM-DD` heading) is *prepended* above everything else — the
insertion point moves from the bottom to the top, but prepending never
touches a prior entry's text, so the append-only guarantee holds exactly as
before. If a past entry itself needs correcting, add a new entry that says
so; never edit or remove the old one in place. See `wiki/schema.md` for
the full maintenance schema.

## 2026-11-25

* **Update**: `process/issue-triage.md`'s mutation recipes changed after the
  triage of #1102 to #1132. "Create split issue" passes a priority label and
  says to read back the body, set the road block and stamp `triaged` in the
  same run. "Set road block" passes `--apply` as its last argument and says
  what the script prints with and without it (#1131), and the Class section
  no longer says that the script has no dry run. A new recipe, "Add a road
  block option", adds a goal to the project's `Road block` field. Not an
  ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md`'s Tracker section now asks for a search
  of the other plugin's tracker before either half of a cross-cutting issue is
  filed, and names gvt-fleet and gvt-construct3 beside gvt-wiki. It came from
  the retro of the refactoring audit that filed #1102 to #1127. Not an ingest;
  no `raw/` source drove it.
* **Update**: `process/issue-triage.md` says which labels a duplicate closed in
  the triage run gets, that it gets no road block, that "Close duplicate" runs
  without the comment of "Mark duplicate", and that evidence the duplicate adds
  goes to the canonical as a comment. They came from the retro of the triage of
  #1097 and #1098. Not an ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md` gains a "Read back comment" recipe, a
  Dependencies paragraph for a cited commit that fails the ancestor check only
  because its change reached `main` under another sha, and a sentence on how to
  check a note that retracts a comment blocker with `extract`. They came from
  the retro of the triage of #1079, #1081, #1082 and #1088. Not an ingest; no
  `raw/` source drove it.

## 2026-11-24

* **Update**: `maintainer/release-cycle-rules.md` gains "A CHANGELOG sentence
  that says how behaviour changed is run on the old and the new code before
  the commit". It came from the retro of #951, whose entry first claimed a
  behaviour that the new code did not have; a run on both sides found it
  before the pull request was opened. Not an ingest; no `raw/` source drove it.

## 2026-11-23

* **Creation**: `maintainer/timing-tests.md` holds the rules for a test of
  running time: compare two sizes, use the median of several rounds, run every
  round, choose the limit from measurements under load, and prove the test
  with a quadratic mutation. `CLAUDE.md` routes to it from its Knowledge base
  list. It came from the retro of #982, whose W11 8,000-item test failed a
  fixed 500 ms limit on a loaded machine.
* **Creation**: `decisions/development-practice/0106-a-body-heading-that-names-a-wait-with-nothing-the-grammar-reads-is-a-possible-unparsed-gate.md`,
  the record that the reference grammar reads four more deferral phrases and lists a body
  heading that names a wait with nothing the grammar reads as `possibleGates`, and that
  narrows the compromise of ADR-0087 for headed sections. Registered in
  `decisions/development-practice/index.md`. From #895. Not an ingest; no `raw/` source
  drove it.
* **Update**: `maintainer/release-cycle-rules.md` gains a rule for parallel
  integration branches that take the same ADR number. `commands.validate`
  now runs `renumber-adrs.mjs --next`, which exits 1 on a duplicate number;
  the rule says to re-run it after `origin/main` is merged in, and how to
  move a duplicate record. From the retro of #906.
* **Update**: `process/issue-triage.md` gains a Dependencies paragraph: an
  issue whose premise was read at a commit that is not an ancestor of the
  default branch waits for the issue whose change holds that commit, and triage
  proposes a `Blocked by` comment for it. It came from the retro of the triage
  of #1069 and #1070, which both read as ready while their premise was on
  #1060's unmerged change.

## 2026-11-22

* **Update**: `maintainer/testing-the-audit.md` gains "A change that moves a default also
  scans the eval fixtures and graders that rely on the old one", and
  `maintainer/release-cycle-rules.md` gains "The fix of an issue rewords every sentence that
  names its gap as open". Their descriptions and their rows in `maintainer/index.md` name
  the new rules. From the retro of #1060. Not an ingest; no `raw/` source drove it.
* **Update**: `decisions/skill-shapes/0066-adr-authoring-resolves-decisions-location-retires-claude-md-fallback.md`
  gains an "Amended by" marker that links ADR-0104. The decision text of the record is
  unchanged. From #1060. Not an ingest; no `raw/` source drove it.
* **Creation**: `decisions/skill-shapes/0104-adr-registration-follows-the-record-location.md`,
  the record that an ADR outside the wiki gets a Decision Records row only when the
  documentation index is outside the wiki too. Registered in `decisions/skill-shapes/index.md`.
  From #1060. Not an ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md` gains the read-only recipe "Read the
  road blocks of several issues", one aliased GraphQL query that prints the
  road block of each named issue. It came from the retro of the triage of #1054
  and #1058, where it checked the analyst's road-block claims in one call.
* **Update**: `maintainer/release-cycle-rules.md` gains "Parallel side branches put their
  `[Unreleased]` entries at different points", and its description and its row in
  `maintainer/index.md` name the new rule. From the retro of #1047 and #1046. Not an ingest;
  no `raw/` source drove it.
* **Update**: `decisions/skill-shapes/0084-near-miss-nominate-plus-veto-registration-follows-location.md`,
  `decisions/acceptance-criteria/0102-issue-less-acceptance-fallback-resolves-a-declared-location.md`
  and `maintainer/audit-author-time-findings.md` now call the object "documentation index"
  instead of "docs index". The records change for the name only: no decision changes, so they
  get no amendment marker, as for ADR-0099 under #997. From #1047. Not an ingest; no `raw/`
  source drove it.
* **Update**: `decisions/wiki-and-okf/0067-decision-records-move-into-the-wiki-bundle.md`
  gains an `Amended by` line for ADR-0099, and
  `decisions/wiki-and-okf/0099-this-repo-keeps-no-docs-tree.md` gains the
  matching `Amends` line. ADR-0099 and its row in
  `decisions/wiki-and-okf/index.md` now call the object "documentation index"
  instead of "docs index" and "resolved index". `audit-conventions-as-proto-lint.md`
  now says that this repository runs with the `paths['docs/TOC.md']` override of
  ADR-0099. From #997. Not an ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md`: the Mutation recipes gain "File a
  defect found during triage", for a defect that the verification finds and
  no open issue covers. From the retro of the triage of #1041. Not an ingest;
  no `raw/` source drove it.

## 2026-11-21

* **Update**: `process/issue-triage.md`: the "Set road block" recipe now says
  that the script runs from a worktree when it is given by its full path, with
  no `cd` to the workspace root. From the retro of the triage of #1034 to
  #1036. Not an ingest; no `raw/` source drove it.
* **Update**: `maintainer/plugin-authoring.md` now says that the docs-path test
  does not check a spelled-out default beside `paths['<path>']`, instead of
  telling authors to spell out none. From the #388 retro; the open question is
  #1036. Not an ingest; no `raw/` source drove it.
* **Update**: `maintainer/plugin-authoring.md` gains the section "A `docs/` path
  in a skill or agent body": what `test/docs-path-prose.test.mjs` requires, and
  how to fix a failure or record a deliberate literal. From #388. Not an ingest;
  no `raw/` source drove it.
* **Creation**: `decisions/plugin-structure/0103-docs-path-literals-in-component-bodies-are-guarded-by-a-repo-test.md`,
  the record that a skill or agent body names a declared `docs/` path only beside
  its resolution, that every other consumer `docs/` literal is recorded with a
  kind, and that a repo test enforces both. Registered in
  `decisions/plugin-structure/index.md`. From #388. Not an ingest; no `raw/`
  source drove it.
* **Update**: `process/issue-triage.md` gains a paragraph in Dependencies: a
  body sentence about an unmerged branch records what was read at which
  commit, not a forecast of the merge, and the issue's state is read just
  before such a write. From the retro of the triage of #1007, #1012, #1023 and
  #1025. Not an ingest; no `raw/` source drove it.
* **Update**: `maintainer/testing-the-audit.md` gains a paragraph on scanning
  test titles for a value a change moves before a rename row is pledged, and
  `maintainer/audit-author-time-findings.md` now says a test file is a cited
  file, so a new test goes at the end of its file. From the #938 retro. Not
  an ingest; no `raw/` source drove it.
* **Update**: `decisions/plugin-structure/0062-runtime-path-resolution-for-declared-expectations.md`,
  `decisions/plugin-structure/0068-prose-conventions-doc-default-is-relocatable.md`,
  `decisions/plugin-structure/0095-wiki-practice-ships-as-gvt-wiki-depending-on-gvt-dev.md`
  and `decisions/skill-shapes/0084-near-miss-nominate-plus-veto-registration-follows-location.md`
  each gain an "Amended by" marker that links ADR-0101. The decision text of
  each record is unchanged. From #938. Not an ingest; no `raw/` source drove it.
* **Creation**: `decisions/plugin-structure/0101-document-locations-default-to-the-wiki.md`,
  the record that a declared `docs/` path with no `paths` override derives its
  default location from the wiki directory. Registered in
  `decisions/plugin-structure/index.md`. From #938. Not an ingest; no `raw/`
  source drove it.
* **Update**: `maintainer/dogfooding-the-plugin.md` adds two traps of a headless
  probe: a throwaway repo under a `.claude` folder gets every write refused, and
  the JSON `result` field holds only the session's final message. From the
  retro of #455. Not an ingest; no `raw/` source drove it.
* **Update**: `maintainer/plugin-authoring.md` adds "Say 'verbatim' when the
  output must be found", with the three probe rounds of #455 that measured it.
  From the retro of #455. Not an ingest; no `raw/` source drove it.

## 2026-11-20

* **Update**: `maintainer/audit-author-time-findings.md` now names
  `<wikiDir>/decisions/` as the default location of a repo's ADR trail, where
  it named `docs/decisions/`. From #938, which derives the default location of
  every `docs/<rest>` path from the wiki directory. Not an ingest; no `raw/`
  source drove it.
* **Update**: `decisions/plugin-structure/0100-ordinary-project-docs-resolve-through-the-index-contract-files-stay-declared.md`
  lists `docs/acceptance/` as a contract file, as ADR-0102 declares it, and
  `test/expects-docs-contract.test.mjs` adds it to its allowlist. For #455.
  Not an ingest; no `raw/` source drove it.
* **Creation**: Added `decisions/acceptance-criteria/0102-issue-less-acceptance-fallback-resolves-a-declared-location.md`
  for #455. It decides that the issue-less acceptance fallback resolves a
  declared location, writes nothing and waits when there is none, and never
  commits a file that git ignores. It amends ADR-0017 in part. Listed it in
  that theme's `index.md` and marked the ADR-0017 entry there as amended. Not
  an ingest; no `raw/` source drove it.
* **Update**: `decisions/plugin-structure/0100-ordinary-project-docs-resolve-through-the-index-contract-files-stay-declared.md`
  names the repository's own `CONVENTIONS.md` as the source of the index
  resolution, not `plugin/CONVENTIONS.md`, which is the shipped template. For
  #363. Not an ingest; no `raw/` source drove it.
* **Update**: `decisions/plugin-structure/0100-ordinary-project-docs-resolve-through-the-index-contract-files-stay-declared.md`
  names the index as the file that `plugin/CONVENTIONS.md` "Runtime path
  resolution" resolves for `docs/TOC.md`, with no default, so the text stays
  true when #938 changes the default for a repository with a wiki. For #363.
  Not an ingest; no `raw/` source drove it.
* **Creation**: Added `decisions/plugin-structure/0100-ordinary-project-docs-resolve-through-the-index-contract-files-stay-declared.md`
  for #363. It decides that a component finds an ordinary project doc through
  the documentation index, that only a contract file is declared under `docs/`
  in `metadata.expects`, and that `test/expects-docs-contract.test.mjs` keeps
  the declared `docs/` paths to an allowlist. Listed in
  `decisions/plugin-structure/index.md`. Not an ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md` has a "Read road block" recipe, a
  read-only query for the `Road block` options and an issue's current value,
  and says to report "no change" without a write when the proposal matches.
  From the triage of #1001. Not an ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md` now says, under Labels, that an issue
  can carry more than one category label, and that the Set category recipe
  removes the other categories, so it runs only to change the category. From
  the triage of #992, #996 and #997. Not an ingest; no `raw/` source drove it.
* **Creation**: Added `decisions/wiki-and-okf/0099-this-repo-keeps-no-docs-tree.md`
  for #939 and #375. It decides that the docs index resolves to `index.md`,
  that no component requires `docs/TOC.md`, that the 2026-06 superpowers plan
  and spec stay under `raw/superpowers/`, and that this repo keeps no `docs/`
  tree. It amends ADR-0067 in part. Listed it in that theme's `index.md`. Not
  an ingest; no `raw/` source drove it.
* **Update**: `index.md` now says that it is also the documentation index of
  this repo and names the documents outside the bundle without linking them.
  `llm-wiki-pattern-in-gvt-dev.md` now says that this repo's `docs/TOC.md` was
  removed by #939, and keeps the consumer-contract description of the file.
  Not an ingest; no `raw/` source drove it.
* **Update**: Removed `docs/TOC.md` for #939. The `paths['docs/TOC.md']`
  override in `.gvt-agent.json` resolves the docs index to `index.md`, which
  now names the documents outside the bundle. Updated
  `maintainer/audit-author-time-findings.md` and
  `maintainer/testing-the-audit.md` to match. Not an ingest; no `raw/` source
  drove it.
* **Update**: `process/issue-triage.md` (Class) now says that triage proposes
  a road block for each issue, the `Road block` field of the `gvt-plugins`
  project, and sets it only with the coach's approval. A new "Set road block"
  recipe runs the gvt-fleet workspace's `set.mjs`, which writes at once with no
  dry run. The section also says that an issue outside the project gets an item
  with no Iteration value, so its class stays Later. No `raw/` capture drove
  this run: the source is the triage of #980 and #982, where no recipe covered
  the road block.
* **Update**: `maintainer/audit-author-time-findings.md` now says that an
  insertion into any cited file drifts its pointers, not only an insertion
  into an agent or skill body, and that `pointer-baseline.mjs --targets
  <file>` lists them first. In #684, a paragraph added to `schema.md` drifted
  four citations in ADR-0022 and ADR-0026. `CLAUDE.md`'s Knowledge base now
  routes to the page before an insertion into a file under `plugin/`,
  `wiki/` or `docs/`. Found by the retro of #684.
* **Update**: `schema.md`'s "Page lifecycle: create vs. update" section now
  carries the "Citations on an update" rules from the gvt-wiki schema
  template (GenvidTechnologies/claude-code-plugin-gvt-wiki#41). A claim added
  or changed because a source changed cites a new `sources[]` entry whose
  source shows the change, and an existing footnote is reused only after its
  source is read and shows the sentence. The update-in-place bullet points to
  these rules. Part of #684.
* **Update**: `decisions/wiki-and-okf/0022-okf-bundle-root-is-the-wiki-tier.md`
  and `decisions/wiki-and-okf/0026-okf-dogfood-migration-semantics.md` cite
  `schema.md` by quoted text with no line number, at four citations. The
  "Citations on an update" paragraph moved the cited lines down, and the
  audit reported the four line numbers as drifted. Part of #684.

## 2026-11-19

* **Migration**: Moved the 2026-06 `triage-bugs` plan and spec from
  `docs/superpowers/` to `raw/superpowers/plans/` and `raw/superpowers/specs/`
  for #939, with their text unchanged. They are dated design records kept as
  immutable captures, not sources queued for ingest; no page lists them in its
  `sources`. ADR 0020 still names their old paths, and stays as written.
  Updated `maintainer/testing-the-audit.md` to match. Not an ingest; no `raw/`
  source drove it.
* **Update**: `maintainer/release-cycle-rules.md` now says that a CHANGELOG
  entry which states another issue's state reads that state live, with
  `gh issue view … --json state,stateReason`. The #930 entry said that its
  `maintain-wiki` half was tracked in
  GenvidTechnologies/claude-code-plugin-gvt-wiki#24, copied from the #930
  body; that issue had closed as completed three days before. Found by the
  retro of #930.
* **Update**: `maintainer/audit-author-time-findings.md` now says how to find
  the pointers into a cited file after it has moved: `--targets` refuses the
  old path, the baseline holds the entries, and a continuation after an
  unresolved pointer is found only by reading the citing file. Found by the
  retro of #955. Not an ingest; no `raw/` source drove it.
* **Update**: `decisions/wiki-and-okf/0022-okf-bundle-root-is-the-wiki-tier.md`
  and `decisions/wiki-and-okf/0026-okf-dogfood-migration-semantics.md` now cite
  the wiki templates and `maintain-wiki`'s `SKILL.md` in prose, with no line
  number. Those files moved to `gvt-wiki` in 5.0.0, so their line citations
  could not resolve. `decisions/criteria-authoring/0038-baseline-scope-trap-and-measured-claim-reexecution.md`
  now names the `git stash` example that #373 removed from `designer.md`, in
  place of a line number. Each rewrite names the text that was cited when the
  record was written (#955). Not an ingest; no `raw/` source drove it.

## 2026-11-18

* **Update**: `process/issue-triage.md` (Dependencies) now says that the
  reference check gives a `Relates to` or `Blocked by` relation to every issue
  reference on that line, so other references go on a line of their own. It
  also says to run `extract` on a "Link related" comment draft.
  In the triage of #971, a draft `Relates to #956` line also produced a
  relates-to reference and a `repo-ambiguous` one. Found by the retro of that
  triage. Not an ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md` now says how to read the current class
  of a given issue: the `class` field of its entry in `gvt-fleet ready --all
  --json`. In the triage of #966 to #969, a key search over the output of
  `ready --class … --json` matched only the `untriaged` list, and the class was
  wrongly reported as unconfirmed. Found by the retro of that triage. Not an
  ingest; no `raw/` source drove it.
* **Update**: `process/issue-triage.md` now has an "Edit title" recipe in its
  Mutation recipes, with a title readback. In the triage of #963 and #964, the
  approved retitle of #964 went through an ad-hoc call because no recipe
  covered it. Found by the retro of that triage. Not an ingest; no `raw/`
  source drove it.

## 2026-11-14

* **Update**: `process/issue-triage.md` now says, in its Class section, to
  report each issue's current class beside the proposal, and to skip the
  question and the write when they are the same. In the triage of #954 to #956,
  all three approved class writes returned `noop`.
* **Update**: `process/issue-triage.md` now says, in its Dependencies section,
  to offer the smallest body edit, checked with `extract` before and after,
  when a defect in the reference check makes an open issue read with the wrong
  readiness (#286, found in the triage of #951). Found by the retro of the
  #951 triage. Not an ingest; no `raw/` source drove it.
* **Update**: `maintainer/testing-the-audit.md` now says how to probe a
  cited-file move: the same tree for the old and the new code, and a target
  that cites nothing in the baseline. Found by the retro of #619. Not an ingest;
  no `raw/` source drove it.
* **Update**: `maintainer/audit-author-time-findings.md` now says that a
  baselined pointer into a moved *cited* file goes red, not silent. The audit
  reports `pointer-baseline-target-moved` for an entry that has a digest when
  its pointer no longer resolves to one file (#619). The "Find them" step now
  names `pointer-baseline.mjs --targets`, which shipped with #594. Not an ingest;
  no `raw/` source drove it.

## 2026-11-13

* **Update**: `process/issue-triage.md` now writes a related link as
  `Relates to #<id>` (the Dependencies section and the "Link related" recipe),
  because the reference check does not read `Related:` (#941). Its Class
  section now says to run `gvt-fleet iteration list` before proposing Now or
  Next. Found by the retro of the #941 to #945 triage. Not an ingest; no `raw/`
  source drove it.
* **Update**: The `## Class` section of `process/issue-triage.md` now says that
  the class is the issue's iteration in the project Iteration field, as the
  gvt-fleet coordinator derives it since its ADR 0015. The class labels and the
  `Class` single-select field are marked as not read. The two recipes "Set
  coordinator class" and "Set project Class" and the Class readback are
  replaced by one "Set class" recipe. Found in the triage of #941 to #945, where
  `gvt-fleet class … next` was refused for lack of a next iteration. Not an
  ingest; no `raw/` source drove it.
* **Update**: The `## Class` section of `process/issue-triage.md` now says
  that a Later class still needs the "Set project Class" recipe, although the
  coordinator step writes no label. Found by the retro of the #938 and #939
  triage, where both issues were left out of the project. Not an ingest; no
  `raw/` source drove it.
* **Update**: Added two recipes to the `## Mutation recipes` section of
  `process/issue-triage.md`: "Set category", which reclassifies a defect as
  non-defect work, and "Read back body", which compares an issue body with
  the file written to it. Found by the retro of the #929 and #930 triage.
  Not an ingest; no `raw/` source drove it.
* **Update**: `maintainer/audit-author-time-findings.md` now says that
  rewording a cited line fails the pointer-baseline digest check even when
  no line moves, and how to re-take an entry whose cited passage is meant to
  change. From the #613 retro. Not an ingest; no `raw/` source drove it.
* **Update**: Performed the correction ADR-0041 recorded as owed (#613).
  `llm-wiki-pattern-in-gvt-dev.md` and `audit-conventions-as-proto-lint.md`
  no longer scope every hygiene scanner to `docs/**` and `CLAUDE.md`: they say
  that `scanRetiredTokens` alone also walks `wiki/`, and the proto-lint page's
  exclude list notes that the decisions exclusion follows a `paths` override
  (ADR-0064). `schema.md` now says log entries are prepended, matching this
  log's newest-first rule. Every line an ADR cites keeps its line number;
  the one cited passage that had to change (`llm-wiki-pattern-in-gvt-dev.md`
  lines 82-84, the passage ADR-0041 named) had its pointer-baseline digest
  re-taken. Not an ingest; no `raw/` source drove it.

## 2026-11-12

* **Update**: Added what `gh issue transfer` does to the `## Tracker` section
  of `process/issue-triage.md`: which labels it keeps, how it rewrites bare
  references, that sub-issue links survive, and that a title match misses
  issues. Observed during #443's ownership pass and recorded by its retro.
  Not an ingest; no `raw/` source drove it.

* **Update**: Added a paragraph to `maintainer/testing-the-audit.md`. It says
  that a test file is part of the pointer scanner's citing corpus, so a
  literal path-colon-number string in a test is a real pointer, and it gives
  the quick check: the bare `pointer-baseline.mjs` scan count must equal the
  baseline entry count. The `CLAUDE.md` Knowledge base trigger for that page
  now names this case. Source: the #594 retro.
  
* **Update**: Added a `## Tracker` section to `process/issue-triage.md`. It
  says which tracker owns an issue now that the wiki practice ships as
  `gvt-wiki`, and how to handle an issue with a half in each plugin. Recorded
  on #443, whose ownership pass moved 35 open issues to the `gvt-wiki` tracker.
  Not an ingest; no `raw/` source drove it.

* **Update**: Added a `## Class` section to `process/issue-triage.md`. It
  names the two stores of an issue's Now/Next/Later class (the coordinator's
  `class:now`/`class:next` labels, which the coach overview reads, and the
  `gvt-plugins` project's Class field) and says that a triage pass sets both.
  Added the `class:*` labels to its Labels list and the "Set coordinator class",
  "Set project Class" and "Read back the project Class" recipes. The triage of
  #919 to #927 set only the project field. Recorded on #865. Not an ingest; no
  `raw/` source drove it.

## 2026-11-11

* **Creation**: Added `decisions/plugin-structure/0098-gvt-wiki-move-own-guard-installed-resolution-and-external-provider.md`,
  recording the guard split by prefix, the installed-`gvt-wiki` resolution,
  the `providedBy` rendering of Practice Coverage, the write-only
  `wiki-editor` and the `MIGRATION.md` copy-base SHA (#441, with #914), and
  listed it in that theme's `index.md`. Not an ingest; no `raw/` source drove it.
* **Update**: Added an `Amended by` marker for ADR-0098 to
  `decisions/plugin-structure/0027-pillar-declaration-and-two-sided-coverage-report.md`
  (decisions 1 and 2).

## 2026-10-13

* **Creation**: Added `decisions/development-practice/0075-quoted-artifacts-vs-direction-in-dispatch-briefs.md`,
  recording the source / content / direction roles for quoted blocks in
  `plan-task` dispatch briefs (#554, with #569 and #646 combined), and listed it
  in that theme's `index.md`. Not an ingest; no `raw/` source drove it.

## 2026-10-12

* **Creation**: Added `decisions/development-practice/0072-triage-verifies-issue-claims-against-the-target-artifact.md`,
  recording the claim-vs-artifact verification step in `issue-triage-analyst`
  (#193, with #430 folded in), and listed it in that theme's `index.md`. Not an
  ingest; no `raw/` source drove it.

## 2026-10-09

* **Creation**: Added `maintainer/leaf-dependency-posture.md` and
  `maintainer/leaf-dependency-ledger.md`, the two documents ADR-0051 deferred
  until `gvt-dev` first pins a leaf, as recorded in ADR-0071 (#458, #578).
  Both are listed in `maintainer/index.md`. Not an ingest; no `raw/` source
  drove them.

## 2026-10-08

* **Update**: Retro of the docs→wiki chain. `maintainer/audit-author-time-findings.md`
  gains a note on moving a *cited* file: its baselined pointers go silently
  unresolved, so repair them by intent and check that the cited text still
  exists. `maintainer/release-cycle-rules.md` records that the leak-guard
  check now runs in `commands.validate` too. Not an ingest; no `raw/` source
  drove it.

* **Migration**: Moved the maintenance schema from `docs/` into the bundle as
  `schema.md` for #587, gave it OKF frontmatter as a `convention` page, listed
  it under `## Schema` in `index.md`, and brought its claims up to date with
  the moved tree. Not an ingest; no `raw/` source drove it.

## 2026-10-06

* **Migration**: Moved the long maintainer sections of `CLAUDE.md` into six
  `maintainer/` pages for #586, registered them in `maintainer/index.md`, and
  replaced them in `CLAUDE.md` with a `## Knowledge base` routing list. Not an
  ingest; no `raw/` source drove it.

## 2026-10-05

* **Migration**: Moved the issue-triage conventions to `process/issue-triage.md`
  and the plugin-authoring notes to `maintainer/plugin-authoring.md` for #585,
  gave each OKF frontmatter, added the `process/` and `maintainer/` indexes, and
  linked them from `index.md`. Not an ingest; no `raw/` source drove it.

## 2026-10-01

* **Migration**: Moved the repo's decision records from `docs/decisions/` into
  `wiki/decisions/<theme>/` for #584, gave each OKF frontmatter, added the
  decisions and theme indexes, and linked them from `index.md`. Not an
  ingest; no `raw/` source drove it.

## 2026-08-04

* **Migration**: Moved this bundle to OKF v0.2 for #192 — reworked
  `llm-wiki-pattern-in-gvt-dev.md`, `audit-conventions-as-proto-lint.md`,
  `index.md`, and `log.md` to the v0.2 page, index, and log shapes; see
  ADR-0026 for the reasoning. `usage_window` is omitted from the page
  frontmatter per #221. The 2026-07-21 entry below was re-rendered from the
  old 4-column table into a §9 prose bullet, not revised — its Change, Why,
  and Source text is preserved word-for-word.

## 2026-07-21

* **Creation**: Created `llm-wiki-pattern-in-gvt-dev.md` and
  `audit-conventions-as-proto-lint.md`; added both to `index.md`. Dogfooding
  #143 — standing up the wiki practice in the plugin repo itself, ingesting
  the two captured `raw/` sources into the first real wiki pages. Source:
  #143.
