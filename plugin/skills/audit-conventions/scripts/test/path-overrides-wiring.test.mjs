// Integration test: `.gvt-agent.json`'s optional `paths` block (documented at
// CONVENTIONS.md:82) is wired into audit.mjs's two filesystem evaluators
// (evaluateFile, evaluateConfig) via lib/path-overrides.mjs's
// resolveExpectationPath, and unmatched/unusable override entries surface as
// a `path-override` warning finding via overrideFindings — rather than being
// silently inert, which was the defect (#383/#386): a consumer could set the
// documented example verbatim and nothing read it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { withTempMigratedRepo } from './helpers/temp-repo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/path-overrides-wiring.test.mjs -> scripts
const AUDIT_PATH = resolve(__dirname, '..', 'audit.mjs');

function spawnAudit(args, cwd) {
  return spawnSync(process.execPath, [AUDIT_PATH, ...args], { cwd, encoding: 'utf8' });
}

function writeConfig(dir, paths) {
  return writeFile(
    join(dir, '.gvt-agent.json'),
    JSON.stringify(
      { project: { name: 'foo' }, commands: { validate: 'echo ok' }, paths },
      null,
      2,
    ),
  );
}

// The load-bearing fixture: no docs/TOC.md, a real documentation/INDEX.md,
// and a `paths` override pointing the declared `docs/TOC.md` expectation at
// it. condense-lessons is the ONLY component that declares docs/TOC.md as
// `required: true` (every other declaration is `required: false`), so before
// this wiring landed this fixture reported a required-expectation error and
// exited 1 — measured directly against the pre-change audit.mjs:
//
//   EXIT=1
//   - **condense-lessons** expects `docs/TOC.md` — file not found. Reason: ...
//
// (plus 11 further `docs/TOC.md — file not found (optional)` info lines for
// the other components that declare it optionally).
test('audit: a paths override relocating docs/TOC.md satisfies the required condense-lessons expectation', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await mkdir(join(dir, 'documentation'), { recursive: true });
    await writeFile(join(dir, 'documentation', 'INDEX.md'), '# Index\n');
    await writeConfig(dir, { 'docs/TOC.md': 'documentation/INDEX.md' });
  });
  try {
    const result = spawnAudit([], tmpDir);

    assert.doesNotMatch(
      result.stdout,
      /docs\/TOC\.md.*not found/,
      'the override must resolve docs/TOC.md to documentation/INDEX.md for every declaring component',
    );
    assert.equal(
      result.status,
      0,
      `audit must exit 0 once the override satisfies condense-lessons' required docs/TOC.md:\n${result.stdout}`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: a paths override relocating a directory expectation (docs/decisions/) uses the resolved path for the directory check', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    await mkdir(join(dir, 'custom-decisions'), { recursive: true });
    await writeConfig(dir, { 'docs/decisions/': 'custom-decisions/' });
  });
  try {
    const result = spawnAudit([], tmpDir);

    // Before the resolved-path fix, the trailing-slash directory check ran
    // against the UNRESOLVED declared path (`docs/decisions/`), so a
    // relocated directory would still report missing even though
    // custom-decisions/ exists on disk.
    assert.doesNotMatch(
      result.stdout,
      /docs\/decisions\/.*directory not found/,
      'an existing custom-decisions/ directory reached via the override must satisfy docs/decisions/',
    );
    // Stronger: a FILE at the resolved path prints "expected a directory,
    // found a file", which the pattern above misses. Satisfied = no finding.
    assert.doesNotMatch(
      result.stdout,
      /expects `docs\/decisions\/`/,
      'a satisfied relocated docs/decisions/ expectation must produce no finding line',
    );
    assert.equal(result.status, 0);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: a paths override pointing docs/decisions/ at a MISSING directory is still reported', async () => {
  // Positive control for the relocation test's absence pattern.
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    await writeConfig(dir, { 'docs/decisions/': 'custom-decisions/' });
  });
  try {
    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /expects `docs\/decisions\/`/,
      'a relocated directory that does not exist must render an `expects` finding line',
    );
    assert.equal(result.status, 0, 'the expectation is optional, so the exit code stays 0');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: an unrecognized paths key surfaces a path-override warning finding', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    await writeConfig(dir, { 'docs/nonexistent-key.md': 'somewhere-else.md' });
  });
  try {
    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /paths key 'docs\/nonexistent-key\.md' does not match any declared expectation path — nothing reads this override/,
      'a paths key with no matching declared expectation must be flagged rather than silently inert',
    );
    assert.match(result.stdout, /### Warnings/, 'path-override findings render under Warnings');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: an empty paths override value surfaces a path-override warning finding', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    // docs/decisions/ is declared (create-adr, plan-task, tech-writer) and
    // always optional, so an unusable override here can't also trip a
    // required-expectation failure — isolates this assertion to the
    // path-override finding itself.
    await writeConfig(dir, { 'docs/decisions/': '' });
  });
  try {
    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /paths\['docs\/decisions\/'\] override value is empty or unusable/,
      'an empty override value must be flagged',
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// Live control: this repo's own real .gvt-agent.json `paths` is exactly
// `{"plugin_root": "plugin"}` — a RESERVED_PATH_KEYS entry, never a
// convention-file override target. It must never be flagged, and it must
// never gain a spurious ### Warnings section from this wiring.
test('audit: a plugin_root-only paths block (this repo\'s own shape) produces no path-override findings', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    await writeConfig(dir, { plugin_root: 'plugin' });
  });
  try {
    const result = spawnAudit([], tmpDir);

    assert.doesNotMatch(
      result.stdout,
      /paths key|path-override|does not match any declared expectation path/,
      'plugin_root is reserved — it must never be treated as an override target or flagged as unrecognized',
    );
    assert.equal(result.status, 0);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// The declared path decides the expected kind; a trailing slash on the override
// value (or its absence) must not change it (ADR-0077).
test('audit: an override value without a trailing slash still satisfies a declared directory (docs/decisions/)', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    await mkdir(join(dir, 'custom-decisions'), { recursive: true });
    await writeConfig(dir, { 'docs/decisions/': 'custom-decisions' });
  });
  try {
    const result = spawnAudit([], tmpDir);
    assert.doesNotMatch(result.stdout, /expects `docs\/decisions\/`/);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('audit: an override value with a trailing slash still satisfies a declared file (docs/TOC.md)', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await mkdir(join(dir, 'documentation'), { recursive: true });
    await writeFile(join(dir, 'documentation', 'INDEX.md'), '# Index\n');
    await writeConfig(dir, { 'docs/TOC.md': 'documentation/INDEX.md/' });
  });
  try {
    const result = spawnAudit([], tmpDir);
    assert.doesNotMatch(result.stdout, /expects `docs\/TOC\.md`/);
    assert.equal(result.status, 0, result.stdout);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---- #731: a relocated expectation names both the declared and resolved path ----

const CREATE_ADR_NO_OVERRIDE =
  '- **create-adr** expects `docs/decisions/` — directory not found (optional). Reason: Home for ADR files; scaffolded on first use if absent';

async function auditWithPaths(paths) {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    await writeConfig(dir, paths);
  });
  try {
    return spawnAudit([], tmpDir).stdout.split('\n');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test('audit: a relocated, missing docs/decisions/ names both the declared and the resolved path (#731)', async () => {
  const lines = await auditWithPaths({ 'docs/decisions/': 'wiki/decisions/' });
  const arrow = lines.filter((l) => l.includes('(→ `wiki/decisions/` via paths)'));
  assert.equal(arrow.length, 3, `create-adr, plan-task and tech-writer each name the arrow:\n${arrow.join('\n')}`);
  assert.ok(
    arrow.includes(
      '- **create-adr** expects `docs/decisions/` (→ `wiki/decisions/` via paths) — directory not found (optional). Reason: Home for ADR files; scaffolded on first use if absent',
    ),
    arrow.join('\n'),
  );
  assert.ok(lines.some((l) => /expects `docs\/decisions\/`/.test(l)));
});

test('audit: a relocated config file names both the declared and the resolved file on config findings (#731)', async () => {
  const lines = await auditWithPaths({ '.gvt-agent.json': 'cfg/agent.json' });
  const arrow = lines.filter((l) => l.includes('(→ `cfg/agent.json` via paths)'));
  assert.ok(arrow.length >= 1, 'config findings name the resolved file');
  assert.equal(lines.filter((l) => /in cfg\/agent\.json`/.test(l)).length, 0, 'the resolved-only target form is gone');
  assert.ok(
    arrow.includes(
      '- **validator** expects `commands.validate in .gvt-agent.json` (→ `cfg/agent.json` via paths) — cfg/agent.json not found. Reason: The shell command this agent runs verbatim',
    ),
    arrow.join('\n'),
  );
});

test('audit: a paths override replacing a prefer chain names the resolved path (#731)', async () => {
  const lines = await auditWithPaths({ 'docs/wiki-schema.md': 'kb/schema.md' });
  const line = lines.find((l) => l.startsWith('- **maintain-wiki**') && l.includes('`docs/wiki-schema.md` (→ `kb/schema.md` via paths)'));
  assert.ok(line, lines.filter((l) => l.includes('maintain-wiki')).join('\n'));
});

test('audit: an override equal to the declared path renders no arrow (#731)', async () => {
  const lines = await auditWithPaths({ 'docs/decisions/': 'docs/decisions/' });
  assert.ok(lines.includes(CREATE_ADR_NO_OVERRIDE), lines.filter((l) => l.includes('create-adr')).join('\n'));
  assert.equal(lines.filter((l) => l.includes('via paths')).length, 0);
});

test('audit: with no paths override, expectation findings render byte-identically and carry no arrow (#731)', async () => {
  const tmpDir = await withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    await writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ project: { name: 'foo' }, commands: { validate: 'echo ok' } }, null, 2),
    );
  });
  try {
    const out = spawnAudit([], tmpDir).stdout;
    const lines = out.split('\n');
    assert.ok(lines.includes(CREATE_ADR_NO_OVERRIDE));
    assert.ok(
      lines.includes(
        '- **maintain-wiki** expects `wiki/schema.md` or `docs/wiki-schema.md` — file not found (optional). Reason: The wiki\'s maintenance-rules schema (page format, create-vs-update lifecycle, raw/ immutability, staleness policy via stale_after, verb contract), resolved as the paths override for this key, else <wikiDir>/schema.md inside the bundle, else the legacy docs/wiki-schema.md; the skill offers to scaffold it, at the override path when one is set and else at <wikiDir>/schema.md, when none of the three exists',
      ),
    );
    assert.equal(out.split('via paths').length - 1, 0);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
