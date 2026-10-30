// Reference grammar for triage-issues' issue-refs script (#209): the single
// definition of how an issue's title, body, heading sections and comments
// name other issues. Pure: no writes, no process.exit, no console output.
//
// A line-state machine. It tracks fenced blocks, blockquotes, inline code,
// struck spans, heading sections and the Acceptance scope, and emits per-line
// records (never whole bodies). Every exclusion below is its own small named
// function or branch, so each can be disabled on its own (mutation run).
//
// Not here: the SD9 banner. The extract() contract has no banner field, so
// banner detection (self-declaration and parent-naming exclusions) is left to
// the resolve half.
//
// Regex hygiene: every pattern is linear (no nested quantifiers) because the
// input is untrusted issue text.

const PLACEHOLDER = String.fromCharCode(1);

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const BLOCKQUOTE_RE = /^\s{0,3}>/;
const CODE_RE = /`[^`]*`/g;
const STRUCK_RE = /~~[^~]*~~/g;
const LEAD_RE = /^\s*(?:([-*+]|\d{1,9}[.)])\s+)?(?:\[([ xX])\]\s+)?[*_]*/;

// Anchored at the line start (mid-line rule), with an optional negator prefix
// so a negated form is recognised and then rejected by its own predicate.
const STATEMENT_RE =
  /^(?:(not|no longer|never|no)\s+)?(blocked[ -]by|depends[ -]on|blocks|relates[ -]to)\b/i;
const TRIGGER_RE =
  /^(?:deferral trigger|pick this up when|pick it up (?:only )?when|revisit when|not urgent|deferred until|parked until)\b/i;
const MEASUREMENT_RE =
  /\b(?:count(?:s|ed|ing)?|measure(?:s|d|ment|ments)?|measuring|probe(?:s|d)?|probing|benchmark(?:s|ed|ing)?|threshold(?:s)?)\b/i;
const RETRACT_RE =
  /\b(?:no longer (?:applies|depends on|blocked by|blocks|a blocker)|blocker (?:is )?(?:satisfied|cleared|resolved)|unblocked)\b/i;
const TRIAGE_NOTE_RE = /^[*_\s]*triage verification note/i;
const BLOCKER_HEADING_RE = /^(blocked[ -]by|depends[ -]on)$/i;
const ACCEPTANCE_HEADING_RE = /^acceptance\b/i;
const CHILD_ROW_RE = /^[*_]*((?:[\w.-]+\/[\w.-]+)?#(\d{1,9}))(?!\w)(.*)$/;
const ANNOTATION_RE = /\bblocked[ -]by\b/i;
const TITLE_AFTER_RE = /\(\s*after\s+([^)]*)\)/gi;
const TITLE_VERB_RE = /\b(?:blocked[ -]by|depends[ -]on)\b/i;

// owner/repo#N, name#N, "name #N", "#N" and github issue/pull URLs.
const REF_RE =
  /(?:https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d{1,9}))|(?:(?<![\w./-])([\w.-]+\/[\w.-]+)#(\d{1,9})(?!\w))|(?:(?<![\w./#-])([\w.-]+)( ?)#(\d{1,9})(?!\w))|(?:(?<![\w&])#(\d{1,9})(?!\w))/gi;

// Words that precede "#N" in ordinary prose and are not a repository name.
const NOT_A_REPO_WORD_RE =
  /^(?:open|closed|merged|shipped|released|parent|child|sibling|split|and|or|issue|issues|pr|prs|pull|ticket|bug|see|also|plus|then|the|a|an|to|in|on|of|for|with|by|from|is|are|was|be|as|at|after|before|until|when|if|needs|need|via|per|both|all|than|that|this|these|those|it|its|refs|ref|fixes|closes)$/i;

// What may sit between the statement verb (or a list separator) and a
// "repo-name #N" item: only the optional ":" and emphasis marks plus space,
// or a list separator (",", ";", "&", "+", "and", "or") then space.
const ITEM_LEAD_RE = /^[\s:*_]*$/;
const ITEM_SEPARATOR_RE = /(?:[,;&+]|(?<![\w])(?:and|or))\s*$/i;

const RELATIONS = {
  'blocked by': 'blocked-by',
  'depends on': 'depends-on',
  blocks: 'blocks',
  'relates to': 'relates-to',
};

// ---- distinct exclusion rules (each can be disabled on its own) ----

// Rule: fenced blocks. Returns the next fence state and whether to skip.
function trackFence(raw, fence) {
  const m = FENCE_RE.exec(raw);
  if (fence) {
    if (m && m[1][0] === fence.ch && m[1].length >= fence.len && m[2].trim() === '') {
      return { fence: null, skip: true };
    }
    return { fence, skip: true };
  }
  if (m) return { fence: { ch: m[1][0], len: m[1].length }, skip: true };
  return { fence: null, skip: false };
}

// Rule: blockquotes.
function isBlockquoteLine(raw) {
  return BLOCKQUOTE_RE.test(raw);
}

// Rule: inline code.
function maskInlineCode(s) {
  return s.replace(CODE_RE, PLACEHOLDER);
}

// Rule: struck-through spans.
function maskStruck(s) {
  return s.replace(STRUCK_RE, ' ');
}

// Rule: negated statements ("Not blocked by", "No longer depends on").
function isNegatedStatement(negator) {
  return Boolean(negator);
}

// Rule: mid-line mentions are narrative. The anchor in STATEMENT_RE is the rule.
function findStatement(text) {
  const m = STATEMENT_RE.exec(text);
  if (!m) return null;
  const verb = m[2].toLowerCase().replace('-', ' ');
  return {
    negator: m[1],
    relation: RELATIONS[verb],
    rest: text.slice(m.index + m[0].length),
  };
}

// Rule: checklist rows under an Acceptance heading are not child rows.
function inAcceptanceScope(section) {
  return Boolean(section && section.kind === 'acceptance');
}

// Rule: a comma right after the number is not a child row (the #442 shape).
function hasCommaAfterNumber(after) {
  return after.startsWith(',');
}

// Rule: a retraction withdraws only the same target.
function sameTarget(a, b) {
  if (!a || !b) return false;
  return (
    a.number === b.number && (a.repo || '').toLowerCase() === (b.repo || '').toLowerCase()
  );
}

// Rule: a triage verification note is skipped for statements (read for
// triggers and retraction lines).
function isTriageNote(body) {
  const first = body.split(/\r?\n/, 1)[0];
  return TRIAGE_NOTE_RE.test(first);
}

// Rule: the space form "name #N" names a repository only when the word starts
// a reference item, i.e. it follows the statement verb (after an optional ":")
// or a list separator. Anywhere else ("its split #740", "sub-issues #189")
// the word is ordinary prose and "#N" is a plain same-repo reference.
// `before` is the text preceding the word within the scanned text.
function startsReferenceItem(before) {
  return ITEM_LEAD_RE.test(before) || ITEM_SEPARATOR_RE.test(before);
}

// Rule: an issue never references itself (same-repo reference to its own number).
function isSelfRef(target, issueNumber) {
  return Boolean(target) && target.repo === null && target.number === Number(issueNumber);
}

// ---- helpers ----

function normalizeRepo(repo, ctx) {
  if (ctx.repo && repo.toLowerCase() === ctx.repo) return null;
  return repo;
}

function sameKey(target) {
  return `${(target.repo || '').toLowerCase()}#${target.number}`;
}

// Every reference named in a text, in order. A "name#N" or "name #N" is
// unresolvable (repo-ambiguous). spaceForm: whether "name #N" counts.
function scanRefs(text, ctx, spaceForm) {
  const out = [];
  const seen = new Set();
  const add = (target, unresolvable) => {
    const key = target ? sameKey(target) : `?${out.length}`;
    if (target && seen.has(key)) return;
    seen.add(key);
    out.push({ target, unresolvable });
  };
  REF_RE.lastIndex = 0;
  let m;
  while ((m = REF_RE.exec(text)) !== null) {
    if (m[3] !== undefined) {
      add({ repo: normalizeRepo(`${m[1]}/${m[2]}`, ctx), number: Number(m[3]) });
    } else if (m[5] !== undefined) {
      add({ repo: normalizeRepo(m[4], ctx), number: Number(m[5]) });
    } else if (m[8] !== undefined) {
      const word = m[6];
      const plain = !/[a-z]/i.test(word) || NOT_A_REPO_WORD_RE.test(word);
      if (m[7] === '' ) {
        add(null, 'repo-ambiguous');
      } else if (spaceForm && !plain && startsReferenceItem(text.slice(0, m.index))) {
        add(null, 'repo-ambiguous');
      } else {
        add({ repo: null, number: Number(m[8]) });
      }
    } else {
      add({ repo: null, number: Number(m[9]) });
    }
  }
  return out;
}

function makeRef(f) {
  const ref = {
    source: f.source,
    origin: f.origin,
    target: f.target,
    line: f.line,
    retracted: false,
    relation: f.relation === undefined ? null : f.relation,
  };
  if (f.checked !== undefined) ref.checked = f.checked;
  if (f.unresolvable !== undefined) ref.unresolvable = f.unresolvable;
  return ref;
}

function stripLead(masked) {
  const m = LEAD_RE.exec(masked);
  return {
    isList: m[1] !== undefined,
    checkbox: m[2],
    rest: masked.slice(m[0].length),
  };
}

function headingKind(title) {
  const clean = title.replace(/[*_]/g, '').replace(/[#:\s]+$/, '').trim();
  if (BLOCKER_HEADING_RE.test(clean)) return 'blocker';
  if (ACCEPTANCE_HEADING_RE.test(clean)) return 'acceptance';
  return null;
}

function headingRelation(title) {
  return /^blocked/i.test(title.replace(/[*_\s]/g, '')) ? 'blocked-by' : 'depends-on';
}

// ---- scanning ----

function scanTitle(title, ctx, entries) {
  const text = maskInlineCode(title);
  const seen = new Set();
  const push = (found) => {
    for (const f of found) {
      if (!f.target || seen.has(sameKey(f.target))) continue;
      seen.add(sameKey(f.target));
      entries.push({
        order: -1,
        ref: makeRef({
          source: 'title',
          origin: 'title',
          target: f.target,
          line: title.trim(),
        }),
      });
    }
  };
  TITLE_AFTER_RE.lastIndex = 0;
  let m;
  while ((m = TITLE_AFTER_RE.exec(text)) !== null) push(scanRefs(m[1], ctx, false));
  const v = TITLE_VERB_RE.exec(text);
  if (v) push(scanRefs(text.slice(v.index + v[0].length), ctx, false));
}

function scanText(text, origin, order, ctx, skipStatements) {
  const out = { entries: [], triggers: [], retractions: [] };
  let fence = null;
  let section = null;

  const closeSection = () => {
    if (section && section.kind === 'blocker' && section.refCount === 0) {
      out.entries.push({
        order,
        ref: makeRef({
          source: 'heading',
          origin,
          target: null,
          line: section.line,
          relation: section.relation,
          unresolvable: 'heading-detached',
        }),
      });
    }
  };
  const emit = (source, target, line, extra = {}) => {
    out.entries.push({ order, ref: makeRef({ source, origin, target, line, ...extra }) });
  };

  for (const raw of text.split(/\r?\n/)) {
    const fenced = trackFence(raw, fence);
    fence = fenced.fence;
    if (fenced.skip) continue;
    if (isBlockquoteLine(raw)) continue;

    const masked = maskStruck(maskInlineCode(raw));
    const line = raw.trim();

    const heading = HEADING_RE.exec(masked);
    if (heading) {
      const level = heading[1].length;
      if (!(section && level > section.level)) {
        closeSection();
        const title = heading[2];
        const kind = headingKind(title);
        section = kind
          ? { level, kind, refCount: 0, line, relation: headingRelation(title) }
          : null;
      }
      continue;
    }

    const lead = stripLead(masked);

    // Retraction lines are read in comments, including triage notes.
    if (origin === 'comment' && RETRACT_RE.test(masked)) {
      const targets = scanRefs(masked, ctx, false)
        .filter((r) => r.target)
        .map((r) => r.target);
      if (targets.length) out.retractions.push({ order, targets });
    }

    // Deferral triggers (R21), read in bodies and comments alike.
    if (TRIGGER_RE.test(lead.rest)) {
      out.triggers.push({ line, origin, measurement: MEASUREMENT_RE.test(lead.rest) });
      for (const r of scanRefs(lead.rest, ctx, false)) {
        if (r.target) emit('deferral', r.target, line);
      }
      continue;
    }

    if (skipStatements) continue;

    // Checklist child rows.
    if (lead.isList && lead.checkbox !== undefined) {
      const row = CHILD_ROW_RE.exec(lead.rest);
      if (row && !inAcceptanceScope(section) && !hasCommaAfterNumber(row[3])) {
        const target = scanRefs(row[1], ctx, false)[0].target;
        emit('child-row', target, line, { checked: lead.checkbox !== ' ' });
        if (section && section.kind === 'blocker') section.refCount++;
        const ann = ANNOTATION_RE.exec(row[3]);
        if (ann) {
          for (const r of scanRefs(row[3].slice(ann.index + ann[0].length), ctx, false)) {
            if (r.target) emit('row-annotation', r.target, line);
          }
        }
        continue;
      }
    }

    // Blocker statements.
    const stmt = findStatement(lead.rest);
    if (stmt) {
      if (isNegatedStatement(stmt.negator)) continue;
      const found = scanRefs(stmt.rest, ctx, true);
      if (found.length === 0) {
        if (stmt.relation === 'blocked-by' || stmt.relation === 'depends-on') {
          emit('statement', null, line, { relation: stmt.relation, unresolvable: 'prose' });
        }
      } else {
        for (const f of found) {
          emit('statement', f.target, line, {
            relation: stmt.relation,
            unresolvable: f.unresolvable,
          });
        }
      }
      if (section && section.kind === 'blocker' && found.length) section.refCount++;
      continue;
    }

    // A reference-bearing line inside a Blocked by / Depends on heading section.
    if (section && section.kind === 'blocker') {
      const found = scanRefs(lead.rest, ctx, true);
      if (found.length) {
        section.refCount++;
        for (const f of found) {
          emit('heading', f.target, line, {
            relation: section.relation,
            unresolvable: f.unresolvable,
          });
        }
      }
    }
  }
  closeSection();
  return out;
}

/**
 * Extract the references from one issue's raw record.
 * @param {{ number?: number, title?: string, body?: string,
 *           comments?: Array<{ body?: string, createdAt?: string }> }} issue
 * @param {{ repo?: string }} [options] repo: the tracker's owner/repo, so a
 *   reference naming it is a same-repo one (repo null)
 * @returns {{ refs: object[], triggers: object[] }}
 */
export function extract(issue, options = {}) {
  const ctx = { repo: options && options.repo ? String(options.repo).toLowerCase() : null };
  const entries = [];
  const triggers = [];
  const retractions = [];

  scanTitle(String(issue.title == null ? '' : issue.title), ctx, entries);

  const body = String(issue.body == null ? '' : issue.body);
  const parts = [scanText(body, 'body', -1, ctx, false)];

  const comments = (issue.comments || [])
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const x = String(a.c.createdAt || '');
      const y = String(b.c.createdAt || '');
      return x < y ? -1 : x > y ? 1 : a.i - b.i;
    });
  comments.forEach(({ c }, k) => {
    const text = String(c.body == null ? '' : c.body);
    parts.push(scanText(text, 'comment', k, ctx, isTriageNote(text)));
  });

  for (const p of parts) {
    entries.push(...p.entries);
    triggers.push(...p.triggers);
    retractions.push(...p.retractions);
  }

  // Self-references are never emitted, from any source.
  const kept = entries.filter((e) => !isSelfRef(e.ref.target, issue.number));
  entries.length = 0;
  entries.push(...kept);

  // Retraction pass (R7): a later comment withdraws a reference to the same target.
  for (const r of retractions) {
    for (const e of entries) {
      if (e.ref.source === 'child-row') continue;
      if (e.order >= r.order) continue;
      if (r.targets.some((t) => sameTarget(t, e.ref.target))) e.ref.retracted = true;
    }
  }

  return { refs: entries.map((e) => e.ref), triggers };
}
