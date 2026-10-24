---
type: decision-record
title: 'A prefer chain probes each candidate for its kind and stops at one it cannot examine, through one resolver shared by the audit and practice-detect'
description: 'resolveCandidate replaces the boolean exists loops: an unexaminable candidate stops the chain, the declared path sets the kind, and the trailing slash is stripped before probing.'
tags: [decisions, audit-conventions]
status: stable
---
# 0077. A prefer chain probes each candidate for its kind and stops at one it cannot examine, through one resolver shared by the audit and practice-detect

- **Status:** accepted
- **Date:** 2026-10-13
- **Issue:** #671 (related: #679, #672; refines [ADR-0070](../wiki-and-okf/0070-wiki-schema-resolves-inside-the-bundle-amends-0015.md) decision 1)

## Context

[ADR-0070](../wiki-and-okf/0070-wiki-schema-resolves-inside-the-bundle-amends-0015.md) decision 1 set one
resolution order for a `metadata.expects` files entry that carries `prefer`: the `paths` override, then the
bundle location, then the legacy location. It said the order is "shared by every consumer", and it left open what
"exists" means for a candidate.

audit-core 0.4.0 added `probePath`, which stats a path, then lstats it to confirm absence, and returns one of
`file`, `directory`, `other`, `absent` or `error`. Before it, gvt-dev walked the candidates with the boolean
`fileExists` and `dirExists`. Those return false on any stat failure. A preferred candidate that existed but
could not be examined (permission denied, a symlink loop, a dangling link) was therefore treated as absent, and
resolution fell through to the next candidate without a word (#671). The audit could then report a different
schema than the one the repo's owner had pointed at.

Two further defects sat beside it:

- The trailing slash of a declared directory stayed in the probed path, and `stat('file/')` behaves differently by
  platform.
- `practice-detect` carried its own copy of the boolean loop, which is the duplication ADR-0070 decision 1 ruled
  out.

Measured on 2026-10-13, on audit-core 0.4.0, the platform split in `probePath` before any stripping:

| Path | Windows, Node 24.11.1 | Linux (WSL2), Node 20.19.2 |
|---|---|---|
| `afile/` | file | absent |
| `afile` plus a backslash | file | absent |
| `afile//` | file | absent |
| `adir/` | directory | directory |
| `nope/` | absent | not listed |
| dangling link `dlink` | error ENOENT | error ENOENT |
| `dlink/` | error ENOENT | **absent** |

So a file at a slash path, and a dangling link at a slash path, gave different answers on the two platforms. A
dangling link in particular is an `error` on Windows and an `absent` on Linux, which would have let the stop rule
below fire on one platform only.

The Linux column was measured on Node 20.19.2 (WSL2), below the supported Node 22 (audit-core 0.4.0 declares `node >=22`). `stat`'s trailing-separator behaviour is a kernel property, not a Node one, but that is an inference, not a measurement. The supported-runtime check is the end-to-end directory tests running on CI's ubuntu Node 22 job.

## Decision

The resolver is `resolveCandidate` in `plugin/skills/audit-conventions/scripts/lib/candidate-resolution.mjs`.
It takes the probe as an injected argument (default `probePath`).

**1. One shared resolver, used by both consumers.** The audit's `resolveFile` and `practice-detect`'s schema
signal both call `resolveCandidate`. The policy is written once and unit-tested with a stub probe.

**2. The stop rule.** Candidates are walked in order.

- A candidate holding the expected kind satisfies the entry.
- A candidate that cannot be examined (`kind: 'error'`) stops the chain and is reported in its own state.
- A candidate of the wrong kind, or of kind `other`, is passed over, and the unmet finding names it, for example
  "`x` was passed over (found a directory)". The text comes from `formatCandidateTarget` in the same module.
- The last candidate is the answer when nothing earlier stopped the chain.

**3. The kind comes from the declared path's trailing slash, never the candidate's.** `expectedKind` reads the
entry's declared `path`. An override says where the thing lives, not what it is.

**4. Trailing `/` and `\` are stripped from a candidate before it is joined and probed.** `probeRelPath` applies
`/[\\/]+$/`, so every platform examines the same path and the platform split in the table above cannot reach the
stop rule. The precedent is `expandPrefer` in `lib/expect-prefer.mjs`, which strips the same character class from
`wikiDir`.

**5. `practice-detect`'s schema signal is `satisfied` from the same resolver.** An `error` candidate gives
`schemaDoc: false`, so the Environment row agrees with the audit's finding. A wrong-kind or `other` candidate
that is not last falls through. A wrong-kind last candidate gives false. Presence-only holds (ADR-0015 decision
2), because `probePath` only stats: it never lists a directory or reads a file.

**6. Rendering.** When every candidate is absent, the unmet finding renders exactly as it did before. Otherwise it
names the candidate the detail describes, followed by any passed-over notes.

## Compromise

Structure:

- Chosen: Option A, "one shared resolver module with an injected probe, used by both consumers".
- Rejected: Option B, "adopt `probePath` inline at each site" — it writes the policy twice against ADR-0070 decision 1, and the audit-main copy is not unit-testable.
- Rejected: Option C, "ask upstream for a candidate-aware `evaluateFile`" — ADR-0070 Compromise rejects widening a shared leaf for one expectation.

Wrong-kind candidate:

- Chosen: Option B2, fall through: only `error` stops the chain, and a passed-over candidate is named in an unmet finding.
- Rejected: Option A2, stop on any non-absent candidate — it reports unmet where maintain-wiki can read the legacy schema, and flips practice-detect to partial.

Kind source:

- Chosen: the noun comes from the declared `entry.path`.
- Rejected: the noun from the candidate's slash. The rationale: "An override says where the thing lives, not what it is."

These were the only options considered.

Accepted residuals:

- If a directory sits at `wiki/schema.md` and `docs/wiki-schema.md` is a real file, the entry is satisfied and
  the stray directory is not mentioned. This is the same class as ADR-0070's shadowed duplicate.
- A consumer `paths` override whose value's slash disagrees with its key's slash changes meaning, because the
  kind now follows the declared key, in both directions. A declared `docs/decisions/` with an override value
  `adr` (no slash) over a real `adr/` directory was unmet and is now satisfied. A declared `docs/TOC.md` with an override `docs/TOC/`
  pointing at a directory was satisfied and is now unmet, reading `expected a file, found a directory`; for a
  required entry that changes the audit's exit to 1. An override says where the thing lives, not what it is,
  and this was chosen deliberately. It is unvalidated across consumers; 0 of this repo's 2 content overrides
  are affected.

## Consequences

- A preferred candidate that exists but cannot be read now surfaces as its own finding and as
  `schemaDoc: false`, instead of resolving silently to a later location.
- The audit and the Environment row cannot disagree about which candidate answered, because both read the same
  result.
- Evidence. Mutation testing on 2026-10-13 against commit 6be07b6 (638 tests): each rule has a test that fails
  when the rule is removed, namely the error stop, the pass-over, the strip, the declared-path kind, and
  `practice-detect`'s wiring. This repo's own audit output is byte-identical before and after the change.
- ADR-0070 carries an amendment pointer to this record.

**Related:** ADR-0070 (decision 1 refined), ADR-0015, ADR-0062, #671, #679, #672.

**Amendment (2026-10-24, #731).** [ADR-0082](0082-the-audit-report-names-what-it-actually-examined.md) adds the
one-candidate counterpart of decision 6's rendering: when a `paths` override relocated an expectation, the finding
reads ``expects `<declared>` (→ `<resolved>` via paths)``, built by `formatOverrideTarget`. The decisions above are
left as written.
