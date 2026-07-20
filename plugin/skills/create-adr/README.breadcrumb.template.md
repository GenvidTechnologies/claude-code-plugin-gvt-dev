# Decision Records

This directory contains Architecture Decision Records (ADRs) in **MADR-lite** format.

**Template:** the MADR-lite template is bundled in the `gvt-dev` plugin at `plugin/docs/decision-record.template.md` — `gvt-dev:tech-writer` fills it automatically.

**To add or insert a record:** run `/gvt-dev:create-adr` — it handles numbering, chronological insertion, renumbering, and from-empty chronological backfill. Do not hand-number files.

**Retroactive records:** a record may be **backfilled retroactively** — its number reflects chronological *decision* order, not authorship order. Such a record distinguishes **Originally decided** (derived from git history) from **Recorded** (when the file was written), so readers don't mistake the write date for the decision date.

**Index:** all records are listed in [`docs/TOC.md`](../TOC.md) under the **Decision Records** heading.
