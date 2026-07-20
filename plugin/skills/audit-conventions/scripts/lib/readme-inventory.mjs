// Author-time inventory lint for the plugin's own repo-root README.
//
// On a maintainer / dogfood run against the plugin source (gated by the caller
// via AUDITING_PLUGIN_SOURCE), this checks that the README's "Skills" table and
// "Agents" list stay in sync with the components actually under plugin/skills
// and plugin/agents — catching the drift where a new skill/agent lands but the
// README table is never updated (and vice-versa: a row left behind after a
// removal/rename).
//
// Pure: takes the README text plus the actual component-name lists and returns
// findings in the same self-contained shape as audit.mjs's other repo-health
// checks (`{ kind, ok: false, severity, detail }`). Tolerant of a README that
// lacks a given section — it skips that half rather than flagging every
// component — so it never fires on a plugin repo whose README has a different
// shape, only on drift within an existing table/list.

// First-column-only match for a Markdown table row: `| `<name>` | ... |`.
// Deliberately anchored to the row's first cell so backtick tokens in the
// Purpose column (e.g. a row that mentions `triaged`) are not mistaken for
// listed skills.
const SKILL_ROW_RE = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm;

// Any `<name>` backtick token — used only within the bounded Agents section,
// which is a plain comma-separated list of names.
const NAME_RE = /`([a-z][a-z0-9-]*)`/g;

// Slice the text belonging to a `**Marker**` section: from just after the
// marker to the start of the next `**...**` bold-marker line (or end of doc).
// README sections are introduced by bold markers (**Skills**, **Agents**,
// **Hook:**, **Complementary...**), so this bounds each section to its own
// content — keeping, e.g., the Hook/Complementary prose (which mentions
// `plan-task`, `code-review`, `pre-commit-lint`, ...) out of the Agents scan.
function sliceSection(content, marker) {
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx + marker.length);
  const nextIdx = rest.search(/\n\*\*/);
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

function matchNames(re, text) {
  const out = new Set();
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) out.add(m[1]);
  return out;
}

function mk(detail) {
  return { kind: 'readme-inventory', ok: false, severity: 'warning', detail };
}

// dir is the plugin subdirectory ('skills' | 'agents'); where names the README
// element ('skills table' | 'agents list').
function diff(dir, where, actual, listed) {
  const findings = [];
  const actualSet = new Set(actual);
  for (const name of actual) {
    if (!listed.has(name)) {
      findings.push(
        mk(`plugin/${dir}/${name} is present but missing from the README ${where} — add it.`),
      );
    }
  }
  for (const name of listed) {
    if (!actualSet.has(name)) {
      findings.push(
        mk(
          `README ${where} lists \`${name}\`, which has no matching plugin/${dir}/ entry — ` +
            `stale, remove or rename it.`,
        ),
      );
    }
  }
  return findings;
}

export function checkReadmeInventory(readmeContent, skillNames, agentNames) {
  if (readmeContent == null) return [];
  const findings = [];

  const skillsSection = sliceSection(readmeContent, '**Skills**');
  if (skillsSection != null) {
    findings.push(...diff('skills', 'skills table', skillNames, matchNames(SKILL_ROW_RE, skillsSection)));
  }

  const agentsSection = sliceSection(readmeContent, '**Agents**');
  if (agentsSection != null) {
    findings.push(...diff('agents', 'agents list', agentNames, matchNames(NAME_RE, agentsSection)));
  }

  return findings;
}
