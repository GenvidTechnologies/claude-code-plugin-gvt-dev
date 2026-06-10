import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inferHostFromRemote, detectHostDrift } from '../lib/host-drift.mjs';

test('inferHostFromRemote: https GitHub', () => {
  assert.equal(inferHostFromRemote('https://github.com/genvid-holdings/repo.git'), 'github');
});

test('inferHostFromRemote: ssh GitHub', () => {
  assert.equal(inferHostFromRemote('git@github.com:genvid-holdings/repo.git'), 'github');
});

test('inferHostFromRemote: https Bitbucket', () => {
  assert.equal(inferHostFromRemote('https://bitbucket.org/genvid/repo.git'), 'bitbucket');
});

test('inferHostFromRemote: ssh Bitbucket', () => {
  assert.equal(inferHostFromRemote('git@bitbucket.org:genvid/repo.git'), 'bitbucket');
});

test('inferHostFromRemote: case-insensitive', () => {
  assert.equal(inferHostFromRemote('https://GitHub.com/Org/Repo.git'), 'github');
});

test('inferHostFromRemote: unrecognized host -> null', () => {
  assert.equal(inferHostFromRemote('https://gitlab.com/org/repo.git'), null);
});

test('inferHostFromRemote: empty / non-string -> null', () => {
  assert.equal(inferHostFromRemote(''), null);
  assert.equal(inferHostFromRemote(null), null);
  assert.equal(inferHostFromRemote(undefined), null);
});

test('detectHostDrift: mismatch -> { configured, inferred }', () => {
  assert.deepEqual(
    detectHostDrift({ configuredHost: 'bitbucket', remoteUrl: 'https://github.com/o/r.git' }),
    { configured: 'bitbucket', inferred: 'github' },
  );
});

test('detectHostDrift: agreement -> null', () => {
  assert.equal(
    detectHostDrift({ configuredHost: 'github', remoteUrl: 'git@github.com:o/r.git' }),
    null,
  );
});

test('detectHostDrift: absent configuredHost -> null (optional/inferred)', () => {
  assert.equal(detectHostDrift({ configuredHost: undefined, remoteUrl: 'https://github.com/o/r' }), null);
  assert.equal(detectHostDrift({ configuredHost: '', remoteUrl: 'https://github.com/o/r' }), null);
});

test('detectHostDrift: no remote / unresolvable -> null (stay silent)', () => {
  assert.equal(detectHostDrift({ configuredHost: 'github', remoteUrl: '' }), null);
  assert.equal(detectHostDrift({ configuredHost: 'github', remoteUrl: 'https://gitlab.com/o/r' }), null);
});
