// Walks the plugin's installed skills/ and agents/ trees and loads each
// component's frontmatter. Extracted from audit.mjs for the audit-core
// package split (#457); see ADR-0057 verdict B (plugin-root parameter, not a
// "components directory") and verdict D (the loader returns parsed
// frontmatter rather than pre-deriving policy fields from it).

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { fileExists, dirExists } from './probes.mjs';
import { extractFrontmatter } from './frontmatter.mjs';

export async function walkComponents(pluginRoot) {
  if (typeof pluginRoot !== 'string') {
    throw new TypeError('walkComponents: pluginRoot must be a string (plugin root directory)');
  }

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

export async function loadComponent(type, name, filePath) {
  // Unguarded read: unreachable in practice today, since walkComponents has
  // just confirmed the file exists before calling loadComponent — the
  // no-throw property currently holds by accident rather than by design.
  // Deferred fix (ADR-0057 Q2).
  const content = await fs.readFile(filePath, 'utf8');
  const fm = extractFrontmatter(content);
  if (!fm) return { type, name, expects: null, frontmatter: null };
  return {
    type,
    name,
    expects: fm.metadata?.expects ?? null,
    frontmatter: fm,
  };
}
