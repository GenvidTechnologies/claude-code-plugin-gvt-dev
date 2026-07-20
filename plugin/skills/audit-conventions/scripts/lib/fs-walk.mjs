// Shared file-walking helpers used by migrate.mjs and hygiene checks.

import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';

export async function listFiles(repoRoot, sub, predicate) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(relative(repoRoot, full).split('\\').join('/'));
      }
    }
  }
  await walk(join(repoRoot, sub));
  return out;
}

// Recursively list *.md files under <repoRoot>/<sub>, returned repo-relative.
export async function listMarkdown(repoRoot, sub) {
  return listFiles(repoRoot, sub, (name) => name.endsWith('.md'));
}
