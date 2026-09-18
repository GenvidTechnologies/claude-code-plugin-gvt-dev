// Minimal YAML frontmatter parser scoped to the shapes used by skill/agent
// frontmatter. Handles:
//   - Top-level scalar keys (string, boolean)
//   - Nested objects (one level — metadata.expects)
//   - Arrays of objects (with - key: value items)
//   - Block scalars (`>`, `>-`, `>+`, `|`, `|-`, `|+`) with chomping —
//     folded styles join lines with a space (collapsing whitespace) and
//     fold an interior blank line to a single newline; literal styles
//     preserve newlines as written. The block body is consumed by
//     indentation so its lines are never re-scanned as mapping keys.
// Does NOT handle an explicit indentation indicator (e.g. `>2`), anchors,
// aliases, flow style, or arbitrarily-deep nesting. The frontmatter shape is
// constrained — if we ever need more, replace this with a real YAML parser.

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export function extractFrontmatter(source) {
  const match = source.match(FRONTMATTER_RE);
  if (!match) return null;
  return parseYaml(match[1]);
}

export function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  parseBlock(lines, 0, 0, root);
  return root;
}

function parseBlock(lines, startIdx, baseIndent, container) {
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const indent = leadingSpaces(line);
    if (indent < baseIndent) return i;

    const stripped = line.slice(indent);

    if (stripped.startsWith('- ')) {
      // Array item — caller should have set up an array container
      return i;
    }

    const colon = stripped.indexOf(':');
    if (colon === -1) {
      i++;
      continue;
    }
    const key = stripped.slice(0, colon).trim();
    const valueText = stripped.slice(colon + 1).trim();

    const blockScalar = /^([|>])([+-]?)$/.exec(valueText);

    if (blockScalar) {
      const literal = blockScalar[1] === '|';
      const chomp = blockScalar[2] === '+' ? 'keep' : blockScalar[2] === '-' ? 'strip' : 'clip';
      const result = readBlockScalar(lines, i + 1, indent, literal, chomp);
      container[key] = result.value;
      i = result.nextIndex;
    } else if (valueText === '') {
      // Nested block — could be array or object. Peek next non-blank line.
      const next = peekNextNonBlank(lines, i + 1);
      if (next && next.text.startsWith('- ')) {
        const arr = [];
        container[key] = arr;
        i = parseArray(lines, next.index, next.indent, arr);
      } else if (next && next.indent > indent) {
        const obj = {};
        container[key] = obj;
        i = parseBlock(lines, next.index, next.indent, obj);
      } else {
        container[key] = null;
        i++;
      }
    } else {
      container[key] = parseScalar(valueText);
      i++;
    }
  }
  return i;
}

function parseArray(lines, startIdx, baseIndent, arr) {
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const indent = leadingSpaces(line);
    if (indent < baseIndent) return i;

    const stripped = line.slice(indent);
    if (!stripped.startsWith('- ')) return i;

    // Array item — `- key: value` starts an object.
    const item = {};
    arr.push(item);

    // First key/value on the same line as the dash:
    const inline = stripped.slice(2);
    const colon = inline.indexOf(':');
    if (colon !== -1) {
      const key = inline.slice(0, colon).trim();
      const valueText = inline.slice(colon + 1).trim();
      if (valueText !== '') {
        item[key] = parseScalar(valueText);
      }
    }

    // Subsequent keys at indent + 2 (the dash + space)
    i = parseBlock(lines, i + 1, baseIndent + 2, item);
  }
  return i;
}

// Consume a YAML block scalar body starting at `startIdx`, given the
// indentation of the `key:` line that introduced it (`keyIndent`). The
// body's own indentation is set by its first non-blank line (YAML rule);
// any line indented at or below `keyIndent`, or a dedent below the body's
// own indentation, ends the block. Returns the rendered value plus the
// index of the first line *not* consumed, so the caller can resume parsing
// there instead of re-scanning body lines as mapping keys.
function readBlockScalar(lines, startIdx, keyIndent, literal, chomp) {
  const rawLines = [];
  let blockIndent = null;
  let i = startIdx;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      rawLines.push('');
      continue;
    }
    const indent = leadingSpaces(line);
    if (blockIndent === null) {
      if (indent <= keyIndent) break;
      blockIndent = indent;
    }
    if (indent < blockIndent) break;
    rawLines.push(line.slice(blockIndent));
  }
  // The loop above exits two ways, and `keep` chomping (below) needs to
  // know which: EOF (the `for` condition failed, `i === lines.length`) or
  // dedent (a `break`, `i` points at the sibling-key/dedent line that isn't
  // part of the body and was never pushed).
  const eofTerminated = i === lines.length;

  // Chomping: count and strip trailing blank lines, then decide how many
  // (if any) trailing newlines the rendered value keeps.
  let trailingBlankCount = 0;
  while (rawLines.length && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
    trailingBlankCount++;
  }

  let value;
  if (rawLines.length === 0) {
    value = chomp === 'keep' ? '\n'.repeat(trailingBlankCount) : '';
  } else {
    const joined = literal ? rawLines.join('\n') : foldLines(rawLines);
    if (chomp === 'strip') value = joined;
    else if (chomp === 'clip') value = joined + '\n';
    else {
      // keep: the source always has at least one trailing newline — the
      // one that terminates the last content line — plus one more for
      // every genuine blank line after it. An EOF-terminated block (the
      // split simply ran out of lines) already has that terminator
      // represented as one of `trailingBlankCount`'s "" elements, even
      // when there are zero genuine blank lines past it, so `trailingBlankCount`
      // alone is the total. A dedent-terminated block (ended by a sibling
      // key line, which is never blank) leaves no such element — the
      // terminator is real but uncounted — so it must be added back
      // explicitly. Using a flat `Math.max(trailingBlankCount, 1)` instead
      // of this correction under-counts a dedent-terminated block that has
      // one or more genuine trailing blank lines (e.g. 1 blank line + dedent
      // needs 2 newlines, not 1). The outer `Math.max(…, 1)` is a floor for
      // the degenerate case where the captured text has no trailing newline
      // at all (e.g. a block scalar as the very last frontmatter key, where
      // the closing `---` fence's `\n` is consumed by the outer regex and
      // never reaches this function) — `clip` always emits at least one
      // newline in that case, and `keep` should never emit fewer than `clip`.
      const newlineCount = trailingBlankCount + (eofTerminated ? 0 : 1);
      value = joined + '\n'.repeat(Math.max(newlineCount, 1));
    }
  }

  return { value, nextIndex: i };
}

// Fold body lines per YAML's folded-scalar rule: consecutive content lines
// join with a single space; an interior blank line folds to a single
// newline (a run of N blank lines folds to N newlines, and no extra space
// is added around the run — the newline(s) already act as the separator).
// Does not implement the "more-indented lines keep their line breaks"
// exception — no component in this repo's corpus exercises it.
function foldLines(lines) {
  let result = lines[0];
  let idx = 1;
  while (idx < lines.length) {
    if (lines[idx] === '') {
      let count = 0;
      while (idx < lines.length && lines[idx] === '') {
        count++;
        idx++;
      }
      result += '\n'.repeat(count);
      if (idx < lines.length) {
        result += lines[idx];
        idx++;
      }
    } else {
      result += ' ' + lines[idx];
      idx++;
    }
  }
  return result;
}

function peekNextNonBlank(lines, fromIdx) {
  for (let i = fromIdx; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    return { index: i, indent: leadingSpaces(line), text: line.slice(leadingSpaces(line)) };
  }
  return null;
}

function leadingSpaces(line) {
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  return i;
}

function parseScalar(text) {
  // Strip surrounding quotes (single or double)
  const trimmed = text.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  // Number?
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  return trimmed;
}
