# skeleton/

The pristine **placeholder** convention files that `audit-conventions --fix`
writes when scaffolding a greenfield repo. `planGreenfield` (in
`skills/audit-conventions/scripts/lib/migrate.mjs`) copies these verbatim, so
they are the single source of truth for what a freshly-scaffolded repo gets —
edit the file here, not a JS string literal.

- `.genvid-agent.json` — empty config schema (the consumer fills in real values)
- `CLAUDE.md` — stub with the `@CONVENTIONS.md` import and section placeholders
- `docs/TOC.md` — placeholder documentation index

`CONVENTIONS.md` is **not** here: the scaffold copies the plugin's own canonical
`CONVENTIONS.md` from the repo root, which is already a single source of truth.

> **`skeleton/` vs. `examples/`:** these hold *empty placeholders* a consumer
> fills in. [`examples/`](../examples/) holds a *worked, filled-in* example
> consuming-repo (the Bunny game) for reference — it shows what these files look
> like once populated. Keep the two in sync in spirit, but they serve different
> purposes: skeleton is what gets written, examples is what "done" looks like.
