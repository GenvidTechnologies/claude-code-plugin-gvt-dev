#!/usr/bin/env node
// CLI entrypoint for triage-issues' issue-refs script (#209). Sits beside its
// own lib/, the same shape as maintain-wiki's wiki-lint.mjs.
//
// The lib modules are pure; this file's only job is to parse argv, read the
// saved gh outputs it is pointed at, call the lib and print what it returns.
// It spawns nothing and makes no network call: every tracker or registry read
// is a command `plan` prints and the caller runs.
//
// Usage:
//   node issue-refs.mjs plan    --open <f> [--comments <f>] [--structure <f>]
//        [--comparison <f>] --repo <owner/repo> --limit <n> --cap <n>
//        [--order <f>] [--lookups <dir>] --state-template <t>
//        [--root <dir>] [--registry-cap <n>]
//   node issue-refs.mjs resolve <the same flags> [--non-interactive]
//   node issue-refs.mjs extract --single <readOne.json> [--repo <owner/repo>]
//
// Output: `plan` and `resolve` print one JSON object per line; `extract
// --single` prints one JSON object. Diagnostics go to stderr.
// Exit: 0 success, 1 lib error, 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { extract } from './lib/refs-grammar.mjs';
import { resolve, plan } from './lib/refs-resolve.mjs';

const USAGE = [
  'Usage:',
  '  node issue-refs.mjs plan --open <f> [--comments <f>] [--structure <f>] [--comparison <f>]',
  '       --repo <owner/repo> --limit <n> --cap <n> [--order <f>] [--lookups <dir>]',
  '       --state-template <t> [--root <dir>] [--registry-cap <n>]',
  '  node issue-refs.mjs resolve <same flags> [--non-interactive]',
  '  node issue-refs.mjs extract --single <readOne.json> [--repo <owner/repo>]',
].join('\n');

class UsageError extends Error {}

const OPTIONS = {
  single: { type: 'boolean' },
  open: { type: 'string' },
  comments: { type: 'string' },
  structure: { type: 'string' },
  comparison: { type: 'string' },
  repo: { type: 'string' },
  limit: { type: 'string' },
  cap: { type: 'string' },
  order: { type: 'string' },
  lookups: { type: 'string' },
  'state-template': { type: 'string' },
  root: { type: 'string' },
  'registry-cap': { type: 'string' },
  'non-interactive': { type: 'boolean' },
};

function requireFlag(values, name) {
  if (values[name] === undefined || values[name] === '') {
    throw new UsageError(`missing required flag --${name}`);
  }
  return values[name];
}

function checkRepo(repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || /^[.\/]+$/.test(repo)) {
    throw new UsageError('--repo must be owner/repo (letters, digits, dot, dash, underscore)');
  }
  return repo;
}

function intFlag(values, name) {
  const raw = values[name];
  if (!/^\d+$/.test(raw)) throw new UsageError(`--${name} must be a non-negative integer`);
  return Number(raw);
}

function readJson(flag, file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new UsageError(`--${flag}: cannot read ${file}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`--${flag}: ${file} is not valid JSON`);
  }
}

function readOrder(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new UsageError(`--order: cannot read ${file}`);
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d+$/.test(l))
    .map(Number);
}

// {key: rawText} for every <key>.json in the directory. The raw text is passed
// through untouched: the lib parses it (it may hold stdout plus stderr).
function readLookups(dir) {
  const out = {};
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!/^[\w.-]+\.json$/.test(name)) continue;
    try {
      out[name.slice(0, -'.json'.length)] = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      // unreadable entry (a directory, say): treated as absent
    }
  }
  return out;
}

function printLines(items) {
  for (const item of items) console.log(JSON.stringify(item));
}

function runPlanOrResolve(sub, values) {
  const repo = checkRepo(requireFlag(values, 'repo'));
  const openFile = requireFlag(values, 'open');
  const stateTemplate = requireFlag(values, 'state-template');
  const limit = intFlag({ limit: requireFlag(values, 'limit') }, 'limit');
  const cap = intFlag({ cap: requireFlag(values, 'cap') }, 'cap');
  const options = { repo, limit, cap, stateTemplate };
  if (values['registry-cap'] !== undefined) {
    options.registryCap = intFlag(values, 'registry-cap');
  }
  if (values.root !== undefined) options.root = values.root;
  if (values.order !== undefined) options.order = readOrder(values.order);
  if (values['non-interactive']) options.nonInteractive = true;

  const input = { open: readJson('open', openFile), lookups: {} };
  if (values.comments !== undefined) input.comments = readJson('comments', values.comments);
  if (values.structure !== undefined) input.structure = readJson('structure', values.structure);
  if (values.comparison !== undefined) input.comparison = readJson('comparison', values.comparison);
  if (values.lookups !== undefined) input.lookups = readLookups(values.lookups);

  return sub === 'plan' ? plan(input, options) : resolve(input, options);
}

function main(argv) {
  const [sub, ...rest] = argv;
  if (sub !== 'plan' && sub !== 'resolve' && sub !== 'extract') {
    console.error(`Unknown subcommand: ${sub === undefined ? '(none)' : sub}\n${USAGE}`);
    return 2;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, strict: true, options: OPTIONS });
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  try {
    if (sub === 'extract') {
      if (!values.single) throw new UsageError('extract requires --single');
      if (positionals.length !== 1) throw new UsageError('extract --single takes one readOne JSON file');
      const options = {};
      if (values.repo !== undefined) options.repo = checkRepo(values.repo);
      const issue = readJson('single', positionals[0]);
      const result = extract(issue, options);
      console.log(JSON.stringify({ refs: result.refs, triggers: result.triggers, banner: result.banner }));
      return 0;
    }
    printLines(runPlanOrResolve(sub, values));
    return 0;
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`${err.message}\n${USAGE}`);
      return 2;
    }
    throw err;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
