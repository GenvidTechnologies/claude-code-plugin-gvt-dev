// Guard: this repository keeps its documentation in wiki/ and tracks no
// file under docs/ (ADR-0099). Tools such as the superpowers brainstorming
// and writing-plans skills write into docs/ by default, so the tree can come
// back unnoticed. commands.test and commands.validate run this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('no-docs-tree: this repository tracks no file under docs/', () => {
  const out = execFileSync('git', ['ls-files', '--', 'docs'], { cwd: ROOT, encoding: 'utf8' });
  assert.deepEqual(
    out.split('\n').filter(Boolean),
    [],
    'documentation lives in wiki/ (ADR-0099); move these files out of docs/',
  );
});
