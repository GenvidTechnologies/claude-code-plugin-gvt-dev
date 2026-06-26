import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import {
  translateLegacyConfig,
  planGreenfield,
  planLegacy,
  applyPlan,
  scanDanglingReferences,
} from '../lib/migrate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test -> scripts -> audit-conventions -> skills -> plugin -> repo root.
// The plugin lives under plugin/, so PLUGIN_ROOT (4 up) holds skeleton/ while
// REPO_ROOT (5 up) holds examples/ and the consuming-repo dogfood surfaces.
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..'); // 5 up = repo root
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..', '..');     // 4 up = plugin/

const SNAPSHOT = {
  templates: [
    { source: 'agents/designer/designer.md.tmpl', target: '.claude/agents/designer/designer.md' },
    { source: 'agents/code-reviewer/code-reviewer.md.tmpl', target: '.claude/agents/code-reviewer/code-reviewer.md' },
    { source: 'hooks/pre-commit-lint.js', target: '.claude/hooks/pre-commit-lint.js' },
  ],
  auto_generated_marker: 'AUTO-GENERATED from burbank-claude-config templates',
};
const MARKER = SNAPSHOT.auto_generated_marker;

async function withTempRepo(setup) {
  const dir = await mkdtemp(join(tmpdir(), 'migrate-test-'));
  try {
    await setup(dir);
    return dir;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

async function writeRepoFile(dir, rel, content) {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

test('translateLegacyConfig: minimal legacy -> defaults', () => {
  const out = translateLegacyConfig({});
  assert.equal(out.project.name, '<your-project-name>');
  assert.deepEqual(out.commands, { test: '', lint: '', build: '', validate: '' });
  assert.deepEqual(out.repo, {});
  assert.deepEqual(out.features, {});
  assert.deepEqual(out.paths, {});
});

test('translateLegacyConfig: project name -> project.name', () => {
  const out = translateLegacyConfig({ project: 'burbank' });
  assert.equal(out.project.name, 'burbank');
});

test('translateLegacyConfig: BASE_BRANCH "main" is dropped (default)', () => {
  const out = translateLegacyConfig({
    variables: { BASE_BRANCH: 'main' },
  });
  assert.equal(out.repo.default_branch, undefined);
});

test('translateLegacyConfig: BASE_BRANCH non-default -> repo.default_branch', () => {
  const out = translateLegacyConfig({
    variables: { BASE_BRANCH: 'development' },
  });
  assert.equal(out.repo.default_branch, 'development');
});

test('translateLegacyConfig: HAS_TDD_NOTES true -> features.tdd', () => {
  const out = translateLegacyConfig({
    features: { HAS_TDD_NOTES: true },
  });
  assert.equal(out.features.tdd, true);
});

test('translateLegacyConfig: HAS_TDD_NOTES false -> features.tdd absent', () => {
  const out = translateLegacyConfig({
    features: { HAS_TDD_NOTES: false },
  });
  assert.equal(out.features.tdd, undefined);
});

test('translateLegacyConfig: blocks are silently dropped (project-specific content moves to CLAUDE.md)', () => {
  const out = translateLegacyConfig({
    project: 'foo',
    blocks: { COMMIT_FORMAT: 'long string', DOCS_TABLE: '...' },
  });
  assert.equal(out.project.name, 'foo');
  // No blocks key in output at all.
  assert.equal('blocks' in out, false);
});

test('translateLegacyConfig: unknown variables drop silently', () => {
  const out = translateLegacyConfig({
    project: 'foo',
    variables: { REPO_SLUG: 'org/repo', TICKET_PREFIX: 'XYZ', CO_AUTHOR_MODEL: 'old' },
  });
  // None of these have a mapping; nothing in repo/features.
  assert.deepEqual(out.repo, {});
  assert.deepEqual(out.features, {});
});

test('translateLegacyConfig: scripts populate commands.*', () => {
  const out = translateLegacyConfig(
    { project: 'foo' },
    { scripts: { test: 'npm test', lint: 'eslint .', build: '', validate: 'npm run all' } },
  );
  assert.equal(out.commands.test, 'npm test');
  assert.equal(out.commands.lint, 'eslint .');
  assert.equal(out.commands.validate, 'npm run all');
});

test('translateLegacyConfig: legacy-sample fixture -> valid new config shape', async () => {
  const examplePath = resolve(REPO_ROOT, 'examples', 'claude-config.legacy-sample.json');
  const sample = JSON.parse(await fs.readFile(examplePath, 'utf8'));

  const out = translateLegacyConfig(sample);

  // Schema-shape checks
  assert.equal(typeof out.project, 'object');
  assert.equal(typeof out.project.name, 'string');
  assert.equal(typeof out.commands, 'object');
  assert.equal(typeof out.repo, 'object');
  assert.equal(typeof out.features, 'object');
  assert.equal(typeof out.paths, 'object');

  // Known mappings from the committed fixture
  assert.equal(out.project.name, 'bunny');
  assert.equal(out.repo.default_branch, 'development'); // from BASE_BRANCH
  assert.equal(out.features.tdd, true);                 // from HAS_TDD_NOTES

  // #8: real commands derived from the legacy declarations (not npm defaults)
  assert.equal(out.commands.test, 'pnpm run test:min');
  assert.equal(out.commands.lint, 'pnpm run lint');
  assert.equal(out.commands.validate, 'pnpm run lint && pnpm run test:min');

  // Output JSON-serializes cleanly
  assert.doesNotThrow(() => JSON.stringify(out));
});

// ---------------------------------------------------------------------------
// #8 — map the legacy config's real commands (not generic npm placeholders)
// ---------------------------------------------------------------------------

test('translateLegacyConfig: PACKAGE_MANAGER + TEST_COMMAND + blocks -> real commands', () => {
  const out = translateLegacyConfig({
    project: 'burbank',
    variables: { PACKAGE_MANAGER: 'pnpm', TEST_COMMAND: 'pnpm run test:min' },
    blocks: {
      VALIDATION_COMMANDS_BASH: 'pnpm run lint\npnpm run overriden:validate\npnpm run test:min',
      REVIEW_COMMANDS: 'pnpm run lint && pnpm run test:min',
    },
  });
  assert.equal(out.commands.test, 'pnpm run test:min');
  assert.equal(out.commands.lint, 'pnpm run lint');
  assert.equal(out.commands.validate, 'pnpm run lint && pnpm run test:min');
});

test('translateLegacyConfig: lint/build extracted from VALIDATION_COMMANDS_BASH when no REVIEW_COMMANDS', () => {
  const out = translateLegacyConfig({
    variables: { PACKAGE_MANAGER: 'pnpm' },
    blocks: { VALIDATION_COMMANDS_BASH: 'pnpm run lint\npnpm run build\npnpm run test:min' },
  });
  assert.equal(out.commands.lint, 'pnpm run lint');
  assert.equal(out.commands.build, 'pnpm run build');
  // validate falls back to the joined bash lines when REVIEW_COMMANDS is absent
  assert.equal(out.commands.validate, 'pnpm run lint && pnpm run build && pnpm run test:min');
});

test('translateLegacyConfig: legacy declarations take precedence over package.json scripts', () => {
  const out = translateLegacyConfig(
    { variables: { PACKAGE_MANAGER: 'pnpm', TEST_COMMAND: 'pnpm run test:min' } },
    { scripts: { test: 'npm test', lint: 'npm run lint', build: '', validate: 'npm run lint && npm test' } },
  );
  assert.equal(out.commands.test, 'pnpm run test:min'); // not 'npm test'
});

// ---------------------------------------------------------------------------
// #5 — honor LOCAL EDIT marker before deleting rendered files
// ---------------------------------------------------------------------------

test('planLegacy: rendered file with LOCAL EDIT block is skipped, not deleted', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/agents/designer/designer.md',
      `<!-- ${MARKER} -->\n\n<!-- LOCAL EDIT: friction-audit checks -->\nlocal content\n`);
    await writeRepoFile(d, '.claude/agents/code-reviewer/code-reviewer.md',
      `<!-- ${MARKER} -->\n\npristine content\n`);
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const deletes = plan.actions.filter((a) => a.type === 'delete-file').map((a) => a.path);
    const notes = plan.actions.filter((a) => a.type === 'note').map((a) => a.summary);

    assert.ok(!deletes.some((p) => p.includes('designer.md')), 'designer.md must NOT be deleted');
    assert.ok(deletes.some((p) => p.includes('code-reviewer.md')), 'pristine code-reviewer.md should be deleted');
    assert.ok(notes.some((s) => s.includes('designer.md') && /LOCAL EDIT/.test(s)),
      'a prominent note must flag the LOCAL EDIT file');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #25 — greenfield scaffold must not clobber pre-existing convention files
// ---------------------------------------------------------------------------

test('planGreenfield: empty repo scaffolds all four files', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const plan = await planGreenfield(dir, PLUGIN_ROOT);
    const writes = plan.actions.filter((a) => a.type === 'write-file').map((a) => a.path);
    assert.ok(writes.some((p) => p.endsWith('CONVENTIONS.md')), 'CONVENTIONS.md scaffolded');
    assert.ok(writes.some((p) => p.endsWith('CLAUDE.md')), 'CLAUDE.md scaffolded');
    assert.equal(plan.actions.filter((a) => a.type === 'note').length, 0, 'no SKIPPED notes on empty repo');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planGreenfield: scaffold content is sourced verbatim from skeleton/', async () => {
  const dir = await withTempRepo(async () => {});
  try {
    const plan = await planGreenfield(dir, PLUGIN_ROOT);
    const writeFor = (suffix) => plan.actions.find((a) => a.type === 'write-file' && a.path.endsWith(suffix));

    const agentCfg = writeFor('.gvt-agent.json');
    assert.equal(agentCfg.content, await fs.readFile(join(PLUGIN_ROOT, 'skeleton/.gvt-agent.json'), 'utf8'));
    assert.doesNotThrow(() => JSON.parse(agentCfg.content), 'skeleton .gvt-agent.json must be valid JSON');

    const claudeMd = writeFor('CLAUDE.md');
    assert.equal(claudeMd.content, await fs.readFile(join(PLUGIN_ROOT, 'skeleton/CLAUDE.md'), 'utf8'));
    assert.match(claudeMd.content, /@CONVENTIONS\.md/, 'skeleton CLAUDE.md must keep the @CONVENTIONS.md import');

    const toc = writeFor('TOC.md');
    assert.equal(toc.content, await fs.readFile(join(PLUGIN_ROOT, 'skeleton/docs/TOC.md'), 'utf8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planGreenfield: pre-existing CONVENTIONS.md / CLAUDE.md are SKIPPED, not overwritten', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'CONVENTIONS.md', 'hand-written c3 contract\n');
    await writeRepoFile(d, 'CLAUDE.md', 'detailed hand-written project context\n');
  });
  try {
    const plan = await planGreenfield(dir, PLUGIN_ROOT);
    const writes = plan.actions.filter((a) => a.type === 'write-file').map((a) => a.path);
    const notes = plan.actions.filter((a) => a.type === 'note').map((a) => a.summary);

    assert.ok(!writes.some((p) => p.endsWith('CONVENTIONS.md')), 'CONVENTIONS.md must NOT be overwritten');
    assert.ok(!writes.some((p) => p.endsWith('CLAUDE.md')), 'CLAUDE.md must NOT be overwritten');
    assert.ok(notes.some((s) => s.includes('CONVENTIONS.md') && /SKIPPED/.test(s)),
      'a SKIPPED note must flag the pre-existing CONVENTIONS.md');
    assert.ok(notes.some((s) => s.includes('CLAUDE.md') && /SKIPPED/.test(s)),
      'a SKIPPED note must flag the pre-existing CLAUDE.md');

    // The preserved files keep their original content after applying the plan.
    await applyPlan(plan, dir);
    assert.equal(await fs.readFile(join(dir, 'CONVENTIONS.md'), 'utf8'), 'hand-written c3 contract\n');
    assert.equal(await fs.readFile(join(dir, 'CLAUDE.md'), 'utf8'), 'detailed hand-written project context\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #6 — clean dangling settings.json hook + package.json script
// ---------------------------------------------------------------------------

test('planLegacy: removes dangling pre-commit-lint hook from .claude/settings.json', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/pre-commit-lint.js' }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: 'node other.js' }] },
        ],
      },
    }, null, 2));
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const action = plan.actions.find((a) => a.type === 'write-file' && a.path.endsWith('settings.json'));
    assert.ok(action, 'expected a settings.json write-file action');
    assert.ok(!action.content.includes('pre-commit-lint.js'), 'dangling hook command must be removed');
    assert.ok(action.content.includes('other.js'), 'unrelated hooks must be preserved');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planLegacy: removes dangling pre-commit-lint hook from legacy ARRAY-shaped .claude/settings.json', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/settings.json', JSON.stringify({
      hooks: [
        { matcher: { event: 'PreToolUse', tool: 'Bash' },
          hooks: [{ type: 'shell', command: 'node .claude/hooks/pre-commit-lint.js' }] },
        { matcher: { event: 'PreToolUse', tool: 'Write' },
          hooks: [{ type: 'shell', command: 'node other.js' }] },
      ],
    }, null, 2));
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const action = plan.actions.find((a) => a.type === 'write-file' && a.path.endsWith('settings.json'));
    assert.ok(action, 'expected a settings.json write-file action for the legacy array shape');
    assert.ok(!action.content.includes('pre-commit-lint.js'), 'dangling hook command must be removed (array shape)');
    assert.ok(action.content.includes('other.js'), 'unrelated hooks must be preserved');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planLegacy: array-shaped settings whose only hook is dangling drops the hooks key', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/settings.json', JSON.stringify({
      otherSetting: true,
      hooks: [
        { matcher: { event: 'PreToolUse', tool: 'Bash' },
          hooks: [{ type: 'shell', command: 'node .claude/hooks/pre-commit-lint.js' }] },
      ],
    }, null, 2));
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const action = plan.actions.find((a) => a.type === 'write-file' && a.path.endsWith('settings.json'));
    assert.ok(action, 'expected a settings.json write-file action');
    const parsed = JSON.parse(action.content);
    assert.ok(!('hooks' in parsed), 'emptied hooks key should be removed entirely');
    assert.equal(parsed.otherSetting, true, 'unrelated settings preserved');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planLegacy: removes package.json script referencing the removed submodule', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'package.json', JSON.stringify({
      scripts: {
        test: 'jest',
        'sync-claude-config': 'tsx burbank-claude-config/lib/render.ts --config claude-config.json',
      },
    }, null, 2));
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const action = plan.actions.find((a) => a.type === 'write-file' && a.path.endsWith('package.json'));
    assert.ok(action, 'expected a package.json write-file action');
    const pkg = JSON.parse(action.content);
    assert.ok(!('sync-claude-config' in pkg.scripts), 'dead sync script must be removed');
    assert.equal(pkg.scripts.test, 'jest', 'unrelated scripts preserved');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #71 — stale .gitmodules / .claudeignore after submodule removal
// ---------------------------------------------------------------------------

test('planLegacy: removes now-empty .gitmodules when the legacy submodule was the last entry', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.gitmodules',
      '[submodule "burbank-claude-config"]\n\tpath = burbank-claude-config\n\turl = git@example.com:org/burbank-claude-config.git\n');
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const gitCmds = plan.actions.filter((a) => a.type === 'git-cmd').map((a) => a.args.join(' '));
    assert.ok(gitCmds.includes('rm -f burbank-claude-config'), 'submodule itself removed');
    assert.ok(gitCmds.includes('rm -f .gitmodules'), 'now-empty .gitmodules removed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planLegacy: keeps .gitmodules when other submodules remain', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.gitmodules',
      '[submodule "burbank-claude-config"]\n\tpath = burbank-claude-config\n\turl = u1\n' +
      '[submodule "other"]\n\tpath = other\n\turl = u2\n');
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const gitCmds = plan.actions.filter((a) => a.type === 'git-cmd').map((a) => a.args.join(' '));
    assert.ok(gitCmds.includes('rm -f burbank-claude-config'), 'submodule itself removed');
    assert.ok(!gitCmds.includes('rm -f .gitmodules'), '.gitmodules kept — other submodules remain');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planLegacy: deletes .claudeignore when it only ignored the removed submodule', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claudeignore', 'burbank-claude-config/\n');
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const del = plan.actions.find((a) => a.type === 'delete-file' && a.path.endsWith('.claudeignore'));
    assert.ok(del, '.claudeignore should be deleted when it only ignored the submodule');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('planLegacy: strips only the submodule line from a .claudeignore with other entries', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claudeignore', 'node_modules/\nburbank-claude-config/\ndist/\n');
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const write = plan.actions.find((a) => a.type === 'write-file' && a.path.endsWith('.claudeignore'));
    assert.ok(write, 'expected a .claudeignore write-file action');
    assert.ok(!write.content.includes('burbank-claude-config'), 'submodule line stripped');
    assert.ok(write.content.includes('node_modules/'), 'unrelated ignores preserved');
    assert.ok(write.content.includes('dist/'), 'unrelated ignores preserved');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #7 — port agent sidecars + post-apply dangling-ref report
// ---------------------------------------------------------------------------

test('planLegacy: ports a legacy code-reviewer sidecar to docs/', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/agents/code-reviewer/project-context.md', 'review context\n');
  });
  try {
    const plan = await planLegacy(dir, PLUGIN_ROOT, SNAPSHOT);
    const move = plan.actions.find((a) => a.type === 'move-file');
    assert.ok(move, 'expected a move-file action for the sidecar');
    assert.ok(move.from.includes('project-context.md'));
    assert.ok(move.to.replace(/\\/g, '/').endsWith('docs/code-review-context.md'));

    // applyPlan actually moves the file
    await applyPlan(plan, dir);
    const moved = await fs.readFile(join(dir, 'docs/code-review-context.md'), 'utf8');
    assert.equal(moved, 'review context\n');
    await assert.rejects(fs.access(join(dir, '.claude/agents/code-reviewer/project-context.md')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanDanglingReferences: flags settings.json still referencing the deleted pre-commit-lint hook', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/settings.json', JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/pre-commit-lint.js' }] }] },
    }, null, 2));
  });
  try {
    const warnings = await scanDanglingReferences(dir);
    const hit = warnings.find((w) => w.file.replace(/\\/g, '/').endsWith('.claude/settings.json'));
    assert.ok(hit, 'should flag settings.json that still references the deleted hook');
    assert.match(hit.hint, /pre-commit-lint/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanDanglingReferences: finds stale doc refs and orphaned sidecars', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, 'CLAUDE.md', 'Run `npm run sync-claude-config` to update burbank-claude-config.\n');
    await writeRepoFile(d, 'docs/claude-config.md', 'The AUTO-GENERATED files come from the submodule.\n');
    await writeRepoFile(d, '.claude/agents/ts-implementer/project-architecture.md', 'arch notes\n');
  });
  try {
    const warnings = await scanDanglingReferences(dir);
    const files = warnings.map((w) => w.file.replace(/\\/g, '/'));
    assert.ok(files.some((f) => f.endsWith('CLAUDE.md')), 'should flag CLAUDE.md');
    assert.ok(files.some((f) => f.endsWith('docs/claude-config.md')), 'should flag docs/claude-config.md');
    assert.ok(files.some((f) => f.endsWith('project-architecture.md')), 'should flag orphaned sidecar');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #72 — orphaned-sidecar follow-up names a candidate docs/ target / disposition
// ---------------------------------------------------------------------------

test('scanDanglingReferences: names a candidate doc for a knowledge-bearing orphan', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/agents/analyst/project-knowledge.md', 'system overview\n');
    await writeRepoFile(d, '.claude/agents/designer/project-knowledge.md', 'domain notes\n');
  });
  try {
    const warnings = await scanDanglingReferences(dir);
    const analyst = warnings.find((w) => w.file.replace(/\\/g, '/').endsWith('agents/analyst/project-knowledge.md'));
    const designer = warnings.find((w) => w.file.replace(/\\/g, '/').endsWith('agents/designer/project-knowledge.md'));
    assert.match(analyst.hint, /docs\/architecture\.md/);
    assert.match(designer.hint, /docs\/domain\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanDanglingReferences: marks obsolete sidecars for deletion with their successor', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/agents/validator/project-commands.md', 'validate cmds\n');
    await writeRepoFile(d, '.claude/skills/cleanup-initiative/project-docs-to-check.md', 'doc links\n');
  });
  try {
    const warnings = await scanDanglingReferences(dir);
    const cmds = warnings.find((w) => w.file.replace(/\\/g, '/').endsWith('project-commands.md'));
    const docs = warnings.find((w) => w.file.replace(/\\/g, '/').endsWith('project-docs-to-check.md'));
    assert.match(cmds.hint, /obsolete.*\.gvt-agent\.json/);
    assert.match(docs.hint, /obsolete.*docs\/TOC\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scanDanglingReferences: unknown orphan falls back to the generic port-or-delete hint', async () => {
  const dir = await withTempRepo(async (d) => {
    await writeRepoFile(d, '.claude/agents/whatever/project-mystery.md', 'unknown\n');
  });
  try {
    const warnings = await scanDanglingReferences(dir);
    const hit = warnings.find((w) => w.file.replace(/\\/g, '/').endsWith('project-mystery.md'));
    assert.ok(hit, 'unknown sidecar still flagged');
    assert.match(hit.hint, /port the still-relevant parts into docs\//);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
