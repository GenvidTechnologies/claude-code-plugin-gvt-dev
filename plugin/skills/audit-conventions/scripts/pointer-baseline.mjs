#!/usr/bin/env node
// Generates and prunes the pointer-anchor ratchet baseline.
//
// THE SCANNER NEVER WRITES. lib/pointer-anchors.mjs is pure: it reads the
// citing corpus, reads targets, and returns findings. This script is the one
// and only writer of the baseline file — which is why it is a peer of audit.mjs
// rather than a module under lib/. lib/ holds importable logic; this is an
// executable entry point. Every rule about what an entry IS — the key, the
// digest, the envelope the reader accepts — lives in lib/pointer-anchors.mjs
// and is imported here, never restated.
//
// Usage:
//   node pointer-baseline.mjs [repoPath] [--write] [--accept-new]
//   node pointer-baseline.mjs [repoPath] --rename <old>=<new> [--rename ...]
//       [--allow-drift <new-file>@<pointer>#<occurrence>=<current-digest> ...] [--write]
//
//   (bare)        Print the diff this run WOULD apply. Writes nothing.
//   --write       Apply it.
//   --accept-new  Also ADD entries for findings not already in the baseline.
//   --rename      RE-KEY every baseline entry whose citing file is <old> onto
//                 <new>, verbatim apart from `file`. Repeatable, for a
//                 simultaneous batch of moves (chains and swaps both work).
//                 Mutually exclusive with --accept-new. Dry run by default,
//                 same as the modes above.
//   --allow-drift Names ONE re-keyed entry — by its <new-file>, <pointer>,
//                 <occurrence> and its CURRENT digest — and authorizes that
//                 one entry to re-take the current digest instead of
//                 refusing on drift. Requires --rename. Repeatable. Usable
//                 only within the SAME run that re-keys the entry; a token
//                 whose digest is stale, or that names no drifting entry at
//                 all, refuses as an unused allowance.
//
// PRUNE-ONLY IS THE DEFAULT, with or without --write: entries matching nothing
// in the current scan are removed, and nothing is added. That default exists
// because the baseline is a whole-value store with two writers — add and prune —
// and no diff view once it has been written. A wholesale regeneration would
// silently re-accept every finding introduced since the last run, which is the
// clobber this default exists to prevent; prune-only makes accepting new debt a
// separate, explicit act.
//
// A KEPT ENTRY IS PASSED THROUGH VERBATIM, digest included. Re-taking a digest
// is neither an add nor a prune, so this script never does it on its own: a
// pointer-baseline-drifted finding means the target moved under an accepted
// pointer, and resolving it is a decision — repair the citation, or delete the
// entry and re-accept it deliberately — not a regeneration. The ONE exception
// is --rename --allow-drift, which narrows that same delete-and-re-accept
// hatch to a single reviewed entry: the operator names the exact current
// digest by hand, so the re-take is still a deliberate decision, just
// expressed as one token instead of a delete-and-regenerate round trip.
//
// --accept-new REFUSES, with a non-zero exit and no write, while any
// pointer-anchor-drift or pointer-anchor-broken finding exists. Those two kinds
// mean a pointer is provably wrong: the anchor sits elsewhere in the target, or
// nowhere in it at all. Baselining a known-wrong pointer would undercut the
// tool's own premise. Repair them first, then accept the rest.
//
// KNOWN GAP, DELIBERATE. The refusal covers pointer-anchor-drift and
// pointer-anchor-broken. It does NOT cover pointer-anchor-missing — so a newly
// added pointer carrying no content anchor can still be accepted by
// --accept-new without complaint. This gate is not the defence against that; a
// separate guard test pins the specific pointers that must never be baselined.
//
// --RENAME IS A PURE RE-KEY, not a prune or an accept: entries of files not
// named in a --rename pair pass through untouched even when they are stale,
// and the POINTER TEXT of a re-keyed entry is never rewritten — only its
// `file` (the citing side) moves. It refuses, writing nothing, when a re-keyed
// entry finds no current finding at its new key, when a stored digest and the
// current one both exist and disagree AND no --allow-drift token names that
// entry with its current digest (repair the citation, repeat the move without
// --rename, or supply the token — see --allow-drift above), when a <new> path
// already holds baseline entries of its own that are not themselves being
// vacated, when an --allow-drift token matches no drifting entry or names the
// wrong digest (an unused allowance), or when the whole run would re-key
// nothing at all (including an absent or unreadable baseline, which this mode
// never creates or overwrites). A zero-entry pair is not by itself a refusal
// — it is reported and skipped. A drift refusal is ANNOTATED: it checks
// whether the drift is fully explained by the rename itself (a
// cross-reference to the citing file's old basename, rewritten to the new
// one in the same batch) and, when it is, prints a ready --allow-drift token
// to re-run with.
//
// Exit codes: 0 success (including a dry run with pending changes); 1 the
// --accept-new refusal, or a --rename refusal; 2 a usage error.

import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  BASELINE_FILE,
  baselineKey,
  DIGEST_LENGTH,
  loadBaseline,
  renameExplainsDrift,
  scanPointerAnchors,
} from './lib/pointer-anchors.mjs';

// The two finding kinds that block --accept-new. Both mean the citation is
// provably wrong about its target, as opposed to merely uncheckable
// (pointer-anchor-missing) or unresolvable (pointer-ambiguous,
// pointer-unresolved, pointer-orphan-continuation).
const BLOCKING_KINDS = ['pointer-anchor-drift', 'pointer-anchor-broken'];

const USAGE = [
  'Usage: node pointer-baseline.mjs [repoPath] [--write] [--accept-new]',
  '       node pointer-baseline.mjs [repoPath] --rename <old>=<new> [--rename ...]',
  '           [--allow-drift <new-file>@<pointer>#<occurrence>=<current-digest> ...] [--write]',
  '',
  '  (bare)        Print the diff this run would apply. Writes nothing.',
  '  --write       Apply it.',
  '  --accept-new  Also add entries for findings not already in the baseline.',
  '  --rename      Re-key every baseline entry citing <old> onto <new>,',
  '                verbatim apart from `file`. Repeatable. Mutually exclusive',
  '                with --accept-new.',
  '  --allow-drift Re-keys ONE drifted entry, naming its current digest,',
  '                instead of refusing on that entry. Requires --rename.',
  '                Repeatable.',
  '  --help        Print this text.',
  '',
  'Prune-only is the default, with or without --write: entries matching nothing',
  'in the current scan are removed and nothing is added. The baseline is a',
  'whole-value store with no diff view once written, so a wholesale regeneration',
  'would silently re-accept every finding introduced since the last run.',
  '',
  'A kept entry is passed through verbatim, digest included. This script never',
  're-takes a digest on its own: a drifted acceptance is a decision to make by',
  'hand — except within --rename --allow-drift, which narrows that same',
  'delete-and-re-accept decision to one named, reviewed entry.',
  '',
  '--accept-new refuses, with a non-zero exit and no write, while any',
  'pointer-anchor-drift or pointer-anchor-broken finding exists — baselining a',
  'provably wrong pointer would undercut the premise of the check.',
  '',
  'Known gap, deliberate: that refusal covers pointer-anchor-drift and',
  'pointer-anchor-broken only. It does NOT cover pointer-anchor-missing, so a',
  'newly added pointer with no content anchor can still be accepted by',
  '--accept-new without complaint. A separate guard test, not this gate, pins',
  'the specific pointers that must never be baselined.',
  '',
  '--rename is a pure re-key, not a prune or an accept: other files pass',
  'through untouched, and the POINTER TEXT of a re-keyed entry is never',
  'rewritten, only its `file`. It refuses — writing nothing — when a re-keyed',
  'entry finds no current finding at its new key, when a stored digest and the',
  'current one disagree and no --allow-drift token names that entry with its',
  'current digest, when a <new> already holds entries of its own that are not',
  'themselves being vacated, when an --allow-drift token matches no drifting',
  'entry or names the wrong digest (an unused allowance), or when the whole',
  'run would re-key nothing at all (an absent baseline included — this mode',
  'never creates or overwrites one). A zero-entry pair is reported and',
  'skipped, not a refusal by itself. A drift refusal says whether the rename',
  'itself explains it and, when it does, prints a ready --allow-drift token.',
].join('\n');

// One row per flag. --targets (#594) and any later addition slot in here.
const OPTIONS = {
  write: { type: 'boolean' },
  'accept-new': { type: 'boolean' },
  rename: { type: 'string', multiple: true },
  'allow-drift': { type: 'string', multiple: true },
  help: { type: 'boolean', short: 'h' },
};

function parseCliArgs(argv) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    }));
  } catch (err) {
    // Map by err.code, not message text — node:util's wording is not a
    // contract this script owns.
    if (err.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      const match = /Unknown option '([^']+)'/.exec(err.message);
      const token = match ? match[1] : argv.find((arg) => arg.startsWith('-'));
      return { error: `unknown option '${token}'` };
    }
    if (err.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      return { error: err.message.split('\n')[0] };
    }
    throw err;
  }

  if (positionals.length > 1) {
    return { error: `unexpected extra argument '${positionals[1]}'` };
  }

  // A lone positional shaped like a --rename pair is a forgotten flag, not a
  // repoPath — catch it before it is silently resolved as one.
  if (positionals[0] !== undefined && positionals[0].includes('=')) {
    return {
      error: `positional argument '${positionals[0]}' looks like a --rename pair — did you forget --rename?`,
    };
  }

  const renameTokens = values.rename ?? [];
  if (renameTokens.length > 0 && values['accept-new']) {
    return { error: '--rename cannot be combined with --accept-new' };
  }

  // Checked before either token list is parsed for its own grammar, so a
  // malformed --allow-drift token given without --rename still reports the
  // mode error, not a grammar error about a token that can never be used.
  const allowDriftTokens = values['allow-drift'] ?? [];
  if (allowDriftTokens.length > 0 && renameTokens.length === 0) {
    return { error: '--allow-drift requires --rename' };
  }

  let renames = null;
  if (renameTokens.length > 0) {
    const parsed = parseRenameTokens(renameTokens);
    if (parsed.error) return { error: parsed.error };
    renames = parsed.renames;
  }

  let allowances = [];
  if (allowDriftTokens.length > 0) {
    const parsed = parseAllowDriftTokens(allowDriftTokens);
    if (parsed.error) return { error: parsed.error };
    allowances = parsed.allowances;
  }

  return {
    repoPath: positionals[0],
    write: values.write ?? false,
    acceptNew: values['accept-new'] ?? false,
    renames,
    allowances,
    help: values.help ?? false,
  };
}

// Normalizes a repoPath-shaped token for path comparison against the citing
// corpus: backslashes to forward slashes, leading './' components stripped
// repeatedly.
function normalizeRepoPath(value) {
  let out = String(value).replace(/\\/g, '/');
  while (out.startsWith('./')) out = out.slice(2);
  return out;
}

// Parses and validates every --rename token into `[{ old, new }]`, both sides
// normalized. Each token must be a single non-empty <old>=<new> pair whose
// sides differ once normalized; an <old> or a <new> may each appear at most
// once across the whole batch — the "two pairs onto one <new>" and "renamed
// twice" cases are usage errors, not something planRename has to notice, and
// planRename's own ontoExisting refusal only has to guard a <new> that is NOT
// itself part of the batch.
function parseRenameTokens(tokens) {
  const renames = [];
  const seenOld = new Set();
  const seenNew = new Set();

  for (const token of tokens) {
    const parts = token.split('=');
    if (parts.length !== 2) {
      return { error: `--rename '${token}' is not a single <old>=<new> pair` };
    }
    const [rawOld, rawNew] = parts;
    if (rawOld === '' || rawNew === '') {
      return { error: `--rename '${token}' is missing its <old> or <new> side` };
    }

    const from = normalizeRepoPath(rawOld);
    const to = normalizeRepoPath(rawNew);
    if (from === to) {
      return { error: `--rename '${token}' names the same path on both sides` };
    }
    if (seenOld.has(from)) {
      return { error: `--rename names '${from}' as <old> more than once` };
    }
    if (seenNew.has(to)) {
      return { error: `--rename names '${to}' as <new> more than once` };
    }

    seenOld.add(from);
    seenNew.add(to);
    renames.push({ old: from, new: to });
  }

  return { renames };
}

// A digest is exactly DIGEST_LENGTH lowercase hex characters — the same
// alphabet digestCitedRange (lib/pointer-anchors.mjs) writes, so a token
// naming a digest the lib could never have produced is rejected at parse
// time rather than silently failing to match anything later.
const ALLOW_DRIFT_DIGEST_RE = new RegExp(`^[0-9a-f]{${DIGEST_LENGTH}}$`);

// Parses one --allow-drift token, `<new-file>@<pointer>#<occurrence>=<current-digest>`,
// from the RIGHT: the last `=` splits off the digest, the last `#` before
// that splits off the occurrence, and the last `@` before THAT splits the
// file from the pointer. This relies on the pointer grammar
// (PATH_SOURCE/LINESPEC_SOURCE in lib/pointer-anchors.mjs) never containing
// an `@`, `#` or `=` of its own. If a future pointer form ever did, a token
// would split at the wrong boundary and match no baseline key — which fails
// SAFE: an unused allowance refuses the run, it can never silently authorize
// a drift it was not meant to.
function parseAllowDriftToken(token) {
  const eq = token.lastIndexOf('=');
  if (eq === -1) {
    return { error: `--allow-drift '${token}' is missing '=<current-digest>'` };
  }
  const digest = token.slice(eq + 1);
  if (!ALLOW_DRIFT_DIGEST_RE.test(digest)) {
    return {
      error: `--allow-drift '${token}' has a malformed digest — expected ${DIGEST_LENGTH} lowercase hex characters`,
    };
  }

  const hash = token.lastIndexOf('#', eq - 1);
  if (hash === -1) {
    return { error: `--allow-drift '${token}' is missing '#<occurrence>'` };
  }
  const occurrenceText = token.slice(hash + 1, eq);
  if (!/^[0-9]+$/.test(occurrenceText)) {
    return { error: `--allow-drift '${token}' has a non-integer occurrence '${occurrenceText}'` };
  }

  const at = token.lastIndexOf('@', hash - 1);
  if (at === -1) {
    return { error: `--allow-drift '${token}' is missing '@<pointer>'` };
  }
  const rawFile = token.slice(0, at);
  const pointer = token.slice(at + 1, hash);
  if (rawFile === '') {
    return { error: `--allow-drift '${token}' is missing its <new-file>` };
  }
  if (pointer === '') {
    return { error: `--allow-drift '${token}' is missing its <pointer>` };
  }

  return {
    allowance: {
      file: normalizeRepoPath(rawFile),
      pointer,
      occurrence: Number(occurrenceText),
      digest,
    },
  };
}

function parseAllowDriftTokens(tokens) {
  const allowances = [];
  for (const token of tokens) {
    const parsed = parseAllowDriftToken(token);
    if (parsed.error) return { error: parsed.error };
    allowances.push(parsed.allowance);
  }
  return { allowances };
}

// The identity fields plus the digest — taken straight off a finding, because a
// finding already carries everything an entry needs. `kind` is recorded for a
// reader's benefit and is deliberately not part of the key.
const entryFrom = (finding) => ({
  file: finding.file,
  pointer: finding.pointer,
  occurrence: finding.occurrence ?? 0,
  kind: finding.kind,
  digest: finding.digest ?? null,
});

// Stable order so the written file diffs legibly between runs. The reader does
// not care about order; a human reviewing a prune does.
const sortEntries = (entries) =>
  [...entries].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.pointer.localeCompare(b.pointer) ||
      a.occurrence - b.occurrence,
  );

function tallyKinds(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');
}

// Computes what this run would change. Pure — the caller owns both the scan and
// the write.
//
// `missing` is every current finding absent from the baseline; `add` is that
// same set only when --accept-new was passed, which is the entire difference
// between the two modes. Two findings cannot share a key today (the checks that
// produce them are mutually exclusive), but first-wins dedupe keeps that an
// invariant of this file rather than an assumption about another one.
function planBaseline(findings, baseline, { acceptNew = false } = {}) {
  const current = new Map();
  for (const finding of findings) {
    const key = baselineKey(finding);
    if (!current.has(key)) current.set(key, entryFrom(finding));
  }

  const existingKeys = new Set(baseline.entries.map((entry) => baselineKey(entry)));
  const kept = baseline.entries.filter((entry) => current.has(baselineKey(entry)));
  const prune = baseline.entries.filter((entry) => !current.has(baselineKey(entry)));
  const missing = [...current.values()].filter((entry) => !existingKeys.has(baselineKey(entry)));
  const add = acceptNew ? missing : [];

  return {
    kept,
    prune,
    missing,
    add,
    entries: sortEntries([...kept, ...add]),
    changed: prune.length > 0 || add.length > 0,
  };
}

// Computes what a --rename run would apply: a SIMULTANEOUS re-key of every
// baseline entry whose `file` is an <old> in `renames`, onto the paired
// <new>. Pure — the caller owns the scan, the load, and the write.
//
// `renames` is `[{ old, new }]`, both sides already normalized. `allowances`
// is `[{ file, pointer, occurrence, digest }]` — parsed --allow-drift tokens,
// each naming ONE re-keyed entry (by its <new-file>/<pointer>/<occurrence>)
// and the CURRENT digest it authorizes that entry to re-take instead of
// refusing on drift.
//
// All <old> paths are vacated in ONE pass before anything is re-keyed, which
// is what makes a chain (a=b, b=c) and a swap (a=b, b=a) both land correctly:
// a <new> that is itself being vacated by another pair is never mistaken for
// an occupied target.
//
// Five refusal categories, collected together rather than stopping at the
// first:
//   - ontoExisting  — a <new> already holds entries of its own that are not
//                     themselves part of this batch;
//   - noFinding     — a re-keyed entry's new key matches no current finding;
//   - drift         — a re-keyed entry's stored digest and the current
//                     digest at its new key are both non-null and disagree,
//                     and no allowance names that entry with that current
//                     digest;
//   - unusedAllowance — an --allow-drift token that matched no drifting
//                     entry at all, or named a digest other than the current
//                     one. Fails SAFE: an allowance that cannot be matched
//                     exactly refuses rather than silently doing nothing;
//   - nothingToRekey — the whole run would re-key 0 entries (allowed drift
//                     counted as re-keyed), including an absent or
//                     unreadable baseline (never created here).
//
// A re-keyed entry whose stored digest is non-null but whose current digest
// is null (the target became ambiguous or unresolved under the move) passes
// through VERBATIM — that is not drift, because there is nothing to compare.
//
// A drift entry MATCHED by an allowance is the one place this script ever
// re-takes a digest: it re-keys with the CURRENT digest, `kind` verbatim,
// same as any other re-key — see the header comment's one exception.
function planRename(findings, baseline, renames, allowances = []) {
  const renameMap = new Map(renames.map(({ old: from, new: to }) => [from, to]));
  const vacated = new Set(renameMap.keys());

  const current = new Map();
  for (const finding of findings) {
    const key = baselineKey(finding);
    if (!current.has(key)) current.set(key, finding);
  }

  const occupied = new Set(
    baseline.entries.filter((entry) => !vacated.has(entry.file)).map((entry) => entry.file),
  );
  const ontoExisting = [...new Set(renameMap.values())].filter((to) => occupied.has(to));

  const allowanceByKey = new Map(
    allowances.map((allowance) => [baselineKey(allowance), allowance]),
  );
  const usedAllowanceKeys = new Set();

  const rekeyedCountByOld = new Map([...vacated].map((from) => [from, 0]));
  const untouched = [];
  const rekeyed = [];
  const allowedDrift = [];
  const noFinding = [];
  const drift = [];

  for (const entry of baseline.entries) {
    const to = renameMap.get(entry.file);
    if (to === undefined) {
      untouched.push(entry);
      continue;
    }
    rekeyedCountByOld.set(entry.file, rekeyedCountByOld.get(entry.file) + 1);

    const moved = { ...entry, file: to };
    const key = baselineKey(moved);
    const finding = current.get(key);
    if (!finding) {
      noFinding.push(moved);
      continue;
    }

    const currentDigest = finding.digest ?? null;
    if (entry.digest != null && currentDigest != null && entry.digest !== currentDigest) {
      const allowance = allowanceByKey.get(key);
      if (allowance && allowance.digest === currentDigest) {
        usedAllowanceKeys.add(key);
        allowedDrift.push({ ...moved, digest: currentDigest });
        continue;
      }
      // `target` rides along only to let the caller ANNOTATE this refusal
      // (renameExplainsDrift, in runRename) — it resolves through the same
      // finding attachDigests already resolved it for, never re-derived.
      // It is not itself part of the written entry shape.
      drift.push({
        ...moved,
        storedDigest: entry.digest,
        currentDigest,
        target: finding.target ?? null,
      });
      continue;
    }

    rekeyed.push(moved);
  }

  // Entries NOT part of this batch whose own key no longer matches anything
  // current — a citing file moved without a --rename pair naming it. A pure
  // re-key does not prune them; it only warns, since the operator may not
  // have finished the sequence of --rename calls yet.
  const leftBehind = untouched.filter((entry) => !current.has(baselineKey(entry)));

  const unusedAllowance = allowances.filter(
    (allowance) => !usedAllowanceKeys.has(baselineKey(allowance)),
  );

  const totalRekeyed = rekeyed.length + allowedDrift.length;
  const nothingToRekey = !baseline.present || totalRekeyed === 0;
  const refused =
    ontoExisting.length > 0 ||
    noFinding.length > 0 ||
    drift.length > 0 ||
    unusedAllowance.length > 0 ||
    nothingToRekey;

  return {
    refused,
    nothingToRekey,
    ontoExisting,
    noFinding,
    drift,
    unusedAllowance,
    rekeyedCountByOld,
    leftBehind,
    untouched,
    rekeyed,
    allowedDrift,
    entries: sortEntries([...untouched, ...rekeyed, ...allowedDrift]),
  };
}

const describeEntry = (entry) =>
  `${entry.file}  ${entry.pointer}  #${entry.occurrence}  (${entry.kind ?? 'unknown'})`;

function printEntries(prefix, entries, limit = 25, log = console.log) {
  for (const entry of entries.slice(0, limit)) log(`  ${prefix} ${describeEntry(entry)}`);
  if (entries.length > limit) log(`  ${prefix} … and ${entries.length - limit} more`);
}

function serialize(entries) {
  return JSON.stringify({ version: 1, entries }, null, 2) + '\n';
}

function printRenameRefusal(plan) {
  console.error('REFUSED');
  console.error('');
  if (plan.ontoExisting.length > 0) {
    console.error(
      plan.ontoExisting.length === 1
        ? '1 rename target already holds baseline entries and is not itself being renamed away:'
        : `${plan.ontoExisting.length} rename targets already hold baseline entries and are not ` +
          'themselves being renamed away:',
    );
    for (const file of plan.ontoExisting) console.error(`  - ${file}`);
    console.error('');
  }
  if (plan.noFinding.length > 0) {
    console.error(
      `${plan.noFinding.length} re-keyed entr${
        plan.noFinding.length === 1 ? 'y matches' : 'ies match'
      } no current finding at its new key:`,
    );
    printEntries('-', plan.noFinding, 25, console.error);
    console.error('');
  }
  if (plan.drift.length > 0) {
    console.error(
      `${plan.drift.length} re-keyed entr${
        plan.drift.length === 1 ? 'y has' : 'ies have'
      } drifted — the stored digest no longer matches the current one:`,
    );
    for (const entry of plan.drift) {
      console.error(
        `  - ${describeEntry(entry)}  ${entry.storedDigest} -> ${entry.currentDigest}`,
      );
      if (entry.explained) {
        console.error(
          `    explained by this rename — re-run with --allow-drift '${entry.allowDriftToken}' to accept it`,
        );
      } else {
        console.error('    not explained by this rename — its content actually changed');
      }
    }
    console.error('');
  }
  if (plan.unusedAllowance.length > 0) {
    console.error(
      `${plan.unusedAllowance.length} --allow-drift token${
        plan.unusedAllowance.length === 1 ? '' : 's'
      } matched no drifting entry at its current digest — unused allowance:`,
    );
    for (const allowance of plan.unusedAllowance) {
      console.error(
        `  - unused allowance ${allowance.file}@${allowance.pointer}#${allowance.occurrence}=${allowance.digest}`,
      );
    }
    console.error('');
  }
  if (plan.nothingToRekey) {
    console.error('nothing to re-key — this run would re-key 0 entries.');
    console.error('');
  }
  console.error('Nothing was written.');
}

// Reads `path` under `repoRoot`, or null on any error — the same "degenerate
// input contributes nothing" discipline lib/pointer-anchors.mjs's own
// safeReadFile applies, kept local since that one is not exported.
async function safeReadFile(path) {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

// Attaches an `explained`/`allowDriftToken` verdict to each still-refused
// drift entry, reading its TARGET once — the same path attachDigests already
// resolved for the finding this entry drifted against (see planRename), so
// this never re-derives resolution. An unreadable or unresolved target (no
// single match) can never be explained: there is nothing to reconstruct
// against, so it reports unexplained rather than guessing.
async function annotateDrift(driftEntries, renames, repoRoot) {
  for (const entry of driftEntries) {
    let explained = false;
    if (entry.target != null) {
      const content = await safeReadFile(join(repoRoot, entry.target));
      if (content != null) {
        explained = renameExplainsDrift({
          content,
          pointer: entry.pointer,
          storedDigest: entry.storedDigest,
          renames,
        });
      }
    }
    entry.explained = explained;
    entry.allowDriftToken = explained
      ? `${entry.file}@${entry.pointer}#${entry.occurrence}=${entry.currentDigest}`
      : null;
  }
}

// Runs a --rename plan: prints the refusal and exits 1, or prints the plan
// and applies it under --write. Split out of main() only because the two
// modes (accept/prune vs. rename) share nothing past the header lines.
async function runRename({ findings, baseline, renames, allowances, write, baselinePath, repoRoot }) {
  const plan = planRename(findings, baseline, renames, allowances);

  if (plan.refused) {
    if (plan.drift.length > 0) await annotateDrift(plan.drift, renames, repoRoot);
    printRenameRefusal(plan);
    process.exit(1);
  }

  for (const { old: from, new: to } of renames) {
    const count = plan.rekeyedCountByOld.get(from) ?? 0;
    console.log(
      count === 0
        ? `  ${from}=${to}: no baseline entries — nothing to re-key`
        : `  ${from}=${to}: ${count} entr${count === 1 ? 'y' : 'ies'} re-keyed`,
    );
  }
  console.log('');

  if (plan.leftBehind.length > 0) {
    console.log(
      `### ${plan.leftBehind.length} entr${
        plan.leftBehind.length === 1 ? 'y is' : 'ies are'
      } left behind — not renamed, and no current finding matches their key:`,
    );
    printEntries('!', plan.leftBehind);
    console.log('');
  }

  console.log(
    `${plan.entries.length} entr${plan.entries.length === 1 ? 'y' : 'ies'} after this run ` +
      `(${plan.rekeyed.length} re-keyed, ${plan.allowedDrift.length} re-keyed with allowed drift, ` +
      `${plan.untouched.length} untouched).`,
  );

  if (!write) {
    console.log('Dry run — nothing written. Re-run with --write to apply.');
    return;
  }

  await fs.writeFile(baselinePath, serialize(plan.entries), 'utf8');
  console.log(`Wrote ${BASELINE_FILE}.`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`pointer-baseline: ${args.error}`);
    console.error('');
    console.error(USAGE);
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const repoRoot = resolve(args.repoPath ?? process.cwd());
  const baselinePath = join(repoRoot, BASELINE_FILE);

  // useBaseline: false — the generator needs the UNSUPPRESSED findings. A
  // suppressed scan would report nothing for exactly the entries it has to
  // decide about.
  const findings = await scanPointerAnchors(repoRoot, { useBaseline: false });
  const baseline = await loadBaseline(repoRoot);

  console.log('## pointer-baseline');
  console.log('');
  console.log(`repo:     ${repoRoot}`);
  console.log(
    `baseline: ${BASELINE_FILE} — ${
      baseline.present ? `${baseline.entries.length} entries` : 'absent (nothing suppressed)'
    }`,
  );
  console.log(
    `scan:     ${findings.length} finding${findings.length === 1 ? '' : 's'}${
      findings.length > 0 ? ` (${tallyKinds(findings)})` : ''
    }`,
  );
  console.log(
    `mode:     ${
      args.renames ? `rename (${args.renames.length} pair${args.renames.length === 1 ? '' : 's'})`
      : args.acceptNew ? 'prune + accept-new'
      : 'prune-only'
    }, ${args.write ? 'write' : 'dry run'}`,
  );
  console.log('');

  if (args.renames) {
    return runRename({
      findings,
      baseline,
      renames: args.renames,
      allowances: args.allowances,
      write: args.write,
      baselinePath,
      repoRoot,
    });
  }

  // The refusal is checked BEFORE any plan is computed or printed, so a run
  // that cannot legitimately accept anything says only that.
  const blocking = findings.filter((finding) => BLOCKING_KINDS.includes(finding.kind));
  if (args.acceptNew && blocking.length > 0) {
    console.error(
      `REFUSED: --accept-new cannot run while ${blocking.length} finding${
        blocking.length === 1 ? '' : 's'
      } (${tallyKinds(blocking)}) show a pointer to be provably wrong.`,
    );
    console.error(
      'Baselining a known-wrong pointer would accept a citation the checker has already',
    );
    console.error('proved false. Repair these, then re-run:');
    console.error('');
    for (const finding of blocking) console.error(`  - ${finding.detail}`);
    console.error('');
    console.error('Nothing was written.');
    process.exit(1);
  }

  const plan = planBaseline(findings, baseline, { acceptNew: args.acceptNew });

  if (plan.prune.length > 0) {
    console.log(`### Prune — ${plan.prune.length} entry/entries match nothing in this scan`);
    printEntries('-', plan.prune);
    console.log('');
  }
  if (plan.add.length > 0) {
    console.log(`### Accept — ${plan.add.length} new entry/entries`);
    printEntries('+', plan.add);
    console.log('');
  }
  if (!args.acceptNew && plan.missing.length > 0) {
    console.log(
      `### ${plan.missing.length} finding${
        plan.missing.length === 1 ? ' is' : 's are'
      } not in the baseline — NOT added (prune-only)`,
    );
    console.log('  Re-run with --accept-new to accept them as debt.');
    console.log('');
  }

  console.log(
    `${plan.entries.length} entr${plan.entries.length === 1 ? 'y' : 'ies'} after this run ` +
      `(${plan.kept.length} kept, ${plan.add.length} added, ${plan.prune.length} pruned).`,
  );

  if (!plan.changed) {
    console.log('Nothing to change — the baseline file was not touched.');
    return;
  }
  if (!args.write) {
    console.log('Dry run — nothing written. Re-run with --write to apply.');
    return;
  }

  await fs.writeFile(baselinePath, serialize(plan.entries), 'utf8');
  console.log(`Wrote ${BASELINE_FILE}.`);
}

main().catch((err) => {
  console.error('pointer-baseline failed:', err);
  process.exit(1);
});
