---
type: decision-record
title: 'A docs/ path in a component body is named only beside its resolution or recorded as a literal, and a repo test enforces it'
description: 'A skill or agent body names a declared docs/ path only beside its resolution; every other consumer docs/ literal is recorded in test/docs-path-literals.json with a kind and a note, and test/docs-path-prose.test.mjs checks the bodies at block level.'
tags: [decisions, plugin-structure]
status: stable
---
# 0103. A docs/ path in a component body is named only beside its resolution or recorded as a literal, and a repo test enforces it

- **Status:** accepted
- **Date:** 2026-11-20
- **Issue:** #388

## Context

A declared `docs/` path can be moved by a `paths` override, and a component resolves
the declared path through that override
([ADR-0062](0062-runtime-path-resolution-for-declared-expectations.md)). An ordinary
project doc is found through the documentation index and is never declared
([ADR-0100](0100-ordinary-project-docs-resolve-through-the-index-contract-files-stay-declared.md)).
A declared path has a default location that moves with the wiki
([ADR-0101](0101-document-locations-default-to-the-wiki.md)).

Those records fix the frontmatter. A skill or agent body is prose, and a body can still
tell the agent to read `docs/<file>` directly. In a repository that moved the file, that
read finds nothing and nothing reports it. The test of ADR-0100 reads frontmatter only,
so body prose was checked by review alone. #388 fixed the existing raw reads. Without a
guard, the next body edit can add one again.

Not every `docs/` string in a body is a read. A body also names `docs/` as an example, as
a path in another repository, as a place that a scan looks at on purpose, or as history.
A guard that flags every `docs/` string would be noise, and one that ignores all of them
would guard nothing.

## Decision

**1. The rule.** A skill or agent body names a declared `docs/` path only beside its
resolution: `paths['X']`, or the shared phrase "the file that `CONVENTIONS.md` "Runtime
path resolution" resolves for `X`". Every other consumer `docs/` literal in a body is
recorded in `test/docs-path-literals.json`, with a kind and a note. A hard-coded read of
a declared path is never recorded as deliberate. It is fixed.

**2. The guard.** `test/docs-path-prose.test.mjs` enforces the rule. It has 16 tests.
D1 to D6 run on the real tree. U1 to U10 run `scan()` on fixtures. The test uses node
builtins only and runs in `commands.test` and `commands.validate`. The corpus is the
agent bodies, the skill bodies and the shipped docs, with frontmatter stripped. It
derives the declared paths from the component frontmatter, 7 at landing, so a later
declaration or removal needs no edit to the test.

- D1: a block that names a declared path with no resolution beside it must be covered by
  a recorded literal.
- D2: a block that names any other consumer `docs/` path must be covered by a recorded
  literal.
- D3: each recorded literal's anchor matches exactly one block in its file, and that
  block still names the token with no resolution. A stale or ambiguous entry fails.
- D4: each entry has a kind from the closed list and a non-empty note.
- D5: each block that uses the resolution wording uses the shared phrase.
- D6: each key inside a resolution is a declared path or a known path declared by
  another plugin.

When the test fails, the message gives the file and line, the token, and a JSON entry to
paste, with `kind` and `note` left to fill in.

**3. Block granularity.** The test reads a block, not a line. A block is a paragraph, a
list item with its continuation lines, a table row, a heading, or one fenced-code line.
A resolution that wraps across two lines in the source stays in one block. A line-level
check gave false reds on hard-wrapped resolutions in `create-adr` and `triage-issues`.

**4. The kinds.** `kind` is a closed list. Each kind says why a literal is not a read of a
declared path. The counts are those of the recorded list at landing: 37 literals.

| Kind | Count | Meaning |
|---|---|---|
| `common-location-hint` | 14 | The sentence finds the doc through the documentation index and names the usual path only as the place to look when there is no index. |
| `example` | 4 | A sample command, a sample line of audit output, a table cell or a look-alike path that shows a format. It tells the reader to read nothing. |
| `plugin-defined-location` | 4 | A location that the skill itself defines as a fallback, or that another plugin writes by default, such as the dated records of the superpowers plugin. |
| `heuristic` | 4 | The folder is part of a rule that classifies files or defines a scan, for example "a markdown file outside `docs/` is a likely draft". |
| `describes-the-audit` | 3 | Prose about what the audit scans. It describes the audit's corpus and sends the reader nowhere. |
| `historical` | 3 | An earlier issue, an observed incident or a legacy location that a scan checks on purpose. It records what happened. |
| `other-repo` | 3 | A path in a different repository, such as a sibling plugin's runbook or a vendored dependency's decision folder. |
| `resolved-earlier` | 1 | The same sentence resolves the path. The note quotes the sentence that resolves it. |
| `plugin-tree` | 1 | The `docs/` folder of the plugin's own tree under `plugin_root`, not the consumer's documentation. |

To add a kind, change the list in the test and add a row to this table.

**5. A separate test file.** The guard is a separate file from
`test/expects-docs-contract.test.mjs`. That test checks declarations against an
allowlist. This one checks bodies against declarations. Each failure message then names
one rule.

## Compromise

Considered and rejected:

- **Line level, tier 1 only, with the literals recorded in an ADR table (Option A2).**
  Hard-wrap false reds, unless every wrapped resolution is reflowed. No guard on an
  ordinary-doc literal or on a `docs/` root literal. A table in an ADR drifts from the
  tree, because nothing ties the table to the lines.
- **An audit self-scan (Option A3).** `audit-conventions/scripts/**` belonged to another
  branch in this cycle. Severity, gating and findings plumbing are heavier than a repo
  test. A consumer could never act on it: the scan is plugin-only, as the
  `principle-citation` scan is.
- **File level.** One citation per file would pass every later raw read. Example: a line
  in `triage-issues` that says `docs/TOC.md` is never written would pass because an
  earlier line of the file resolves it.
- **A blanket rule for the `triage-issues` sentence "every later mention".** It would
  pass any future raw read below that sentence. Per-block `resolved-earlier` entries
  replace it.
- **Inline clauses in each body (Question B2).** They add runtime tokens for every
  consumer, they need edits in other components' files, and nothing checks them
  mechanically.
- **An ADR table only (Question B3).** It drifts.
- **A per-component declaration rule.** It would fire on the decisions line of
  `code-reviewer`, which cites `paths['docs/decisions/']` while `code-reviewer` does not
  declare `docs/decisions/`. The override check is global.
- **No ADR (Question E2).** The kinds and the granularity are trade-offs that a later
  author would reopen.

## Consequences

- A change that adds a `docs/` path to a body fails `commands.validate` until the path is
  resolved or recorded. The failure message prints an entry to paste.
- A recorded literal cannot silently outlive its line. D3 fails an entry whose anchor
  matches no block, or more than one block, or whose block no longer names the token.
- Recording a literal needs a kind and a note, so a reviewer sees each exception and the
  reason for it in the diff.
- The test checks that a path is beside its resolution. It does not check that the
  resolution is correct for the sentence. Review still reads the new prose.
- The test and the literal list are one more pair of files for a maintainer to know. The
  maintainer rule that points at them is in the maintainer wiki.
