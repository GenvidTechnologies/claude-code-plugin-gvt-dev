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
(package `@genvid/construct3-chef`, bin `construct3-chef`), `npx construct3-chef`
looks for a *package* called `construct3-chef` and 404s.

Always invoke the full package spec, then the subcommand:

```
npx -y @genvid/<pkg>@<version> <subcommand>
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

## Example

A scoped MCP server, shipped via `plugin.json`, invoked by full package spec,
version-pinned — all three points at once:

```json
{
  "name": "genvid-c3",
  "version": "0.1.0",
  "mcpServers": {
    "construct3-chef": {
      "command": "npx",
      "args": ["-y", "@genvid/construct3-chef@1.4.0", "mcp"]
    }
  }
}
```
