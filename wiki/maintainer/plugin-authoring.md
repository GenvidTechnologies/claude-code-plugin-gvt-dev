---
type: practice-note
title: 'Authoring Genvid Plugins'
description: 'Cross-plugin authoring gotchas — shipping MCP servers via plugin.json, npx package-name resolution, version pinning, step renumbering, example naming, a small model''s output template, verbatim output a reader or script must find, and docs/ paths in a skill or agent body.'
tags: [maintainer, plugin-authoring]
status: stable
---
# Authoring Genvid Plugins

Cross-cutting gotchas for building Genvid Claude Code plugins — things that cost
real debugging time and recur across plugins. Surfaced while authoring the
gvt-construct3 sibling plugin.

## Ship MCP servers via `plugin.json`, not a root `.mcp.json`

A root `.mcp.json` in a plugin repo is read as **project-scope** MCP config
whenever that repo is open. So the plugin's *own dev repo* tries to start the
servers every session — and errors if they need a context the dev repo lacks
(credentials, a built artifact, a running game).

Declare servers under `mcpServers` in `.claude-plugin/plugin.json` instead. They
ship to consumers and start when the plugin is **enabled** in a consuming repo,
and they never fire in the plugin's own dev repo. This is the canonical, cleaner
placement.

## `npx` resolves by package name, not bin name

`npx` resolves **package names** from the registry, not installed bin names.
`npx <name>` looks up a *package* named `<name>` — it does not search for a bin
named `<name>`. For a scoped package whose bin is unscoped
(package `@genvidtech/construct3-chef`, bin `construct3-chef`), `npx construct3-chef`
looks for a *package* called `construct3-chef` and 404s.

Always invoke the full package spec, then the subcommand:

```
npx -y @genvidtech/<pkg>@<version> <subcommand>
```

This bites in two places — the `mcpServers` command and any version-probe or
setup script that shells out to the tool.

## Pin the MCP server version

Pinning `@<version>` in the `npx` invocation makes "update the MCP server" a
one-line version bump and keeps consumers reproducible (no silent drift to a
newer published version mid-session).

## Inserting a step into a numbered `## Process` cascades references

Most skill bodies number their `## Process` steps (`### 1.`, `### 2.`, … with
`4a`/`4b` sub-steps). Inserting or removing a step renumbers every following
step **and** silently invalidates any cross-reference to them — and those refs
aren't only in the renumbered region. They hide *above* the insertion point
(e.g. `create-pr`'s host-detection step 1 pointing at "Step 4a/4b"), in sibling
skills, and in `docs/`.

After any such edit, grep the whole file (and the skill's siblings) for stale
step references before committing:

```bash
grep -rnE 'Step [0-9]+[a-z]?|### [0-9]+[a-z]?\.' plugin/skills/<name>/
```

Reconcile every hit against the new numbering. `claude plugin validate` will
**not** catch a dangling "see Step 4a" — it's prose, not schema.

## Don't name another plugin's components in illustrative examples

When a shipped skill/agent body or `CONVENTIONS.md` needs an *illustrative*
`namespace:component` example (an "e.g. …" agent or skill reference), use a
fake/descriptive placeholder (e.g. `<domain-plugin>:<explorer>`) or one of
`gvt-dev`'s **own** components — never another plugin's real name. We ship many
of our own; there's no reason to borrow a sibling plugin's.

Two failure modes motivate this:

- **It goes stale on rename.** `CONVENTIONS.md` shipped `genvid-c3:c3-explorer`
  as the domain-explorer example; the C3 plugin was later renamed
  `genvid-c3 → gvt-construct3`, and because consumers receive `CONVENTIONS.md`
  verbatim, the dead name propagated to every consuming repo until filed as a bug
  (#122). A placeholder can't rename-rot.
- **It privileges one plugin.** An illustrative example shouldn't imply the one
  sibling that happens to be named is the canonical or only choice.

This is about *illustrative* references. **Factual** prose — "X is the reference
implementation", a concrete real manifest shown as a worked example — legitimately
names a real plugin, but must then be kept **current** (a stale factual name is
just a bug). When in doubt about whether a reference is illustrative or factual,
prefer the placeholder.

## Put a small model's required output shape in its template

An agent that runs on a small model (`model: haiku`, as `gvt-dev:validator`
does) follows its Output Format template and its Process steps far more
reliably than an example tucked inside a Key Rule. When the agent must write a
line a particular way, show that line in the Output Format template **and**
say it in the step that produces it.

Measured on `validator-evals` variant R. The requirement was that a step the
`&&` chain never reached keeps its `NOT RUN` label even after it is run
individually:

- **Rule with an inline example only:** 0 of 3 runs complied. Each opened
  with a bare `schema: PASS`.
- **Plus the line in the Output Format template:** 1 of 3.
- **Plus "the line still begins `<step>: NOT RUN`" in Process step 3:** 3 of 3.

Measure the change with a harness rather than trusting the prose. Read
correctly, every one of the non-complying reports was factually right; only the
shape was wrong, which no review of the rule text would have predicted.

## Say "verbatim" when the output must be found

The rule above covers a small model's report shape. The same failure hits a
skill's own output on the session model. "Print the line `X`" is read as
"report that X happened". The model bolds the line, merges it into a sentence,
or summarizes a checklist instead of printing its rows. A reader skims past it,
and a script that greps for it finds nothing.

Measured with headless `plan-task` runs on #455, on 2026-11-20:

- **"Report `Acceptance criteria: committed at <path>.`" and "print the drafted
  checklist":** the first runs summarized the checklist rows (F1, at 582f826)
  and described the commit in prose (F3, at 50f9b76).
- **Plus "verbatim":** the second round printed the phrases, but with bold
  markup or inside a longer sentence.
- **"Print the line verbatim, as plain text on its own line: no bold, no other
  formatting, no other sentence on the line, with only the placeholders filled
  in":** all three runs at 87b91c3 printed each line alone and unformatted.

Name each property the output needs: verbatim, plain, on its own line, and
which parts are placeholders. When the output is a block (a checklist), say
"the heading and every row as written, not a summary of the rows".

## A bundled contract template's marker line names its own skill

The `triage-issues` near-miss detection (SKILL.md §0 step 1) treats the skill
name in the `Project conventions consumed by` marker as load-bearing: a
prefix-only match is a false positive. So a bundled contract template's
marker line names its own skill, never a sibling's or a generic placeholder.
The reason is concrete: the wiki schema template of the gvt-wiki plugin's
`maintain-wiki` skill shares the same `Project conventions consumed by` prefix
(naming `/gvt-wiki:maintain-wiki`),
and a prefix-only reading would route a live wiki schema into the
rename/replace offer (#246).

## A `docs/` path in a skill or agent body

A body never sends the reader to a fixed `docs/` location. A repository can move
any declared path with `paths` in `.gvt-agent.json`, and the defaults themselves
moved to the wiki in 6.0.0 (ADR-0101), so a literal path reads a file that may
not be there. `test/docs-path-prose.test.mjs` enforces this on every body under
`plugin/agents/`, `plugin/skills/` and `plugin/docs/` (ADR-0103):

- **D1:** a block that names a declared path (one that some component lists
  under `metadata.expects`) must carry its resolution in the same block: either
  `paths['<path>']`, or the shared phrase
  "the file that `CONVENTIONS.md` "Runtime path resolution" resolves for `<path>`".
  For the documentation index, write "the documentation index (the file that
  `CONVENTIONS.md` "Runtime path resolution" resolves for `docs/TOC.md`)" at the
  first mention and "the documentation index" after it. Spell out no default.
- **D2:** a block that names any other `docs/` path must be recorded as
  deliberate.
- **D5:** a block that uses the resolution wording must use the shared phrase
  exactly.

An ordinary project doc, such as an architecture or lessons-learned doc, is
named by its role and found through the documentation index (ADR-0100). Its
usual `docs/` path may appear only as a fallback hint.

**When the test fails,** first ask whether the line tells the model to read or
write that location. If it does, reword it to resolve the path. Never record a
hard-coded read as deliberate. If the line is a deliberate literal, such as an
example, another repository's path, a fallback hint or a description of what
the audit scans, paste the skeleton the failure message prints into
`test/docs-path-literals.json`, then fill in the `kind` and a one-sentence
`note`. The `anchor` is a short substring found in exactly one block of that
file. The closed list of kinds and their meanings is in ADR-0103. D3 fails an
entry whose anchor matches no block or more than one, or whose block now carries
the resolution, so delete an entry when its line goes.

## Example

A scoped MCP server, shipped via `plugin.json`, invoked by full package spec,
version-pinned — all three points at once:

```json
{
  "name": "gvt-construct3",
  "version": "0.1.0",
  "mcpServers": {
    "construct3-chef": {
      "command": "npx",
      "args": ["-y", "@genvidtech/construct3-chef@1.4.0", "mcp"]
    }
  }
}
```
