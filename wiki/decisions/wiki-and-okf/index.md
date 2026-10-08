# Wiki and OKF

Decisions about the maintain-wiki skill's wiki and raw tiers and the OKF bundle format.

## Records

* [maintain-wiki design boundaries: repo-root placement, standalone lint, thin ingest](0015-maintain-wiki-design-boundaries.md) - maintain-wiki's wiki and raw tiers live at the repo root, lint stays a standalone verb, and ingest is a new thin verb.
* [OKF v0.2 bundle root: the wiki/ tier, with raw/ outside the bundle](0022-okf-bundle-root-is-the-wiki-tier.md) - The OKF v0.2 bundle root is the wiki directory, leaving the raw directory outside the bundle so the immutability rule stands unamended.
* [OKF v0.2 concept-page frontmatter contract: full key set, `## Sources` dropped, `wiki.decay` retired](0024-okf-concept-page-frontmatter-contract.md) - The concept-page frontmatter emits the full OKF v0.2 key set, drops the Sources section, and retires wiki.decay for per-page stale_after.
* [The OKF §11 tolerant-consumer bound lives in `maintain-wiki`'s `lint` section, with a bidirectional pointer to the schema docs](0025-okf-consumer-bound-in-the-skill-body.md) - The OKF tolerant-consumer bound is written in maintain-wiki's skill body rather than the schema doc or a new plugin-owned doc.
* [OKF v0.2 dogfood migration semantics: provenance dates, pruned `sources[]`, and a standing out-of-bundle advisory](0026-okf-dogfood-migration-semantics.md) - The dogfood wiki's OKF v0.2 migration dates generated.at from content production and prunes sources to claim-supporting captures.
* [Widening `scanRetiredTokens` to `<wikiDir>/` amends ADR-0015's wiki limb only; `raw/` stays unamended](0041-widen-retired-token-scan-to-wiki-amends-0015.md) - The retired-token scan widens to the wiki directory, amending only ADR-0015's wiki limb while leaving raw and decision 2 unamended.
* [`audit-conventions` declines OKF bundle content to `maintain-wiki lint`, enforcing a boundary it previously only assumed](0053-audit-conventions-declines-bundle-content-to-wiki-lint.md) - The orphan and broken-link scanners decline OKF bundle content and report the decline as a new info finding instead of misfiring.
* [`wiki-lint`'s mechanical checker: no cross-skill imports, a `lib/` shape, and resolution-based orphan matching](0054-wiki-lint-mechanical-checker-shape-and-orphan-resolution.md) - wiki-lint's modules re-implement fence and link masking rather than importing it, and the checker always exits 0 per the tolerant-consumer bound.
* [Decision records move into the wiki bundle: nine themes, OKF frontmatter, one global sequence](0067-decision-records-move-into-the-wiki-bundle.md) - This repo's 66 decision records move from docs/decisions/ into nine themed wiki/decisions/ folders, each carrying OKF frontmatter and a theme index entry.
* [The wiki schema resolves inside the bundle first, a prefer field declares the order, and ADR-0015 decision 1 is amended](0070-wiki-schema-resolves-inside-the-bundle-amends-0015.md) - The wiki schema resolves from the paths override, then wiki/schema.md in the bundle, then legacy docs/wiki-schema.md; prefer declares it, amending ADR-0015.
