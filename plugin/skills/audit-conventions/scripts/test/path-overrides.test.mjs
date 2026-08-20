import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESERVED_PATH_KEYS,
  resolveExpectationPath,
  resolveDocsRoot,
  overrideFindings,
} from '../lib/path-overrides.mjs';

test('resolveExpectationPath: exact key hit returns the override', () => {
  const r = resolveExpectationPath({ 'docs/TOC.md': 'wiki/index.md' }, 'docs/TOC.md');
  assert.equal(r, 'wiki/index.md');
});

test('resolveExpectationPath: miss returns the declared path unchanged', () => {
  const r = resolveExpectationPath({ 'docs/TOC.md': 'wiki/index.md' }, 'CLAUDE.md');
  assert.equal(r, 'CLAUDE.md');
});

test('resolveExpectationPath: plugin_root is reserved, never treated as an override', () => {
  const r = resolveExpectationPath({ plugin_root: 'plugin' }, 'plugin_root');
  assert.equal(r, 'plugin_root');
});

test('resolveExpectationPath: c3project is reserved, never treated as an override', () => {
  const r = resolveExpectationPath({ c3project: 'some/legacy/path' }, 'c3project');
  assert.equal(r, 'c3project');
});

test('resolveExpectationPath: trailing-slash directory override is preserved', () => {
  const r = resolveExpectationPath({ 'docs/decisions/': 'adr/' }, 'docs/decisions/');
  assert.equal(r, 'adr/');
});

test('resolveExpectationPath: handles paths being undefined, null, or {}', () => {
  assert.equal(resolveExpectationPath(undefined, 'docs/TOC.md'), 'docs/TOC.md');
  assert.equal(resolveExpectationPath(null, 'docs/TOC.md'), 'docs/TOC.md');
  assert.equal(resolveExpectationPath({}, 'docs/TOC.md'), 'docs/TOC.md');
});

test('resolveDocsRoot: defaults to "docs" when there is no override', () => {
  assert.deepEqual(resolveDocsRoot({}), { root: 'docs', unrepresentable: false });
  assert.deepEqual(resolveDocsRoot(undefined), { root: 'docs', unrepresentable: false });
});

test('resolveDocsRoot: relocates to the override\'s directory', () => {
  const r = resolveDocsRoot({ 'docs/TOC.md': 'documentation/INDEX.md' });
  assert.deepEqual(r, { root: 'documentation', unrepresentable: false });
});

test('resolveDocsRoot: a repo-root override is unrepresentable, root stays "docs"', () => {
  const r = resolveDocsRoot({ 'docs/TOC.md': 'INDEX.md' });
  assert.deepEqual(r, { root: 'docs', unrepresentable: true });
});

test('overrideFindings: flags a paths key matching nothing declared', () => {
  const findings = overrideFindings({ 'docs/GLOSSARY.md': 'wiki/glossary.md' }, ['docs/TOC.md']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warning');
  assert.equal(findings[0].kind, 'path-override');
  assert.equal(findings[0].key, 'docs/GLOSSARY.md');
});

test('overrideFindings: flags an empty/unusable override value', () => {
  const findings = overrideFindings({ 'docs/TOC.md': '' }, ['docs/TOC.md']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warning');
  assert.equal(findings[0].key, 'docs/TOC.md');
});

test('overrideFindings: a valid override against a declared path produces no findings', () => {
  const findings = overrideFindings({ 'docs/TOC.md': 'wiki/index.md' }, ['docs/TOC.md', 'CLAUDE.md']);
  assert.deepEqual(findings, []);
});

test('overrideFindings: returns [] for undefined/null/{} paths', () => {
  assert.deepEqual(overrideFindings(undefined, ['docs/TOC.md']), []);
  assert.deepEqual(overrideFindings(null, ['docs/TOC.md']), []);
  assert.deepEqual(overrideFindings({}, ['docs/TOC.md']), []);
});

test('RESERVED_PATH_KEYS pair: this repo\'s own paths={plugin_root:"plugin"} round-trips clean', () => {
  const paths = { plugin_root: 'plugin' };
  assert.equal(resolveExpectationPath(paths, 'plugin'), 'plugin');
  assert.deepEqual(overrideFindings(paths, ['docs/TOC.md', 'CLAUDE.md', 'commands.validate']), []);
});

test('RESERVED_PATH_KEYS is exactly [plugin_root, c3project]', () => {
  assert.deepEqual(RESERVED_PATH_KEYS, ['plugin_root', 'c3project']);
});
