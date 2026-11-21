// Guard: a component declares a docs/ path in metadata.expects only for a
// contract file, a file whose location the plugin itself defines (ADR-0100).
// An ordinary project doc, such as an architecture or coding-conventions doc,
// is found through the documentation index instead, because the project
// decides where it lives. A declared ordinary doc reports "file not found
// (optional)" in every repository that keeps it elsewhere, while the
// component reads nothing (#363). commands.test and commands.validate run
// this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugin');

// The docs/ files whose location the plugin defines. To add one, first decide
// that the plugin owns its location (a skill scaffolds it, or reads it at a
// fixed heading), then add it here and in the ADR-0100 list.
const CONTRACT_DOCS = new Set([
  'docs/TOC.md',
  'docs/decisions/',
  'docs/code-review-context.md',
  'docs/code-review-docs.md',
  'docs/code-review-patterns.md',
  'docs/issue-triage.md',
  'docs/acceptance/',
]);

// Returns every `path:` value under the frontmatter that starts with docs/.
export function docsExpectations(text) {
  const m = /^---\r?\n([^]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return [];
  const paths = [];
  for (const line of m[1].split(/\r?\n/)) {
    const p = /^\s+-\s+path:\s*["']?(docs\/[^"'\s]*)/.exec(line);
    if (p) paths.push(p[1]);
  }
  return paths;
}

function componentFiles() {
  const files = [];
  const agents = join(PLUGIN, 'agents');
  for (const f of readdirSync(agents)) {
    if (f.endsWith('.md')) files.push(join(agents, f));
  }
  const skills = join(PLUGIN, 'skills');
  for (const d of readdirSync(skills)) {
    const f = join(skills, d, 'SKILL.md');
    if (existsSync(f)) files.push(f);
  }
  return files;
}

test('expects-docs-contract: the parser finds a declared docs/ path and ignores the body', () => {
  const text = [
    '---',
    'name: example',
    'metadata:',
    '  expects:',
    '    files:',
    '      - path: docs/architecture.md',
    '        required: false',
    '      - path: CLAUDE.md',
    '---',
    '',
    '      - path: docs/runbook.md',
  ].join('\n');
  assert.deepEqual(docsExpectations(text), ['docs/architecture.md']);
});

test('expects-docs-contract: every docs/ path a component declares is a contract file (ADR-0100)', () => {
  const files = componentFiles();
  assert.ok(files.length > 20, `expected the plugin's skills and agents, found ${files.length} files`);
  const found = [];
  const offenders = [];
  for (const f of files) {
    for (const p of docsExpectations(readFileSync(f, 'utf8'))) {
      found.push(p);
      if (!CONTRACT_DOCS.has(p)) offenders.push(`${f.slice(ROOT.length + 1).split('\\').join('/')}: ${p}`);
    }
  }
  assert.ok(found.length > 0, 'expected at least one declared docs/ path; the parser may be broken');
  assert.deepEqual(
    offenders,
    [],
    'an ordinary project doc is found through the documentation index, not declared in metadata.expects (ADR-0100)',
  );
});
