# 0002. Self-declaring skill contract via `metadata.expects`

- **Status:** accepted
- **Date:** 2026-05-31
- **Issue:** none — established at the v2.0.0 public release (decision predates the public repo; pinned to its first recorded appearance)

## Context

Retroactive record. The plugin's skills and agents only work when the consuming repo
supplies a small convention contract (`CLAUDE.md`, `CONVENTIONS.md`, `docs/TOC.md`,
`.genvid-agent.json`, plus per-skill files, config keys, and tools). Something had to (a)
record what each component needs and (b) let a repo check whether it satisfies those needs
before a skill fails mid-run. The contract is also non-uniform: most expectations are
universal, but some are needed by exactly one skill (`package.json` only for
`publish-npm-package`) and must not be imposed on unrelated repos.

## Decision

Each skill/agent **declares its own prerequisites** in YAML frontmatter under a custom
`metadata.expects` block — `files`, `config` keys (with their `in:` source), and `tools`,
each with a mandatory `reason`. The `audit-conventions` skill reads these declarations
across every installed component, **aggregates the required ones**, and validates a repo
against the union, printing each item's `reason` when it is missing. `required: true` is
the default; `required: false` marks a skill-conditional expectation that the aggregator
must **not** fold into the repo-wide contract.

Architecture: the contract is distributed into the components that own it (no central
schema to drift out of sync), and a single read-only auditor reconstructs the whole-repo
view on demand. Top-level frontmatter stays Anthropic-standard; custom data lives under
`metadata` so `claude plugin validate` accepts it.

## Compromise

Alternatives rejected:

- **A central schema file** listing every repo's obligations — drifts from the skills it
  describes; every skill edit risks a stale central file.
- **Prose-only expectations in skill bodies** — not machine-checkable, so no audit.
- **All expectations `required: true`** — a single skill-specific file (e.g.
  `package.json`) would fail every repo that doesn't use that skill.

The cost: the `required: false` lever must be kept honest by authors (a mis-marked
required expectation silently widens the aggregated contract), which is why adding a skill
includes re-running the audit to prove the contract didn't widen.

## Consequences

`audit-conventions` can validate or migrate a repo (`--fix`) entirely from the components'
own declarations; the eval harness grades whether the skill drives off the validator vs.
hand-rolling. The contract is the public surface documented in [0006](0006-two-surface-external-system-pattern.md)'s
external-system pattern and elsewhere. Self-declaration is what makes the
[`${CLAUDE_PLUGIN_ROOT}`](0003-plugin-root-path-substitution.md) and pipeline records'
components portable across consuming repos.
