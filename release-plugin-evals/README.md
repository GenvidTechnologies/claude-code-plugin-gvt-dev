# release-plugin eval harness

Skill-level evals for the `gvt-dev:release-plugin` skill. They test **Claude's
behavior wielding the skill** — specifically the Phase 1 *state-classifier*: does
it `git fetch` before judging, classify the repo into the right state, and gate
(confirm) before any mutating or irreversible action?

This is the skill's riskiest reasoning surface. It earns an eval because it is
**objectively verifiable, state-dependent, and safety-gated** — the three
criteria the repo's CLAUDE.md names for when an eval is worth building.

## The four states

The skill classifies a release into exactly one of these (see the SKILL.md
Phase 1 table):

- `clean` — the release triangle (tag ↔ `plugin.json` version ↔ marketplace
  `source.ref`, plus CHANGELOG) is consistent → proceed to pick the next version.
- `local-stale-ff` — the working tree is clean but local is simply *behind*
  origin and fast-forwardable. **Not a broken release** — offer a fast-forward
  and re-assess.
- `genuine-inconsistency` — the triangle genuinely disagrees (orphaned tag,
  marketplace ref ahead of / mismatched with the released version, missing
  CHANGELOG section) → guided, confirm-before-acting reconcile.
- `first-release` — the plugin has no marketplace entry (and usually no tag) →
  add a new `plugins[]` entry instead of bumping a ref.

## Why local-stale-ff is the headline test

The `local-stale-ff` eval is a **regression test for a real false alarm**: in the
session that produced this skill, an analysis agent looked at a local `main` that
was 6 commits behind origin and reported a *"broken release state"* — when the
remote was perfectly consistent and the only fix was `git merge --ff-only`. The
skill's Phase 1 leads with `git fetch` and treats a fast-forward as a non-event
precisely to stop this misclassification. The eval fails if the agent cries
"broken release" instead of fast-forwarding.

## What's committed (reusable infra)

- `evals.json` — the 4 eval prompts + objective behavioral assertions, one per
  state.
- `fixtures/<state>/` — minimal mock plugin repos (`plugin.json` + `CHANGELOG.md`)
  representing the **local working copy** for each state.

## What's gitignored (regenerable run artifacts)

`iteration-*/`, `outputs/`, `grading.json`, `benchmark.json`, and generated
`*.html` viewers.

## Known limitation — git/marketplace state lives in the prompt, not the fixture

Unlike `audit-conventions` (which ships a real `audit.mjs` and git-repo
fixtures), `release-plugin` has **no script** and its classification depends on
*relationships* a static fixture can't carry: local-vs-origin commit distance,
which commit a tag points at, and the live marketplace `source.ref`. Faithfully
reconstructing those would require a setup script that builds commits, tags, a
behind-origin relationship, and a stubbed marketplace per fixture.

Rather than build that, each fixture supplies the plugin files and the eval
**prompt narrates the authoritative git/marketplace facts** the skill would
otherwise obtain via `git fetch` and `gh api`. The graded signal is therefore
*behavioral* (correct classification + fetch-first + confirm-before-mutating),
read from the agent's commands and final answer — not a with-vs-without outcome
delta. A future iteration could add per-fixture setup scripts to make the git
state real; the assertions would not change.

## How a run works

Mirror the `audit-conventions-evals/` flow: per eval, copy the fixture into a
sandbox outside this repo, spawn a subagent pointed at the skill (substituting
the plugin root for `${CLAUDE_PLUGIN_ROOT}`), have it save `answer.md` +
`commands.md`, then grade each eval's assertions from those into `grading.json`.
