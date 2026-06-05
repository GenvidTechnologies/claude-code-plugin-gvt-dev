# Authoring Genvid Plugins

Cross-cutting gotchas for building Genvid Claude Code plugins — things that cost
real debugging time and recur across plugins. Surfaced while authoring the
genvid-c3 sibling plugin.

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
