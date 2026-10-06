---
type: practice-note
title: 'Skill Frontmatter Rules'
description: 'The two rules a skill or agent description must meet, the 1536-char listing cap and no unquoted colon-space, and why breaking either fails silently.'
tags: [maintainer, plugin-authoring]
status: stable
---
# Skill Frontmatter Rules

Rules for the frontmatter description of a new or edited skill or agent.

- **Keep the `description` ≤ 1536 chars** (`skillListingMaxDescChars`). Over that, it's silently truncated in the session skill listing — degrading the routing signal the description exists for — and nothing in `claude plugin validate` flags it. The audit now warns (author-time only, on a maintainer/dogfood run against the plugin source) when a skill or agent description exceeds the cap; keep the audit's desc-length warnings at zero. Descriptions regress over the cap easily, so re-check after any description edit.
- **Don't put a `: ` (colon-space) inside the unquoted `description`.** Frontmatter `description`s are YAML *plain scalars*, and a colon-space is YAML's mapping indicator — so `description: Foo bar: baz` parses as a nested map and the frontmatter fails to load (`claude plugin validate` reports "YAML frontmatter failed to parse … loads with empty metadata," silently dropping every field). Descriptions are long and prose-y, so this sneaks in easily (a `maintain-wiki` description shipped `…existing wiki: dead links…` and broke the build). Use an em-dash (`—`) or reword instead; the same applies to any long unquoted scalar (`reason:` fields included).
