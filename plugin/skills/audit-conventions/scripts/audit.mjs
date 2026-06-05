#!/usr/bin/env node
// Validates the consuming repo against the genvid plugin's convention
// contract. Walks installed skill/agent metadata.expects, evaluates each
// expectation against the cwd, and prints a structured report.
//
// Default mode is validate-only.
//   --fix         Compute the migration plan and print a dry-run summary.
//   --fix --apply Actually apply the plan to the filesystem.
//
// Exit code: 0 if all required expectations are satisfied (or --fix planning
// succeeded); 1 otherwise.

import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { extractFrontmatter } from './lib/frontmatter.mjs';
import { resolveKey } from './lib/config-resolve.mjs';
import { detectState, STATE_GREENFIELD, STATE_LEGACY, STATE_MIGRATED } from './lib/state-detect.mjs';
import { planGreenfield, planLegacy, applyPlan, scanDanglingReferences } from './lib/migrate.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(SCRIPT_DIR, '..', '..', '..'); // <plugin>/skills/audit-conventions/scripts -> <plugin>

const REPO_ROOT = process.cwd();
const FIX_MODE = process.argv.includes('--fix');
const APPLY_MODE = process.argv.includes('--apply');

async function main() {
  const state = await detectState(REPO_ROOT);

  if (FIX_MODE) {
    await runFix(state);
    return;
  }

  const components = await walkComponents(PLUGIN_ROOT);
  const findings = [];
  for (const component of components) {
    const expects = component.expects;
    if (!expects) continue;

    for (const entry of expects.files ?? []) {
      findings.push(await evaluateFile(component, entry));
    }
    for (const entry of expects.config ?? []) {
      findings.push(await evaluateConfig(component, entry));
    }
    for (const entry of expects.tools ?? []) {
      findings.push(evaluateTool(component, entry));
    }
  }

  const report = formatReport(state, findings);
  console.log(report);

  const hasErrors = findings.some((f) => f.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

// ---- walk ------------------------------------------------------------------

async function walkComponents(pluginRoot) {
  const components = [];

  const skillsDir = join(pluginRoot, 'skills');
  if (await dirExists(skillsDir)) {
    const skills = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of skills) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(skillsDir, entry.name, 'SKILL.md');
      if (!(await fileExists(skillFile))) continue;
      const component = await loadComponent('skill', entry.name, skillFile);
      if (component) components.push(component);
    }
  }

  const agentsDir = join(pluginRoot, 'agents');
  if (await dirExists(agentsDir)) {
    const agents = await fs.readdir(agentsDir, { withFileTypes: true });
    for (const entry of agents) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const name = entry.name.replace(/\.md$/, '');
      const component = await loadComponent('agent', name, join(agentsDir, entry.name));
      if (component) components.push(component);
    }
  }

  return components;
}

async function loadComponent(type, name, filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const fm = extractFrontmatter(content);
  if (!fm) return { type, name, expects: null };
  return { type, name, expects: fm.metadata?.expects ?? null };
}

// ---- evaluate --------------------------------------------------------------

async function evaluateFile(component, entry) {
  const required = entry.required !== false;
  const path = join(REPO_ROOT, entry.path);
  const exists = await fileExists(path);

  if (exists) {
    return { kind: 'file', component: component.name, target: entry.path, ok: true };
  }
  return {
    kind: 'file',
    component: component.name,
    target: entry.path,
    ok: false,
    severity: required ? 'error' : 'info',
    detail: `file not found${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

async function evaluateConfig(component, entry) {
  const required = entry.required !== false;
  const inFile = entry.in ?? '.genvid-agent.json';
  const filePath = join(REPO_ROOT, inFile);

  let parsed;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      kind: 'config',
      component: component.name,
      target: `${entry.key} in ${inFile}`,
      ok: false,
      severity: required ? 'error' : 'info',
      detail: err.code === 'ENOENT' ? `${inFile} not found` : `${inFile} unreadable (${err.message})`,
      reason: entry.reason,
    };
  }

  const result = resolveKey(parsed, entry.key);
  if (result.found) {
    return { kind: 'config', component: component.name, target: `${entry.key} in ${inFile}`, ok: true };
  }
  return {
    kind: 'config',
    component: component.name,
    target: `${entry.key} in ${inFile}`,
    ok: false,
    severity: required ? 'error' : 'info',
    detail: `key not found (path broke at "${result.missingAt}")${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

function evaluateTool(component, entry) {
  const required = entry.required !== false;
  const exists = commandExists(entry.command);

  if (exists) {
    return { kind: 'tool', component: component.name, target: entry.command, ok: true };
  }
  return {
    kind: 'tool',
    component: component.name,
    target: entry.command,
    ok: false,
    severity: required ? 'error' : 'info',
    detail: `command not found on PATH${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

// ---- helpers ---------------------------------------------------------------

async function fileExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [cmd], { stdio: 'pipe' });
  return result.status === 0;
}

// ---- report ----------------------------------------------------------------

function formatReport(state, findings) {
  const errors = findings.filter((f) => f.severity === 'error');
  const infos = findings.filter((f) => f.severity === 'info');
  const oks = findings.filter((f) => f.ok);
  const requiredCount = findings.filter((f) => f.severity !== 'info').length;

  const lines = [];
  lines.push('## Audit Results');
  lines.push('');
  lines.push(`State: ${state}`);
  lines.push('');

  if (errors.length > 0) {
    lines.push('### Errors (must fix)');
    for (const f of errors) lines.push(formatFinding(f));
    lines.push('');
  }
  if (infos.length > 0) {
    lines.push('### Info (optional)');
    for (const f of infos) lines.push(formatFinding(f));
    lines.push('');
  }

  lines.push('### Summary');
  lines.push(`- ${oks.length} of ${requiredCount} required expectations satisfied.`);
  if (errors.length > 0) {
    lines.push(`- ${errors.length} required expectation${errors.length === 1 ? '' : 's'} unmet.`);
  }
  if (infos.length > 0) {
    lines.push(`- ${infos.length} optional expectation${infos.length === 1 ? '' : 's'} unmet.`);
  }
  if (state === STATE_LEGACY) {
    lines.push('');
    lines.push('> Run `--fix` to migrate from the legacy template-rendered setup.');
  } else if (state === STATE_GREENFIELD) {
    lines.push('');
    lines.push('> Run `--fix` to scaffold the four convention files.');
  }

  return lines.join('\n');
}

function formatFinding(f) {
  const reason = f.reason ? ` Reason: ${f.reason}` : '';
  return `- **${f.component}** expects ${f.kind === 'tool' ? `tool \`${f.target}\`` : `\`${f.target}\``} — ${f.detail}.${reason}`;
}

// ---- --fix orchestration ---------------------------------------------------

async function runFix(state) {
  if (state === STATE_MIGRATED) {
    console.log('## --fix mode\n');
    console.log(`State: ${state}\n`);
    console.log('This repo is already migrated. Nothing to fix — run without --fix to validate.');
    process.exit(0);
  }

  if (APPLY_MODE && !(await workingTreeClean())) {
    console.error('## --fix --apply\n');
    console.error(`State: ${state}\n`);
    console.error('Refusing to apply with a dirty working tree. Commit or stash your changes first,');
    console.error('so the migration lands as a reviewable diff with nothing else mixed in.');
    console.error('(The --fix dry-run writes nothing and runs fine on a dirty tree — preview there first.)');
    process.exit(1);
  }

  let plan;
  if (state === STATE_GREENFIELD) {
    plan = await planGreenfield(REPO_ROOT, PLUGIN_ROOT);
  } else {
    // STATE_LEGACY
    const snapshotPath = join(SCRIPT_DIR, 'legacy-manifest-snapshot.json');
    const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
    plan = await planLegacy(REPO_ROOT, PLUGIN_ROOT, snapshot);
  }

  if (!APPLY_MODE) {
    console.log(formatPlanDryRun(plan));
    process.exit(0);
  }

  console.log(`## --fix --apply (state: ${plan.state})\n`);
  const results = await applyPlan(plan, REPO_ROOT);
  console.log(formatApplyResults(results));

  // Surface anything the plan could not clean up automatically (stale doc/text
  // references, orphaned sidecars) so the user has an explicit follow-up list.
  if (plan.state === STATE_LEGACY) {
    const warnings = await scanDanglingReferences(REPO_ROOT);
    console.log('\n' + formatDanglingReport(warnings));
  }

  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length > 0 ? 1 : 0);
}

async function workingTreeClean() {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    // Not a git repo, or git unavailable — let the operation proceed but warn.
    return true;
  }
  return result.stdout.trim() === '';
}

function formatPlanDryRun(plan) {
  const lines = ['## --fix dry-run'];
  lines.push('');
  lines.push(`State: ${plan.state}`);
  lines.push('');
  lines.push(`The following ${plan.actions.length} action${plan.actions.length === 1 ? '' : 's'} would be applied:`);
  lines.push('');
  let i = 1;
  for (const action of plan.actions) {
    lines.push(`${i}. ${action.summary}`);
    i++;
  }
  lines.push('');
  lines.push('Re-run with `--fix --apply` to actually apply these changes.');
  lines.push('No files have been written.');
  return lines.join('\n');
}

function formatApplyResults(results) {
  const lines = [];
  for (const r of results) {
    const prefix = r.ok ? '✓' : '✗';
    lines.push(`${prefix} ${r.summary}${r.error ? ` — ${r.error}` : ''}`);
  }
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  lines.push('');
  lines.push(`Applied ${ok}/${results.length} actions${failed > 0 ? ` (${failed} failed)` : ''}.`);
  lines.push('');
  lines.push('Review the changes with `git status` / `git diff` and commit when ready.');
  return lines.join('\n');
}

function formatDanglingReport(warnings) {
  const lines = ['### Manual follow-up'];
  lines.push('');
  if (warnings.length === 0) {
    lines.push('No dangling references detected. Nothing left to clean up by hand.');
    return lines.join('\n');
  }
  lines.push('The migration could not clean these up automatically — review and fix by hand:');
  lines.push('');
  for (const w of warnings) {
    lines.push(`- \`${w.file}\` — ${w.hint}.`);
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error('audit failed:', err);
  process.exit(2);
});
