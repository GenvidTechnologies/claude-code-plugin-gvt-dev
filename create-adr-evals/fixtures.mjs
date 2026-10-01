// create-adr-evals/fixtures.mjs
//
// Builds throwaway fixture repos — always under os.tmpdir(), never inside
// this repo's tree — for the create-adr-evals harness (#582 T2). Every
// fixture is a real `git init`-ed repo with one seed commit, so run.mjs can
// spawn `claude -p` with cwd set to the fixture root and grade.mjs can diff
// the working tree against the pre-run snapshot this module also builds.
//
// Four variants, three of which share one tree (a themed, wiki-hosted ADR
// bundle reached via `.gvt-agent.json` `paths['docs/decisions/']`):
//   A        — /gvt-dev:create-adr, explicit theme `beta`
//   A-infer  — /gvt-dev:create-adr, no theme given; the topic fits `beta`
//   C        — dispatch gvt-dev:tech-writer directly, explicit theme `alpha`
//   B        — negative control: no `paths` override, docs/decisions/
//              absent, a decoy wiki/ bundle the agent must leave untouched
//
// No fixture file name here is ever a committed `file.ext:NN`-shaped string
// (the pointer-anchor scanner's corpus) — these trees exist only on disk at
// runtime, under a mkdtemp()'d directory this module also cleans up.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const VARIANTS = ['A', 'A-infer', 'C', 'B'];

// ---------------------------------------------------------------------------
// Filesystem + git helpers
// ---------------------------------------------------------------------------

function write(root, relPath, content) {
  const abs = join(root, ...relPath.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

function gitSeed(root) {
  const opts = { cwd: root, encoding: 'utf8', stdio: 'pipe' };
  spawnSync('git', ['init', '-q'], opts);
  spawnSync('git', ['config', 'user.email', 'eval-fixture@example.com'], opts);
  spawnSync('git', ['config', 'user.name', 'create-adr-evals'], opts);
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', ['commit', '-q', '-m', 'chore: seed fixture'], opts);
}

/**
 * Walk `root` (excluding `.git`) and return a Map of repo-relative POSIX
 * path -> sha256 hex digest of the file's bytes. grade.mjs diffs two of
 * these (one taken here at fixture-build time, one taken after the model
 * run) rather than trusting `git status`, since the model may or may not
 * commit its result.
 */
export function snapshotTree(root) {
  const files = new Map();
  function walk(absDir, relDir) {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        const content = readFileSync(abs);
        files.set(rel, createHash('sha256').update(content).digest('hex'));
      }
    }
  }
  walk(root, '');
  return files;
}

// ---------------------------------------------------------------------------
// Shared themed-wiki tree (A / A-infer / C)
// ---------------------------------------------------------------------------

function buildWikiTree(root) {
  write(root, 'CLAUDE.md', `# Fixture Project (wiki-hosted ADRs)

## Commit Format

Use \`<scope>: <description>\` for every commit (e.g. \`docs: add ADR 0004 — <title>\`).
`);

  write(root, 'docs/TOC.md', `# Documentation Index

## Decision Records

See [wiki/decisions/index.md](../wiki/decisions/index.md) for architecture
decision records — this project hosts ADRs in the wiki, not \`docs/decisions/\`.
`);

  write(root, '.gvt-agent.json', `${JSON.stringify({
    project: {
      name: 'fixture-wiki-adrs',
      description: 'create-adr-evals fixture (wiki-hosted, themed ADRs)',
      languages: ['javascript'],
    },
    commands: { test: '', lint: '', build: '', validate: '' },
    repo: {},
    features: {},
    paths: { 'docs/decisions/': 'wiki/decisions/' },
    wiki: { wikiDir: 'wiki' },
  }, null, 2)}\n`);

  // maintain-wiki's `unreachable-subtree` check requires every subdirectory
  // index.md — at ANY depth — to be linked directly from the bundle-ROOT
  // index (probed directly: checkOrphanedPages() only consults
  // resolvedByIndexDir[rootDir], never a transitive chain through an
  // intermediate index). So the root index links each theme index here too,
  // not only the themed root `decisions/index.md` — without this, even a
  // pristine, untouched fixture reports two false "unreachable-subtree"
  // findings before the model does anything.
  write(root, 'wiki/index.md', `---
okf_version: "0.2"
---

# Wiki Index

## Decision Records

* [Decision Records](decisions/index.md) - architecture and trade-off decisions, grouped by theme
* [Alpha decisions](decisions/alpha/index.md) - decisions about the alpha subsystem's public API surface
* [Beta decisions](decisions/beta/index.md) - decisions about the beta subsystem's storage layer
`);

  write(root, 'wiki/decisions/index.md', `# Decision Records

Architecture decisions for this project, grouped by theme.

## Themes

* [Alpha](alpha/index.md) - decisions about the alpha subsystem's public API surface
* [Beta](beta/index.md) - decisions about the beta subsystem's storage layer
`);

  write(root, 'wiki/decisions/alpha/index.md', `# Alpha Decisions

Decisions about the alpha subsystem's public API surface.

## Records

* [Use REST over GraphQL for the alpha API](0001-use-rest-over-graphql.md) - chose REST for the public alpha API surface over GraphQL
* [Version the alpha API via URL prefix](0003-version-api-via-url-prefix.md) - chose URL-prefix versioning over header-based versioning for the alpha API
`);

  write(root, 'wiki/decisions/alpha/0001-use-rest-over-graphql.md', `---
type: decision-record
title: 'Use REST over GraphQL for the alpha API'
description: 'Chose REST for the public alpha API surface over GraphQL'
tags: [decisions, alpha]
status: stable
---

# 0001. Use REST over GraphQL for the alpha API

- **Status:** accepted
- **Date:** 2026-01-10
- **Issue:** none

## Context

The alpha subsystem needed a public API surface, and the team weighed REST
against GraphQL before building it.

## Decision

Use REST for the alpha subsystem's public API.

## Compromise

GraphQL's flexible field selection was rejected as unneeded complexity for
alpha's small, stable resource set.

## Consequences

Clients get a familiar, cacheable REST surface; ad-hoc field selection isn't
available.
`);

  write(root, 'wiki/decisions/alpha/0003-version-api-via-url-prefix.md', `---
type: decision-record
title: 'Version the alpha API via URL prefix'
description: 'Chose URL-prefix versioning over header-based versioning for the alpha API'
tags: [decisions, alpha]
status: stable
---

# 0003. Version the alpha API via URL prefix

- **Status:** accepted
- **Date:** 2026-02-14
- **Issue:** none

## Context

The alpha API needed a versioning scheme before its first breaking change.

## Decision

Version the alpha API via a URL prefix (\`/v1/...\`, \`/v2/...\`).

## Compromise

Header-based versioning was rejected because it made the active version
invisible in logs and bug reports.

## Consequences

Clients see the version in every request path; routing a breaking change to
a new prefix is simple, at the cost of some route duplication.
`);

  write(root, 'wiki/decisions/beta/index.md', `# Beta Decisions

Decisions about the beta subsystem's storage layer.

## Records

* [Use SQLite for local beta storage](0002-use-sqlite-for-local-storage.md) - chose SQLite over flat files for the beta subsystem's local storage
`);

  write(root, 'wiki/decisions/beta/0002-use-sqlite-for-local-storage.md', `---
type: decision-record
title: 'Use SQLite for local beta storage'
description: 'Chose SQLite over flat files for local storage in the beta subsystem'
tags: [decisions, beta]
status: stable
---

# 0002. Use SQLite for local beta storage

- **Status:** accepted
- **Date:** 2026-01-20
- **Issue:** none

## Context

The beta subsystem needed durable local storage for a small, frequently
read/written cache table.

## Decision

Use SQLite for the beta subsystem's local storage.

## Compromise

Flat files were rejected because they gave up transactional writes the
cache table needed.

## Consequences

Writes are transactional and crash-safe; the process carries a small
embedded database dependency it didn't have before.
`);

  // Decoy: proves the agent honors `.gvt-agent.json`'s `paths` override
  // rather than falling back to the retired default location.
  write(root, 'docs/decisions/0009-decoy.md', `# 0009. Decoy decision (ignore)

This file exists only to prove the agent does not treat \`docs/decisions/\`
as the ADR home when \`.gvt-agent.json\`'s \`paths\` override points elsewhere.
`);
}

// ---------------------------------------------------------------------------
// Shared default-location tree (B)
// ---------------------------------------------------------------------------

function buildDefaultTree(root) {
  write(root, 'CLAUDE.md', `# Fixture Project (default ADR location)

## Commit Format

Use \`<scope>: <description>\` for every commit (e.g. \`docs: add ADR 0001 — <title>\`).
`);

  write(root, 'docs/TOC.md', `# Documentation Index

## Decision Records
`);

  write(root, '.gvt-agent.json', `${JSON.stringify({
    project: {
      name: 'fixture-default-adrs',
      description: 'create-adr-evals fixture (default docs/decisions/ location)',
      languages: ['javascript'],
    },
    commands: { test: '', lint: '', build: '', validate: '' },
    repo: {},
    features: {},
    paths: {},
  }, null, 2)}\n`);

  // Decoy wiki bundle: unrelated to this project's ADR conventions (no
  // `paths` override points here). Proves the agent doesn't mistake a
  // wiki/ directory it happens to see for its ADR home.
  write(root, 'wiki/index.md', `# Wiki Index (decoy)

This directory is unrelated to this project's ADR conventions — it exists
only to prove the agent never writes an ADR here.

## Decisions (decoy)

* [Decoy decision](decisions/0007-decoy.md) - unrelated decoy content
`);

  write(root, 'wiki/decisions/0007-decoy.md', `# Decoy decision (ignore)

This file exists only to prove the agent doesn't mistake this project's
decoy \`wiki/\` directory for its ADR home.
`);

  // docs/decisions/ is deliberately absent — the first-use scaffold path.
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const NON_INTERACTIVE = 'Operate fully non-interactively: do not ask the user '
  + 'any clarifying questions. Make a reasonable choice yourself for anything '
  + 'you would normally ask about (placement is "append"; decision date is '
  + 'today). Never create a new ADR theme directory unless explicitly told to.';

function createAdrPrompt({ themeLine, title, context, decision, compromise, consequences }) {
  return [
    'This is a throwaway test repository for evaluating the gvt-dev plugin.',
    'Use the /gvt-dev:create-adr skill to author one new, on-demand architecture',
    'decision record (placement: append).',
    NON_INTERACTIVE,
    themeLine,
    `Title: ${title}`,
    `Context: ${context}`,
    `Decision: ${decision}`,
    `Compromise: ${compromise}`,
    `Consequences: ${consequences}`,
    'Issue ref: none.',
  ].filter(Boolean).join('\n');
}

function techWriterPrompt({ title, context, decision, compromise, consequences }) {
  return [
    'This is a throwaway test repository for evaluating the gvt-dev plugin.',
    'Use the Agent tool to dispatch the gvt-dev:tech-writer agent directly',
    '(do not invoke the create-adr skill or any other skill) to author one new',
    'architecture decision record with these exact parameters:',
    '- ADR directory: wiki/decisions/',
    '- Target number: 4 (zero-padded 0004) — use this number explicitly, do not compute next-highest',
    '- Theme: alpha',
    '- wiki: true (this directory is inside the project wiki: OKF frontmatter is required, no docs/decisions/README.md scaffold, no docs/TOC.md update; register the new record in wiki/decisions/alpha/index.md instead)',
    `- Title: ${title}`,
    `- Context: ${context}`,
    `- Decision: ${decision}`,
    `- Compromise: ${compromise}`,
    `- Consequences: ${consequences}`,
    '- Issue ref: none',
    NON_INTERACTIVE,
    'Stage the result; do not ask whether to proceed.',
  ].join('\n');
}

const PROMPTS = {
  A: createAdrPrompt({
    themeLine: 'Theme: beta.',
    title: 'Cache beta read-API responses for 60 seconds',
    context: "Downstream services were issuing redundant requests against the beta subsystem's read API because responses were never cached, adding needless load during traffic spikes.",
    decision: 'Cache every beta read-API response for 60 seconds at the edge, replacing the previous no-cache default.',
    compromise: 'A 60-second TTL risks serving stale beta data during that window; a shorter 10-second TTL was rejected as not reducing load enough, and per-endpoint TTLs were rejected as unnecessary complexity for the current traffic pattern.',
    consequences: 'Downstream load drops immediately; beta read responses can be up to 60 seconds stale, so time-sensitive consumers must account for that.',
  }),
  'A-infer': createAdrPrompt({
    themeLine: 'Choose the single most fitting existing theme yourself (do not ask which one, and do not create a new theme).',
    title: "Switch beta's local cache store from SQLite to an in-process LRU",
    context: "The beta subsystem's local storage layer used SQLite for a small, frequently-overwritten cache table, but write amplification from SQLite's WAL was adding latency under load.",
    decision: 'Replace that SQLite-backed cache table with an in-process LRU cache sized to the working set.',
    compromise: "An in-memory LRU loses its contents on process restart, which SQLite didn't; a Redis-backed cache was rejected as operational overweight for this cache's size.",
    consequences: 'Cache writes get much faster and simpler; a process restart now cold-starts the cache, so the first requests after a restart see higher latency.',
  }),
  C: techWriterPrompt({
    title: 'Rate-limit the alpha API per API key',
    context: 'A small number of alpha API clients were able to starve the rest by issuing requests without any per-client limit.',
    decision: 'Apply a per-API-key rate limit on the alpha API, enforced at the gateway.',
    compromise: 'A global (non-per-key) rate limit was rejected because one noisy client could still exhaust the shared budget for everyone else.',
    consequences: "Well-behaved clients are now protected from noisy neighbors; a legitimate client with a sudden traffic spike must request a higher per-key limit instead of it being absorbed automatically.",
  }),
  B: createAdrPrompt({
    themeLine: '',
    title: 'Adopt trunk-based development for this project',
    context: 'Long-lived feature branches were accumulating large, hard-to-review diffs and frequent merge conflicts.',
    decision: 'Adopt trunk-based development: short-lived branches merged to the trunk within a day or two.',
    compromise: 'Git-flow-style release branches were rejected as unnecessary process overhead for a project that ships continuously.',
    consequences: 'Merge conflicts shrink and review diffs stay small; work in progress is visible on the trunk sooner, so incomplete features need a flag or to stay small enough to land in one piece.',
  }),
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build one fresh fixture repo for `variant` under a new mkdtemp() directory.
 * Returns `{ root, before, meta, prompt }`:
 *   - `root`   — absolute path to the fixture repo (git-initialized, one seed commit)
 *   - `before` — snapshotTree(root) taken immediately after the seed commit
 *   - `meta`   — grading inputs (see grade.mjs): wiki/decisionsDir/themes/expectedNumber/expectedTheme
 *   - `prompt` — the prompt text run.mjs passes to `claude -p`
 */
export function buildFixture(variant, { tmpRoot } = {}) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`Unknown create-adr-evals variant: ${variant} (expected one of ${VARIANTS.join(', ')})`);
  }

  // realpathSync.native expands a Windows 8.3 short name (e.g. FABIEN~1) in
  // os.tmpdir(): Claude Code's permission layer treats writes under a short
  // path as suspicious and denies them in a headless run, which made runs
  // fail for reasons unrelated to the skill under test.
  const base = realpathSync.native(tmpRoot ?? tmpdir());
  const root = mkdtempSync(join(base, `create-adr-eval-${variant.replace(/[^A-Za-z0-9]/g, '')}-`));

  let meta;
  if (variant === 'B') {
    buildDefaultTree(root);
    meta = {
      wiki: false,
      decisionsDir: 'docs/decisions/',
      themes: [],
      expectedNumber: 1,
      expectedTheme: null,
    };
  } else {
    buildWikiTree(root);
    meta = {
      wiki: true,
      decisionsDir: 'wiki/decisions/',
      themes: ['alpha', 'beta'],
      expectedNumber: 4,
      expectedTheme: variant === 'A' ? 'beta' : variant === 'C' ? 'alpha' : null,
    };
  }

  gitSeed(root);
  const before = snapshotTree(root);

  return { root, before, meta, prompt: PROMPTS[variant] };
}
