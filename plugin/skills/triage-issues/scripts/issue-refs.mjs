#!/usr/bin/env node
// CLI entrypoint for triage-issues' issue-refs script (#209). Sits beside its
// own lib/, the same shape as maintain-wiki's wiki-lint.mjs.
//
// The lib modules are pure; this file's only job is to parse argv, call them
// and print what they return.
//
// Usage:
//   node issue-refs.mjs plan [args]
//   node issue-refs.mjs resolve [args]
//   node issue-refs.mjs extract --single [args]
//
// SKELETON. Each known subcommand calls into the lib, which throws
// `not implemented` until a later task lands the logic.

import { parseArgs } from 'node:util';

import { extract } from './lib/refs-grammar.mjs';
import { resolve, plan } from './lib/refs-resolve.mjs';

const USAGE = [
  'Usage:',
  '  node issue-refs.mjs plan [args]',
  '  node issue-refs.mjs resolve [args]',
  '  node issue-refs.mjs extract --single [args]',
].join('\n');

function main(argv) {
  const [sub, ...rest] = argv;
  if (sub !== 'plan' && sub !== 'resolve' && sub !== 'extract') {
    console.error(`Unknown subcommand: ${sub === undefined ? '(none)' : sub}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: false,
    options: { single: { type: 'boolean' } },
  });
  let out;
  if (sub === 'plan') out = plan({ values, positionals });
  else if (sub === 'resolve') out = resolve({ values, positionals });
  else if (values.single) out = extract({ values, positionals });
  else {
    console.error(`extract requires --single\n${USAGE}`);
    return 2;
  }
  console.log(JSON.stringify(out, null, 2));
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
