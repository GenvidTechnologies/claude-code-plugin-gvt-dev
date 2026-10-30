// Reference-state resolution for triage-issues' issue-refs script (#209):
// turns extracted references into states, outcomes, readiness and the lookup
// plan. Pure: no writes, no process.exit, no console output, no process
// spawning, no network. Every tracker read is a command plan() PRINTS for the
// caller to run; resolve() only reads what the caller saved.
//
// Part 1 (this file today): state resolution, the lookup plan, the readiness
// core (blockers, deferral triggers, checklist umbrella). Later parts extend
// the named seams marked "SEAM" below:
//   - native structure, umbrella routing, banner, precedence: buildNative,
//     detectBanner, structureReadiness
//   - release consumption and the registry plan: classifyClosedCrossRepo,
//     planRegistry
//
// Every rule is its own small named predicate or function, so each can be
// disabled on its own (mutation run).
//
// Regex hygiene: every pattern is linear (no nested quantifiers) because the
// inputs include untrusted issue text and saved command output.

import { extract } from './refs-grammar.mjs';

// ---- constants ----

const SAFE_REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const DOTS_ONLY_RE = /^\.+$/;

// gh's page size for the bulk comments read: an array this long may be cut.
const COMMENTS_PAGE = 100;

// The documented bugTracker.refStateQuery, used when the caller passes none.
const DEFAULT_STATE_TEMPLATE =
  "gh api repos/{repo}/issues/{id} --jq '{number,state,state_reason,closed_at,pull_request:(.pull_request != null),sub_issues_summary}'";

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

// The bulk comment array for one issue may have been cut at the page size.
function isCommentsTruncated(count) {
  return count >= COMMENTS_PAGE;
}

// ---- context ----

function numberOption(value) {
  if (value === undefined || value === null || value === '') return NaN;
  return Number(value);
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
    openByNumber,
    openTruncated: isOpenListTruncated(open.length, limit),
    comparison,
    lookups: data.lookups && typeof data.lookups === 'object' ? data.lookups : {},
    structureRows: asArray(data.structure),
    cutKeys: new Set(),
    entries: [],
  };

  ctx.entries = open.map((issue) => {
    const bulk = commentsByNumber.get(issue.number);
    const comments = bulk !== undefined ? bulk : asArray(issue.comments);
    const out = extract(
      { number: issue.number, title: issue.title, body: issue.body, comments },
      { repo },
    );
    return { issue, comments, bulkCount: bulk !== undefined ? bulk.length : 0, ...out };
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

// A lookup is spent only where it can change what is reported: not on a
// retracted or unsafe reference, not on a ticked child row, not on a Blocks or
// Relates to reference, and not where the state is already in hand.
function needsLookup(ref, ctx) {
  if (ref.retracted) return false;
  if (!ref.target || unsafeTargetKind(ref.target)) return false;
  if (ref.source === 'child-row') {
    if (ref.checked) return false;
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

// SEAM (part 3): the registry commands for closed cross-repo blockers.
// eslint-disable-next-line no-unused-vars
export function planRegistry(_ctx) {
  return [];
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
    return { state: null, gap: 'absent', provenance: 'in hand' };
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

// SEAM (part 3): a closed cross-repo blocker. Today the consumption mode is
// unknown, so a closed upstream blocker is never silently cleared.
// eslint-disable-next-line no-unused-vars
export function classifyClosedCrossRepo(_ref, _st, _ctx) {
  return { outcome: 'closed-release-unverified' };
}

// The outcome of one resolvable reference, given what is known of its target.
function classifyRef(ref, st, ctx) {
  const child = ref.source === 'child-row';
  // A ticked row is consistent unless its child is still open.
  if (child && ref.checked) return { outcome: st.state === 'open' ? 'ticked-open' : 'not-open' };
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

// ---- SEAM (part 2): native structure and banner ----

// eslint-disable-next-line no-unused-vars
function buildNative(_entry, _ctx) {
  return { status: 'no-data', parent: null, total: null, completed: null };
}

// eslint-disable-next-line no-unused-vars
function detectBanner(_entry, _ctx) {
  return null;
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
  if (ref.outcome === 'closed-release-unverified') return `${label} (closed, release unverified)`;
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
        (r.outcome === 'ticked-open' || r.outcome === 'live'),
    )
    .map((r) => r.target.number);
  return [...new Set(numbers)].sort((a, b) => a - b);
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
    decidedBy,
    disagreements: checklistDisagreements(rec),
  };
}

function isRoutable(state) {
  return state === 'ready' || state === 'ready-caveat';
}

// SEAM (part 2): umbrella structure. Today the umbrella comes from checklist
// rows alone; part 2 unions native children, the banner and the precedence rules.
function structureReadiness(core, rec, coreByNumber) {
  let state = core.state;
  let reason = core.reason;
  let routedTo = null;
  if (core.openChildren.length) {
    routedTo =
      core.openChildren.find((n) => {
        const child = coreByNumber.get(n);
        return child === undefined || isRoutable(child.state);
      }) ?? null;
    state = 'umbrella';
    const routing = routedTo === null ? 'no ready child' : `routed to #${routedTo}`;
    reason = `umbrella: open children ${core.openChildren.map((n) => `#${n}`).join(', ')}; ${routing}`;
  }
  return {
    state,
    rankable: state === 'ready' || state === 'ready-caveat' || state === 'blocked',
    reason,
    blockedBy: core.blockedBy,
    openChildren: core.openChildren,
    routedTo,
    decidedBy: core.decidedBy,
    disagreements: core.disagreements,
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

  const rec = {
    number: entry.issue.number,
    refs,
    triggers,
    banner: detectBanner(entry, ctx),
    native: buildNative(entry, ctx),
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
