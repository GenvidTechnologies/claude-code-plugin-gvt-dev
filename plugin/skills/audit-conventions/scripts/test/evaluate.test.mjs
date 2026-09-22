import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { evaluateFile, evaluateConfig, evaluateTool } from '../lib/evaluate.mjs';

const component = { name: 'some-skill' };

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'evaluate-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// 1. satisfied file
test('evaluateFile: satisfied', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'CLAUDE.md');
    await writeFile(filePath, 'hi\n');
    const entry = { path: 'CLAUDE.md', reason: 'Required file' };
    const resolve = () => ({ path: filePath, probe: 'file', target: 'CLAUDE.md' });
    const f = await evaluateFile(component, entry, resolve);
    assert.equal(f.ok, true);
    assert.deepEqual(f, {
      kind: 'file', component: 'some-skill', target: 'CLAUDE.md', ok: true, required: true,
    });
  });
});

// 2. satisfied config
test('evaluateConfig: satisfied', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, '.gvt-agent.json');
    await writeFile(filePath, JSON.stringify({ project: { name: 'genvid' } }));
    const entry = { key: 'project.name', reason: 'Required config key' };
    const resolve = () => ({ path: filePath, source: '.gvt-agent.json', target: 'project.name in .gvt-agent.json' });
    const f = await evaluateConfig(component, entry, resolve);
    assert.equal(f.ok, true);
    assert.deepEqual(f, {
      kind: 'config', component: 'some-skill', target: 'project.name in .gvt-agent.json', ok: true, required: true,
    });
  });
});

// 3. satisfied tool
test('evaluateTool: satisfied', () => {
  const entry = { command: 'node', reason: 'Required tool' };
  const f = evaluateTool(component, entry);
  assert.equal(f.ok, true);
  assert.deepEqual(f, {
    kind: 'tool', component: 'some-skill', target: 'node', ok: true, required: true,
  });
});

// 4. unsatisfied file
test('evaluateFile: unsatisfied', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'MISSING.md');
    const entry = { path: 'MISSING.md', reason: 'Required file' };
    const resolve = () => ({ path: filePath, probe: 'file', target: 'MISSING.md' });
    const f = await evaluateFile(component, entry, resolve);
    assert.equal(f.ok, false);
    assert.equal(f.severity, 'error');
    assert.equal(f.detail, 'file not found');
  });
});

// 5. unsatisfied config
test('evaluateConfig: unsatisfied (key not found)', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, '.gvt-agent.json');
    await writeFile(filePath, JSON.stringify({ project: {} }));
    const entry = { key: 'project.name', reason: 'Required config key' };
    const resolve = () => ({ path: filePath, source: '.gvt-agent.json', target: 'project.name in .gvt-agent.json' });
    const f = await evaluateConfig(component, entry, resolve);
    assert.equal(f.ok, false);
    assert.equal(f.severity, 'error');
    assert.equal(f.detail, 'key not found (path broke at "project.name")');
  });
});

// 6. unsatisfied tool
test('evaluateTool: unsatisfied', () => {
  const entry = { command: 'definitely-not-a-real-command-xyz', reason: 'Required tool' };
  const f = evaluateTool(component, entry);
  assert.equal(f.ok, false);
  assert.equal(f.severity, 'error');
  assert.equal(f.detail, 'command not found on PATH');
});

// 7. satisfied findings carry exactly the 5-key shape, across all three kinds
test('satisfied findings: exactly 5 keys, all three kinds', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'CLAUDE.md');
    await writeFile(filePath, 'hi\n');
    const configPath = join(dir, '.gvt-agent.json');
    await writeFile(configPath, JSON.stringify({ project: { name: 'genvid' } }));

    const fileFinding = await evaluateFile(
      component,
      { path: 'CLAUDE.md', reason: 'r' },
      () => ({ path: filePath, probe: 'file', target: 'CLAUDE.md' }),
    );
    const configFinding = await evaluateConfig(
      component,
      { key: 'project.name', reason: 'r' },
      () => ({ path: configPath, source: '.gvt-agent.json', target: 'project.name in .gvt-agent.json' }),
    );
    const toolFinding = evaluateTool(component, { command: 'node', reason: 'r' });

    const expectedKeys = ['component', 'kind', 'ok', 'required', 'target'];
    assert.deepEqual(Object.keys(fileFinding).sort(), expectedKeys);
    assert.deepEqual(Object.keys(configFinding).sort(), expectedKeys);
    assert.deepEqual(Object.keys(toolFinding).sort(), expectedKeys);
  });
});

// 8. unsatisfied findings carry exactly the 8-key shape, across all three kinds
test('unsatisfied findings: exactly 8 keys, all three kinds', async () => {
  await withTempDir(async (dir) => {
    const missingFilePath = join(dir, 'MISSING.md');
    const missingConfigPath = join(dir, 'MISSING.json');

    const fileFinding = await evaluateFile(
      component,
      { path: 'MISSING.md', reason: 'r' },
      () => ({ path: missingFilePath, probe: 'file', target: 'MISSING.md' }),
    );
    const configFinding = await evaluateConfig(
      component,
      { key: 'project.name', reason: 'r' },
      () => ({ path: missingConfigPath, source: 'MISSING.json', target: 'project.name in MISSING.json' }),
    );
    const toolFinding = evaluateTool(component, { command: 'definitely-not-a-real-command-xyz', reason: 'r' });

    const expectedKeys = ['component', 'detail', 'kind', 'ok', 'reason', 'required', 'severity', 'target'];
    assert.deepEqual(Object.keys(fileFinding).sort(), expectedKeys);
    assert.deepEqual(Object.keys(configFinding).sort(), expectedKeys);
    assert.deepEqual(Object.keys(toolFinding).sort(), expectedKeys);
  });
});

// 9. required: false yields severity 'info' and a detail ending ' (optional)';
//    required yields 'error' and no suffix
test('required vs optional: severity and detail suffix', async () => {
  await withTempDir(async (dir) => {
    const missingPath = join(dir, 'MISSING.md');
    const resolve = () => ({ path: missingPath, probe: 'file', target: 'MISSING.md' });

    const requiredFinding = await evaluateFile(component, { path: 'MISSING.md', reason: 'r' }, resolve);
    assert.equal(requiredFinding.severity, 'error');
    assert.equal(requiredFinding.detail.endsWith(' (optional)'), false);

    const optionalFinding = await evaluateFile(component, { path: 'MISSING.md', required: false, reason: 'r' }, resolve);
    assert.equal(optionalFinding.severity, 'info');
    assert.equal(optionalFinding.detail.endsWith(' (optional)'), true);
  });
});

// 10. evaluateConfig: missing file vs. unreadable/malformed file are different branches
test('evaluateConfig: missing file vs. malformed file produce different detail branches', async () => {
  await withTempDir(async (dir) => {
    const missingPath = join(dir, 'MISSING.json');
    const missingFinding = await evaluateConfig(
      component,
      { key: 'project.name', reason: 'r' },
      () => ({ path: missingPath, source: 'MISSING.json', target: 'project.name in MISSING.json' }),
    );
    assert.equal(missingFinding.detail, 'MISSING.json not found');

    const malformedPath = join(dir, 'BAD.json');
    await writeFile(malformedPath, '{ not valid json');
    const malformedFinding = await evaluateConfig(
      component,
      { key: 'project.name', reason: 'r' },
      () => ({ path: malformedPath, source: 'BAD.json', target: 'project.name in BAD.json' }),
    );
    assert.match(malformedFinding.detail, /^BAD\.json unreadable \(/);
    assert.notEqual(missingFinding.detail, malformedFinding.detail);
  });
});

// 11. evaluateConfig: key does not resolve
test('evaluateConfig: unresolvable key reports where the path broke', async () => {
  await withTempDir(async (dir) => {
    const configPath = join(dir, '.gvt-agent.json');
    await writeFile(configPath, JSON.stringify({ commands: {} }));
    const f = await evaluateConfig(
      component,
      { key: 'commands.validate', reason: 'r' },
      () => ({ path: configPath, source: '.gvt-agent.json', target: 'commands.validate in .gvt-agent.json' }),
    );
    assert.equal(f.detail, 'key not found (path broke at "commands.validate")');
  });
});

// 12. the probe-noun case: resolve's `probe` drives the rendered noun, from the
//     same code path (ADR-0057 verdict A / verdict C proved by execution)
test('evaluateFile: probe noun renders directory vs. file from the same code path', async () => {
  await withTempDir(async (dir) => {
    const missingDirPath = join(dir, 'missing-dir');
    const dirFinding = await evaluateFile(
      component,
      { path: 'missing-dir/', reason: 'r' },
      () => ({ path: missingDirPath, probe: 'directory', target: 'missing-dir/' }),
    );
    assert.equal(dirFinding.detail, 'directory not found');

    const missingFilePath = join(dir, 'missing-file.md');
    const fileFinding = await evaluateFile(
      component,
      { path: 'missing-file.md', reason: 'r' },
      () => ({ path: missingFilePath, probe: 'file', target: 'missing-file.md' }),
    );
    assert.equal(fileFinding.detail, 'file not found');
  });
});
