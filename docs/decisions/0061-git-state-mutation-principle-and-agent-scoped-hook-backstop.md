# 0061. A new development-principles principle (#14) forbids state-mutating git in agent dispatches; a PreToolUse hook backstops it for `gvt-dev:*` subagents

- **Status:** accepted
- **Date:** 2026-09-25
- **Issue:** #557, #566

## Context

Agents dispatched in orchestrated mode — implementers staging files under `plan-task`'s
"stage but don't commit" protocol, and the read-only `validator` grading a staged diff —
have run `git stash`, `git reset`, and `git checkout` to measure a "before" state, and in
doing so destroyed staged-but-uncommitted work that was not theirs to touch: a sibling
task's staged files, or the user's own index. #566 recorded the validator running `git
reset` despite an explicit "git stash-free" brief; #564 separately recorded the validator
editing tracked source, a distinct read-only violation of the same shape. Both incidents
share a root cause the brief format itself invited: a dispatch asked an agent to grade a
*direction* ("pass count increases") or a *before/after delta* without supplying the
baseline figure, leaving the agent to go derive one — and git state mutation was the tool
at hand for deriving it.

## Decision

### 1 — a new principle (`development-principles.md` #14), restated at the sites most likely to be dispatched without it loaded

Principle #14 states the rule generally: never mutate working-tree, index, or history
state to measure a baseline, because uncommitted work — a sibling's staged task, or the
user's own index — may be the only copy of it. It names the denied family (`stash`,
`stash pop`, `reset`, `checkout <ref>`/`checkout -- <path>`, `switch`, `restore` including
`--staged`, `clean`), the three-step preference order for a baseline (a figure supplied by
the brief; a non-mutating read such as `git show <ref>:<path>` or `git diff --staged`; a
scratch `git worktree add` outside the repo tree, only when the dispatch explicitly allows
it — `build-probe`'s containment discipline), and what remains unrestricted: an agent's own
deliverable writes (`git add`/`git mv`/`git rm` of its own files, and, standalone only, its
own commit — ADR-0008), and a mutation control the orchestrator discharges before the
gates under `build-probe`'s containment.

Per the #167 precedent — an agent dispatched standalone may never have loaded
`development-principles.md` at all — the rule is **restated**, not merely cited, in
`plugin/agents/validator.md`, `plugin/agents/code-reviewer.md`,
`plugin/agents/ts-implementer.md`, and `plugin/agents/tech-writer.md`'s own Commit
Protocol / Key Rules sections. `validator.md` and `code-reviewer.md` each also state
plainly that the agent is read-only and never changes repository state, independent of
what a dispatch asks. The rule applies in both standalone and orchestrated modes, since
the "whose index is this" hazard exists in a standalone dispatch too (the user's own
uncommitted work) and not only the orchestrated one (a sibling's staged task).

`plan-task`'s Execution section carries the corresponding **dispatcher-side** half:
every implementer dispatch now states outright *"Do not `git stash`, `reset`, `checkout`,
`switch`, `restore` or `clean` to measure a before-state — the index may hold work that is
not yours; baselines come from this brief or from `git show <base>:<path>`* (principle
#14), and both the known-red-baseline paragraph and the whole-suite-direction paragraph
now require the orchestrator to hand the validator a baseline **figure** — a pre-measured
count or an on-default-branch measurement taken before the branch diverged — rather than
an instruction to go measure it, since a read-only agent asked for a number it cannot
derive without mutating state has no non-mutating way to produce it. `validate-changes`'s
dispatch is amended the same way: *grade the tree as it stands and do not change
repository state (principle #14); report any baseline you'd need rather than deriving it.*

### 2 — a PreToolUse Bash hook backstops the prose for `gvt-dev:*` subagents specifically

A new plugin hook, `plugin/hooks/git-state-guard.mjs` (entry point) plus
`plugin/hooks/lib/git-state-guard.mjs` (the pure, unit-tested classifier), denies a closed
set of state-mutating `git` subcommands — `stash` (except `list`/`show`), `reset`,
`checkout`, `switch`, `restore`, `clean` (except `-n`/`--dry-run`), `merge`, `rebase`,
`cherry-pick`, `revert`, `pull`, `am` — but **only** when the PreToolUse payload carries a
non-empty `agent_id` **and** an `agent_type` starting with `gvt-dev:`. A denial exits `2`
with a reason citing principle #14 and naming a non-mutating alternative (`git show
<ref>:<path>`, `git diff --staged`, or reporting the mis-staged file to the orchestrator
instead of unstaging it directly). The hook fails **open** — exit `0` — on any input it
cannot confidently classify: a malformed or unparsable payload, a missing or broken
`shell-quote` install (loaded dynamically for exactly this reason), or a command outside
`git` entirely. This mirrors `pre-commit-lint.js`'s existing fail-open, exit-2-to-block
convention, wired into the same `PreToolUse`/`Bash` matcher in `plugin/hooks/hooks.json`.

**This is a backstop, not a sandbox.** A subagent that routes the same command through
`bash -c "git reset --hard"` or an equivalent indirection evades the hook entirely — the
guard classifies a literal Bash tool-call command string, nothing more — so the prose
restatements in decision 1 remain the primary control and the hook exists to catch the
direct, common-case invocation the incidents were actually made of.

**Accepted false positive:** a `gvt-dev` implementer that mis-stages a file of its own —
one it is entitled to unstage — cannot do so with `git restore --staged` under this guard,
since the hook cannot distinguish "my own mis-staged file" from "a sibling's staged work"
from the command line alone. The prescribed remedy (in the hook's own denial message and
in principle #14) is to report the mis-staged file to the orchestrator rather than fix it
by mutating the index directly.

**Evidence the scoping condition is reachable in practice.** A headless probe against
Claude Code 2.1.282 logged the PreToolUse payload for two calls: a main-thread Bash call
carried no `agent_id`/`agent_type` keys at all, while a call from a dispatched
`gvt-dev:validator` subagent carried `agent_id` set and `agent_type` equal to
`"gvt-dev:validator"` (recorded as a comment on #557). Separately, a static reading of the
2.1.282 binary found that agent-frontmatter `hooks`, `permissionMode`, and `mcpServers`
keys are ignored for plugin agents specifically, with the binary's own message naming the
escape hatch: *"…which is ignored for plugin agents. Use `.claude/agents/` for this level
of control."* — confirming that a plugin-shipped agent cannot self-declare this control
and a plugin-level `PreToolUse` hook is the available seam.

### 3 — the tokenizer is `shell-quote` 1.10.0, an exact-pinned runtime dependency

The classifier delegates command tokenization to `shell-quote`'s `parse()` (MIT, zero
dependencies), pinned at the exact version `1.10.0` in `plugin/package.json` and its
lockfile, over writing a bespoke ~40-line tokenizer — the user's call, weighed against a
second runtime npm dependency on a hook that runs on every Bash call this plugin's agents
issue. `parse()` is injected into the classifier by the entry point rather than imported
directly by `lib/git-state-guard.mjs`, so the classifier itself stays dependency-free and
trivially testable with a stub parser, and the entry point loads it via a dynamic
`import()` so a missing or broken install fails open (exit `0`) instead of crashing the
hook and blocking every Bash call.

Observed tokenizer behaviour the classifier compensates for rather than assumes away:
`parse()` does not treat a bare newline as a command separator the way it does every
control operator it recognizes (`&&`, `||`, `;`, `|`, `&`, `(`, `)`, …), so a multi-line
command string is split on newlines before tokenization — otherwise words on either side
of a newline would read as one unbroken argument list with no boundary between them.
`$(...)` command substitution is not parsed specially, but its parentheses still surface
as control-operator tokens, which is enough to isolate the inner command onto its own
segment for classification. And env-variable expansion is suppressed via the tokenizer's
env callback, which returns each variable name prefixed and unresolved (`$REF` stays
literal) rather than substituting a real value, since classification must not depend on
what a variable happens to hold at hook time.

## Compromise

**Prose alone was rejected as sufficient.** #566 is itself the counter-evidence: a
dispatch brief stated the git-stash-free constraint explicitly and the validator ran `git
reset` anyway. A hook adds a mechanical backstop for the specific, common-case invocation
shape, at the accepted cost that it is not a sandbox and can be evaded by an agent that
routes the command through a subshell.

**Agent-frontmatter `hooks`/`permissionMode` were rejected** because the 2.1.282 binary
ignores both for plugin agents (verified by the static read above) — there is no
per-agent lever to reach for here, only a plugin-level one.

**`disallowedTools` was rejected** for its granularity: it operates at the whole-tool
level, and every implementer and critic agent needs Bash for the vast majority of
legitimate git reads and writes the guard must not touch — banning Bash outright to stop
a dozen subcommands would remove far more capability than the incidents warranted.

**A plugin-shipped permission deny rule was rejected.** A plugin's `settings` surface is
understood to carry only `agent` and `subagentStatusLine` — a claim inherited from prior
documentation review rather than independently re-verified for this record — which if
accurate leaves no plugin-level permission-rule surface to add a deny rule to in the first
place.

**Guarding every subagent, not just `gvt-dev:*`, was rejected.** A consuming repo may
declare its own project-specific agents (via `.claude/agents/`) that legitimately run
`checkout`/`rebase`/etc. as part of their normal job; scoping the guard to `agent_type`
starting with `gvt-dev:` keeps it from reaching into a consumer's own agent surface, which
this plugin does not own and has no basis to restrict.

**A `.gvt-agent.json` opt-in/opt-out list was rejected** as unnecessary contract surface:
the guard's scope is already fully determined by the two conditions in decision 2 (a
non-empty `agent_id`, an `agent_type` prefix this plugin itself controls), so a consumer
config key would only add an assertability lever with no corresponding need.

**Depending on `shell-quote` rather than a hand-rolled tokenizer** trades a small, mature,
dependency-free parser against a second runtime npm dependency loaded on every Bash call a
`gvt-dev` agent makes. Accepted on the same lockfile-gated-dependency terms ADR-0051
already established for `@genvidtech/audit-core`, and mitigated by the dynamic-import
fail-open path in decision 2, so a broken or absent install degrades to "no guard" rather
than "no hook runs at all."

## Consequences

**Every `gvt-dev` agent dispatch** now runs under two independent controls rather than
one: the prose restatement it should have loaded regardless of dispatch mode, and — when
dispatched as a subagent with a recognizable `gvt-dev:` `agent_type` — the hook backstop.
A consumer's own project-specific agents are unaffected.

**A fresh git checkout of this repo** now needs `npm ci --prefix plugin` before
`plugin/hooks/test/*.test.mjs` or `commands.validate`/`commands.test` will pass, since
`shell-quote` joins `@genvidtech/audit-core` as a `plugin/package.json` dependency; a
cache-based invocation (a consumer's audit, or this repo's own dogfooded skills once
released) needs nothing extra, consistent with ADR-0060's C.

**The accepted false positive** (an implementer cannot unstage its own mis-staged file
under the guard) is a known, narrow cost of scoping the guard to a command-line
classification rather than a finer-grained "whose staged file is this" check, which the
guard has no way to answer from the Bash tool-call payload alone.

**Related records:** ADR-0008 establishes that the orchestrator, not the implementer,
owns the commit in orchestrated mode — this record extends that same staged-but-uncommitted
protocol with the rule that an implementer must not touch state beyond its own deliverable
writes either. ADR-0040 already named leaving the index and working tree untouched as
property (b) of a sound re-execution capture mechanism; principle #14 generalizes that
same property from the re-execution/capture context to every dispatched agent's baseline
measurement.
