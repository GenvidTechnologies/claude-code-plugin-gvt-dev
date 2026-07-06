---
name: reconcile-mcp-pin
description: >-
  Reconcile a Genvid Claude Code plugin's hand-enumerated agent tool inventories
  after a pinned MCP server version is bumped — including a **scope rename**
  (the package name changing, not just its version). A pin bump can add, rename,
  or remove MCP tools, and hand-maintained tool lists drift silently — for an
  agent with a hard `tools:` allow-list a missed read tool becomes *uncallable*,
  a functional regression, not just a doc gap. This skill generalizes the proven
  tool-surface-reconciliation runbook: pull the authoritative surface straight
  from the pinned package (npm pack + registerTool grep, count-checked), diff old
  vs new, reconcile the read-side and mutation-side agents respecting the
  read/mutate split, sweep stale @<old> version prose, bump the plugin.json pin,
  and add a CHANGELOG entry. It is the precursor to a plugin release, so reach
  for it WHENEVER someone bumps a bundled MCP server pin,
  renames its npm scope, or notices agent tool lists drifting after a server
  update. Trigger on requests like "bump the construct3-chef / c3-domain-manager
  pin", "the tool lists drifted after the server bump", or "rename the package
  scope / @genvid → @genvidtech". It stops short of the
  release — hand off to release-plugin to tag and ship. Do NOT use it for: cutting
  the plugin release itself (use release-plugin); publishing an npm / TypeScript
  package to npmjs.com (use publish-npm-package / release-npm-package); or bumping
  a skill's minVersion floor on a plain pin bump (a scope rename is the one
  guarded exception).
metadata:
  expects:
    config:
      - key: paths.plugin_root
        in: .gvt-agent.json
        required: false
        reason: Path from the repo root to the directory containing .claude-plugin/plugin.json (and skills/, agents/); defaults to "." (plugin at repo root). Set to e.g. "plugin" for a subfolder layout.
    tools:
      - command: npm
        reason: Pulls the authoritative MCP tool surface straight from the pinned package (npm pack), and detects the latest published version to bump to (npm view)
      - command: git
        reason: Sweeps stale pinned-version prose across the plugin subtree and creates the single reconciliation commit
---

# Reconcile an MCP server pin

This skill keeps a plugin's **agent tool inventories** honest after a bundled MCP
server's pinned version is bumped. It applies to a plugin that (a) pins one or
more MCP servers in `.claude-plugin/plugin.json` `mcpServers` and (b) ships agents
that **enumerate those servers' tools by hand**. gvt-construct3 is the reference
consumer; the procedure generalizes its `docs/tool-surface-reconciliation.md`
runbook to any such plugin.

It executes the in-repo work directly, with validation gates, then **stops short
of the release**: the output is a clean, reviewed reconciliation commit that
`release-plugin` tags and ships next.

Work in small, ordered steps. The authoritative surface comes from the **pinned
package's compiled server**, never from memory or READMEs — both drift.

## Why it matters

- **An agent with a hard `tools:` allow-list can only call what it enumerates.**
  Any read tool the server added but the allow-list omits is *uncallable* — a
  functional regression, not a doc gap. This is the failure this skill exists to
  prevent.
- **An agent with no `tools:` lock** can call anything; its tool lists are
  documentation only. But stale docs still send it down wrong paths (hand-rolling
  something a new tool now does). Reconcile its body too.

Keep the **read / mutate split** correct, and stay within the plugin's knowledge
boundaries — document tool **names and one-line purposes**, never project-specific
or tooling-schema content (that belongs to the consuming repo or each server's own
docs).

## Resolve the plugin root first

Read `paths.plugin_root` from `.gvt-agent.json`; if absent, default to `.`
(plugin at the repo root). Below, `<plugin_root>` is that value — `.claude-plugin/plugin.json`,
`skills/`, `agents/`, and `docs/` all live under it.

## Phase 1: Identify the bump

1. Read `<plugin_root>/.claude-plugin/plugin.json` `mcpServers`. Each entry pins a
   package via its `args` (e.g. `["-y", "@genvid/construct3-chef@0.7.0", "mcp"]`).
   Record each server's package name and its **current (old) pin**.
   - If the package **name** itself is changing, not only its version (e.g.
     `@genvid/construct3-chef` → `@genvidtech/construct3-chef`), this is a
     **scope rename** — see "## Scope rename (a broader pin bump)" below for the
     additional work it layers onto Phases 2–7.
2. Determine the **new** pin per server being bumped:
   - If the maintainer passed an explicit target version, use it.
   - Otherwise detect the latest published version and **confirm before bumping**:
     ```bash
     npm view @genvid/construct3-chef version
     ```
   - When several servers are pinned, reconcile **one server at a time** — only the
     ones whose pin is actually changing.
3. If old == new for every server, there is nothing to reconcile — say so and stop.

## Phase 2: Authoritative tool surface from the pinned package

Pull the surface straight from each pinned package's compiled server. **Run this
pipeline in the Bash tool** (it is POSIX — `npm pack | tar | grep | sed`); do not
paste it into PowerShell.

```bash
cd "$(mktemp -d)"
# Pack OLD and NEW of the same package. npm names each tarball
# <scope>-<name>-<version>.tgz (e.g. genvid-construct3-chef-0.7.0.tgz). Extract
# each into its own like-named dir — both tarballs unpack to `package/`, so
# extracting them side by side into one place would clobber.
npm pack @genvid/construct3-chef@<old> @genvid/construct3-chef@<new>
for t in *.tgz; do d="${t%.tgz}"; mkdir -p "$d"; tar -xzf "$t" -C "$d"; done

# Tool name = first arg to registerTool(...) — or to a one-arg wrapper that calls it.
# Match both so the grep survives a wrapper refactor (chef 0.8.0 moved to `reg("name", …)`).
# Scan EVERY compiled module under dist/mcp/ (recursive, *.js), not just server.js — a
# server can register tools from a secondary module (e.g. a dynamic `opsRegistry.js`), and
# a server.js-only grep would diff empty even though the surface grew. `sort -u` de-dupes
# names that appear in more than one module.
surface() {  # surface <extracted-dir> → one tool name per line, sorted
  grep -rohE '(registerTool|reg)\(\s*"[a-z0-9-]+"' --include='*.js' "$1"/package/dist/mcp/ \
    | sed -E 's/.*"([a-z0-9-]+)"/\1/' | sort -u
}
surface genvid-construct3-chef-<old> > old.txt
surface genvid-construct3-chef-<new> > new.txt
diff old.txt new.txt   # '<' = removed in new, '>' = added in new
```

(For a different package, swap the `@genvid/<pkg>` names and the `genvid-<pkg>-<ver>`
dir names; the compiled server lives under `package/dist/mcp/` in each tarball. Reconcile
one server per run.)

**Sanity-check each count before trusting the diff.** Know the rough surface size
(chef ≈ 28+ tools; c3-domain-manager ≈ 13) — `wc -l old.txt new.txt`. If a list is
**0** or implausibly small, the registration pattern moved — behind a differently-named
wrapper, or into a module outside `dist/mcp/` — *not* "every tool was removed," which is
exactly the wrong conclusion. Open the package's `package/dist/mcp/` modules (start with
`server.js`), search for `registerTool` to see how it's actually invoked (you may find a
wrapper like `reg(`, or the registrations split into a module outside `dist/mcp/`), update
the grep pattern or scope to match, and re-run. A silent zero that you trust will strip every tool from the allow-lists.

**A plausible but *unchanged* diff can also lie.** The recursive `dist/mcp/` scan above
catches tools in secondary modules, but a registration *outside* that path — or a surface
the release notes describe that the grep still can't see — diffs empty with counts that
look fine (non-zero and unchanged), so nothing trips the count check. If the bump's
**release notes mention new tools but `diff old.txt new.txt` is empty**, do not conclude
"no surface change": grep wider (all of `package/dist/`) or read the release notes' named
tools against `new.txt` by hand before trusting the empty diff.

To classify each tool READ_ONLY vs MUTATE, also read its `description` /
`readOnlyHint` from the `registerTool("name", { … },` block (a small Node walk over
the module that registers it under `dist/mcp/`, or just open the blocks for the changed
tools).

## Phase 3: Diff old vs new

Compare the two surfaces into three buckets, each tool classified READ_ONLY or MUTATE:

- **Added** — present in `<new>`, absent in `<old>`.
- **Removed** — present in `<old>`, absent in `<new>`.
- **Renamed** — a removed name and an added name that are clearly the same tool
  (same purpose, renamed). Treat as a paired update, not a remove+add.

If the diff is empty, only the version prose needs sweeping (Phase 5) — skip Phase 4.

## Phase 4: Reconcile the agents

For each changed tool, edit the agent files under `<plugin_root>/agents/`,
respecting the read / mutate split:

- **Added READ tool** → add it to the **hard-`tools:`-allow-list agent**, in **both**
  its `tools:` frontmatter (the `mcp__<server>__<tool>` entry) **and** its body tool
  list. If the mutation-side agent's workflow reads it too, add it to that agent's
  reading list in the body.
- **Added MUTATE tool** → document it in the **mutation-side agent's** body under the
  right subsection. (Add to a hard allow-list only if that agent is actually meant to
  call it.)
- **Renamed / removed** → update or delete the stale entry in **both** agents
  (frontmatter and body wherever it appears).

> **Guided checkpoint — which agent gets a newly-added tool.** The read/mutate split
> is the default, but the call is the maintainer's. A new non-mutating helper goes to
> the read-only explorer; a tool may *also* warrant a documentation-only mention on the
> mutation-side agent (gvt-construct3 put `validate-editor` on the explorer's allow-list and,
> by maintainer call, a doc-only mention on the implementer). Surface added tools with
> their classification and confirm the placement rather than auto-routing.

> **Guided checkpoint — "same tools, richer output."** The signal is a tool that is
> *absent from the surface diff* (its name is in neither the added nor the removed
> bucket) yet whose **behavior** changed per the package's release notes — an enriched
> output, a new field, a smarter result. There is nothing to add to an agent body (the
> tool name and one-line purpose are unchanged); a CHANGELOG note is the right and only
> record. Editing a body to describe the richer output would push past the "name +
> one-line purpose" knowledge boundary. The tool-surface diff can't surface this — it's
> driven off the upstream changelog, so scan it when the bump's release notes mention
> behavior, not just tools.

## Phase 5: Sweep stale pinned-version prose

Reconciling the allow-lists is not enough — the **old** pin is also written into
agent/doc *prose* and drifts every bump if you don't sweep it. After bumping, grep
the plugin subtree for the version you bumped **from** and update every prose
occurrence:

```bash
grep -rn '@0\.7\.0' <plugin_root>/agents <plugin_root>/docs
```

**Do not** sweep `minVersion` floors in `<plugin_root>/skills/*/SKILL.md` — those are
deliberate floor decisions, not the pin. A pin bump is not a floor bump. The one
exception is a **scope rename**, where the floor becomes a prompted keep-vs-raise
call — see "## Scope rename (a broader pin bump)" below.

## Phase 6: Bump the pin, record, validate

1. **Bump** the `mcpServers` `args` version in `<plugin_root>/.claude-plugin/plugin.json`
   from `<old>` to `<new>` for each reconciled server.
2. **CHANGELOG** — add an entry under `<plugin_root>/CHANGELOG.md` → `[Unreleased]`
   for any agent-facing change (the agents ship; this reconciliation procedure does
   not). Note added/renamed/removed tools and which agents changed; for a
   "same tools, richer output" bump, a one-line note is the whole record.
3. **Validate**:
   ```bash
   claude plugin validate <plugin_root>
   ```

## Phase 7: Commit and hand off

1. Create **one reconciliation commit** via `commit-changes` — the pin bump, the
   agent edits, the version-prose sweep, and the CHANGELOG entry are one logical
   unit. Follow the project's commit format.
2. **Stop here.** This skill does not tag or release. Point the maintainer at
   `release-plugin` to cut the version and ship — the reconciliation commit is its
   precondition (a plugin whose agent allow-lists match the pin it's about to ship).

## Scope rename (a broader pin bump)

Sometimes a bump changes the package's **name**, not only its version — the
maintainer moved the npm scope (e.g. `@genvid/construct3-chef` →
`@genvidtech/construct3-chef`). gvt-construct3 did exactly this for both of its
bundled servers: `construct3-chef@0.10.2` → `@genvidtech/construct3-chef@0.11.2`,
and `c3-domain-manager@0.5.0` → `@genvidtech/c3-domain-manager@0.6.1`.

Everything in Phases 1–7 still applies. This section layers the **additional**
work a name change requires on top of them — it does not replace or duplicate them.

1. **Detect it in Phase 1.** The trigger for this branch is the package name
   itself changing, not only its version (see the note at Phase 1 step 1).

2. **Migrate functional package-name fields, not just version prose (spans
   Phases 5–6 and the plugin's skills).** Phase 5 sweeps stale *version* prose
   written from the old pin. A rename additionally requires migrating every
   functional occurrence of the package **name**: the `mcpServers` `args` pin in
   `plugin.json` (the name, not only the version — the pin bump itself is
   Phase 6 step 1), and — critically — the consuming plugin's
   `metadata.expects.mcp.package` fields in its `skills/*/SKILL.md` (the
   consuming plugin's own audited contract, not gvt-dev's). Those name fields
   drive the consuming plugin's audit `npx -y <package> --version` probe and its
   `node_modules` version walk — leave them on the old scope and the audit keeps
   validating a **deprecated** package while the plugin actually launches the
   new one: a silent contract mismatch a version-prose sweep alone won't catch.

3. **`minVersion` floor — a prompted keep-vs-raise decision.** This is the one
   guarded exception to Phase 5's "never touch `minVersion`" rule. Under the new
   scope, nothing is published below the new scope's first-published version, so
   the old floor may be unreachable. This exception applies **only** on a scope
   rename; a plain version-bump run still leaves `minVersion` alone (Phase 5 /
   "When this applies").

   > **Guided checkpoint — keep or raise `minVersion`.** State the old floor,
   > the new scope's first-published version, and whether the old floor is
   > still reachable under the new scope. Ask the maintainer to keep the floor
   > (if still reachable) or raise it to the new scope's earliest safe version
   > — this is a deliberate call each time, never an automatic copy and never
   > an automatic bump.

4. **Preserve the historical record.** Never rewrite a shipped CHANGELOG entry
   or ADR when sweeping name references — they record the scope that actually
   shipped at the time, and a blanket `@old → @new` sweep would falsify them.
   Only the new `[Unreleased]` CHANGELOG entry (Phase 6 step 2) names the new
   scope.

5. **Verify the tool surface by packing OLD and NEW — and sweep transitive
   renames (extends Phase 2).** The old scope typically stays installable, so
   `npx @old-scope/pkg --version` still "works" against a stale package — don't
   trust a bump issue's "no tool changes" claim on that basis alone. Extend
   Phase 2's pack-and-diff to pack **both** `@old-scope/pkg@<oldver>` and
   `@new-scope/pkg@<newver>` — now different package names, not just different
   versions of the same name — and diff their `registerTool(…)`/`reg(…)`
   surfaces to prove no tool change. A scope rename also often carries
   **transitive** dependency renames (e.g. `@genvidtech/c3source`,
   `@genvidtech/mcp-utils`) — sweep their *live* references too, leaving
   historical mentions intact per element 4 above.

gvt-construct3 captured the C3-specific version of this as a "Scope rename (a
broader pin bump)" section in its own `docs/tool-surface-reconciliation.md`.

## When this applies / when it doesn't

- **Applies** when a plugin pins MCP servers in `plugin.json` `mcpServers` AND ships
  agents that enumerate those servers' tools by hand. gvt-construct3 is the reference.
- **Does not apply** to a plugin with no bundled MCP servers (e.g. gvt-dev itself),
  or to one whose agents don't enumerate server tools — there is nothing to drift.
- **Not a release.** Use `release-plugin` to tag and ship; this is its precursor.
- **Not a floor bump.** A skill's `minVersion` is a separate, deliberate decision —
  leave it alone (Phase 5). The one guarded exception is a **scope rename**, where
  the floor becomes a prompted keep-vs-raise call (see "## Scope rename (a broader
  pin bump)").
