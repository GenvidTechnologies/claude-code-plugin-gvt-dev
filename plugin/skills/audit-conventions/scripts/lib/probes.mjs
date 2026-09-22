// Filesystem/command existence probes used to evaluate metadata.expects
// entries. Extracted verbatim from audit.mjs for the audit-core package
// split (#457).

import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';

export async function fileExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [cmd], { stdio: 'pipe' });
  return result.status === 0;
}
