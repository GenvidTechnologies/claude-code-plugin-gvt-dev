# Skill shapes

Decisions about how individual skills are shaped, dispatch, and gate their own behavior.

## Records

* [create-adr skill: dispatch to tech-writer, shared template, and third-writer safety](0011-create-adr-skill-dispatch-design.md) - create-adr delegates all writes to tech-writer, moves the ADR template to plugin docs, and gates renumbering with a clean-tree dry run.
* [build-probe adopts a pure-discipline shape, deviating from the five-part pattern](0018-build-probe-pure-discipline.md) - build-probe ships as a pure-discipline skill with no analyst subagent and no bundled generic probes.
* [Near-miss contract resolution in `triage-issues`](0020-near-miss-contract-resolution.md) - triage-issues detects a near-miss conventions doc and resolves it to one of four outcomes rather than auto-renaming it.
* [`run-retro`'s cache-lags-source gate stays skill-local, with a bidirectional `CLAUDE.md` pointer](0023-skill-local-gate-with-pointer.md) - run-retro's cache-lags-source verification gate stays skill-local, with a bidirectional pointer from CLAUDE.md's dogfooding caveat.
* [`renumber-adrs`: recursive theme discovery, single-pass whole-filename token rewrite, and frozen-history exclusion](0063-renumber-adrs-recursive-themes-single-pass-token-rewrite.md) - renumber-adrs discovers ADRs recursively as one chronological sequence and rewrites every citing form in a single whole-filename-token pass.
* [ADR authoring resolves the decisions location through `paths`; the `CLAUDE.md`-declared location is retired](0066-adr-authoring-resolves-decisions-location-retires-claude-md-fallback.md) - ADR authoring resolves the decisions location and next number through the renumber-adrs script, retiring the informal CLAUDE.md fallback.
* [Triage label recipes remove only the other labels, and a readback gates the `triaged` stamp](0083-label-recipes-remove-only-other-labels-readback-gates-stamp.md) - triage-issues set recipes add the target label and remove only the other labels in its set; a label readback gates the triaged stamp; a legacy guard covers already-scaffolded contracts.
* [Near-miss detection nominates and vetoes, and contract registration follows the contract's location](0084-near-miss-nominate-plus-veto-registration-follows-location.md) - triage-issues nominates a near-miss on either signal with vetoes outranking both, never removes a stale duplicate under --force, registers a wiki-located contract in the wiki index, and scaffolds into the wiki by default.
