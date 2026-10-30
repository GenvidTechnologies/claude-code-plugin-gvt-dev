// Reference-state resolution for triage-issues' issue-refs script (#209):
// turns extracted references into states, outcomes, readiness and the lookup
// plan. Pure: no writes, no process.exit, no console output, no process
// spawning, no network. Every tracker read is a command plan() PRINTS for the
// caller to run; resolve() only reads what the caller saved.
//
// Parts 1 to 3: state resolution, the lookup plan, the readiness core
// (blockers, deferral triggers), native structure, the banner, umbrella
// routing and precedence, and release consumption for closed cross-repo
// blockers (D3): classifyClosedCrossRepo and planRegistry.
//
// Release consumption reads two manifests with fs, nothing else: the
// .gitmodules and package.json directly under options.root. This script never
// runs git, so "tracked" is the CALLER's responsibility: options.root must
// name a checkout whose manifests are the tracked ones. With no root, or no
// file, nothing is read and the consumption is unknown.
//
// Registry keys: "npm.repository.<dep>" and "npm.time.<dep>", the dependency
// name escaped (see registryKey). A bare "." never appears in a state key
// ("." is escaped there), so a registry key cannot collide with one.
//
// Every rule is its own small named predicate or function, so each can be
// disabled on its own (mutation run).
//
// Regex hygiene: every pattern is linear (no nested quantifiers) because the
// inputs include untrusted issue text and saved command output.

import fs from 'node:fs';
import path from 'node:path';

import { extract } from './refs-grammar.mjs';

// ---- constants ----

// D3: at most this many npm packages are checked per run.
const REGISTRY_CAP_DEFAULT = 5;
const NPM_NAME_MAX = 214;
// A name (and a scope) starts with a letter or digit: never "-" or "~", which
// a printed command could read as an option.
const NPM_NAME_RE = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
// Keys of `npm view <dep> time --json` that are versions: semver-shaped only.
// A date-parseable value under any other key (an error body's "summary") is not.
const SEMVER_KEY_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const SAFE_REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const DOTS_ONLY_RE = /^\.+$/;

// gh's page size for the bulk comments read: an array this long may be cut.
const COMMENTS_PAGE = 100;

// The documented bugTracker.refStateQuery, used when the caller passes none.
const DEFAULT_STATE_TEMPLATE =
  "gh api repos/{repo}/issues/{id} --jq '{number,state,state_reason,closed_at,pull_request:(.pull_request != null),sub_issues_summary}'";

// The pin recorded for a .gitmodules submodule: always pinned, commit unknown.
const SUBMODULE_PIN = 'submodule';

const BLOCKING_RELATIONS = new Set(['blocked-by', 'depends-on']);
const UNCLEARED_OUTCOMES = new Set(['live', 'closed-unreleased', 'unresolvable']);
// A deferral trigger whose reference ended in one of these has fired.
const SATISFIED_OUTCOMES = new Set(['cleared', 'not-open']);

const NOT_FOUND_RE = /\bHTTP 404\b/;
const TRIGGER_FIRED_RE = /\btrigger\s+(?:has\s+)?(?:fired|met)\b/i;
const FENCE_LINE_RE = /^ {0,3}(?:`{3,}|~{3,})/;
const BLOCKQUOTE_LINE_RE = /^\s{0,3}>/;

// ---- small helpers ----

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function targetLabel(target) {
  return target.repo ? `${target.repo}#${target.number}` : `#${target.number}`;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// ---- rule: the repository option and printed-command safety (SAFE) ----

// A repo name safe to print into a command: owner/repo with word, dot and dash
// characters only, and no segment made only of dots (path traversal).
function isSafeRepoName(repo) {
  if (typeof repo !== 'string' || !SAFE_REPO_RE.test(repo)) return false;
  return repo.split('/').every((part) => !DOTS_ONLY_RE.test(part));
}

function isSafeNumber(number) {
  return Number.isInteger(number) && number >= 1;
}

// The kind a target is refused with, or null when it may reach a command.
function unsafeTargetKind(target) {
  if (target.repo && !isSafeRepoName(target.repo)) return 'repo-ambiguous';
  if (!isSafeNumber(target.number)) return 'nonexistent';
  return null;
}

function requireRepo(options) {
  const repo = options && options.repo;
  if (!isSafeRepoName(repo)) {
    throw new Error('invalid repo option: expected owner/repo (letters, digits, ".", "_", "-")');
  }
  return repo;
}

// ---- rule: relations (Blocks and Relates to never block) ----

// Child rows are membership, not blockers. Statement and heading references
// block only for blocked-by and depends-on; title, deferral and row-annotation
// references (relation null) are inherently blocking.
function isBlockingRef(ref) {
  if (ref.source === 'child-row') return false;
  if (ref.relation === null || ref.relation === undefined) return true;
  return BLOCKING_RELATIONS.has(ref.relation);
}

// ---- rule: lookup keys ----

// Injective, filename-safe key per target. A same-repo target is
// "issue-<N>"; a cross-repo one is "<owner>-<repo>-<N>" with "_", "." and "-"
// inside the names escaped, so the separators are the only bare "-".
function escapeKeyPart(part) {
  return part.replace(/[_.-]/g, (c) => (c === '_' ? '_u' : c === '.' ? '_p' : '_d'));
}

export function stateKey(target) {
  if (!target.repo) return `issue-${target.number}`;
  const [owner, name] = target.repo.toLowerCase().split('/');
  return `${escapeKeyPart(owner)}-${escapeKeyPart(name)}-${target.number}`;
}

// Only {repo} and {id} are substituted; jq's own braces are left alone.
function stateCommand(template, repo, number) {
  return template.replace(/\{(repo|id)\}/g, (_match, name) =>
    name === 'repo' ? repo : String(number),
  );
}

// ---- rule: reading a saved lookup (404 handling) ----

function jsonObjectsIn(text) {
  const found = [];
  const tryParse = (s) => {
    try {
      const value = JSON.parse(s);
      if (value && typeof value === 'object' && !Array.isArray(value)) found.push(value);
    } catch {
      // not JSON; the caller falls back to the next shape
    }
  };
  const trimmed = text.trim();
  if (trimmed === '') return found;
  tryParse(trimmed);
  if (found.length) return found;
  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('{')) tryParse(t);
  }
  if (found.length) return found;
  const a = trimmed.indexOf('{');
  const b = trimmed.lastIndexOf('}');
  if (a >= 0 && b > a) tryParse(trimmed.slice(a, b + 1));
  return found;
}

// Rule: gh's 404 puts a JSON body with "status":"404" on stdout and
// "gh: Not Found (HTTP 404)" on stderr; the lookup file holds both. Either
// signal alone means the target does not exist.
function isNotFoundOutput(text, objects) {
  if (objects.some((o) => String(o.status) === '404')) return true;
  return NOT_FOUND_RE.test(text);
}

function isStateObject(o) {
  return typeof o.state === 'string' && /^(?:open|closed)$/i.test(o.state);
}

/**
 * Read one saved lookup (stdout and stderr of the printed command).
 * Anything that is neither a state nor a 404 is a failed lookup.
 * @param {unknown} text
 * @param {{ number: number }} [target]
 * @returns {{ state: 'open'|'closed'|'pr'|'nonexistent'|'failed',
 *             closedAt?: string, stateReason?: string }}
 */
export function parseLookup(text, target) {
  const s = typeof text === 'string' ? text : '';
  const objects = jsonObjectsIn(s);
  const obj = objects.find(isStateObject);
  if (obj) {
    if (target && Number.isInteger(obj.number) && obj.number !== target.number) {
      return { state: 'failed' };
    }
    if (obj.pull_request === true) return { state: 'pr' };
    const state = obj.state.toLowerCase();
    const out = { state };
    if (state === 'closed') {
      if (typeof obj.closed_at === 'string') out.closedAt = obj.closed_at;
      if (typeof obj.state_reason === 'string') out.stateReason = obj.state_reason;
    }
    return out;
  }
  if (isNotFoundOutput(s, objects)) return { state: 'nonexistent' };
  return { state: 'failed' };
}

// ---- rule: truncation (Q2) ----

// An open list as long as its -L limit may have been cut: absence proves nothing.
function isOpenListTruncated(openCount, limit) {
  return Number.isFinite(limit) && openCount >= limit;
}

// The comparison set (issues in any state) as long as its limit may have been
// cut: a number absent from it proves nothing, so it needs a lookup.
function isComparisonTruncated(count, limit) {
  return Number.isFinite(limit) && count >= limit;
}

// The bulk comment array for one issue may have been cut at the page size.
function isCommentsTruncated(count) {
  return count >= COMMENTS_PAGE;
}

// The bulk comments array as long as its -L limit may have been cut: an issue
// missing from it proves nothing about its comments.
function isBulkCommentsTruncated(ctx) {
  return ctx.bulkCommentsLength !== null && isOpenListTruncated(ctx.bulkCommentsLength, ctx.limit);
}

// The bulk structure array as long as its -L limit may have been cut: an issue
// missing from it proves nothing about its sub-issues.
function isBulkStructureTruncated(ctx) {
  return ctx.bulkStructureLength !== null && isOpenListTruncated(ctx.bulkStructureLength, ctx.limit);
}

// No bulk comments array was given and the issue carries no comments field of
// its own (absent, which is not the same as an empty array): the comments were
// never fetched, so their absence proves nothing.
function hasNoCommentData(ctx, issue) {
  return ctx.bulkCommentsLength === null && !Array.isArray(issue.comments);
}

// ---- context ----

function numberOption(value) {
  if (value === undefined || value === null || value === '') return NaN;
  return Number(value);
}

function registryCapOption(value) {
  const n = numberOption(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : REGISTRY_CAP_DEFAULT;
}

/**
 * Normalise the saved inputs and options once, and run the grammar over every
 * open issue. Exported as the seam the later parts hang their data on.
 * @param {unknown} input
 * @param {unknown} options
 */
export function buildContext(input, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const repo = requireRepo(opts);
  const data = input && typeof input === 'object' ? input : {};

  const open = asArray(data.open)
    .filter((i) => i && Number.isInteger(i.number))
    .sort((a, b) => a.number - b.number);
  const openByNumber = new Map(open.map((i) => [i.number, i]));

  const limit = numberOption(opts.limit);
  const cap = numberOption(opts.cap);

  const comparisonRows = asArray(data.comparison);
  const comparison = comparisonRows.length
    ? new Map(
        comparisonRows
          .filter((r) => r && Number.isInteger(r.number))
          .map((r) => [r.number, String(r.state).toUpperCase()]),
      )
    : null;
  const comparisonLimit = numberOption(opts.comparisonLimit);

  const commentsByNumber = new Map();
  for (const row of asArray(data.comments)) {
    if (!row || !Number.isInteger(row.number)) continue;
    const list = commentsByNumber.get(row.number) || [];
    commentsByNumber.set(row.number, list.concat(asArray(row.comments)));
  }

  const ctx = {
    repo,
    nonInteractive: Boolean(opts.nonInteractive),
    limit,
    cap: Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : Infinity,
    template:
      typeof opts.stateTemplate === 'string' && opts.stateTemplate !== ''
        ? opts.stateTemplate
        : DEFAULT_STATE_TEMPLATE,
    order: opts.order,
    root: typeof opts.root === 'string' && opts.root !== '' ? opts.root : null,
    registryCap: registryCapOption(opts.registryCap),
    openByNumber,
    openTruncated: isOpenListTruncated(open.length, limit),
    comparison,
    comparisonTruncated:
      comparison !== null && isComparisonTruncated(comparisonRows.length, comparisonLimit),
    lookups: data.lookups && typeof data.lookups === 'object' ? data.lookups : {},
    structureRows: asArray(data.structure),
    bulkCommentsLength: Array.isArray(data.comments) ? data.comments.length : null,
    bulkStructureLength: Array.isArray(data.structure) ? data.structure.length : null,
    cutKeys: new Set(),
    entries: [],
  };

  ctx.entries = open.map((issue) => {
    const bulk = commentsByNumber.get(issue.number);
    // Absent from a cut bulk list: the comments are unknown, so none are read.
    const commentsCut = bulk === undefined && isBulkCommentsTruncated(ctx);
    // No bulk input at all and no inline field: the comments were never fetched.
    const commentsNoData = bulk === undefined && hasNoCommentData(ctx, issue);
    const commentsUnknown = commentsCut || commentsNoData;
    const comments = commentsUnknown ? [] : bulk !== undefined ? bulk : asArray(issue.comments);
    const out = extract(
      { number: issue.number, title: issue.title, body: issue.body, comments },
      { repo },
    );
    return {
      issue,
      comments,
      commentsUnknown,
      commentsNoData,
      bulkCount: bulk !== undefined ? bulk.length : 0,
      ...out,
    };
  });
  return ctx;
}

function hasLookup(ctx, key) {
  return hasOwn(ctx.lookups, key);
}

// ---- rule: which references need a lookup, and the plan ----

// The state of a same-repo target is already in hand when the open list or the
// comparison set names it. Cross-repo targets are never in hand.
function isStateInHand(target, ctx) {
  if (target.repo) return false;
  if (ctx.openByNumber.has(target.number)) return true;
  return Boolean(ctx.comparison && ctx.comparison.has(target.number));
}

// Rule: a ticked row is settled in hand only when its absence proves
// something: a same-repo target missing from an untruncated open list (and no
// comparison set) is plainly not open. A cross-repo target, or one absent from
// a truncated list or from the comparison set, is not settled.
function isTickedRowSettled(target, ctx) {
  if (target.repo) return false;
  return !ctx.openTruncated && !ctx.comparison;
}

// A lookup is spent only where it can change what is reported: not on a
// retracted or unsafe reference, not on a ticked child row that is settled in
// hand, not on a Blocks or Relates to reference, and not where the state is
// already in hand.
function needsLookup(ref, ctx) {
  if (ref.retracted) return false;
  if (!ref.target || unsafeTargetKind(ref.target)) return false;
  if (ref.source === 'child-row') {
    if (ref.checked && isTickedRowSettled(ref.target, ctx)) return false;
  } else if (!isBlockingRef(ref)) {
    return false;
  }
  return !isStateInHand(ref.target, ctx);
}

// The issue numbers in lookup order: options.order first (ranked), then the
// rest ascending.
function lookupIssueOrder(ctx) {
  const asc = ctx.entries.map((e) => e.issue.number);
  const known = new Set(asc);
  const seen = new Set();
  const out = [];
  for (const n of asArray(ctx.order)) {
    const v = Number(n);
    if (known.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  for (const n of asc) if (!seen.has(n)) out.push(n);
  return out;
}

/**
 * Every distinct target that needs a state lookup, in lookup order: the
 * referencing issues in ranked-then-ascending order, each issue's references in
 * order of appearance, one entry per distinct target.
 * @param {ReturnType<typeof buildContext>} ctx
 * @returns {Array<{ key: string, repo: string, number: number }>}
 */
export function lookupTargets(ctx) {
  const byNumber = new Map(ctx.entries.map((e) => [e.issue.number, e]));
  const seen = new Set();
  const out = [];
  for (const n of lookupIssueOrder(ctx)) {
    for (const ref of byNumber.get(n).refs) {
      if (!needsLookup(ref, ctx)) continue;
      const key = stateKey(ref.target);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, repo: ref.target.repo || ctx.repo, number: ref.target.number });
    }
  }
  return out;
}

// Rule: the cap. The first `cap` targets are looked up; position, not what is
// already saved, decides the cut, so the cut set is stable across rounds.
function isCutByCap(index, cap) {
  return index >= cap;
}

function cutKeysOf(targets, ctx) {
  const cut = new Set();
  targets.forEach((t, i) => {
    if (isCutByCap(i, ctx.cap) && !hasLookup(ctx, t.key)) cut.add(t.key);
  });
  return cut;
}

// ---- rule: manifests (D3 inference input) ----

function readTextOrNull(root, name) {
  if (!root) return null;
  try {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return null;
  }
}

// The url = lines of a .gitmodules.
function submoduleUrlsIn(text) {
  const urls = [];
  for (const raw of text.split(/\r?\n/)) {
    const eq = raw.indexOf('=');
    if (eq < 0 || raw.slice(0, eq).trim() !== 'url') continue;
    const value = raw.slice(eq + 1).trim();
    if (value !== '') urls.push(value);
  }
  return urls;
}

// Every { name, spec } of the four dependency sections of a package.json.
function dependenciesIn(text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return [];
  }
  if (!pkg || typeof pkg !== 'object') return [];
  const out = [];
  for (const section of DEP_SECTIONS) {
    const deps = pkg[section];
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string') out.push({ name, spec });
    }
  }
  return out;
}

const manifestCache = new WeakMap();

function manifestsOf(ctx) {
  const cached = manifestCache.get(ctx);
  if (cached) return cached;
  const gitmodules = readTextOrNull(ctx.root, '.gitmodules');
  const packageJson = readTextOrNull(ctx.root, 'package.json');
  const manifests = {
    submoduleUrls: gitmodules === null ? [] : submoduleUrlsIn(gitmodules),
    deps: packageJson === null ? [] : dependenciesIn(packageJson),
  };
  manifestCache.set(ctx, manifests);
  return manifests;
}

// ---- rule: naming a repo (source consumption, repository.url) ----

// The lowercase "owner/repo" a git or GitHub spec names, or null: a
// "github:owner/repo" or bare "owner/repo" shorthand, or a github.com URL
// (https, ssh, git, git+..., or the scp form), with an optional ".git" and
// "#ref". A spec on any other host names no GitHub repo.
function githubSlugOf(spec) {
  let s = String(spec).trim().toLowerCase();
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash);
  if (s.startsWith('git+')) s = s.slice(4);
  let rest;
  if (s.startsWith('github:')) {
    rest = s.slice(7);
  } else {
    const url = /^(?:(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?|[^@/\s]+@)github\.com[/:](.+)$/.exec(s);
    if (url) rest = url[1];
    else if (SAFE_REPO_RE.test(s)) rest = s;
    else return null;
  }
  rest = rest.replace(/\/+$/, '');
  if (rest.endsWith('.git')) rest = rest.slice(0, -4);
  return SAFE_REPO_RE.test(rest) ? rest : null;
}

function namesRepo(spec, repo) {
  const slug = githubSlugOf(spec);
  return slug !== null && slug === String(repo).toLowerCase();
}

// Rule: a .gitmodules URL, or a dependency spec of git or GitHub form, that
// names the repo means its source is consumed (D3 step 1).
function isSourceConsumed(repo, manifests) {
  if (manifests.submoduleUrls.some((u) => namesRepo(u, repo))) return true;
  return manifests.deps.some((d) => namesRepo(d.spec, repo));
}

// The "#ref" (commit, tag or branch) a git or GitHub dependency spec carries,
// or null when it carries none or an empty one.
function pinOfSpec(spec) {
  const s = String(spec).trim();
  const hash = s.indexOf('#');
  if (hash < 0) return null;
  const pin = s.slice(hash + 1).trim();
  return pin === '' ? null : pin;
}

// The pins of every source consumption of the repo, in order: a dependency
// spec with a "#ref" gives that ref; a .gitmodules submodule is always pinned
// to a commit the script cannot read (it spawns no git), so it gives
// 'submodule'. An unpinned dependency spec gives nothing.
function consumptionPinsOf(repo, manifests) {
  const pins = [];
  if (manifests.submoduleUrls.some((u) => namesRepo(u, repo))) pins.push(SUBMODULE_PIN);
  for (const d of manifests.deps) {
    if (!namesRepo(d.spec, repo)) continue;
    const pin = pinOfSpec(d.spec);
    if (pin !== null) pins.push(pin);
  }
  return pins;
}

// Rule: a pinned source consumption does not clear a closed blocker, because
// the pin may predate the fix. Any pinned consumption counts, so an unpinned
// dependency beside a submodule is still pinned.
function isPinnedConsumption(repo, manifests) {
  return consumptionPinsOf(repo, manifests).length > 0;
}

// ---- rule: registry package names (SAFE) ----

// A dependency name safe to print into an npm command.
function isValidNpmName(name) {
  return typeof name === 'string' && name.length <= NPM_NAME_MAX && NPM_NAME_RE.test(name);
}

function lastSegmentOf(name) {
  return name.slice(name.lastIndexOf('/') + 1);
}

// Rule: a dependency whose name's last path segment equals the repo name (D3
// step 2). The Named miss: a package named otherwise is consumption unknown.
function isNamedAfterRepo(name, repo) {
  return lastSegmentOf(name) === repo.split('/')[1].toLowerCase();
}

// The one dependency to confirm for a repo: valid names only, sorted so the
// choice is stable.
function registryDependencyFor(repo, manifests) {
  const names = manifests.deps
    .map((d) => d.name)
    .filter((n) => isValidNpmName(n) && isNamedAfterRepo(n, repo));
  return names.length ? [...new Set(names)].sort()[0] : null;
}

// D3: source-consumed, then a registry package to confirm, else unknown.
function inferConsumption(repo, ctx) {
  const manifests = manifestsOf(ctx);
  if (isSourceConsumed(repo, manifests)) {
    if (!isPinnedConsumption(repo, manifests)) return { mode: 'source', pinned: false };
    return { mode: 'source', pinned: true, pin: consumptionPinsOf(repo, manifests)[0] };
  }
  const dep = registryDependencyFor(repo, manifests);
  if (dep !== null) return { mode: 'registry', dep };
  return { mode: 'unknown' };
}

// ---- rule: registry keys, candidates and the cap ----

const REGISTRY_KEY_ESCAPES = { _: '_u', '.': '_p', '-': '_d', '@': '_a', '/': '_s', '~': '_t' };

// Filename-safe and injective for a valid npm name. The "npm." prefix holds a
// bare ".", which no state key can (escapeKeyPart escapes "."), so the shapes
// cannot collide.
function registryKey(kind, dep) {
  return `npm.${kind}.${dep.replace(/[_.\-@/~]/g, (c) => REGISTRY_KEY_ESCAPES[c])}`;
}

function isRegistryCut(index, cap) {
  return index >= cap;
}

// A reference whose closed upstream state could need a registry check: a
// live, blocking, cross-repo, safe reference read as closed with a closed_at.
function isRegistryCandidate(ref, ctx) {
  if (ref.retracted || !ref.target || !ref.target.repo) return false;
  if (unsafeTargetKind(ref.target)) return false;
  if (ref.source === 'child-row' || !isBlockingRef(ref)) return false;
  const st = stateOf(ref.target, ctx);
  return st.state === 'closed' && typeof st.closedAt === 'string';
}

const registryCache = new WeakMap();

// The distinct packages to check, in lookup order, each with its keys and
// whether the cap cuts it. Only closed cross-repo blockers produce any.
function registryEntriesOf(ctx) {
  const cached = registryCache.get(ctx);
  if (cached) return cached;
  const byNumber = new Map(ctx.entries.map((e) => [e.issue.number, e]));
  const seen = new Set();
  const out = [];
  for (const n of lookupIssueOrder(ctx)) {
    for (const ref of byNumber.get(n).refs) {
      if (!isRegistryCandidate(ref, ctx)) continue;
      const consumption = inferConsumption(ref.target.repo, ctx);
      if (consumption.mode !== 'registry' || seen.has(consumption.dep)) continue;
      seen.add(consumption.dep);
      out.push({
        dep: consumption.dep,
        repoKey: registryKey('repository', consumption.dep),
        timeKey: registryKey('time', consumption.dep),
        cut: isRegistryCut(out.length, ctx.registryCap),
      });
    }
  }
  registryCache.set(ctx, out);
  return out;
}

/**
 * The registry commands for closed cross-repo blockers whose consumption is a
 * npm package: two per package, at most `registryCap` packages, the overflow
 * listed as { key, skipped: 'cap' }.
 * @param {ReturnType<typeof buildContext>} ctx
 * @returns {Array<{ key: string, command?: string, skipped?: 'cap' }>}
 */
export function planRegistry(ctx) {
  const out = [];
  for (const e of registryEntriesOf(ctx)) {
    const wanted = [
      { key: e.repoKey, command: `npm view ${e.dep} repository.url --prefer-online` },
      { key: e.timeKey, command: `npm view ${e.dep} time --json --prefer-online` },
    ].filter((w) => !hasLookup(ctx, w.key));
    if (wanted.length === 0) continue;
    if (e.cut) out.push({ key: e.repoKey, skipped: 'cap' });
    else out.push(...wanted);
  }
  return out;
}

// ---- rule: reading the saved registry output ----

function savedText(ctx, key) {
  return hasLookup(ctx, key) && typeof ctx.lookups[key] === 'string' ? ctx.lookups[key] : null;
}

// Rule: the registry's repository.url must name the blocker's own repo. The
// first non-empty line is the URL; npm's error output names no GitHub repo.
function repoUrlConfirms(text, repo) {
  const first = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '');
  if (first === undefined) return false;
  return namesRepo(first.replace(/^"|"$/g, ''), repo);
}

// The published versions of `npm view <dep> time --json`, or null when the
// output is not that (E404 and other errors, an empty body).
// Rule: a key counts as a version only when it looks like semver.
function isVersionKey(key) {
  return SEMVER_KEY_RE.test(key);
}

// Rule: the object is a `time` result only when it carries "created".
function isTimeResult(obj) {
  return typeof obj.created === 'string';
}

function publishedVersionsOf(text) {
  const obj = jsonObjectsIn(text)[0];
  if (!obj || hasOwn(obj, 'error') || !isTimeResult(obj)) return null;
  const versions = Object.entries(obj)
    .filter(([k, v]) => isVersionKey(k) && typeof v === 'string')
    .map(([version, at]) => ({ version, at: Date.parse(at) }))
    .filter((v) => Number.isFinite(v.at));
  const tags = obj['dist-tags'];
  const tagged = tags && typeof tags.latest === 'string' ? tags.latest : null;
  return { versions, tagged };
}

// Rule: some version published strictly after the issue closed (SD8).
function isPublishedAfter(versions, closedAtMs) {
  return versions.some((v) => v.at > closedAtMs);
}

// The newest published version, else dist-tags.latest when the output has no
// version, else null.
function latestOf({ versions, tagged }) {
  if (versions.length === 0) return tagged;
  return versions.reduce((a, b) => (b.at >= a.at ? b : a)).version;
}

function releaseUnverified(extra) {
  return { outcome: 'closed-release-unverified', ...extra };
}

// A closed cross-repo blocker (D3): consumed as source clears; a confirmed npm
// package is checked against the registry; anything else, or any failed read,
// stays release-unverified and is never cleared.
export function classifyClosedCrossRepo(ref, st, ctx) {
  const consumption = inferConsumption(ref.target.repo, ctx);
  if (consumption.mode === 'source') {
    // A pinned consumption may predate the fix: a caveat, never a clear.
    if (consumption.pinned) return releaseUnverified({ pin: consumption.pin });
    return { outcome: 'cleared', via: 'source-consumed' };
  }
  if (consumption.mode !== 'registry') return releaseUnverified();

  const entry = registryEntriesOf(ctx).find((e) => e.dep === consumption.dep);
  const repoText = entry ? savedText(ctx, entry.repoKey) : null;
  const timeText = entry ? savedText(ctx, entry.timeKey) : null;
  if (repoText === null || timeText === null) {
    return releaseUnverified(entry && entry.cut ? { skipped: 'cap' } : undefined);
  }
  if (!repoUrlConfirms(repoText, ref.target.repo)) return releaseUnverified();
  const published = publishedVersionsOf(timeText);
  const closedAtMs = Date.parse(st.closedAt);
  if (published === null || !Number.isFinite(closedAtMs)) return releaseUnverified();
  if (isPublishedAfter(published.versions, closedAtMs)) {
    return { outcome: 'cleared', via: 'released (version check only)', provenance: 'registry' };
  }
  const latest = latestOf(published);
  if (latest === null) return releaseUnverified();
  return { outcome: 'closed-unreleased', latest, provenance: 'registry' };
}

/**
 * Plan the lookups needed before references can be resolved.
 * @param {unknown} input
 * @param {unknown} [options]
 * @returns {Array<{ key: string, command?: string, skipped?: 'cap' }>}
 */
export function plan(input, options) {
  const ctx = buildContext(input, options);
  const entries = [];
  lookupTargets(ctx).forEach((t, i) => {
    if (hasLookup(ctx, t.key)) return;
    if (isCutByCap(i, ctx.cap)) entries.push({ key: t.key, skipped: 'cap' });
    else entries.push({ key: t.key, command: stateCommand(ctx.template, t.repo, t.number) });
  });
  return entries.concat(planRegistry(ctx));
}

// ---- rule: state of one target ----

// What is known about a target: a saved lookup first (it names the state
// precisely), then the open list, then the comparison set; otherwise absence.
// Absence on an untruncated open list is "not-open", never "closed" (Q2).
// `state` is the public state (or null); `gap` names why it is null.
function stateOf(target, ctx) {
  const key = stateKey(target);
  if (hasLookup(ctx, key)) {
    const read = parseLookup(ctx.lookups[key], target);
    if (read.state === 'failed') return { state: null, gap: 'failed', provenance: 'lookup' };
    const out = { state: read.state, gap: null, provenance: 'lookup' };
    if (read.closedAt) out.closedAt = read.closedAt;
    if (read.stateReason) out.stateReason = read.stateReason;
    return out;
  }
  if (target.repo) return { state: null, gap: 'unread', provenance: 'in hand' };
  if (ctx.openByNumber.has(target.number)) {
    return { state: 'open', gap: null, provenance: 'in hand' };
  }
  if (ctx.comparison) {
    const row = ctx.comparison.get(target.number);
    if (row === 'OPEN') return { state: 'open', gap: null, provenance: 'in hand' };
    if (row === 'CLOSED') return { state: 'closed', gap: null, provenance: 'in hand' };
    // A comparison set at its limit may have been cut: absence proves nothing.
    const gap = ctx.comparisonTruncated ? 'truncated' : 'absent';
    return { state: null, gap, provenance: 'in hand' };
  }
  if (ctx.openTruncated) return { state: null, gap: 'truncated', provenance: 'in hand' };
  return { state: 'not-open', gap: null, provenance: 'in hand' };
}

// The unresolvable kind a state reads as, or null when the state is usable.
function unresolvableKindOf(st) {
  if (st.state === 'pr') return 'pr';
  if (st.state === 'nonexistent') return 'nonexistent';
  if (st.gap === 'failed') return 'lookup-failed';
  if (st.gap === 'unread') return 'cross-repo-unread';
  if (st.gap === 'absent') return 'absent';
  if (st.gap === 'truncated') return 'truncated';
  return null;
}

// Rule: a ticked row whose child has no usable state is unresolvable, not
// "not-open": the state is unknown (cross-repo unread, cut from a truncated
// list, absent, lookup failed), or the lookup says it is a pull request or
// does not exist.
function isTickedStateUnknown(st) {
  return st.state === null || st.state === 'pr' || st.state === 'nonexistent';
}

// The outcome of one resolvable reference, given what is known of its target.
function classifyRef(ref, st, ctx) {
  const child = ref.source === 'child-row';
  // A ticked row is consistent unless its child is still open or unknown.
  if (child && ref.checked) {
    if (st.state === 'open') return { outcome: 'ticked-open' };
    if (isTickedStateUnknown(st)) {
      return { outcome: 'unresolvable', kind: unresolvableKindOf(st), provenance: 'lookup' };
    }
    return { outcome: 'not-open' };
  }
  // Blocks and Relates to are reported nowhere unless the form is broken.
  if (!child && !isBlockingRef(ref)) return { outcome: st.state === 'open' ? 'live' : 'not-open' };
  const kind = unresolvableKindOf(st);
  if (kind) return { outcome: 'unresolvable', kind };
  if (st.state === 'open') return { outcome: 'live' };
  if (st.state === 'not-open') return { outcome: child ? 'unticked-not-open' : 'not-open' };
  if (child) return { outcome: 'unticked-closed' };
  if (ref.target.repo) return classifyClosedCrossRepo(ref, st, ctx);
  return { outcome: 'cleared', via: 'same-repo' };
}

function annotateRef(ref, ctx) {
  const base = { ...ref };
  if (ref.retracted) return { ...base, state: null, outcome: 'retracted', provenance: 'in hand' };
  if (!ref.target) {
    return {
      ...base,
      state: null,
      outcome: 'unresolvable',
      kind: ref.unresolvable || 'prose',
      provenance: 'in hand',
    };
  }
  const unsafe = unsafeTargetKind(ref.target);
  if (unsafe) {
    return { ...base, state: null, outcome: 'unresolvable', kind: unsafe, provenance: 'in hand' };
  }
  const st = stateOf(ref.target, ctx);
  const verdict = classifyRef(ref, st, ctx);
  const out = { ...base, state: st.state, ...verdict };
  if (!out.provenance) out.provenance = st.provenance;
  if (st.closedAt) out.closedAt = st.closedAt;
  if (needsLookup(ref, ctx) && ctx.cutKeys.has(stateKey(ref.target))) out.skipped = 'cap';
  return out;
}

// ---- rule: deferral triggers (Q12) ----

function sortedComments(comments) {
  return comments
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const x = String(a.c.createdAt || '');
      const y = String(b.c.createdAt || '');
      return x < y ? -1 : x > y ? 1 : a.i - b.i;
    })
    .map(({ c }) => c);
}

// The lines of a comment that may carry a statement: fenced and blockquoted
// lines are quotation, not assertion.
function proseLines(body) {
  const out = [];
  let fenced = false;
  for (const raw of String(body == null ? '' : body).split(/\r?\n/)) {
    if (FENCE_LINE_RE.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || BLOCKQUOTE_LINE_RE.test(raw)) continue;
    out.push(raw);
  }
  return out;
}

function saysTriggerFired(line) {
  return TRIGGER_FIRED_RE.test(line.replace(/`[^`]*`/g, ' '));
}

// The position of a trigger among the sorted comments: -1 for the body.
function triggerOrder(trigger, comments) {
  if (trigger.origin !== 'comment') return -1;
  const at = comments.findIndex((c) =>
    proseLines(c.body).some((l) => l.trim() === trigger.line),
  );
  return at;
}

// Rule: a reference-free trigger is fired only by a LATER comment that says so.
function isFiredByLaterComment(trigger, comments) {
  const from = triggerOrder(trigger, comments);
  return comments.some(
    (c, i) => i > from && proseLines(c.body).some((l) => saysTriggerFired(l)),
  );
}

// Rule: a trigger carrying a reference is fired by that reference (cleared or
// no longer open), or by a retraction naming every one of them.
function evaluateTrigger(trigger, refs, comments) {
  const own = refs.filter(
    (r) => r.source === 'deferral' && r.origin === trigger.origin && r.line === trigger.line,
  );
  if (own.length) {
    const live = own.filter((r) => r.outcome !== 'retracted');
    if (live.length === 0) return { fired: true, firedBy: 'comment', hasRefs: true };
    if (live.every((r) => SATISFIED_OUTCOMES.has(r.outcome))) {
      return { fired: true, firedBy: 'reference', hasRefs: true };
    }
    return { fired: false, firedBy: null, hasRefs: true };
  }
  if (isFiredByLaterComment(trigger, comments)) {
    return { fired: true, firedBy: 'comment', hasRefs: false };
  }
  return { fired: false, firedBy: null, hasRefs: false };
}

// ---- rule: native structure (D2, R41) ----

// Absent structure data is "no data", never "no children" (R41).
function noNative() {
  return { status: 'no-data', parent: null, total: null, completed: null, openChildren: [], outside: 0 };
}

function nativeParentOf(row) {
  const p = row.parent;
  return p && Number.isInteger(p.number) ? p.number : null;
}

// A row proves "no sub-issues" only when it carries the summary counts.
function hasSummary(row) {
  const s = row.subIssuesSummary;
  return Boolean(s) && Number.isInteger(s.total) && Number.isInteger(s.completed);
}

const structureIndexes = new WeakMap();

// The saved structure rows indexed by issue number, plus each open parent's
// open children (the saved rows whose parent is that umbrella), cached per ctx.
function structureIndex(ctx) {
  const cached = structureIndexes.get(ctx);
  if (cached) return cached;
  const byNumber = new Map();
  const childrenOf = new Map();
  for (const row of ctx.structureRows) {
    if (!row || !Number.isInteger(row.number)) continue;
    byNumber.set(row.number, row);
    const parent = nativeParentOf(row);
    if (parent === null || !ctx.openByNumber.has(row.number)) continue;
    const list = childrenOf.get(parent) || [];
    list.push(row.number);
    childrenOf.set(parent, list);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a - b);
  const index = { byNumber, childrenOf };
  structureIndexes.set(ctx, index);
  return index;
}

// Rule: native open sub-issues the summary counts but the open list does not
// show (cross-repo or truncated). They keep the issue an umbrella.
function outsideCount(total, completed, found) {
  return Math.max(0, total - completed - found);
}

function buildNative(entry, ctx) {
  const index = structureIndex(ctx);
  const row = index.byNumber.get(entry.issue.number);
  if (!row || !hasSummary(row)) return noNative();
  const { total, completed } = row.subIssuesSummary;
  const openChildren = index.childrenOf.get(entry.issue.number) || [];
  return {
    status: 'data',
    parent: nativeParentOf(row),
    total,
    completed,
    openChildren,
    outside: outsideCount(total, completed, openChildren.length),
  };
}

// Rule: every native sub-issue is closed (and there is at least one).
function isNativeAllClosed(native) {
  return native.status === 'data' && native.total > 0 && native.outside === 0 &&
    native.openChildren.length === 0;
}

// ---- rule: the umbrella banner (SD9b) ----

// The self-declaration form, the markup stripping and the parent-naming
// exclusion live in the grammar module (extract() returns the banner), so both
// halves share one predicate; this half only supplies the parents.

// The issues that count as this one's parent: its native parent, and any open
// issue whose checklist names this one as a child.
function parentNumbersOf(entry, ctx) {
  const parents = new Set();
  const row = structureIndex(ctx).byNumber.get(entry.issue.number);
  const native = row ? nativeParentOf(row) : null;
  if (native !== null) parents.add(native);
  for (const other of ctx.entries) {
    if (other.issue.number === entry.issue.number) continue;
    const lists = other.refs.some(
      (r) =>
        r.source === 'child-row' && r.target && !r.target.repo && r.target.number === entry.issue.number,
    );
    if (lists) parents.add(other.issue.number);
  }
  return parents;
}

// The first banner line in the body, or null. extract() already found the
// first self-declaring line without parent exclusion; only when there is one
// and the issue has parents is the body read again, with the parents given.
function detectBanner(entry, ctx) {
  if (!entry.banner) return null;
  const parents = parentNumbersOf(entry, ctx);
  if (parents.size === 0) return entry.banner;
  const { number, title, body } = entry.issue;
  return extract({ number, title, body, comments: [] }, { repo: ctx.repo, parent: parents }).banner;
}

// ---- readiness core ----

function decisionSource(ref) {
  if (ref.source === 'title') return 'title';
  if (ref.source === 'deferral') return 'deferral';
  if (ref.source === 'child-row') return 'checklist';
  return ref.origin === 'comment' ? 'comment' : 'body';
}

function decidedEntry(ref) {
  const entry = { source: decisionSource(ref), provenance: ref.provenance };
  if (ref.target) entry.target = ref.target;
  entry.outcome = ref.outcome;
  return entry;
}

// Rule: which outcomes leave the issue blocked. A release-unverified blocker
// is a caveat interactively and a block under --non-interactive.
function isUncleared(ref, ctx) {
  if (UNCLEARED_OUTCOMES.has(ref.outcome)) return true;
  return ref.outcome === 'closed-release-unverified' && ctx.nonInteractive;
}

function isCaveat(ref, ctx) {
  return ref.outcome === 'closed-release-unverified' && !ctx.nonInteractive;
}

function describeBlocker(ref) {
  const label = ref.target ? targetLabel(ref.target) : 'unverified blocker';
  if (ref.outcome === 'live') return `${label} (open)`;
  if (ref.outcome === 'closed-unreleased') {
    return `${label} (closed upstream, not yet released, latest is ${ref.latest})`;
  }
  if (ref.outcome === 'closed-release-unverified') {
    if (ref.pin === SUBMODULE_PIN) {
      return `${label} (closed, consumed as a pinned submodule, fix unverified)`;
    }
    if (ref.pin !== undefined) {
      return `${label} (closed, consumed at pinned ref ${ref.pin}, fix unverified)`;
    }
    return `${label} (closed, release unverified)`;
  }
  return `${label} (unresolvable: ${ref.kind})`;
}

// The open same-repo children named by checklist rows. A ticked row whose
// child is open stays routable; an unticked row whose child is closed never is.
function checklistOpenChildren(rec) {
  const numbers = rec.refs
    .filter(
      (r) =>
        r.source === 'child-row' &&
        r.target &&
        !r.target.repo &&
        r.target.number !== rec.number &&
        isOpenChildRow(r),
    )
    .map((r) => r.target.number);
  return [...new Set(numbers)].sort((a, b) => a - b);
}

// Rule: a child row whose child is open (ticked or not).
function isOpenChildRow(r) {
  return r.outcome === 'ticked-open' || r.outcome === 'live';
}

// The unresolvable kinds that mean "state unknown", as opposed to a row that
// can never be a child (a PR, a nonexistent issue, an unsafe reference).
const UNKNOWN_STATE_KINDS = new Set(['truncated', 'cross-repo-unread', 'absent', 'lookup-failed']);

// Rule: a child row whose state is unknown still counts as membership: the
// issue may well be an umbrella, so it must not read as a leaf.
function isUnknownChildRow(r) {
  return r.outcome === 'unresolvable' && UNKNOWN_STATE_KINDS.has(r.kind);
}

// The checklist members that are not same-repo open children: open cross-repo
// children (members, not routable) and rows with unknown state.
function checklistOtherMembers(rec) {
  const crossOpen = [];
  const unknown = [];
  const seen = new Set();
  for (const r of rec.refs) {
    if (r.source !== 'child-row' || !r.target) continue;
    if (!r.target.repo && r.target.number === rec.number) continue;
    const label = targetLabel(r.target);
    if (seen.has(label)) continue;
    if (r.target.repo && isOpenChildRow(r)) {
      seen.add(label);
      crossOpen.push(label);
    } else if (isUnknownChildRow(r)) {
      seen.add(label);
      unknown.push({ label, kind: r.kind });
    }
  }
  return { crossOpen, unknown };
}

// One line per tick-versus-state mismatch (never resolved silently).
function checklistDisagreements(rec) {
  const out = [];
  for (const r of rec.refs) {
    if (r.source !== 'child-row' || !r.target) continue;
    if (r.outcome === 'ticked-open') out.push(`${targetLabel(r.target)} is ticked but still open`);
    if (r.outcome === 'unticked-closed') out.push(`${targetLabel(r.target)} is unticked but closed`);
  }
  return out;
}

function uniqueTargets(refs) {
  const seen = new Set();
  const out = [];
  for (const r of refs) {
    if (!r.target) continue;
    const label = targetLabel(r.target);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(r.target);
  }
  return out;
}

// Readiness from blockers and deferral triggers alone, before any umbrella
// structure. A deferral-source reference is an ordinary blocker; a trigger with
// no resolvable reference is unfired (deferred) unless a later comment fired it.
// measurement is never read here: it only rides on the trigger.
function coreReadiness(rec, facts, ctx) {
  const blockers = rec.refs.filter((r) => r.outcome !== 'retracted' && isBlockingRef(r));
  const uncleared = blockers.filter((r) => isUncleared(r, ctx));
  const caveats = blockers.filter((r) => isCaveat(r, ctx));
  const satisfied = blockers.filter((r) => SATISFIED_OUTCOMES.has(r.outcome));
  const unfired = rec.triggers.filter((t, i) => !t.fired && !facts[i].hasRefs);

  const decidedBy = blockers.map(decidedEntry);
  rec.triggers.forEach((t, i) => {
    if (facts[i].hasRefs) return;
    decidedBy.push({
      source: 'deferral',
      provenance: 'in hand',
      outcome: t.fired ? 'fired' : 'unfired',
    });
  });
  for (const r of rec.refs) if (r.source === 'child-row') decidedBy.push(decidedEntry(r));

  let state = 'ready';
  let reason;
  if (unfired.length) {
    state = 'deferred';
    reason = `deferred: ${unfired.map((t) => t.line).join('; ')}`;
  } else if (uncleared.length) {
    state = 'blocked';
    reason = `blocked by ${uncleared.map(describeBlocker).join(', ')}`;
  } else if (caveats.length) {
    state = 'ready-caveat';
    reason = `ready with a caveat: ${caveats.map(describeBlocker).join(', ')}`;
  } else if (satisfied.length) {
    reason = `ready: ${uniqueTargets(satisfied).map(targetLabel).join(', ')} no longer blocks`;
  } else {
    reason = 'ready: no blockers';
  }

  return {
    state,
    reason,
    blockedBy: uniqueTargets(uncleared),
    openChildren: checklistOpenChildren(rec),
    otherMembers: checklistOtherMembers(rec),
    decidedBy,
    disagreements: checklistDisagreements(rec),
  };
}

function isRoutable(state) {
  return state === 'ready' || state === 'ready-caveat';
}

// ---- rule: precedence of checklist, native structure and banner ----

// Membership is the union of native open children and open checklist children;
// state of each child comes from tracker data, never from a tick.
function unionMembers(nativeOpen, checklistOpen) {
  return [...new Set([...nativeOpen, ...checklistOpen])].sort((a, b) => a - b);
}

// Rule: the issue is an umbrella if ANY source says it has open children,
// including native open sub-issues outside the open list.
// Open cross-repo children and unknown-state child rows are members too.
function isUmbrellaByChildren(members, outside, other = { crossOpen: [], unknown: [] }) {
  return members.length > 0 || outside > 0 || other.crossOpen.length > 0 || other.unknown.length > 0;
}

// Rule: done-but-unclosed needs native data showing every child closed AND no
// open child from the checklist or banner.
function isDoneButUnclosed(native, members) {
  return isNativeAllClosed(native) && members.length === 0;
}

// Rule: a title prefix of "epic:" or "tracking:" (case-insensitive, leading
// whitespace ignored) is a self-declared umbrella.
function hasUmbrellaTitlePrefix(title) {
  const text = typeof title === 'string' ? title : '';
  const colon = text.indexOf(':');
  if (colon < 0) return false;
  return /^(?:epic|tracking)$/i.test(text.slice(0, colon).trim());
}

function checklistListed(rec) {
  const listed = new Set();
  for (const r of rec.refs) {
    if (r.source === 'child-row' && r.target && !r.target.repo) listed.add(r.target.number);
  }
  return listed;
}

// Rule: every native-versus-checklist membership difference is shown.
function membershipDisagreements(native, checklistOpen, rec) {
  if (native.status !== 'data' || native.total === 0) return [];
  const out = [];
  const nativeOpen = new Set(native.openChildren);
  for (const n of checklistOpen) {
    if (nativeOpen.has(n)) continue;
    out.push(
      isNativeAllClosed(native)
        ? `native structure shows every sub-issue closed, but the checklist names #${n} as open`
        : `the checklist names #${n} as open, but it is not an open native sub-issue`,
    );
  }
  const listed = checklistListed(rec);
  if (listed.size) {
    for (const n of native.openChildren) {
      if (!listed.has(n)) out.push(`#${n} is an open native sub-issue missing from the checklist`);
    }
  }
  return out;
}

function structureDecisions(native, banner, titlePrefix) {
  const out = [];
  if (titlePrefix) out.push({ source: 'title-prefix', provenance: 'in hand', outcome: 'umbrella' });
  if (native.status === 'data') {
    let outcome = 'no-sub-issues';
    if (native.total > 0) {
      outcome = isNativeAllClosed(native) ? 'all-closed' : 'open-children';
    }
    out.push({ source: 'native', provenance: 'in hand', outcome });
  }
  if (banner) out.push({ source: 'banner', provenance: 'in hand', outcome: 'declared' });
  return out;
}

function firstRoutable(members, coreByNumber) {
  return (
    members.find((n) => {
      const child = coreByNumber.get(n);
      return child === undefined || isRoutable(child.state);
    }) ?? null
  );
}

// Rule: with only cross-repo open children there is nothing here to route to.
function noRouteText(members, other) {
  return members.length === 0 && other.crossOpen.length > 0
    ? 'no same-repo child to route to'
    : 'no ready child';
}

function umbrellaReason(members, outside, routedTo, other) {
  const parts = [];
  if (members.length) parts.push(`open children ${members.map((n) => `#${n}`).join(', ')}`);
  if (other.crossOpen.length) parts.push(`open cross-repo children ${other.crossOpen.join(', ')}`);
  if (outside > 0) parts.push(`${outside} open sub-issues outside the open list`);
  if (other.unknown.length) {
    const named = other.unknown.map((u) => `${u.label} ${u.kind}`).join(', ');
    const n = other.unknown.length;
    parts.push(`${n} child ${n === 1 ? 'row' : 'rows'} with unknown state (${named})`);
  }
  const routing = routedTo === null ? noRouteText(members, other) : `routed to #${routedTo}`;
  return `umbrella: ${parts.join('; ')}; ${routing}`;
}

function structureReadiness(core, rec, coreByNumber) {
  const native = rec.native;
  const members = unionMembers(native.openChildren, core.openChildren);
  const outside = native.outside;
  let state = core.state;
  let reason = core.reason;
  let routedTo = null;
  const other = core.otherMembers;
  if (isUmbrellaByChildren(members, outside, other)) {
    routedTo = firstRoutable(members, coreByNumber);
    state = 'umbrella';
    reason = umbrellaReason(members, outside, routedTo, other);
  } else if (rec.umbrellaTitle) {
    state = 'umbrella';
    reason = 'umbrella title prefix, no open child found';
  } else if (rec.banner) {
    // A banner means the author keeps the issue open on purpose, so it wins
    // over native all-closed: no close proposal.
    state = 'banner-no-open-child';
    reason = `banner-no-open-child: self-declared umbrella (${rec.banner.line}) with no open child`;
  } else if (isDoneButUnclosed(native, members)) {
    state = 'done-but-unclosed';
    reason = `done-but-unclosed: all ${native.total} native sub-issues are closed`;
  }
  return {
    state,
    rankable: state === 'ready' || state === 'ready-caveat' || state === 'blocked',
    reason,
    blockedBy: core.blockedBy,
    openChildren: members,
    crossRepoOpenChildren: other.crossOpen,
    unknownChildren: other.unknown.map((u) => u.label),
    routedTo,
    parent: native.parent,
    decidedBy: core.decidedBy.concat(structureDecisions(native, rec.banner, rec.umbrellaTitle)),
    disagreements: core.disagreements.concat(
      membershipDisagreements(native, core.openChildren, rec),
    ),
  };
}

// ---- records ----

function buildRecord(entry, ctx) {
  const refs = entry.refs.map((r) => annotateRef(r, ctx));
  const comments = sortedComments(entry.comments);
  const facts = entry.triggers.map((t) => evaluateTrigger(t, refs, comments));
  const triggers = entry.triggers.map((t, i) => ({
    ...t,
    fired: facts[i].fired,
    firedBy: facts[i].firedBy,
  }));
  const commentsTruncated = isCommentsTruncated(entry.bulkCount);
  const notes = [];
  if (commentsTruncated) notes.push('comments possibly truncated');
  if (ctx.openTruncated) notes.push('open list: truncated (at its limit)');
  if (ctx.comparisonTruncated) notes.push('comparison set: truncated (at its limit)');
  const native = buildNative(entry, ctx);
  if (entry.commentsNoData) notes.push('comments: no data');
  else if (entry.commentsUnknown) notes.push('comments: truncated (bulk list at its limit)');
  if (native.status === 'no-data') {
    const cut = !structureIndex(ctx).byNumber.has(entry.issue.number) &&
      isBulkStructureTruncated(ctx);
    notes.push(
      cut ? 'native structure: truncated (bulk list at its limit)' : 'native structure: no data',
    );
  }

  const rec = {
    number: entry.issue.number,
    refs,
    triggers,
    banner: detectBanner(entry, ctx),
    umbrellaTitle: hasUmbrellaTitlePrefix(entry.issue.title),
    native,
    commentsTruncated,
    retractedCount: refs.filter((r) => r.outcome === 'retracted').length,
    notes,
  };
  return { rec, core: coreReadiness(rec, facts, ctx) };
}

/**
 * Resolve extracted references against fetched issue state.
 * @param {unknown} input
 * @param {unknown} [options]
 * @returns {object[]} one record per open issue, ascending issue number
 */
export function resolve(input, options) {
  const ctx = buildContext(input, options);
  ctx.cutKeys = cutKeysOf(lookupTargets(ctx), ctx);
  const staged = ctx.entries.map((e) => buildRecord(e, ctx));
  const coreByNumber = new Map(staged.map((s) => [s.rec.number, s.core]));
  return staged.map((s) => ({
    ...s.rec,
    readiness: structureReadiness(s.core, s.rec, coreByNumber),
  }));
}
