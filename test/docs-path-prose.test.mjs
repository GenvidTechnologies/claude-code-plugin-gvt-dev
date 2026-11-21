// Scans the prose of plugin components for consumer `docs/` paths.
//
// A body may name a `docs/` path that a component declares (a `- path: docs/...`
// line in its frontmatter) only beside the words that resolve it through the
// consumer's `paths` override. Every other consumer `docs/` literal is recorded
// in an allowlist with a kind and a note. This file holds the pure scan() and
// its fixture tests. The scan of the real corpus is wired in separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PHRASE =
  'the file that `CONVENTIONS.md` "Runtime path resolution" resolves for `';
const PHRASE_LEAD = '"Runtime path resolution" resolves for';

export const KINDS = [
  'example',
  'other-repo',
  'plugin-tree',
  'common-location-hint',
  'historical',
  'describes-the-audit',
  'resolved-earlier',
  'heuristic',
  'plugin-defined-location',
];

export const EXTERNAL = [{ key: 'docs/wiki-schema.md', declaredBy: 'gvt-wiki maintain-wiki' }];

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

// Returns { declared: string[], bodyStart: number } for one file's text.
// bodyStart is the 0-based index of the first line after the frontmatter.
function splitFrontmatter(lines) {
  if (lines[0] === undefined || lines[0].trim() !== '---') return { declared: [], bodyStart: 0 };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) return { declared: [], bodyStart: 0 };
  const declared = [];
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^\s*-\s*path:\s*["']?(docs\/[^\s"']+)["']?\s*$/);
    if (m) declared.push(m[1]);
  }
  return { declared, bodyStart: end + 1 };
}

// Splits a body into blocks: { line, text }. line is 1-based, in the whole file.
function blocksOf(lines, bodyStart) {
  const blocks = [];
  let cur = null;
  let inFence = false;
  const flush = () => {
    if (cur) blocks.push({ line: cur.line, text: collapse(cur.lines.join(' ')) });
    cur = null;
  };
  for (let i = bodyStart; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*(```|~~~)/.test(ln)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (ln.trim()) blocks.push({ line: i + 1, text: collapse(ln) });
      continue;
    }
    if (!ln.trim()) {
      flush();
      continue;
    }
    if (/^\s{0,3}#{1,6}\s/.test(ln) || /^\s*\|/.test(ln)) {
      flush();
      blocks.push({ line: i + 1, text: collapse(ln) });
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(ln)) {
      flush();
      cur = { line: i + 1, lines: [ln] };
      continue;
    }
    if (cur) cur.lines.push(ln);
    else cur = { line: i + 1, lines: [ln] };
  }
  flush();
  return blocks;
}

function markKeysOf(text) {
  const keys = [];
  for (const m of text.matchAll(/paths\['([^']+)'\]/g)) keys.push(m[1]);
  for (const m of text.matchAll(/resolves for `([^`]+)`/g)) keys.push(m[1]);
  return keys;
}

// Finds the `docs/` tokens of a block. Each is { token, declared } where declared
// is true when the token names a declared path (token is then that path).
function docsTokens(text, declared) {
  const out = [];
  const seen = new Set();
  const sorted = [...declared].sort((a, b) => b.length - a.length);
  for (const m of text.matchAll(/docs\//g)) {
    const idx = m.index;
    if (idx > 0 && /[A-Za-z0-9_./}-]/.test(text[idx - 1])) continue;
    const raw = text.slice(idx).match(/^docs\/[A-Za-z0-9_.\-/<>*]*/)[0].replace(/[.,;:]+$/, '');
    const hit = sorted.find((x) => (x.endsWith('/') ? raw.startsWith(x) : raw === x));
    const token = hit ?? raw;
    const key = (hit ? 'D:' : 'O:') + token;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ token, declared: Boolean(hit) });
  }
  return out;
}

// Shortest substring around the token that matches exactly one block of the file.
function pickAnchor(text, token, fileBlocks) {
  const at = Math.max(0, text.indexOf(token));
  for (const radius of [20, 40, 80, 160]) {
    const anchor = text.slice(Math.max(0, at - radius), at + token.length + radius);
    if (fileBlocks.filter((b) => b.text.includes(anchor)).length === 1) return anchor;
  }
  return text;
}

// Pure scan. files: { path, text }[]. literals: { file, anchor, token, kind, note }[].
// externalKeys: string[] of keys that a MARK may name without a component declaring them.
export function scan({ files, literals = [], externalKeys = [] }) {
  const declaredSet = new Set();
  const parsed = files.map((f) => {
    const lines = f.text.split(/\r?\n/);
    const fm = splitFrontmatter(lines);
    for (const d of fm.declared) declaredSet.add(d);
    return { path: f.path, lines, bodyStart: fm.bodyStart };
  });
  const declared = [...declaredSet].sort();
  const perFile = new Map();
  for (const p of parsed) perFile.set(p.path, blocksOf(p.lines, p.bodyStart));

  const uncovered = [];
  const marked = [];
  const phraseVariants = [];
  const unknownKeys = [];
  const known = new Set([...declared, ...externalKeys]);

  for (const [file, blocks] of perFile) {
    for (const b of blocks) {
      const keys = markKeysOf(b.text);
      for (const key of keys) {
        if (!known.has(key)) unknownKeys.push({ file, line: b.line, token: key });
      }
      if (b.text.includes(PHRASE_LEAD) && !b.text.includes(PHRASE)) {
        phraseVariants.push({ file, line: b.line, token: PHRASE_LEAD });
      }
      for (const t of docsTokens(b.text, declared)) {
        if (t.declared && keys.includes(t.token)) {
          marked.push({ file, line: b.line, token: t.token });
          continue;
        }
        if (!t.declared && keys.includes(t.token)) continue;
        const covered = literals.some(
          (l) => l.file === file && l.token === t.token && b.text.includes(l.anchor),
        );
        if (covered) continue;
        uncovered.push({
          file,
          line: b.line,
          token: t.token,
          tier: t.declared ? 1 : 2,
          skeleton: {
            file,
            anchor: pickAnchor(b.text, t.token, blocks),
            token: t.token,
            kind: '?',
            note: '',
          },
        });
      }
    }
  }

  const staleLiterals = [];
  const ambiguousLiterals = [];
  const badKinds = [];
  for (const l of literals) {
    if (!KINDS.includes(l.kind) || typeof l.note !== 'string' || !l.note.trim()) {
      badKinds.push({ file: l.file, anchor: l.anchor, token: l.token, kind: l.kind });
    }
    const hits = (perFile.get(l.file) ?? []).filter((b) => b.text.includes(l.anchor));
    if (hits.length === 0) {
      staleLiterals.push({ file: l.file, anchor: l.anchor, token: l.token, why: 'no block matches the anchor' });
    } else if (hits.length > 1) {
      ambiguousLiterals.push({
        file: l.file,
        anchor: l.anchor,
        token: l.token,
        lines: hits.map((b) => b.line),
      });
    } else {
      const b = hits[0];
      const named = docsTokens(b.text, declared).some((t) => t.token === l.token);
      if (!named) {
        staleLiterals.push({ file: l.file, anchor: l.anchor, token: l.token, line: b.line, why: 'block no longer names the token' });
      } else if (markKeysOf(b.text).includes(l.token)) {
        staleLiterals.push({ file: l.file, anchor: l.anchor, token: l.token, line: b.line, why: 'block now carries the marker' });
      }
    }
  }

  return { declared, uncovered, marked, staleLiterals, ambiguousLiterals, badKinds, phraseVariants, unknownKeys };
}

// Reads the corpus from disk: { path (repo-relative, POSIX), text }[].
export function loadCorpus(root) {
  const out = [];
  const skipDir = (name) => name === 'node_modules';
  const walk = (rel, recurse) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const childRel = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (recurse && !skipDir(e.name) && childRel !== 'plugin/skeleton') walk(childRel, true);
      } else if (e.name.endsWith('.md') && !/CHANGELOG/i.test(e.name)) {
        out.push({ path: childRel, text: readFileSync(join(root, childRel), 'utf8') });
      }
    }
  };
  walk('plugin/agents', true);
  walk('plugin/skills', true);
  walk('plugin/docs', false);
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

// ---- fixture tests ----

const FM =
  '---\nname: x\nmetadata:\n  expects:\n    files:\n      - path: docs/TOC.md\n        reason: r\n      - path: docs/architecture.md\n---\n';
const OFF = FM.split('\n').length - 1; // lines taken by the frontmatter
const F = 'plugin/skills/demo/SKILL.md';
const mk = (body, path = F) => ({ path, text: FM + body });
const run = (body, extra = {}) => scan({ files: [mk(body)], ...extra });

test('docs-path-prose: U1 a raw read of a declared path is flagged', () => {
  const r = run('Intro.\n\nRead `docs/TOC.md` first.\n');
  assert.deepEqual(r.declared, ['docs/TOC.md', 'docs/architecture.md']);
  assert.equal(r.uncovered.length, 1);
  assert.equal(r.uncovered[0].file, F);
  assert.equal(r.uncovered[0].line, OFF + 3);
  assert.equal(r.uncovered[0].token, 'docs/TOC.md');
  assert.equal(r.uncovered[0].tier, 1);
  assert.deepEqual(
    { ...r.uncovered[0].skeleton, anchor: undefined },
    { file: F, anchor: undefined, token: 'docs/TOC.md', kind: '?', note: '' },
  );
  assert.ok(r.uncovered[0].skeleton.anchor.includes('docs/TOC.md'));
  // CRLF is tolerated and gives the same finding.
  const crlf = scan({ files: [{ path: F, text: (FM + 'Intro.\n\nRead `docs/TOC.md` first.\n').replace(/\n/g, '\r\n') }] });
  assert.equal(crlf.uncovered.length, 1);
  assert.equal(crlf.uncovered[0].line, OFF + 3);
});

test('docs-path-prose: U2 the resolving phrase passes', () => {
  const r = run(`Read ${PHRASE}docs/TOC.md\`.\n`);
  assert.deepEqual(r.uncovered, []);
  assert.deepEqual(r.phraseVariants, []);
  assert.deepEqual(r.unknownKeys, []);
  assert.equal(r.marked.length, 1);
  const alt = run("Read the index at paths['docs/TOC.md'].\n");
  assert.deepEqual(alt.uncovered, []);
  assert.equal(alt.marked.length, 1);
});

test('docs-path-prose: U3 a hard-wrapped marker passes', () => {
  const a = run("Read the index, found through paths\n['docs/TOC.md'] in the config.\n");
  // A split inside the quoted key is not a marker: control for the cases below.
  assert.equal(a.uncovered.length, 1);
  const b = run("Resolve the index at\npaths['docs/TOC.md'] before reading `docs/TOC.md`.\n");
  assert.deepEqual(b.uncovered, []);
  const c = run('Read the file that `CONVENTIONS.md` "Runtime path\nresolution" resolves for\n`docs/TOC.md` first.\n');
  assert.deepEqual(c.uncovered, []);
  assert.deepEqual(c.phraseVariants, []);
  assert.equal(c.marked.length, 1);
});

test('docs-path-prose: U4 sibling list items are separate blocks', () => {
  const r = run("- Resolve paths['docs/TOC.md'] and\n  keep `docs/TOC.md` in view.\n- Also see `docs/TOC.md`.\n");
  assert.equal(r.uncovered.length, 1);
  assert.equal(r.uncovered[0].line, OFF + 3);
  assert.equal(r.uncovered[0].token, 'docs/TOC.md');
  assert.equal(r.marked.length, 1);
  assert.equal(r.marked[0].line, OFF + 1);
  // A marker for one declared path does not cover another path in the same block.
  const other = run("Resolve paths['docs/TOC.md'], then read docs/architecture.md.\n");
  assert.equal(other.uncovered.length, 1);
  assert.equal(other.uncovered[0].token, 'docs/architecture.md');
  // Table rows are blocks of their own too.
  const table = run("| a | b |\n|---|---|\n| paths['docs/TOC.md'] | x |\n| docs/TOC.md | y |\n");
  assert.equal(table.uncovered.length, 1);
  assert.equal(table.uncovered[0].line, OFF + 4);
});

test('docs-path-prose: U5 plugin-tree and look-alike docs/ tokens are ignored', () => {
  const r = run(
    'Read ${CLAUDE_PLUGIN_ROOT}/docs/development-principles.md, plugin/docs/writing-style.md and mydocs/TOC.md.\n',
  );
  assert.deepEqual(r.uncovered, []);
  assert.deepEqual(r.marked, []);
  // Control: the same token with a boundary before it is flagged (tier 2).
  const c = run('Read (docs/development-principles.md) now.\n');
  assert.equal(c.uncovered.length, 1);
  assert.equal(c.uncovered[0].tier, 2);
  assert.equal(c.uncovered[0].token, 'docs/development-principles.md');
});

test('docs-path-prose: U6 a variant of the resolving phrase is flagged', () => {
  const bad = run('Read the file that `plugin/CONVENTIONS.md` "Runtime path resolution" resolves for `docs/TOC.md`.\n');
  assert.equal(bad.phraseVariants.length, 1);
  assert.equal(bad.phraseVariants[0].file, F);
  assert.equal(bad.phraseVariants[0].line, OFF + 1);
  assert.deepEqual(bad.uncovered, []);
  const good = run(`Read ${PHRASE}docs/TOC.md\`.\n`);
  assert.deepEqual(good.phraseVariants, []);
});

test('docs-path-prose: U7 a stale literal anchor is flagged', () => {
  const lit = (over) => ({
    file: F,
    anchor: 'Read the sample',
    token: 'docs/TOC.md',
    kind: 'example',
    note: 'shows a sample path',
    ...over,
  });
  const body = 'Read the sample `docs/TOC.md` here.\n';
  const live = run(body, { literals: [lit()] });
  assert.deepEqual(live.uncovered, []);
  assert.deepEqual(live.staleLiterals, []);
  const gone = run(body, { literals: [lit({ anchor: 'Read the old sample' })] });
  assert.equal(gone.staleLiterals.length, 1);
  assert.equal(gone.staleLiterals[0].anchor, 'Read the old sample');
  assert.equal(gone.uncovered.length, 1);
  const marked = run("Read the sample `docs/TOC.md` via paths['docs/TOC.md'].\n", { literals: [lit()] });
  assert.equal(marked.staleLiterals.length, 1);
  assert.equal(marked.staleLiterals[0].why, 'block now carries the marker');
  const moved = run('Read the sample `docs/other.md` here.\n', { literals: [lit()] });
  assert.equal(moved.staleLiterals.length, 1);
  assert.equal(moved.staleLiterals[0].why, 'block no longer names the token');
  const badKind = run(body, { literals: [lit({ kind: 'whatever' }), lit({ note: '  ' })] });
  assert.equal(badKind.badKinds.length, 2);
});

test('docs-path-prose: U8 an ambiguous literal anchor is flagged', () => {
  const lit = {
    file: F,
    anchor: 'Read the sample',
    token: 'docs/TOC.md',
    kind: 'example',
    note: 'shows a sample path',
  };
  const two = run('Read the sample `docs/TOC.md` here.\n\nRead the sample `docs/TOC.md` there.\n', { literals: [lit] });
  assert.equal(two.ambiguousLiterals.length, 1);
  assert.deepEqual(two.ambiguousLiterals[0].lines, [OFF + 1, OFF + 3]);
  assert.deepEqual(two.staleLiterals, []);
  const one = run('Read the sample `docs/TOC.md` here.\n', { literals: [lit] });
  assert.deepEqual(one.ambiguousLiterals, []);
});

test('docs-path-prose: U9 an undeclared marker key is flagged and an external key passes', () => {
  const bad = run("Read paths['docs/ghost.md'] first.\n", { externalKeys: ['docs/wiki-schema.md'] });
  assert.equal(bad.unknownKeys.length, 1);
  assert.equal(bad.unknownKeys[0].token, 'docs/ghost.md');
  assert.equal(bad.unknownKeys[0].line, OFF + 1);
  const ext = run("Read paths['docs/wiki-schema.md'] first.\n", { externalKeys: EXTERNAL.map((e) => e.key) });
  assert.deepEqual(ext.unknownKeys, []);
  assert.deepEqual(ext.uncovered, []);
  const without = run("Read paths['docs/wiki-schema.md'] first.\n");
  assert.equal(without.unknownKeys.length, 1);
  const declaredKey = run("Read paths['docs/TOC.md'] first.\n");
  assert.deepEqual(declaredKey.unknownKeys, []);
});

test('docs-path-prose: U10 a fenced line naming a declared path is its own block and is flagged', () => {
  const r = run("Resolve paths['docs/TOC.md'] first.\n\n```\ncat docs/TOC.md\nls\n```\n");
  assert.equal(r.uncovered.length, 1);
  assert.equal(r.uncovered[0].line, OFF + 4);
  assert.equal(r.uncovered[0].token, 'docs/TOC.md');
  assert.equal(r.marked.length, 1);
  assert.equal(r.marked[0].line, OFF + 1);
});

// ---- real-tree tests ----

const LITERALS = JSON.parse(readFileSync(join(ROOT, 'test', 'docs-path-literals.json'), 'utf8'));
const real = scan({
  files: loadCorpus(ROOT),
  literals: LITERALS,
  externalKeys: EXTERNAL.map((e) => e.key),
});
const where = (x) => `${x.file}:${x.line ?? '?'} ${x.token}`;
const uncoveredMsg = (list) =>
  list
    .map((u) => `${where(u)}\n  add to test/docs-path-literals.json, or resolve it with the PHRASE:\n  ${JSON.stringify(u.skeleton)}`)
    .join('\n');

test('docs-path-prose: D1 every declared-path block carries a marker or a recorded literal', () => {
  const bad = real.uncovered.filter((u) => u.tier === 1);
  assert.equal(bad.length, 0, `\n${uncoveredMsg(bad)}`);
});

test('docs-path-prose: D2 every other consumer docs/ token carries a recorded literal', () => {
  const bad = real.uncovered.filter((u) => u.tier === 2);
  assert.equal(bad.length, 0, `\n${uncoveredMsg(bad)}`);
});

test('docs-path-prose: D3 every literal anchor matches one block that still names its token', () => {
  const stale = real.staleLiterals.map((s) => `stale: ${where(s)} anchor=${JSON.stringify(s.anchor)} (${s.why})`);
  const amb = real.ambiguousLiterals.map(
    (s) => `ambiguous: ${s.file} ${s.token} anchor=${JSON.stringify(s.anchor)} matches lines ${s.lines.join(', ')}`,
  );
  assert.equal(stale.length + amb.length, 0, `\n${[...stale, ...amb].join('\n')}`);
});

test('docs-path-prose: D4 every literal has a known kind and a note', () => {
  const bad = real.badKinds.map(
    (b) => `${b.file} ${b.token} anchor=${JSON.stringify(b.anchor)} kind=${JSON.stringify(b.kind)}: kind must be one of ${KINDS.join(', ')} and the note must not be empty`,
  );
  assert.equal(bad.length, 0, `\n${bad.join('\n')}`);
  for (const l of LITERALS.filter((x) => x.kind === 'resolved-earlier')) {
    assert.ok(l.note.includes('"'), `${l.file} ${l.token}: a resolved-earlier note quotes the sentence that resolves the path`);
  }
});

test('docs-path-prose: D5 no variant of the resolving phrase', () => {
  const bad = real.phraseVariants.map((p) => `${where(p)}: use exactly ${PHRASE}<path>\``);
  assert.equal(bad.length, 0, `\n${bad.join('\n')}`);
});

test('docs-path-prose: D6 every marker key is a declared path or an external key', () => {
  const bad = real.unknownKeys.map(
    (k) => `${where(k)}: not declared by any component and not in EXTERNAL (declared: ${real.declared.join(', ')})`,
  );
  assert.equal(bad.length, 0, `\n${bad.join('\n')}`);
});
