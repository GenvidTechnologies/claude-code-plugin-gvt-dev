# audit-conventions as Proto-Lint

The `audit-conventions` skill's hygiene scanners already perform an informal,
advisory content-lint over `docs/**` and `CLAUDE.md` — separate from, and
narrower than, the `maintain-wiki lint` verb.

## The existing scanners

`plugin/skills/audit-conventions/scripts/lib/hygiene.mjs` ships three pure
scanners, each `(repoRoot, opts) => findings[]`:

- **`scanRetiredTokens`** — flags lines containing a retired
  namespace/plugin-name token (e.g. `genvid:`, `genvid-c3`) across the shared
  Markdown candidate set plus a fixed allow-list of git-tracked config files
  (`.gvt-agent.json`, `package.json`, `.claude/settings.json`,
  `.claude/settings.local.json`). Lines containing `http` are skipped —
  provenance/issue URLs are correct-as-history, not drift.
- **`scanBrokenLinks`** — walks the same candidate Markdown set, skips fenced
  code blocks and inline code spans (so a doc showing a link *as an example*
  doesn't false-positive), and resolves every relative link target with
  `fs.stat`, flagging anything that doesn't exist on disk.
- **`scanOrphanedDocs`** — checks that every file under `docs/` is referenced
  somewhere in `docs/TOC.md` (accepting either the full `docs/`-relative path
  or the bare filename, since `docs/TOC.md` commonly links siblings by bare
  name).

All three share one candidate-file walk (`listCandidateFiles`): `docs/**.md`
plus the repo-root `CLAUDE.md`, minus a default exclude list
(`CHANGELOG.md`, `docs/superpowers/`, `docs/decisions/` — content that is
correct-as-history and would otherwise false-positive on retired tokens or
looks-like-drift patterns).

## How this is already "proto-lint"

These scanners match the shape of the wiki pattern's `lint` verb almost
exactly — dead links, orphaned pages, stale/retired references — just applied
to `docs/` instead of `wiki/`. They are wired into `audit.mjs`'s validate
mode as **advisory, exit-0 findings** (`info`/`warning` severity, never
`error`): a consuming repo's audit never fails because of a broken doc link
or an orphaned page, it just gets told about it. That advisory posture — flag,
don't block — is exactly what `docs/wiki-schema.md` describes for the
`lint` verb's own findings.

## Where the boundary sits

[ADR 0015](../docs/decisions/0015-maintain-wiki-design-boundaries.md) drew
the line explicitly when `maintain-wiki` was designed, splitting what could
have been one generic lint engine into three non-overlapping owners:

- **`audit-conventions`'s hygiene scanners** own contract/hygiene of `docs/**`
  and `CLAUDE.md` — the plugin-contract surface every consuming repo has,
  whether or not it has adopted the wiki practice.
- **`maintain-wiki lint`** owns content health of the repo-root `wiki/` tier
  (and, per the schema, `raw/` immutability) — meaningful only for a repo
  that has actually adopted the wiki practice.
- **#146** owns detection/migration — whether a repo *has* the wiki practice
  at all, and offering to scaffold or migrate it — a distinct concern from
  either scanner running content checks on an already-adopted practice.

The wiki's two tiers (`wiki/`, `raw/`) deliberately live at the repo root
rather than under `docs/`, specifically so they fall outside
`listCandidateFiles`'s walk — `raw/` legitimately contains retired tokens and
dead links as part of its captured-source record, and `wiki/` pages churn on
a different cadence than curated reference docs. That placement is why
`audit-conventions` needed no new exclusion entries when `maintain-wiki`
shipped: the wiki tiers were simply never in its candidate set to begin
with. Only `docs/wiki-schema.md` itself — the curated maintenance-rules doc —
stays under `docs/`, indexed in `docs/TOC.md`, and hygiene-covered like any
other reference doc.

The practical effect: a repo can adopt the wiki practice, run `maintain-wiki
lint` as often or as rarely as it likes, and its `audit-conventions` exit
code is never affected by wiki content health — the two gates stay
independent.

## Sources

- `raw/karpathy-llm-wiki-agent-memory.md` — the `lint` verb definition (dead
  links, orphaned pages, staleness, schema violations) this page compares
  the existing scanners against.
- `raw/beyond-rag-llm-wiki-pattern.md` — the point that maintenance
  discipline, not format alone, is what makes a wiki (or a lint tier)
  actually useful.

## Related

- [The LLM-Wiki Pattern in gvt-dev](llm-wiki-pattern-in-gvt-dev.md) — the
  broader pattern-mapping page this one narrows in from; see its
  `audit-conventions ≈ proto-lint` bullet.
