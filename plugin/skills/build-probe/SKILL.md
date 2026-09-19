---
name: build-probe
description: Guides building a throwaway probe script that answers one checkable question blocking a decision — scaffold it in the scratchpad (never the repo tree), run it against the real system, report the concrete answer on-thread, then discard by default or promote only when the question recurs and the probe is generic enough to survive re-asking. Operationalizes development-principles.md principles 1 and 3 (investigate what you don't know; build tools, keep the generic ones). Use when analysis stalls on an unfamiliar system, before a plan leans on an unverified assumption, or whenever "I think X is true" needs to become "I checked."
metadata:
  pillar: moldable
  expects:
    files:
      - path: CLAUDE.md
        required: false
        reason: Read to understand the real system a probe targets — repo layout, conventions, the domain the question is about
    tools:
      - command: git
        reason: A mutation probe must confirm its revert landed before the result is reported — a partly-failed restore otherwise commits a deliberate defect
---

# Build Probe

Operationalizes `development-principles.md` principle 1 (investigate what you
don't know, build tools when needed) and principle 3 (make the change easy —
including by writing a throwaway tool to check it — and keep the generic ones
around). A probe is a small script whose entire job is to let the real system
contradict a guess. This skill teaches the loop; it does not ship any checks
itself.

**Scope disclaimer.** `build-probe` is the discipline, not a catalog of checks.
It does not ship contract-drift checks, retired-token scans, or any other
standing gate — that surface belongs to `audit-conventions`. A probe answers
one question, once; if the question turns into a standing gate, it graduates
out of this skill's scope entirely (see Step 5).

## 1. State the question

Write down, in one sentence, the checkable question a decision is blocked on.
"Does any skill declare a required tool nobody else needs?" is a question — it
has a yes/no/count answer you can point at. "Explore the tools situation" is
not a question, it's a mood. If you can't phrase what you need as something
with a checkable answer, you're not ready to probe yet — go back to analysis
(or ask the user) until the unknown sharpens into a question.

## 2. Scaffold the probe in the scratchpad

Write the probe script to the session's scratchpad directory (the harness's
own uncommitted temp state) — **never into the repo tree.** The scratchpad
location *is* the throwaway mechanism: it keeps discard the zero-effort
default and it can never accidentally show up in `git status` or get staged
into a commit "since it's already there." Don't write it into the repo tree
"to keep things tidy" — a probe living in tracked files has already put its
thumb on the promote side of the scale before you've looked at the answer.

Use whatever language and tooling this repo already runs probes/scripts in —
there's no plugin-mandated probe language. A probe is allowed to be ugly:
hardcoded paths, no error handling, no tests. It is disposable by
construction, not production code that happens to be new.

**The scratchpad is not part of your repo, so it inherits none of your repo's
tooling config** — no `package.json`, no `tsconfig`, no module-format
resolution — and it's this section's own rule that exposes the gap: a probe
written into the repo tree would inherit that config and work, so the trap
only appears when you follow the rule correctly.

The TypeScript instance: name the probe **`.mts`**, which forces ESM
regardless of the enclosing package. Without a `package.json`, `tsx` resolves
the module format to CJS, and a probe using top-level `await` dies with:

```
ERROR: Top-level await is currently not supported with the "cjs" output format
```

This matters more than a syntax slip, since `await import()` of the module
under test is the natural way to probe it — and that needs top-level `await`.

**On Windows, that same `await import()` needs a `file://` URL, not a path.**
A probe living outside the repo tree has to reach back into it by absolute
path, and Node's ESM loader rejects a Windows absolute path outright —
`import('C:/repo/lib/x.mjs')` throws
`ERR_UNSUPPORTED_ESM_URL_SCHEME ... Received protocol 'c:'`, reading the drive
letter as a URL scheme. Convert first:

```js
import { pathToFileURL } from 'node:url';
const m = await import(pathToFileURL(abs).href);
```

Same trap as the `.mts` one above and for the same reason: it fires *because*
the probe is correctly outside the repo. A probe written inside the tree
imports by relative specifier and never meets it. Note a static
`import ... from 'C:/...'` fails identically, so moving the import to the top
of the file is not the fix.

Prefer `./node_modules/.bin/tsx` over `npx tsx` for invocation. `npx`
**succeeds** — this is not a broken-tool case and not a hang — but a cold,
first invocation can exceed a tool timeout and return no output at all, which
is indistinguishable from a broken probe and sends you debugging the script
instead of the launcher. (One machine measured `./node_modules/.bin/tsx` at
1.5s against `npx tsx` at 40.4s for the same script; the absolute numbers are
that machine's, the ordering isn't.) The per-invocation resolution overhead
also quietly kills the edit-rerun loop that makes probes worth building.

## 3. Run it against the real system

Execute the probe against the actual thing — real files on disk, real git
history, a real build's output, a running process — never a mental model or
summary of it. Capture the raw result: the actual count, the actual list of
offending instances, the actual sample. Don't round it, don't pre-average it,
don't silently drop outliers before you've looked at them — the entire point
of running the probe is to let the concrete result overrule the guess that
motivated it.

**Ask whether running the probe changes what the probe measures.** Some
observations are not repeatable because the act of observing them mutates the
system: fetching a package populates a download cache, running a build fills an
incremental-build directory, a first request warms a connection pool or a CDN
edge, an auth probe mints a token that the next call reuses. Where that is
true, the **first** run answers a different question from every run after it,
and the number you keep is whichever one you happened to write down.

The tell is a probe whose subject is *absence* — not cached, not installed, not
authenticated, not built — since absence is exactly the state a probe tends to
destroy. Guard it by pairing the real invocation with a **control that is
guaranteed to be in the clean state**: probe a package name that certainly is
not cached, a target that certainly has not been built. If the control and the
real invocation disagree, the difference is your answer, and reporting only one
of them is reporting an artifact. Where no clean control can be constructed,
say so and mark the result **not reproducible on this machine** rather than
presenting a single run as the property.

(Observed on this repo: an offline-`npx` probe reported that the command fails
hard with `ENOTCACHED`, and that finding became the stated premise of a filed
issue. Re-run later the same command exited 0 — the original probe had
downloaded and cached the package it was testing for absence. An uncached
control still failed, so the hazard was real but **conditional on cache state**
rather than reliable — a materially different and worse property to depend on
than the hard failure first reported. Note the wording: the behaviour is fully
determined *given* the state, not random. Reporting it as "intermittent" would
teach the opposite of what this step exists to teach, which is that the state
decides the answer.)

**A claim of absence needs a mutation, not a listing.** The same discipline
covers "this is untested", "nothing reads this value", "no caller depends on
that field": a directory listing that shows no dedicated test file is evidence
about *files*, not about *coverage*, and the two come apart routinely when
coverage arrives through an integration test or a transitive call. Establish it
by breaking the thing and observing what fails — stub the function, delete the
field, change the constant, run the suite, then restore and re-run to confirm
the baseline came back. Verify each mutation actually landed before measuring;
a silently-failed edit reports the unmutated baseline and reads exactly like
"nothing depends on this."

**A mutation is the one probe that cannot live in the scratchpad, so contain it
deliberately.** Step 2's rule — never write a probe into the repo tree — still
governs the probe *script*, but a mutation has to touch the real source for the
suite to see it, which puts a deliberate defect in tracked files. That is
exactly the state an orchestrated run is least able to absorb: under
`plan-task`'s staged-but-uncommitted protocol other tasks' work is already in
the index, so an intervening `git add -A`, or a restore that partly fails,
commits the defect. Prefer a **copy of the tree you can throw away** — a
scratch extract, or a detached worktree at the commit you mean to measure —
which keeps the mutation out of the index entirely and lets a failed restore
cost nothing. When mutating in place is unavoidable, require a clean tree
first, revert **before** any commit, and confirm with `git status --porcelain`
that the revert actually landed rather than assuming it. Never report a
mutation result from a tree you have not re-confirmed clean.

**A differential probe needs the pre-change implementation from git, not from
memory.** `build-probe` covers probing a system as it currently stands; it has
no shape yet for "did my change alter observable behavior?" — the question a
refactor raises, and the one a test suite structurally cannot answer when the
suite was rewritten in the same commit as the code. The shape: extract the
pre-change implementation straight from git history —

```
git show <ref>:<path>
```

— then import both the old and new implementation by absolute file URL in one
probe script, run both over a shared corpus, and compare verdicts and values.
Extracting from git rather than hand-copying matters here specifically: a
hand-reconstructed "old" implementation is a probe of your own memory, not of
the code that actually shipped.

**An equivalence claim is carried by its positive cases, not by its count of
inputs.** Report the number of inputs that exercised the *accepting* path
beside the agreement count; a differential result quoted without that number
is not reported. Negative cases bound such a claim — they narrow what could be
wrong — but they cannot establish it: one probe compared 20,036 inputs and
returned `mismatches: 0`, but only 112 of those inputs (0.56%) were accepted
by the pre-change implementation, so a `mismatches: 0` verdict is exactly what
an implementation rejecting every input whatsoever would also produce.

**Corpus size reads as rigor, which is what makes it a trap.**
`20,036 inputs, 0 mismatches` is far more persuasive on the page than
`36 inputs, 0 mismatches` — and the 20,000 fuzzed strings in that run added
exactly 107 further accepted cases against 19,893 further matching
rejections, barely moving the number that actually mattered. A corpus can
always be scaled in the direction that establishes nothing, and doing so makes
the check look stronger while it gets weaker. In that instance the fuzz
alphabet was deliberately seeded with the delimiter and digits at short
lengths so some strings would be well-formed; a letters-only alphabet would
have produced zero accepted inputs, an identical clean `mismatches: 0`, and a
transcript indistinguishable from a real result. This is the same family of
failure as the claim-of-absence rule above — a check that silently measures
nothing — by a different mechanism: there the listing never touched the real
thing, here the corpus never touched the path that matters.

## 4. Report on-thread

State, on the same thread that's making the decision: the question, the
command that was run, and the concrete answer. **Do not off-thread this to a
subagent.** A dispatched agent that runs the probe and returns a one-line
summary throws away exactly the signal a probe exists to produce — the
deciding thread needs to see the raw result itself (the actual list, not a
gist of it) to make the call in Step 5 with eyes open.

## 5. Promote or discard

**Discard by default.** Delete the scratchpad file; it cost nothing and its
value was spent the moment it answered the question. A probe that answered
perfectly is still discarded if the question was asked once — reuse was never
the point.

**Promote only when both hold:**

- **Recurring** — this exact question (or a close variant of it) will get
  asked again: a regression it should guard, a drift it should catch on a
  schedule, a gate a CI job should enforce.
- **Generic** — the probe is already shaped to survive being asked again
  without a rewrite; it isn't hardcoded to today's one-off context in a way
  that would make "reusing" it actually mean rewriting it.

Both conditions have to hold — a recurring question with a probe that's still
contextual mush needs the probe rebuilt into something generic before
promotion means anything; a generic-shaped probe answering a one-time question
is still discarded. This is principle 3's "keep generic tools around" with a
bar attached: keep the few that clear it, discard the many that don't.

A promoted probe becomes a kept tool in the repo, following the same shape as
any other kept tool here: testable logic extracted to a `lib/`-style module
with a companion test, per `CLAUDE.md`'s "put testable logic in `lib/`"
guidance — not the promoted script wholesale. Where a promoted tool lives day
to day is the consuming repo's own convention to decide; this skill doesn't
prescribe a tools-home layout.

**Escalation for what a scratchpad script structurally can't answer.** If the
question requires interactive or visual live inspection — walking a large live
object graph, iterating a custom visualization while the system keeps
running — a batch script is the wrong tool regardless of language. Glamorous
Toolkit is the next rung for that class of question; this skill names it only
as an external option to reach for, declares no dependency on it, and never
installs or wraps it.

## Worked example — did any two skills share a required tool beyond the boring universals?

The question: across `plugin/skills/*/SKILL.md`, does any `metadata.expects.tools`
entry marked `required` (i.e. no `required: false`) name a tool that more than
one skill requires — and if so, which tools and which skills?

A probe for this reads every `SKILL.md`'s frontmatter, pulls the `tools:`
block, and tallies command names, skipping any entry marked `required: false`:

```js
// scratchpad probe — reads plugin/skills/*/SKILL.md frontmatter,
// tallies required (non-optional) tool declarations by command.
import fs from "node:fs";
import path from "node:path";

const skillsDir = path.resolve("plugin/skills");
const toolMap = new Map(); // tool -> [skillName, ...]

for (const name of fs.readdirSync(skillsDir)) {
  const file = path.join(skillsDir, name, "SKILL.md");
  if (!fs.existsSync(file)) continue;
  const fm = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const block = fm?.match(/tools:\r?\n([\s\S]*?)(?=\r?\n {0,4}\S|$)/)?.[1];
  if (!block) continue;
  for (const entry of block.split(/(?=- command:)/).filter((e) => e.trim())) {
    const cmd = entry.match(/- command:\s*(\S+)/)?.[1];
    if (cmd && !/required:\s*false/.test(entry)) {
      (toolMap.get(cmd) ?? toolMap.set(cmd, []).get(cmd)).push(name);
    }
  }
}

for (const [tool, skills] of toolMap) console.log(`${tool} (${skills.length}): ${skills.join(", ")}`);
```

Run against this repo's live `plugin/skills/` on 2026-07-24, the actual
output was:

```
git (15): audit-conventions, cleanup-initiative, clear-worktree, commit-changes,
          create-adr, create-pr, plan-task, publish-npm-package, rebase-branch,
          rebase-stack, reconcile-mcp-pin, release-npm-package, release-plugin,
          split-branch, validate-changes
gh (3): publish-npm-package, release-npm-package, release-plugin
npm (3): publish-npm-package, reconcile-mcp-pin, release-npm-package
node (1): audit-conventions
grep (1): cleanup-initiative
```

So yes — `git` is required by 15 of the plugin's skills (unsurprising, and
already implied by "this is a git-hosted plugin"), and `gh`/`npm` are each
required by the same 3 release-flavored skills, which also isn't news once you
see the skill names. Nothing here was a genuine surprise strong enough to
justify a standing check — this was a one-time contract-shape question asked
to settle curiosity while drafting this skill, not a recurring gate anything
depends on. **Discard.** The script above lived in a scratchpad file for the
run and was deleted afterward; it is reproduced here only as a worked example,
not as a shipped tool.
