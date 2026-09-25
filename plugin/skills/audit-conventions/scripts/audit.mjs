#!/usr/bin/env node
// Entrypoint. Before loading the audit body (component walk, expectation
// evaluation, the hygiene/pointer/principle scanners, --fix orchestration,
// and the report formatter — all of which live in audit-main.mjs), this
// bootstrap runs a preflight check of the plugin's own npm dependencies
// (issue #477). ESM links all static imports before any module-level code
// runs, so a missing or broken dependency pulled in by audit-main.mjs (or
// anything it imports) would otherwise surface as a raw, undiagnosable
// `ERR_MODULE_NOT_FOUND` stack — this preflight catches that case up front
// and prints an actionable message instead.
//
// Keep this file's static imports to node: built-ins and
// ./lib/dependency-preflight.mjs only — anything else risks pulling in the
// very dependency the preflight exists to check, which would defeat the
// point of running it first.
//
// Exit-code contract: 0/1 come from the audit body (see audit-main.mjs's
// own header comment). 2 here means the audit could not run — an
// unexpected error, or its own dependency is unavailable.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkPluginDependencies, formatPreflightFailure } from './lib/dependency-preflight.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(SCRIPT_DIR, '..', '..', '..'); // <plugin>/skills/audit-conventions/scripts -> <plugin>

let verdict;
try {
  verdict = await checkPluginDependencies({ pluginRoot: PLUGIN_ROOT, importer: (spec) => import(spec) });
} catch (err) {
  console.error(`audit.mjs: dependency preflight failed unexpectedly — ${String(err && err.message ? err.message : err).split('\n')[0]}`);
  process.exit(2);
}

if (!verdict.ok) {
  process.stderr.write(`${formatPreflightFailure(verdict)}\n`);
  process.exit(2);
}

try {
  await import('./audit-main.mjs');
} catch (err) {
  console.error(`audit.mjs: failed to load the audit body — ${String(err.message ?? err).split('\n')[0]}`);
  process.exit(2);
}
