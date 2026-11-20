import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_WIKI_DIR,
  RESERVED_PATH_KEYS,
  effectiveWikiDir,
  resolveExpectationPath,
  resolveDeclaredPath,
  resolveDocsRoot,
  overrideFindings,
  wikiDerivedDefault,
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
  assert.deepEqual(resolveDocsRoot({}), { root: 'docs', indexFile: 'TOC.md', unrepresentable: false });
  assert.deepEqual(resolveDocsRoot(undefined), { root: 'docs', indexFile: 'TOC.md', unrepresentable: false });
});

test('resolveDocsRoot: relocates to the override\'s directory', () => {
  const r = resolveDocsRoot({ 'docs/TOC.md': 'documentation/INDEX.md' });
  assert.deepEqual(r, { root: 'documentation', indexFile: 'INDEX.md', unrepresentable: false });
});

test('resolveDocsRoot: a repo-root override is unrepresentable, root stays "docs"', () => {
  const r = resolveDocsRoot({ 'docs/TOC.md': 'INDEX.md' });
  assert.deepEqual(r, { root: 'docs', indexFile: 'TOC.md', unrepresentable: true });
});

test('resolveDocsRoot: the unrepresentable fallback filename is unconditional, not the override\'s basename', () => {
  // A second, differently-named repo-root override: the fallback must still be
  // "TOC.md", so the pairing above isn't an artifact of that one input.
  assert.deepEqual(resolveDocsRoot({ 'docs/TOC.md': 'README.md' }), {
    root: 'docs',
    indexFile: 'TOC.md',
    unrepresentable: true,
  });
  assert.deepEqual(resolveDocsRoot({ 'docs/TOC.md': './INDEX.md' }), {
    root: 'docs',
    indexFile: 'TOC.md',
    unrepresentable: true,
  });
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

test('wiki-default: docs/TOC.md derives <wikiDir>/index.md', () => {
  assert.equal(DEFAULT_WIKI_DIR, 'wiki');
  assert.equal(wikiDerivedDefault('docs/TOC.md', 'wiki'), 'wiki/index.md');
  assert.equal(wikiDerivedDefault('docs/TOC.md', 'docs/wiki'), 'docs/wiki/index.md');
  assert.deepEqual(resolveDeclaredPath({}, 'docs/TOC.md'), { path: 'wiki/index.md', from: 'wiki-default' });
  assert.deepEqual(resolveDeclaredPath({ wiki: { wikiDir: 'kb' } }, 'docs/TOC.md'), {
    path: 'kb/index.md',
    from: 'wiki-default',
  });
  // A null config is the same as an empty one.
  assert.deepEqual(resolveDeclaredPath(null, 'docs/TOC.md'), { path: 'wiki/index.md', from: 'wiki-default' });
});

test('wiki-default: docs/<rest> derives <wikiDir>/<rest> and a directory keeps its slash', () => {
  assert.equal(wikiDerivedDefault('docs/decisions/', 'wiki'), 'wiki/decisions/');
  assert.equal(wikiDerivedDefault('docs/x/', 'wiki'), 'wiki/x/');
  assert.equal(wikiDerivedDefault('docs/issue-triage.md', 'wiki'), 'wiki/issue-triage.md');
  assert.equal(wikiDerivedDefault('docs/a/b.md', 'wiki'), 'wiki/a/b.md');
  // A nested wikiDir keeps its own separators.
  assert.equal(wikiDerivedDefault('docs/decisions/', 'docs/wiki'), 'docs/wiki/decisions/');
  assert.deepEqual(resolveDeclaredPath({ wiki: { wikiDir: 'docs/wiki' } }, 'docs/decisions/'), {
    path: 'docs/wiki/decisions/',
    from: 'wiki-default',
  });
  // wikiDir 'docs': derived equals declared, so nothing moved.
  assert.equal(wikiDerivedDefault('docs/decisions/', 'docs'), 'docs/decisions/');
  assert.deepEqual(resolveDeclaredPath({ wiki: { wikiDir: 'docs' } }, 'docs/decisions/'), {
    path: 'docs/decisions/',
    from: 'declared',
  });
});

test('wiki-default: a path outside docs/ is not derived', () => {
  assert.equal(wikiDerivedDefault('CLAUDE.md', 'wiki'), 'CLAUDE.md');
  assert.equal(wikiDerivedDefault('.gvt-agent.json', 'wiki'), '.gvt-agent.json');
  assert.equal(wikiDerivedDefault('documentation/x.md', 'wiki'), 'documentation/x.md');
  // The prefix must be the whole segment 'docs/'.
  assert.equal(wikiDerivedDefault('docsx/a.md', 'wiki'), 'docsx/a.md');
  assert.equal(wikiDerivedDefault('sub/docs/a.md', 'wiki'), 'sub/docs/a.md');
  // The exact path 'docs/' has an empty rest and is not derived.
  assert.equal(wikiDerivedDefault('docs/', 'wiki'), 'docs/');
  assert.deepEqual(resolveDeclaredPath({}, 'docs/'), { path: 'docs/', from: 'declared' });
  assert.deepEqual(resolveDeclaredPath({}, 'CLAUDE.md'), { path: 'CLAUDE.md', from: 'declared' });
});

test('wiki-default: an override wins over the derived default', () => {
  const config = { paths: { 'docs/TOC.md': 'documentation/INDEX.md' } };
  assert.deepEqual(resolveDeclaredPath(config, 'docs/TOC.md'), {
    path: 'documentation/INDEX.md',
    from: 'paths',
  });
  // The override wins over a configured wikiDir as well.
  const both = { paths: { 'docs/decisions/': 'adr/' }, wiki: { wikiDir: 'kb' } };
  assert.deepEqual(resolveDeclaredPath(both, 'docs/decisions/'), { path: 'adr/', from: 'paths' });
  // A different key's override leaves this path to the derived default.
  assert.deepEqual(resolveDeclaredPath(both, 'docs/TOC.md'), { path: 'kb/index.md', from: 'wiki-default' });
  // An override wins with `prefer` given too.
  assert.deepEqual(resolveDeclaredPath(config, 'docs/TOC.md', { prefer: ['wiki/index.md'] }), {
    path: 'documentation/INDEX.md',
    from: 'paths',
  });
  // A `prefer` entry never takes the wiki default: its own lookup lives elsewhere.
  assert.deepEqual(resolveDeclaredPath({}, 'docs/TOC.md', { prefer: ['wiki/index.md'] }), {
    path: 'docs/TOC.md',
    from: 'declared',
  });
  // A reserved key is never an override target.
  assert.deepEqual(resolveDeclaredPath({ paths: { plugin_root: 'plugin' } }, 'plugin_root'), {
    path: 'plugin_root',
    from: 'declared',
  });
});

test('wiki-default: wikiDir is wiki.wikiDir when set and not blank, else wiki, with or without the wiki block', () => {
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: 'kb' } }), 'kb');
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: 'docs/wiki' } }), 'docs/wiki');
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: '  kb  ' } }), 'kb');
  // One trailing separator is stripped, either kind.
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: 'kb/' } }), 'kb');
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: 'kb\\' } }), 'kb');
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: ' kb/ ' } }), 'kb');
  // Blank, missing, or not a string: the default.
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: '' } }), 'wiki');
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: '   ' } }), 'wiki');
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: 7 } }), 'wiki');
  assert.equal(effectiveWikiDir({ wiki: { wikiDir: null } }), 'wiki');
  assert.equal(effectiveWikiDir({ wiki: {} }), 'wiki');
  assert.equal(effectiveWikiDir({ wiki: null }), 'wiki');
  assert.equal(effectiveWikiDir({}), 'wiki');
  assert.equal(effectiveWikiDir(null), 'wiki');
  assert.equal(effectiveWikiDir(undefined), 'wiki');
  assert.equal(DEFAULT_WIKI_DIR, 'wiki');
});

test('wiki-default: a self-pinned override keeps the 5.x location', () => {
  const config = { paths: { 'docs/decisions/': 'docs/decisions/' } };
  assert.deepEqual(resolveDeclaredPath(config, 'docs/decisions/'), {
    path: 'docs/decisions/',
    from: 'paths',
  });
});

test('wiki-default: CONVENTIONS states the rule wikiDerivedDefault implements', () => {
  const conventions = readFileSync(fileURLToPath(new URL('../../../../CONVENTIONS.md', import.meta.url)), 'utf8');
  const tocSpan = '`docs/TOC.md` derives `<wikiDir>/index.md`';
  const restSpan = 'any other `docs/<rest>` derives `<wikiDir>/<rest>`';
  assert.ok(conventions.includes(tocSpan), `plugin/CONVENTIONS.md does not contain: ${tocSpan}`);
  assert.ok(conventions.includes(restSpan), `plugin/CONVENTIONS.md does not contain: ${restSpan}`);
  // The prose and the function are pinned together.
  assert.equal(wikiDerivedDefault('docs/TOC.md', 'wiki'), 'wiki/index.md');
  assert.equal(wikiDerivedDefault('docs/x/', 'wiki'), 'wiki/x/');
});
