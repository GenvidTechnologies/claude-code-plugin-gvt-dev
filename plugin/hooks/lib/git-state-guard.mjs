// Git state-mutation guard — classification logic.
//
// Denies destructive `git` invocations (stash, reset, checkout, switch,
// restore, clean, merge, rebase, cherry-pick, revert, pull, am) issued by an
// orchestrated gvt-dev agent (an implementer dispatched by e.g. `plan-task`),
// per development-principles.md principle #14: those agents must never
// mutate working tree, index, or history state that may belong to a sibling
// task or the orchestrator. A human or a non-gvt-dev agent is never in scope.
//
// Tokenization is delegated to `shell-quote`'s `parse()`, injected by the
// caller (see git-state-guard.mjs, the PreToolUse entry point) so this module
// stays free of a hard import and is trivially testable with a stub parser.
// `parse()` does not treat a bare newline as a command separator — unlike
// every control operator it does recognize (`&&`, `||`, `;`, `|`, `&`, `(`,
// `)`, …) — so a multi-line command string is split on newlines *before*
// tokenization; otherwise words on either side of the newline would be read
// as one unbroken argument list with no boundary between them.

const GLOBAL_OPTIONS_WITH_SEPARATE_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree']);
const GLOBAL_OPTIONS_WITH_EQ_FORM = ['--git-dir=', '--work-tree='];
const GLOBAL_FLAGS = new Set([
  '--no-pager',
  '-P',
  '--paginate',
  '-p',
  '--bare',
  '--no-replace-objects',
  '--literal-pathspecs',
]);

// Subcommands that mutate the working tree, the index, or history and are
// denied for an in-scope agent. `stash` and `clean` each carry a narrow,
// explicitly non-mutating exception handled in evaluateSubcommand below.
const DENY_SUBCOMMANDS = new Set([
  'stash',
  'reset',
  'checkout',
  'switch',
  'restore',
  'clean',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'pull',
  'am',
]);

const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

// shell-quote's env callback receives just the variable name (no leading
// `$`); returning it prefixed and unresolved keeps `$REF` (or `${REF}`)
// literal in the tokenized output instead of expanding it to a real value —
// classification must not depend on what a variable happens to hold.
function literalEnv(name) {
  return '$' + name;
}

function isAssignment(tok) {
  return typeof tok === 'string' && ASSIGNMENT_RE.test(tok);
}

function isGitWord(tok) {
  if (typeof tok !== 'string') return false;
  if (tok === 'git' || tok === 'git.exe') return true;
  if (tok.endsWith('/git') || tok.endsWith('/git.exe')) return true;
  if (tok.endsWith('\\git.exe')) return true;
  return false;
}

// A shell-quote control-operator token, e.g. { op: '&&' }. Glob tokens also
// carry an `op` field (`{ op: 'glob', pattern: '*.log' }`) but are opaque
// arguments, not command separators, so they're excluded here.
function isControlOp(tok) {
  return Boolean(tok) && typeof tok === 'object' && typeof tok.op === 'string' && tok.op !== 'glob';
}

// Split a flat shell-quote token stream into one array per simple command,
// breaking at every control operator (&&, ||, ;, ;;, |, |&, &, (, ), <, >,
// <(, <<<, >>, >&, <&). Redirection targets end up as their own (harmless)
// segment rather than folded into the preceding command's argument list,
// which is a conservative simplification: it never hides a `git` invocation,
// it can only ever misclassify a stray redirect target as its own segment.
function splitIntoSegments(tokens) {
  const segments = [];
  let current = [];
  for (const tok of tokens) {
    if (isControlOp(tok)) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(tok);
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function denyResult(subcommand) {
  return {
    deny: true,
    reason:
      `Blocked: 'git ${subcommand}' mutates working-tree, index, or history state ` +
      '(development-principles.md principle #14 — an orchestrated agent must never ' +
      'stash, reset, checkout, switch, restore, clean, merge, rebase, cherry-pick, ' +
      'revert, pull, or am, since that state may belong to a sibling task or the ' +
      "orchestrator). Use a non-mutating alternative instead: 'git show <ref>:<path>' " +
      "to read prior content, 'git diff --staged' to inspect what's staged, or the " +
      'baseline already supplied in your dispatch brief. If you believe you ' +
      'mis-staged a file, report back to the orchestrator instead of mutating the ' +
      'tree or index yourself.',
  };
}

function hasDryRunFlag(rest) {
  return rest.some((tok) => {
    if (typeof tok !== 'string') return false;
    if (tok === '-n' || tok === '--dry-run') return true;
    // A combined short-flag cluster (e.g. -nd, -dn) containing 'n'.
    return /^-[a-zA-Z]+$/.test(tok) && tok.includes('n');
  });
}

function evaluateSubcommand(subcommand, rest) {
  if (!DENY_SUBCOMMANDS.has(subcommand)) return { deny: false };

  if (subcommand === 'stash') {
    const next = rest[0];
    if (next === 'list' || next === 'show') return { deny: false };
  }

  if (subcommand === 'clean' && hasDryRunFlag(rest)) {
    return { deny: false };
  }

  return denyResult(subcommand);
}

// Classify a single simple command's tokens (already split at control
// operators). Returns { deny: false } for anything that isn't a denied `git`
// invocation, including a command whose word isn't `git` at all.
function classifySegment(tokens) {
  let i = 0;

  while (i < tokens.length && isAssignment(tokens[i])) i++;

  if (tokens[i] === 'env') {
    i++;
    while (i < tokens.length && isAssignment(tokens[i])) i++;
  }

  if (!isGitWord(tokens[i])) return { deny: false };
  i++;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (typeof tok !== 'string') break;
    if (GLOBAL_OPTIONS_WITH_SEPARATE_ARG.has(tok)) {
      i += 2;
      continue;
    }
    if (GLOBAL_OPTIONS_WITH_EQ_FORM.some((prefix) => tok.startsWith(prefix))) {
      i += 1;
      continue;
    }
    if (GLOBAL_FLAGS.has(tok)) {
      i += 1;
      continue;
    }
    break;
  }

  const subcommand = tokens[i];
  if (typeof subcommand !== 'string') return { deny: false };

  return evaluateSubcommand(subcommand, tokens.slice(i + 1));
}

function inScope(agent_id, agent_type) {
  return (
    typeof agent_id === 'string' &&
    agent_id.length > 0 &&
    typeof agent_type === 'string' &&
    agent_type.startsWith('gvt-dev:')
  );
}

// Classify a PreToolUse Bash payload's command against the git state-mutation
// guard. `parse` is shell-quote's `parse` function (or a test double with the
// same signature: `parse(command, env) -> ParseEntry[]`). Never throws:
// anything unexpected — an unparsable line, a malformed input shape — resolves
// to `{ deny: false }` so the guard fails open rather than blocking a command
// it can't confidently classify.
export function classify({ agent_id, agent_type, command } = {}, parse) {
  if (!inScope(agent_id, agent_type)) return { deny: false };
  if (typeof command !== 'string' || command.trim() === '') return { deny: false };
  if (typeof parse !== 'function') return { deny: false };

  const lines = command.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === '') continue;

    let tokens;
    try {
      tokens = parse(line, literalEnv);
    } catch {
      continue;
    }
    if (!Array.isArray(tokens)) continue;

    for (const segment of splitIntoSegments(tokens)) {
      const result = classifySegment(segment);
      if (result.deny) return result;
    }
  }

  return { deny: false };
}
