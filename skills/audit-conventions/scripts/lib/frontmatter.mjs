// Minimal YAML frontmatter parser scoped to the shapes used by skill/agent
// frontmatter. Handles:
//   - Top-level scalar keys (string, boolean)
//   - Nested objects (one level — metadata.expects)
//   - Arrays of objects (with - key: value items)
// Does NOT handle multiline scalars, anchors, aliases, flow style, or
// arbitrarily-deep nesting. The frontmatter shape is constrained — if we
// ever need more, replace this with a real YAML parser.

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

    if (valueText === '') {
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
