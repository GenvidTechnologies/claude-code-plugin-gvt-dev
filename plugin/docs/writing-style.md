# Writing style

This doc is the single home of the gvt-dev writing style. Agents and skills follow it when they write technical text. Maintainers follow it when they write the plugin's own prose.

The style governs how text reads. It does not govern whether the text is true. The rules came out of issues #733 and #522.

The style is inspired by ASD-STE100 and is not compliance with it. It borrows the aim (plain, unambiguous technical text) and none of the formal vocabulary or grammar controls.

## Scope

The style covers text written into a repo or a tracker:

- docs, ADRs, plans, review findings and reports
- issue bodies and comments
- commit messages, PR bodies and CHANGELOG entries
- code comments, docstrings and test names

It also covers the plugin's own shipped prose, written from now on.

There is no bulk retrofit. A change that rewrites a passage brings that passage to the style. A change that only inserts text does not restyle the text around it.

## The rules

### Short, direct sentences

Put one idea in a sentence. Put the subject and the verb early.

- Before: "It should be noted that, in the event the lint step is not able to complete, the commit may be blocked."
- After: "If the lint step fails, the commit is blocked."

### One name for each component

Use the name the repo already gives the thing: a file name, a heading, an identifier or a frontmatter `name:`. For a plugin component, use the namespaced form, such as `gvt-dev:tech-writer`. Use that name every time. Do not add a glossary. A glossary would be a second home for names that already have one.

- Before: "The tech-writer agent edits the doc. Then the docs bot stages it." (one agent, two names)
- After: "`gvt-dev:tech-writer` edits the doc. Then `gvt-dev:tech-writer` stages it."

### Observations, hypotheses and checks stay apart

Say what you saw. Say separately what you infer from it. Say separately what you ran to test it. The section `### Verified vs. inherited facts in a dispatch brief` in `plan-task` sets the buckets. Its predicted-value bucket is what this doc calls a hypothesis.

- Before: "The cache is stale, so the build fails."
- After: "The build fails with a missing-module error (observed). The cache may be stale (hypothesis). I have not cleared it (no check yet)."

### One action in each procedural step

A step tells the reader to do one thing. If a step has "and then", split it.

- Before: "Edit the manifest, bump the version and run the audit."
- After: "1. Edit the manifest. 2. Bump the version. 3. Run the audit."

### Conditions, warnings and uncertainty are kept

Shorter text must not lose a condition, a warning or a statement of uncertainty. `plan-task` states this as "Label, don't omit" in `### Verified vs. inherited facts in a dispatch brief`. The `gvt-dev:tech-writer` agent adds a related rule: a claim marked inherited or unverified in a dispatch is not settled fact.

- Before: "The hook blocks state-changing git."
- After: "The hook blocks state-changing git for `gvt-dev:*` subagents. It does not guard the main session."

### Say what each check can establish

Name what a check shows and what it does not show. `principle #15` of `development-principles.md` is the base rule.

- Before: "The grep passed, so the sentence is correct."
- After: "The grep shows the string is present. It does not show that the sentence around it is right."

### No invented measurement or diagnosis

Do not write a number you did not measure. Do not write a cause you did not test. `plan-task` says this in "An implementer's authored technical claims are output, not report".

- Before: "The change cut load time by 40%."
- After: "I did not measure load time."

## Voice: a brief is not the document

A dispatch brief says what the document must end up saying. It is not wording to copy.

Write each document type in its own voice:

- An ADR states decisions.
- A skill body addresses the agent that runs it.
- A CHANGELOG entry addresses a consumer. In this plugin's own CHANGELOG, each entry still closes with its version-bump verdict, such as "Behavioral skill/agent change → version bump at release." The plugin's release convention requires that clause, so it is not a voice leak.
- A reference doc addresses its reader.
- A code comment addresses the next maintainer.

These are the tells that brief wording has leaked into a document:

- A heading or lead-in that begins "Record the...".
- A parenthetical addressed to the writer.
- A phrase that is true of the dispatch and false of the document, such as "verified this run".
- A plan task id or a sequencing word, such as "T3" or "once T3 lands".

Two things still ship. A string the brief marks as required wording ships verbatim. An acceptance-row id may be cited.

Voice is not truth. The inherited-claim rule is about truth. A passage can have the right voice and a false claim, or the reverse. The two fail independently.

A grep for the tells is not a check. The same words also appear legitimately.

The brief's roles (source, content and direction) are defined in `### Quoted artifacts vs. direction in a dispatch brief` in `plan-task`. Use those terms as defined there.

## The short form

Every agent and skill body that writes technical text carries the paragraph below, unchanged, under a `## Writing style` heading. The copy is deliberate. An agent dispatched standalone may never open this doc (#167). The plugin's tests fail when a copy differs.

**Write technical text in the gvt-dev writing style.** Use short, direct sentences. Give each component one name and use it every time. Keep what you observed apart from what you infer and from what you checked. Put one action in each procedural step. Keep every condition, warning and statement of uncertainty. Say what each check can establish. Do not invent a measurement or a diagnosis. Text that ships (a doc, a code comment, a test name, a commit, an issue or PR body) is written in its own voice: it carries no instruction to its writer and no plan task id such as "T3". The style is inspired by ASD-STE100 and is not compliance with it. The full rules are in `${CLAUDE_PLUGIN_ROOT}/docs/writing-style.md`.
