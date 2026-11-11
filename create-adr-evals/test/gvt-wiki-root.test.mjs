// create-adr-evals/test/gvt-wiki-root.test.mjs
//
// Unit tests for gvt-wiki-root.mjs. Env, home folder and file reads are
// injected; the real home is never read.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gvtWikiRoot } from '../gvt-wiki-root.mjs';

const KEY = 'gvt-wiki@gvt-plugins';
const homedir = () => '/home/fake';
const installed = (entries) => () => JSON.stringify({ plugins: { [KEY]: entries } });

test('gvtWikiRoot: GVT_WIKI_ROOT wins over installed_plugins.json', () => {
  const root = gvtWikiRoot({
    env: { GVT_WIKI_ROOT: '/override/gvt-wiki' },
    homedir,
    readFile: installed([{ scope: 'user', installPath: '/installed/gvt-wiki' }]),
  });
  assert.equal(root, '/override/gvt-wiki');
});

test('gvtWikiRoot: picks the user-scope install of gvt-wiki@gvt-plugins', () => {
  const root = gvtWikiRoot({
    env: {},
    homedir,
    readFile: installed([
      { scope: 'project', installPath: '/project/gvt-wiki' },
      { scope: 'user', installPath: '/user/gvt-wiki' },
    ]),
  });
  assert.equal(root, '/user/gvt-wiki');
});

test('gvtWikiRoot: falls back to the first install that has an installPath', () => {
  const root = gvtWikiRoot({
    env: {},
    homedir,
    readFile: installed([
      { scope: 'project' },
      { scope: 'local', installPath: '/local/gvt-wiki' },
      { scope: 'project', installPath: '/project/gvt-wiki' },
    ]),
  });
  assert.equal(root, '/local/gvt-wiki');
});

test('gvtWikiRoot: throws naming GVT_WIKI_ROOT when no gvt-wiki install is recorded', () => {
  assert.throws(
    () =>
      gvtWikiRoot({
        env: {},
        homedir,
        readFile: () => JSON.stringify({ plugins: { 'other@gvt-plugins': [{ installPath: '/x' }] } }),
      }),
    /GVT_WIKI_ROOT/,
  );
});

test('gvtWikiRoot: throws naming the file when installed_plugins.json cannot be read', () => {
  assert.throws(
    () =>
      gvtWikiRoot({
        env: {},
        homedir,
        readFile: () => {
          throw new Error('ENOENT');
        },
      }),
    (err) => /installed_plugins\.json/.test(err.message) && /GVT_WIKI_ROOT/.test(err.message),
  );
});
