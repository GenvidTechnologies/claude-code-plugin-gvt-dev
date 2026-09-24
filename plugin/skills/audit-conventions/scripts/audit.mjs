#!/usr/bin/env node
// Entrypoint. The audit body (component walk, expectation evaluation, the
// hygiene/pointer/principle scanners, --fix orchestration, and the report
// formatter) lives in audit-main.mjs — this file just loads it. A later
// change adds a dependency preflight here, before the body loads (issue
// #477). Keep this file's static imports to node: built-ins (and later
// ./lib/dependency-preflight.mjs) only — ESM links all static imports
// before any module-level code runs, so a static import of audit-main.mjs
// (or anything it pulls in) here would defeat the point of a preflight.
//
// Exit-code contract: 0/1 come from the audit body (see audit-main.mjs's
// own header comment). 2 here means the audit could not run at all.
try {
  await import('./audit-main.mjs');
} catch (err) {
  console.error(`audit.mjs: failed to load the audit body — ${String(err.message ?? err).split('\n')[0]}`);
  process.exit(2);
}
