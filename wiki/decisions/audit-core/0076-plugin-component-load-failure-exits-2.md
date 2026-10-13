---
type: decision-record
title: 'A plugin component that cannot be loaded fails the audit with exit 2, after the full report, in every repo'
description: 'The audit turns audit-core 0.3.0 readError and parseError entries into error findings and exits 2 rather than skipping the component.'
tags: [decisions, audit-core]
status: stable
---
# 0076. A plugin component that cannot be loaded fails the audit with exit 2, after the full report, in every repo

- **Status:** accepted
- **Date:** 2026-10-13
- **Issue:** #648 (combined plan #157, #540)

## Context

ADR-0071 adopted `@genvidtech/audit-core`, and ADR-0057 (Q2) set the rule that the library never throws for an
expected condition. 0.3.0 closed the last exception to that rule: with audit-core#5, `loadComponent` resolves an
unreadable file to a `readError` entry instead of rejecting, and with audit-core#4's `yaml` swap it resolves
frontmatter the parser rejects to a `parseError` entry.

That change created a silent skip. Under 0.2.1 a read-denied component made the audit throw (exit 2, `EPERM`), and
a malformed one parsed anyway. Under 0.3.0 with nothing on the consumer side, the walker returns the entry and
the audit drops the component, so its `metadata.expects` vanish from the aggregate and the run exits 0. A
broken plugin would then read as a green audit, which is the defect the audit exists to catch.

ADR-0049 places the exit-code contract on the calling entrypoint, never on the library, so the audit has to decide
what a load failure means for the exit code. Three options existed.

## Decision

The audit converts each walked component carrying `readError` into an error finding of kind
`component-unreadable`, and each carrying `parseError` into one of kind `component-malformed`. When either is
present it prints its full report and then exits **2**. The diagnostic is not gated: it fires in consumer audits
as well as in this repo.

Chosen: **Exit 2: broken tool**. The documented meaning of 2 is "the audit could not run: a broken tool, not a
failed check", and an unreadable plugin component is exactly that. Unreadable files already exited 2 before
0.3.0, so this keeps their code and extends it to malformed ones. Printing the full report first keeps every
other finding visible.

## Compromise

- **Exit 2: broken tool** (chosen), as above.
- **Exit 1: unmet**, rejected. It conflates a plugin defect with the consumer's repo failing the contract, and the
  Summary would count the load failure as a "required expectation unmet" (#540).
- **Error in dogfood, warning in consumers**, rejected. A consumer audit would stay green over vanished
  expectations, which is the defect itself, and it contradicts #648's acceptance row asking for an error-level
  finding.

These were the only three options considered.

## Consequences

- The diagnostic is ungated, so a consumer whose installed plugin is damaged now sees exit 2 where it used to
  see a silent pass.
- The exit-code documentation in `plugin/CONVENTIONS.md` and the `audit-conventions` skill gains the clause that
  exit 2 also covers a plugin component that could not be loaded.
- The Summary gets its own load-failure line rather than counting these under unmet expectations; the fix for #540
  carries that line in the same change.
- ADR-0057 Q2 carries an amendment pointing here for how the audit reports the `readError` entry.
