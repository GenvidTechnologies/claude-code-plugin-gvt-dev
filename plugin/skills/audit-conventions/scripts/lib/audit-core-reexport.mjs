// Plugin-side seam through which code OUTSIDE the plugin package scope
// reaches audit-core (ADR-0071). The `#audit-core` import alias is declared in
// plugin/package.json `imports`, so it does not resolve from outside the
// plugin package, and the scoped package name itself is blocked there by
// .github/scripts/leak-guard.sh. Such callers import this module instead.
//
// Plugin-internal code imports '#audit-core' directly and does not go through
// this file. The export list is an explicit named list, never `export *`, so
// widening the seam is a deliberate edit.

export { extractFrontmatter } from '#audit-core';
