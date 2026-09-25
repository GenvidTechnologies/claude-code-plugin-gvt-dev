// Git state-mutation guard — PreToolUse entry point.
//
// NOT wired into hooks.json yet (gvt-dev #557/#566): this ships the
// classifier, the entry script, and its tests as a standalone unit so it can
// be reviewed and exercised before it's added to the Bash matcher alongside
// pre-commit-lint.js.
//
// Reads a PreToolUse Bash payload from stdin (`agent_id`, `agent_type`,
// `tool_input.command`), classifies the command via
// lib/git-state-guard.mjs, and — mirroring pre-commit-lint.js's
// fail-open, exit-2-to-block convention — writes the denial reason to
// stderr and exits 2 when the guard denies, or exits 0 otherwise (allow,
// or any failure to parse/load, since a hook that can't confidently
// classify must never block).
import { pathToFileURL } from 'node:url';

import { classify } from './lib/git-state-guard.mjs';

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString('utf8');
}

// Dynamic-imported so a missing/broken shell-quote install fails open
// (exit 0) instead of crashing the hook and blocking every Bash call.
async function defaultLoadParse() {
  const mod = await import('shell-quote');
  return mod.parse;
}

export async function run({ stdin = process.stdin, loadParse = defaultLoadParse, write = (s) => process.stderr.write(s) } = {}) {
  let raw;
  try {
    raw = await readStream(stdin);
  } catch {
    return 0;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return 0;
  }

  const command = payload?.tool_input?.command;
  if (typeof command !== 'string' || command.trim() === '') {
    return 0;
  }

  let parse;
  try {
    parse = await loadParse();
  } catch {
    return 0;
  }
  if (typeof parse !== 'function') {
    return 0;
  }

  let result;
  try {
    result = classify({ agent_id: payload?.agent_id, agent_type: payload?.agent_type, command }, parse);
  } catch {
    return 0;
  }

  if (result?.deny) {
    write((result.reason || 'Blocked by git-state-guard.') + '\n');
    return 2;
  }

  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().then((code) => process.exit(code));
}
