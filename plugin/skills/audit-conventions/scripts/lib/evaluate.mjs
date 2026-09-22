// Evaluates metadata.expects entries (files, config keys, tools) into
// expectation findings. Extracted from audit.mjs for the audit-core package
// split (#457).
//
// This module is repo-root-blind: it does no path resolution of its own. A
// caller-supplied `resolve` closure does that work and hands back an
// already-resolved absolute path plus display strings (ADR-0057 verdict A).
// `evaluateFile`'s resolve also reports which probe to run (`file` vs.
// `directory`) -- that probe choice is policy, not mechanism, per the same
// verdict -- and the returned noun is rendered verbatim into `detail`
// (ADR-0057 verdict C). None of the three evaluators throw for an expected
// condition -- a missing file/directory, an unreadable or malformed config,
// an unresolvable key, or a command absent from PATH all return a finding
// (ADR-0057 Q2).

import { promises as fs } from 'node:fs';

import { fileExists, dirExists, commandExists } from './probes.mjs';
import { resolveKey } from './config-resolve.mjs';

export async function evaluateFile(component, entry, resolve) {
  const required = entry.required !== false;
  const { path, probe, target } = resolve(entry);
  const exists = probe === 'directory' ? await dirExists(path) : await fileExists(path);

  if (exists) {
    return { kind: 'file', component: component.name, target, ok: true, required };
  }
  return {
    kind: 'file', component: component.name, target, ok: false, required,
    severity: required ? 'error' : 'info',
    detail: `${probe} not found${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

export async function evaluateConfig(component, entry, resolve) {
  const required = entry.required !== false;
  const { path, source, target } = resolve(entry);

  let parsed;
  try {
    const raw = await fs.readFile(path, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      kind: 'config', component: component.name, target,
      ok: false, required, severity: required ? 'error' : 'info',
      detail: err.code === 'ENOENT' ? `${source} not found` : `${source} unreadable (${err.message})`,
      reason: entry.reason,
    };
  }

  const result = resolveKey(parsed, entry.key);
  if (result.found) {
    return { kind: 'config', component: component.name, target, ok: true, required };
  }
  return {
    kind: 'config', component: component.name, target,
    ok: false, required, severity: required ? 'error' : 'info',
    detail: `key not found (path broke at "${result.missingAt}")${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

export function evaluateTool(component, entry) {
  const required = entry.required !== false;
  const exists = commandExists(entry.command);

  if (exists) {
    return { kind: 'tool', component: component.name, target: entry.command, ok: true, required };
  }
  return {
    kind: 'tool', component: component.name, target: entry.command, ok: false, required,
    severity: required ? 'error' : 'info',
    detail: `command not found on PATH${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}
