# Maintainer notes

Notes for people working on the plugin itself, not for its consuming repos.

## Pages

* [Authoring Genvid Plugins](plugin-authoring.md) - Cross-plugin authoring gotchas — shipping MCP servers via plugin.json, npx package-name resolution, version pinning, step renumbering, and example naming.
* [Dogfooding the Plugin](dogfooding-the-plugin.md) - Why skills run here from the installed cache rather than plugin source, when to release before planning, and how to exercise unreleased source headlessly.
* [Audit Author-Time Findings](audit-author-time-findings.md) - Which audit findings fire only on the plugin source, the severity and report section of each, how the gate is enforced, and how to write passing pointers.
* [Testing the Audit](testing-the-audit.md) - Where testable audit logic lives, how red and green map onto skill work, how to prove a scanner ignores a surface, and when to build an eval harness.
* [Release-Cycle Rules](release-cycle-rules.md) - When a multi-issue chain must branch at the start, how to read the plugin.json version against the newest tag, and how a CHANGELOG entry closes.
* [Skill Frontmatter Rules](skill-frontmatter-rules.md) - The two rules a skill or agent description must meet, the 1536-char listing cap and no unquoted colon-space, and why breaking either fails silently.
* [Running the Audit on Windows](running-the-audit-on-windows.md) - Why the audit and commands.validate must run under Bash rather than PowerShell on Windows, and how to recognise the false grep-not-found failure.
