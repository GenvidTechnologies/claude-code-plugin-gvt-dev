# Audit conventions

Decisions about the audit-conventions skill's checks, severities, and scanning scope.

## Records

* [A distinct `stale-config` state for the pre-rebrand `.genvid-agent.json` filename](0012-stale-config-migration-state.md) - The audit-conventions state detector gets a distinct stale-config state for the pre-rebrand genvid-agent.json filename.
* [Scope the `audit-conventions --fix` CONVENTIONS.md resync to the migrated state only](0013-migrated-state-conventions-resync-scoping.md) - The fix-mode CONVENTIONS.md resync is scoped to the migrated state only, leaving other states' skip-if-exists behavior intact.
* [Scan retired tokens in git-tracked config files, not by presence alone](0014-git-tracked-config-scan-for-retired-tokens.md) - The retired-token scanner's config coverage is intersected with git-tracked files so untracked local overrides can't trip false positives.
* [Extend CONVENTIONS.md resync to stale-config via a shared helper; scope the stale-config token report locally](0016-stale-config-conventions-resync-and-scoped-token-report.md) - The migrated-state CONVENTIONS.md resync is extracted into a shared helper and reused for the stale-config state and its token report.
* [Principle-citation findings are `error` severity, deviating from the all-`warning` author-time family](0019-principle-citation-error-severity.md) - principle-citation runs at error severity, unlike the all-warning author-time family, and an unparseable principles doc yields one finding.
* [Positional pointers are checked for a content anchor, at `error` severity behind the audited-repo gate, ratcheted by a repo-private baseline](0047-pointer-anchor-checker-error-severity-and-ratchet.md) - The positional-pointer checker verifies a re-derivable content anchor rather than range-checking, running at error severity behind a gate.
* [Pointer-anchor corpus includes `wiki/`; hygiene decisions exclusion follows `paths`](0064-pointer-anchor-wiki-corpus-and-decisions-exclusion-paths-override.md) - pointer-anchor's citing corpus gains the wiki directory at error severity, and the decisions exclusion now unions a paths override.
* [Baseline re-key on rename: `--rename` and `--allow-drift`](0065-baseline-rekey-on-rename-rename-and-allow-drift.md) - pointer-baseline.mjs gains a rename re-key mode, and allow-drift narrows the ratchet to one reviewed entry per run.
