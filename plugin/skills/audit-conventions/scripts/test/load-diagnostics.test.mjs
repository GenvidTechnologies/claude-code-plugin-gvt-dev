// Unit tests for lib/load-diagnostics.mjs: the per-component load-failure
// diagnostics and the exit-code mapping. The end-to-end wiring into the real
// audit is covered by load-diagnostics-wiring.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFailureDiagnostics, auditExitCode } from '../lib/load-diagnostics.mjs';

const normal = { type: 'skill', name: 'fine-skill', expects: { files: [] }, frontmatter: { name: 'fine-skill' } };
const unreadable = {
  type: 'agent',
  name: 'locked-agent',
  expects: null,
  frontmatter: null,
  readError: { code: 'EACCES', message: 'permission denied, open locked-agent.md' },
};
const malformed = {
  type: 'skill',
  name: 'broken-skill',
  expects: null,
  frontmatter: null,
  parseError: { code: 'BLOCK_AS_IMPLICIT_KEY', message: 'Nested mappings are not allowed in compact mappings' },
};

test('loadFailureDiagnostics: a component with a readError yields one error diagnostic of kind component-unreadable', () => {
  const result = loadFailureDiagnostics([unreadable]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'component-unreadable');
  assert.equal(result[0].ok, false);
  assert.equal(result[0].severity, 'error');
});

test('loadFailureDiagnostics: the readError detail names the component type, name, error code and message', () => {
  const [d] = loadFailureDiagnostics([unreadable]);
  assert.match(d.detail, /agent/);
  assert.match(d.detail, /locked-agent/);
  assert.match(d.detail, /EACCES/);
  assert.match(d.detail, /permission denied, open locked-agent\.md/);
});

test('loadFailureDiagnostics: a component with a parseError yields one error diagnostic of kind component-malformed', () => {
  const result = loadFailureDiagnostics([malformed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'component-malformed');
  assert.equal(result[0].ok, false);
  assert.equal(result[0].severity, 'error');
});

test('loadFailureDiagnostics: the parseError detail names the component type, name, error code and message', () => {
  const [d] = loadFailureDiagnostics([malformed]);
  assert.match(d.detail, /skill/);
  assert.match(d.detail, /broken-skill/);
  assert.match(d.detail, /BLOCK_AS_IMPLICIT_KEY/);
  assert.match(d.detail, /Nested mappings are not allowed in compact mappings/);
});

test('loadFailureDiagnostics: the detail says the plugin\'s own component failed, so it reads as a plugin defect', () => {
  const [d] = loadFailureDiagnostics([malformed]);
  assert.match(d.detail, /plugin/i);
  assert.match(d.detail, /plugin defect/);
});

test('loadFailureDiagnostics: a normal component yields no diagnostic', () => {
  assert.deepEqual(loadFailureDiagnostics([normal]), []);
});

test('loadFailureDiagnostics: an empty component list yields no diagnostic', () => {
  assert.deepEqual(loadFailureDiagnostics([]), []);
});

test('loadFailureDiagnostics: a mixed list yields diagnostics only for the failed components, in order', () => {
  const result = loadFailureDiagnostics([normal, unreadable, normal, malformed]);
  assert.deepEqual(result.map((d) => d.kind), ['component-unreadable', 'component-malformed']);
  assert.match(result[0].detail, /locked-agent/);
  assert.match(result[1].detail, /broken-skill/);
});

test('auditExitCode: no findings exits 0', () => {
  assert.equal(auditExitCode([]), 0);
});

test('auditExitCode: warning and info findings alone exit 0', () => {
  assert.equal(auditExitCode([{ kind: 'desc-length', severity: 'warning' }, { kind: 'note', severity: 'info' }]), 0);
});

test('auditExitCode: an error finding that is not a load failure exits 1', () => {
  assert.equal(auditExitCode([{ kind: 'file', severity: 'error' }]), 1);
});

test('auditExitCode: a component-unreadable finding exits 2', () => {
  assert.equal(auditExitCode([{ kind: 'component-unreadable', severity: 'error' }]), 2);
});

test('auditExitCode: a component-malformed finding exits 2', () => {
  assert.equal(auditExitCode([{ kind: 'component-malformed', severity: 'error' }]), 2);
});

test('auditExitCode: a load failure alongside another error finding still exits 2', () => {
  assert.equal(
    auditExitCode([{ kind: 'file', severity: 'error' }, { kind: 'component-malformed', severity: 'error' }]),
    2,
  );
});

test('auditExitCode: the diagnostics produced by loadFailureDiagnostics exit 2', () => {
  assert.equal(auditExitCode(loadFailureDiagnostics([malformed])), 2);
});
