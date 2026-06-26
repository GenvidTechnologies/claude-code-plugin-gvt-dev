import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  detectState,
  STATE_GREENFIELD,
  STATE_LEGACY,
  STATE_MIGRATED,
} from '../lib/state-detect.mjs';

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'audit-test-'));
  try {
    await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

test('detectState: empty directory -> greenfield', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    assert.equal(await detectState(dir), STATE_GREENFIELD);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectState: .gvt-agent.json present, no submodule -> migrated', async () => {
  const dir = await withTempRepo(async (d) => {
    await fs.writeFile(join(d, '.gvt-agent.json'), '{}');
  });
  try {
    assert.equal(await detectState(dir), STATE_MIGRATED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectState: legacy claude-config.json present -> legacy', async () => {
  const dir = await withTempRepo(async (d) => {
    await fs.writeFile(join(d, 'claude-config.json'), '{}');
  });
  try {
    assert.equal(await detectState(dir), STATE_LEGACY);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectState: burbank-claude-config submodule -> legacy', async () => {
  const dir = await withTempRepo(async (d) => {
    await fs.writeFile(
      join(d, '.gitmodules'),
      '[submodule "burbank-claude-config"]\n\tpath = burbank-claude-config\n\turl = https://...\n',
    );
  });
  try {
    assert.equal(await detectState(dir), STATE_LEGACY);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectState: legacy submodule + new config -> still legacy (partial migration)', async () => {
  const dir = await withTempRepo(async (d) => {
    await fs.writeFile(join(d, '.gvt-agent.json'), '{}');
    await fs.writeFile(
      join(d, '.gitmodules'),
      '[submodule "burbank-claude-config"]\n\tpath = burbank-claude-config\n\turl = https://...\n',
    );
  });
  try {
    assert.equal(await detectState(dir), STATE_LEGACY);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectState: .gitmodules without burbank-claude-config -> not legacy on that signal alone', async () => {
  const dir = await withTempRepo(async (d) => {
    await fs.writeFile(
      join(d, '.gitmodules'),
      '[submodule "other-thing"]\n\tpath = vendor\n\turl = https://...\n',
    );
    // No config file either
  });
  try {
    assert.equal(await detectState(dir), STATE_GREENFIELD);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
