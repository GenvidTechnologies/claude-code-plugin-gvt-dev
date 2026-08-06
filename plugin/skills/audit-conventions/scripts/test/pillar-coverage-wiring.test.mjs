// Integration test: the "### Practice Coverage" section (lib/pillar-report.mjs's
// formatPracticeCoverage, fed by lib/practice-detect.mjs's detectWikiAdoption)
// is wired into audit.mjs's report output.
//
// THIS FILE IS INTENTIONALLY RED (issue #227, task P8). audit.mjs has not
// been wired to call formatPracticeCoverage / detectWikiAdoption yet — that
// is task F1. Every assertion below is written against the *target* report
// shape and is expected to fail until F1 lands; do not edit audit.mjs to
// turn this green from this task.
//
// Case (d) is the exception worth calling out explicitly: it asserts an
// *absence* (no "unknown pillar" finding, exit 0). Nothing in audit.mjs
// currently emits that finding at all, so (d) passes today for the wrong
// reason — vacuously, the same trap principle-citations-wiring.test.mjs's
// header warns about ("a fixture containing only valid data would pass
// vacuously and prove nothing about the gate"). Here it is a fixture
// containing only *invalid* data (a typo'd pillar) that currently proves
// nothing, because there is no gate yet to suppress. Once F1 wires an
// author-time "unknown pillar" check gated on AUDITING_PLUGIN_SOURCE, this
// same assertion becomes load-bearing: it will prove the gate actively
// suppresses a real, would-be finding when the audited repo is a consumer's
// temp fixture rather than the plugin source tree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { withTempMigratedRepo } from './helpers/temp-repo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/test/pillar-coverage-wiring.test.mjs -> scripts -> audit-conventions -> skills -> plugin
const AUDIT_PATH = resolve(__dirname, '..', 'audit.mjs');

function spawnAudit(args, cwd) {
  return spawnSync(process.execPath, [AUDIT_PATH, ...args], { cwd, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// (a) + (c) — T10 not-adopted path, and T11's load-bearing exit-code guard.
// A bare STATE_MIGRATED repo with no wiki artifacts whatsoever: the wiki
// pillar has nothing to detect. This is the path the plugin repo itself can
// never exercise (it has fully adopted the wiki), so a temp fixture is the
// only way to reach it.
// ---------------------------------------------------------------------------

// condense-lessons requires docs/TOC.md as a *required* expectation — write
// it in every fixture below so the exit-code assertions are isolated to the
// Practice Coverage finding(s) under test rather than tripping on an
// unrelated required-file error (mirrors principle-citations-wiring.test.mjs's
// own docs/TOC.md write, for the same reason).
async function withTempPracticeCoverageRepo(setup) {
  return withTempMigratedRepo(async (dir) => {
    await writeFile(join(dir, 'docs', 'TOC.md'), '# TOC\n');
    if (setup) await setup(dir);
  });
}

test('audit: Practice Coverage renders "not adopted" for Environment when no wiki artifacts exist, and never gates the exit code (T10, T11)', async () => {
  const tmpDir = await withTempPracticeCoverageRepo();
  try {
    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /### Practice Coverage/,
      `report should include a "### Practice Coverage" section:\n${result.stdout}`,
    );
    assert.match(
      result.stdout,
      /Environment \|.*\| not adopted/,
      `Environment row should read "not adopted" when no wiki artifacts exist:\n${result.stdout}`,
    );

    // CRITICAL: a missing practice is an info-style finding, not a contract
    // violation — it must never move the audit's exit code. This is the same
    // load-bearing regression guard hygiene-wiring.test.mjs carries for its
    // own always-on scanners, applied here to the new Practice Coverage
    // surface.
    assert.equal(
      result.status,
      0,
      `audit must exit 0 despite zero wiki practice adoption:\n${result.stdout}`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// (b) — T10 positive control: the same fixture, but fully wiki-adopted.
// Proves case (a)'s "not adopted" assertion is sensitive to the fixture
// (i.e. the renderer actually reads real signals) rather than a string the
// report always emits regardless of repo state.
// ---------------------------------------------------------------------------

async function withTempAdoptedWikiRepo() {
  return withTempPracticeCoverageRepo(async (dir) => {
    await mkdir(join(dir, 'wiki'), { recursive: true });
    await writeFile(join(dir, 'wiki', 'index.md'), '# Index\n');
    await writeFile(join(dir, 'wiki', 'log.md'), '# Log\n');
    await mkdir(join(dir, 'raw'), { recursive: true });
    await writeFile(join(dir, 'docs', 'wiki-schema.md'), '# Schema\n');
    await writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify(
        { project: { name: 'foo' }, commands: { validate: 'echo ok' }, wiki: {} },
        null,
        2,
      ),
    );
  });
}

test('audit: Practice Coverage renders "adopted" for Environment when all wiki artifacts + config are present (T10 positive control)', async () => {
  const tmpDir = await withTempAdoptedWikiRepo();
  try {
    const result = spawnAudit([], tmpDir);

    assert.match(
      result.stdout,
      /Environment \|.*\| adopted/,
      `Environment row should read "adopted" once wiki/, raw/, docs/wiki-schema.md and the wiki config block are all present:\n${result.stdout}`,
    );
    // Guard against the not-adopted regex false-positiving on "not adopted"
    // (which itself contains the substring "adopted").
    assert.doesNotMatch(
      result.stdout,
      /Environment \|.*\| not adopted/,
      `Environment row should not read "not adopted" once the wiki is fully adopted:\n${result.stdout}`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// (d) — T26: the author-time "unknown pillar" gate must actively suppress a
// real, would-be finding when auditing a consuming repo (not the plugin
// source tree). Mirrors principle-citations-wiring.test.mjs's reasoning: a
// fixture carrying only valid pillar declarations would pass vacuously and
// prove nothing about the gate. This fixture deliberately carries a bogus
// declaration (`pillar: enviroment`, a misspelling of `environment`) so
// that IF the gate were ever missing or defeated, this test would catch it
// by seeing the finding escalate the exit code to 1.
//
// As the file header notes: today nothing in audit.mjs emits an
// "unknown pillar" finding at all (no pillar scanning is wired yet), so this
// assertion currently passes vacuously — it proves nothing about a gate that
// doesn't exist yet. It becomes load-bearing once F1's author-time pillar
// check lands.
// ---------------------------------------------------------------------------

async function withTempBogusPillarRepo() {
  return withTempPracticeCoverageRepo(async (dir) => {
    await mkdir(join(dir, 'plugin', 'skills', 'foo'), { recursive: true });
    await writeFile(
      join(dir, 'plugin', 'skills', 'foo', 'SKILL.md'),
      [
        '---',
        'name: foo',
        'description: Foo skill test fixture.',
        'metadata:',
        '  pillar: enviroment',
        '---',
        '',
        '# Foo',
        '',
        'Test fixture skill with a typo\'d pillar declaration.',
        '',
      ].join('\n'),
    );
  });
}

test('audit: "unknown pillar" is not surfaced against a consuming repo, even with a bogus pillar declaration present (T26)', async () => {
  const tmpDir = await withTempBogusPillarRepo();
  try {
    const result = spawnAudit([], tmpDir);

    assert.doesNotMatch(
      result.stdout,
      /unknown pillar/,
      'an "unknown pillar" finding is author-time-only and must not fire when auditing a consuming ' +
        "repo, even though this fixture carries a misspelled pillar ('enviroment') that would trip it",
    );
    assert.equal(
      result.status,
      0,
      `audit must exit 0: the bogus pillar declaration must not fire outside the plugin source:\n${result.stdout}`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
