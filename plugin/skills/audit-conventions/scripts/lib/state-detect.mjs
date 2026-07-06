import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const NEW_CONFIG = '.gvt-agent.json';
const LEGACY_CONFIG = 'claude-config.json';
const STALE_CONFIG = '.genvid-agent.json';
const GITMODULES = '.gitmodules';
const LEGACY_SUBMODULE_NAME = 'burbank-claude-config';

export const STATE_GREENFIELD = 'greenfield';
export const STATE_LEGACY = 'legacy';
export const STATE_MIGRATED = 'migrated';
export const STATE_STALE_CONFIG = 'stale-config';

export async function detectState(repoRoot) {
  const [legacySubmodule, legacyConfig, newConfig, staleConfig] = await Promise.all([
    hasLegacySubmodule(repoRoot),
    fileExists(join(repoRoot, LEGACY_CONFIG)),
    fileExists(join(repoRoot, NEW_CONFIG)),
    fileExists(join(repoRoot, STALE_CONFIG)),
  ]);

  if (legacySubmodule || legacyConfig) return STATE_LEGACY;
  if (newConfig) return STATE_MIGRATED;
  if (staleConfig) return STATE_STALE_CONFIG;
  return STATE_GREENFIELD;
}

async function hasLegacySubmodule(repoRoot) {
  const content = await readIfExists(join(repoRoot, GITMODULES));
  if (!content) return false;
  return content.includes(LEGACY_SUBMODULE_NAME);
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(path) {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}
