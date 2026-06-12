// Migration planning + apply for audit-conventions --fix.
//
// A "plan" is a list of action descriptors. Each action has a type, a
// summary line for dry-run output, and the data needed to apply it. The
// planner is pure (no fs writes); the applier executes the plan against
// the filesystem.
//
// Action types:
//   write-file       { path, content, summary }
//   delete-file      { path, summary }
//   move-file        { from, to, summary }
//   delete-dir-if-empty { path, summary }
//   git-cmd          { args, summary }
//   note             { summary }   (no fs effect; surfaced in dry-run/apply output)

import { promises as fs } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const CONVENTIONS_FILENAME = 'CONVENTIONS.md';
const NEW_CONFIG_FILENAME = '.genvid-agent.json';
const LEGACY_CONFIG_FILENAME = 'claude-config.json';
const CLAUDE_MD = 'CLAUDE.md';
const TOC = 'docs/TOC.md';
const CONVENTIONS_IMPORT_LINE = '@CONVENTIONS.md';
const LEGACY_SUBMODULE_NAME = 'burbank-claude-config';
const SETTINGS_JSON = '.claude/settings.json';
const PACKAGE_JSON = 'package.json';
const LEGACY_HOOK_BASENAME = 'pre-commit-lint.js';
const LOCAL_EDIT_MARKER = 'LOCAL EDIT';
const SKELETON_DIR = 'skeleton';

// Legacy per-agent context sidecars (inlined via {{FILE:path}} by the old
// template engine) map onto the docs the new plugin agents read via
// metadata.expects. The migrator offers to port them to their new homes.
const SIDECAR_MAP = [
  { from: '.claude/agents/code-reviewer/project-context.md', to: 'docs/code-review-context.md' },
  { from: '.claude/agents/code-reviewer/project-patterns.md', to: 'docs/code-review-patterns.md' },
  { from: '.claude/agents/code-reviewer/project-docs.md', to: 'docs/code-review-docs.md' },
  { from: '.claude/agents/ts-implementer/project-architecture.md', to: 'docs/design-patterns.md' },
];

// -----------------------------------------------------------------------------
// translateLegacyConfig — pure function from old schema to new
// -----------------------------------------------------------------------------

export function translateLegacyConfig(legacy, opts = {}) {
  const out = {
    project: {
      name: legacy.project ?? opts.fallbackName ?? '<your-project-name>',
    },
    commands: deriveCommands(legacy, opts.scripts ?? {}),
    repo: {},
    features: {},
    paths: {},
  };

  // Variables: most are dropped (template-engine artifacts). A few map to
  // structured fields when their value is non-default.
  const baseBranch = legacy.variables?.BASE_BRANCH;
  if (baseBranch && baseBranch !== 'main') {
    out.repo.default_branch = baseBranch;
  }

  // Features: HAS_* flags translate to friendlier keys.
  const featureMap = {
    HAS_TDD_NOTES: 'tdd',
    HAS_MEMORY_SECTION: 'memory_section',
    HAS_LESSONS_LEARNED: 'lessons_learned',
  };
  for (const [oldKey, newKey] of Object.entries(featureMap)) {
    if (legacy.features?.[oldKey] === true) {
      out.features[newKey] = true;
    }
  }

  return out;
}

// Derive commands.{test,lint,build,validate} from the legacy config's own
// declarations (the real values the project ran), falling back to package.json
// scripts only when the legacy config provides nothing. Emitting generic `npm`
// placeholders on a pnpm-only repo makes the plugin's pre-commit hook — which
// reads commands.lint — fail on every commit (issue #8).
function deriveCommands(legacy, scripts) {
  const testCmd = legacy.variables?.TEST_COMMAND?.trim();
  const review = legacy.blocks?.REVIEW_COMMANDS?.trim();
  const validationBash = legacy.blocks?.VALIDATION_COMMANDS_BASH?.trim();

  // VALIDATION_COMMANDS_BASH is a newline-separated script; collapse it to a
  // single `&&`-joined string so it fits the scalar commands.validate field.
  const validateFromBlocks = review || (validationBash ? splitCommandLines(validationBash).join(' && ') : '');

  return {
    test: testCmd || extractCommandLine([validationBash, review], 'test') || scripts.test || '',
    lint: extractCommandLine([review, validationBash], 'lint') || scripts.lint || '',
    build: extractCommandLine([validationBash, review], 'build') || scripts.build || '',
    validate: validateFromBlocks || scripts.validate || '',
  };
}

// Split a command block into individual command segments, breaking on both
// newlines and `&&`, trimming and dropping empties.
function splitCommandLines(text) {
  return text
    .split('\n')
    .flatMap((line) => line.split('&&'))
    .map((s) => s.trim())
    .filter(Boolean);
}

// Return the first command segment (across the given sources) that mentions the
// keyword — e.g. extract `pnpm run lint` from a multi-line validation block.
function extractCommandLine(sources, keyword) {
  for (const text of sources) {
    if (!text) continue;
    const hit = splitCommandLines(text).find((seg) => seg.includes(keyword));
    if (hit) return hit;
  }
  return '';
}

// -----------------------------------------------------------------------------
// planGreenfield — scaffold the four convention files
// -----------------------------------------------------------------------------

export async function planGreenfield(repoRoot, pluginRoot) {
  const actions = [];
  const conventionsSource = await fs.readFile(join(pluginRoot, CONVENTIONS_FILENAME), 'utf8');

  // Scaffold each convention file only when it doesn't already exist. A repo can
  // be classified greenfield (no .genvid-agent.json) while still owning a
  // hand-written CONVENTIONS.md or CLAUDE.md — overwriting those would silently
  // destroy authored content (issue #25). Skip-if-exists, and surface the skip
  // as a note so the dry-run plan shows what's being preserved.
  //
  // CONVENTIONS.md is copied from the plugin's own canonical file; the other
  // three come from the skeleton/ folder (the single file-based source of truth
  // for what --fix writes — see skeleton/README.md).
  await pushScaffold(actions, repoRoot, CONVENTIONS_FILENAME, conventionsSource,
    `Copy plugin's CONVENTIONS.md to repo root (${conventionsSource.length} bytes)`);

  await pushScaffold(actions, repoRoot, NEW_CONFIG_FILENAME,
    await readSkeleton(pluginRoot, NEW_CONFIG_FILENAME),
    `Scaffold ${NEW_CONFIG_FILENAME} with empty schema (fill in your project values)`);

  await pushScaffold(actions, repoRoot, CLAUDE_MD, await readSkeleton(pluginRoot, CLAUDE_MD),
    `Scaffold ${CLAUDE_MD} with @CONVENTIONS.md import and stub sections`);

  await pushScaffold(actions, repoRoot, TOC, await readSkeleton(pluginRoot, TOC),
    `Scaffold ${TOC} with placeholder doc map`);

  return { state: 'greenfield', actions };
}

// Read a pristine placeholder convention file from the plugin's skeleton/ folder.
// These are the exact bytes greenfield --fix writes; keeping them as real files
// (rather than inline JS templates) gives one reviewable source of truth and
// removes the drift hazard against examples/.
async function readSkeleton(pluginRoot, rel) {
  return fs.readFile(join(pluginRoot, SKELETON_DIR, rel), 'utf8');
}

// Queue a write-file action only when `rel` is absent under `repoRoot`; if it
// already exists, queue a SKIPPED note instead so the greenfield scaffold never
// clobbers pre-existing user content (issue #25) and the skip stays visible in
// the dry-run plan.
async function pushScaffold(actions, repoRoot, rel, content, writeSummary) {
  const path = join(repoRoot, rel);
  if (await fileExists(path)) {
    actions.push({
      type: 'note',
      summary: `SKIPPED ${rel} — target already exists; keeping your copy`,
    });
    return;
  }
  actions.push({ type: 'write-file', path, content, summary: writeSummary });
}

// -----------------------------------------------------------------------------
// planLegacy — translate, scaffold, delete-rendered, remove-submodule
// -----------------------------------------------------------------------------

export async function planLegacy(repoRoot, pluginRoot, snapshot) {
  const actions = [];

  // 1. Translate config.
  const legacyConfigPath = join(repoRoot, LEGACY_CONFIG_FILENAME);
  if (await fileExists(legacyConfigPath)) {
    const legacy = JSON.parse(await fs.readFile(legacyConfigPath, 'utf8'));
    const pm = legacy.variables?.PACKAGE_MANAGER?.trim() || 'npm';
    const scripts = await readPackageScripts(repoRoot, pm);
    const newConfig = translateLegacyConfig(legacy, { scripts });
    actions.push({
      type: 'write-file',
      path: join(repoRoot, NEW_CONFIG_FILENAME),
      content: JSON.stringify(newConfig, null, 2) + '\n',
      summary: `Translate ${LEGACY_CONFIG_FILENAME} -> ${NEW_CONFIG_FILENAME} (project: ${newConfig.project.name})`,
    });
    actions.push({
      type: 'delete-file',
      path: legacyConfigPath,
      summary: `Delete legacy ${LEGACY_CONFIG_FILENAME}`,
    });
  }

  // 2. Copy plugin's CONVENTIONS.md to repo root (overwrites local copy if any).
  const conventionsSource = await fs.readFile(join(pluginRoot, CONVENTIONS_FILENAME), 'utf8');
  actions.push({
    type: 'write-file',
    path: join(repoRoot, CONVENTIONS_FILENAME),
    content: conventionsSource,
    summary: `Write ${CONVENTIONS_FILENAME} (copy of plugin's canonical)`,
  });

  // 3. Ensure CLAUDE.md exists with @CONVENTIONS.md import.
  const claudeMdPath = join(repoRoot, CLAUDE_MD);
  if (await fileExists(claudeMdPath)) {
    const existing = await fs.readFile(claudeMdPath, 'utf8');
    if (!existing.includes(CONVENTIONS_IMPORT_LINE)) {
      actions.push({
        type: 'write-file',
        path: claudeMdPath,
        content: `${CONVENTIONS_IMPORT_LINE}\n\n${existing}`,
        summary: `Prepend ${CONVENTIONS_IMPORT_LINE} to ${CLAUDE_MD}`,
      });
    }
  } else {
    actions.push({
      type: 'write-file',
      path: claudeMdPath,
      content: await readSkeleton(pluginRoot, CLAUDE_MD),
      summary: `Scaffold ${CLAUDE_MD} with @CONVENTIONS.md import and stub sections`,
    });
  }

  // 4. Delete rendered files using the snapshot.
  const renderedTargets = snapshot.templates.map((t) => t.target);
  const marker = snapshot.auto_generated_marker;
  const dirsTouched = new Set();
  for (const target of renderedTargets) {
    const path = join(repoRoot, target);
    if (!(await fileExists(path))) continue;
    const content = await fs.readFile(path, 'utf8');
    if (!content.includes(marker)) {
      actions.push({
        type: 'note',
        summary: `SKIPPED ${target} — no AUTO-GENERATED marker; treating as user-edited (keep)`,
      });
      continue;
    }
    // The file still carries the AUTO-GENERATED header but also a LOCAL EDIT
    // block: the documented convention for adding project-local content while
    // keeping drift visible to the next sync. Deleting it would silently
    // destroy authored content (issue #5) — skip and flag it prominently.
    if (content.includes(LOCAL_EDIT_MARKER)) {
      actions.push({
        type: 'note',
        summary: `SKIPPED ${target} — contains a LOCAL EDIT block (diverges from template); port its local content to a docs/ file, then delete it by hand`,
      });
      continue;
    }
    actions.push({
      type: 'delete-file',
      path,
      summary: `Delete rendered ${target}`,
    });
    dirsTouched.add(dirname(path));
  }

  // 5. Port legacy per-agent context sidecars to their new docs/ homes
  //    (issue #7) before the empty-dir sweep, so the now-orphaned agent dirs
  //    can be removed once their sidecars have moved out.
  for (const action of await planSidecarPorting(repoRoot)) {
    actions.push(action);
    if (action.type === 'move-file') dirsTouched.add(dirname(action.from));
  }

  for (const dir of dirsTouched) {
    actions.push({
      type: 'delete-dir-if-empty',
      path: dir,
      summary: `Remove ${dir} if empty after deletions`,
    });
  }

  // 6. Clean up references elsewhere in the repo that point at files this
  //    migration removes (issue #6): the plugin's pre-commit hook wired into
  //    settings.json and dead package.json scripts referencing the submodule.
  for (const action of await planSettingsCleanup(repoRoot)) actions.push(action);
  for (const action of await planPackageJsonCleanup(repoRoot)) actions.push(action);

  // 7. Remove the submodule.
  const gitmodulesPath = join(repoRoot, '.gitmodules');
  if (await fileExists(gitmodulesPath)) {
    const gm = await fs.readFile(gitmodulesPath, 'utf8');
    if (gm.includes(LEGACY_SUBMODULE_NAME)) {
      actions.push({
        type: 'git-cmd',
        args: ['submodule', 'deinit', '-f', LEGACY_SUBMODULE_NAME],
        summary: `git submodule deinit -f ${LEGACY_SUBMODULE_NAME}`,
      });
      actions.push({
        type: 'git-cmd',
        args: ['rm', '-f', LEGACY_SUBMODULE_NAME],
        summary: `git rm -f ${LEGACY_SUBMODULE_NAME} (also strips the .gitmodules entry)`,
      });
    }
  }

  return { state: 'legacy', actions };
}

// -----------------------------------------------------------------------------
// applyPlan — execute actions in order, gather results
// -----------------------------------------------------------------------------

export async function applyPlan(plan, repoRoot) {
  const results = [];
  for (const action of plan.actions) {
    try {
      switch (action.type) {
        case 'write-file':
          await ensureDir(dirname(action.path));
          await fs.writeFile(action.path, action.content);
          results.push({ ok: true, summary: action.summary });
          break;
        case 'delete-file':
          await fs.unlink(action.path);
          results.push({ ok: true, summary: action.summary });
          break;
        case 'move-file': {
          await ensureDir(dirname(action.to));
          const data = await fs.readFile(action.from);
          await fs.writeFile(action.to, data);
          await fs.unlink(action.from);
          results.push({ ok: true, summary: action.summary });
          break;
        }
        case 'delete-dir-if-empty':
          try {
            await fs.rmdir(action.path);
            results.push({ ok: true, summary: action.summary });
          } catch (err) {
            if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') {
              results.push({ ok: true, summary: `${action.summary} (not empty, kept)` });
            } else if (err.code === 'ENOENT') {
              results.push({ ok: true, summary: `${action.summary} (already gone)` });
            } else {
              throw err;
            }
          }
          break;
        case 'git-cmd': {
          const result = spawnSync('git', action.args, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' });
          if (result.status !== 0) {
            throw new Error(`git ${action.args.join(' ')} failed: ${result.stderr || result.stdout}`);
          }
          results.push({ ok: true, summary: action.summary });
          break;
        }
        case 'note':
          results.push({ ok: true, summary: action.summary });
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (err) {
      results.push({ ok: false, summary: action.summary, error: err.message });
    }
  }
  return results;
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

async function fileExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function ensureDir(path) {
  await fs.mkdir(path, { recursive: true });
}

async function readPackageScripts(repoRoot, pm = 'npm') {
  try {
    const pkg = JSON.parse(await fs.readFile(join(repoRoot, PACKAGE_JSON), 'utf8'));
    const s = pkg.scripts ?? {};
    return {
      test: s.test ? `${pm} test` : '',
      lint: s.lint ? `${pm} run lint` : '',
      build: s.build ? `${pm} run build` : '',
      validate: s.test && s.lint ? `${pm} run lint && ${pm} test` : (s.test ? `${pm} test` : ''),
    };
  } catch {
    return {};
  }
}

// -----------------------------------------------------------------------------
// Dangling-reference cleanup planners (issue #6)
// -----------------------------------------------------------------------------

function referencesLegacy(command) {
  return typeof command === 'string'
    && (command.includes(LEGACY_HOOK_BASENAME) || command.includes(LEGACY_SUBMODULE_NAME));
}

// Filter a flat array of hook groups, dropping any hook whose command points at
// the dangling legacy pre-commit-lint.js and removing a group entirely once that
// empties it. Returns the kept groups plus whether anything was removed.
function filterHookGroups(groups) {
  let changed = false;
  const kept = [];
  for (const group of groups) {
    const hooks = Array.isArray(group?.hooks) ? group.hooks : [];
    const filtered = hooks.filter((h) => !referencesLegacy(h?.command));
    if (filtered.length !== hooks.length) changed = true;
    // Drop a group only if removing the dangling hook emptied it; leave
    // groups that never had hooks (or still have some) untouched.
    if (hooks.length > 0 && filtered.length === 0) continue;
    kept.push(filtered.length === hooks.length ? group : { ...group, hooks: filtered });
  }
  return { kept, changed };
}

// Strip any PreToolUse-style hook entry whose command points at the
// now-deleted pre-commit-lint.js (the plugin ships its own copy via
// hooks/hooks.json, so the project entry is both redundant and dangling).
//
// Handles both settings.json hook shapes (issue #70): the legacy ARRAY form
// (`hooks: [ {matcher:{event,tool}, hooks:[…]} ]`, the format legacy repos
// being migrated actually carry) and the newer OBJECT form keyed by event
// (`hooks: { PreToolUse: [ {matcher, hooks:[…]} ] }`).
async function planSettingsCleanup(repoRoot) {
  const path = join(repoRoot, SETTINGS_JSON);
  let settings;
  try {
    settings = JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return [];
  }
  if (!settings.hooks || typeof settings.hooks !== 'object') return [];

  let changed = false;
  if (Array.isArray(settings.hooks)) {
    // Legacy array shape: a flat list of { matcher, hooks } groups.
    const { kept, changed: c } = filterHookGroups(settings.hooks);
    changed = c;
    if (kept.length > 0) settings.hooks = kept;
    else delete settings.hooks;
  } else {
    // Newer object shape: keyed by event name -> array of groups.
    for (const event of Object.keys(settings.hooks)) {
      const groups = settings.hooks[event];
      if (!Array.isArray(groups)) continue;
      const { kept, changed: c } = filterHookGroups(groups);
      if (c) changed = true;
      if (kept.length > 0) settings.hooks[event] = kept;
      else delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }
  if (!changed) return [];

  return [{
    type: 'write-file',
    path,
    content: JSON.stringify(settings, null, 2) + '\n',
    summary: `Remove dangling ${LEGACY_HOOK_BASENAME} hook entry from ${SETTINGS_JSON} (plugin provides its own)`,
  }];
}

// Drop package.json scripts whose body references the removed submodule path
// (e.g. the `sync-claude-config` render script that can never run again).
async function planPackageJsonCleanup(repoRoot) {
  const path = join(repoRoot, PACKAGE_JSON);
  let pkg;
  try {
    pkg = JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return [];
  }
  if (!pkg.scripts || typeof pkg.scripts !== 'object') return [];

  const removed = Object.entries(pkg.scripts)
    .filter(([, body]) => typeof body === 'string' && body.includes(LEGACY_SUBMODULE_NAME))
    .map(([name]) => name);
  if (removed.length === 0) return [];

  for (const name of removed) delete pkg.scripts[name];
  return [{
    type: 'write-file',
    path,
    content: JSON.stringify(pkg, null, 2) + '\n',
    summary: `Remove dead ${PACKAGE_JSON} script${removed.length > 1 ? 's' : ''} referencing the removed submodule: ${removed.join(', ')}`,
  }];
}

// -----------------------------------------------------------------------------
// Sidecar porting (issue #7)
// -----------------------------------------------------------------------------

async function planSidecarPorting(repoRoot) {
  const actions = [];
  for (const { from, to } of SIDECAR_MAP) {
    const fromPath = join(repoRoot, from);
    if (!(await fileExists(fromPath))) continue;
    const toPath = join(repoRoot, to);
    if (await fileExists(toPath)) {
      actions.push({
        type: 'note',
        summary: `ORPHANED ${from} — target ${to} already exists; merge its content by hand, then delete the sidecar`,
      });
      continue;
    }
    actions.push({
      type: 'move-file',
      from: fromPath,
      to: toPath,
      summary: `Port legacy sidecar ${from} -> ${to}`,
    });
  }
  return actions;
}

// -----------------------------------------------------------------------------
// scanDanglingReferences — post-apply manual-follow-up report (issues #6/#7/#8)
// -----------------------------------------------------------------------------

const DANGLING_NEEDLES = ['sync-claude-config', LEGACY_SUBMODULE_NAME, 'AUTO-GENERATED'];

// After applying the plan, surface anything the migration could not clean up
// automatically: stale text references in docs/config, and orphaned per-agent
// sidecars the plugin no longer reads. Returns [{ file, hint }].
export async function scanDanglingReferences(repoRoot) {
  const warnings = [];

  // 1. Text references in package.json, CLAUDE.md, and docs/**.md.
  const textFiles = [PACKAGE_JSON, CLAUDE_MD];
  for (const rel of await listMarkdown(repoRoot, 'docs')) textFiles.push(rel);
  for (const rel of textFiles) {
    let content;
    try {
      content = await fs.readFile(join(repoRoot, rel), 'utf8');
    } catch {
      continue;
    }
    const hits = DANGLING_NEEDLES.filter((needle) => content.includes(needle));
    if (hits.length > 0) {
      warnings.push({ file: rel, hint: `still references ${hits.join(', ')}` });
    }
  }

  // 2. Orphaned per-agent / per-skill context sidecars.
  for (const base of ['.claude/agents', '.claude/skills']) {
    for (const rel of await listSidecars(repoRoot, base)) {
      warnings.push({ file: rel, hint: 'orphaned context sidecar — no longer read by any plugin component; port to docs/ or delete' });
    }
  }

  return warnings;
}

// Recursively list *.md files under <repoRoot>/<sub>, returned repo-relative.
async function listMarkdown(repoRoot, sub) {
  return listFiles(repoRoot, sub, (name) => name.endsWith('.md'));
}

// List project-*.md sidecars one level under each child of <repoRoot>/<base>.
async function listSidecars(repoRoot, base) {
  const out = [];
  let children;
  try {
    children = await fs.readdir(join(repoRoot, base), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const child of children) {
    if (!child.isDirectory()) continue;
    let files;
    try {
      files = await fs.readdir(join(repoRoot, base, child.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.isFile() && /^project-.*\.md$/.test(f.name)) {
        out.push(join(base, child.name, f.name).split('\\').join('/'));
      }
    }
  }
  return out;
}

async function listFiles(repoRoot, sub, predicate) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(relative(repoRoot, full).split('\\').join('/'));
      }
    }
  }
  await walk(join(repoRoot, sub));
  return out;
}
