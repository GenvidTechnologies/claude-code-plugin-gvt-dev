# 0025. The OKF §11 tolerant-consumer bound lives in `maintain-wiki`'s `lint` section, with a bidirectional pointer to the schema docs

- **Status:** accepted
- **Date:** 2026-08-04
- **Issue:** #191

## Context

ADR-0022 decision 4 stated the OKF v0.2 §11 **consumer** clauses "bind `lint`
and #150" but deliberately named no owning surface — it was fixing the bundle
root, not the skill's text. ADR-0024 then wrote the page format those clauses
apply to. #191 is where the coupling actually lands: it wires `lint` and
`wiki-librarian` to that format, which forces the deferred question — **which
file owns the constraint that bounds what a consumer may reject a bundle for?**

The constraint is not decorative. §11 is what stops a health check from
becoming a gate: it enumerates the cases a conformant consumer **MUST NOT**
reject a bundle for. Today `lint` is an LLM-mode advisory verb, but #150 is a
*mechanical* checker with an exit code, and it inherits whatever bound is
written here. Wherever the enumeration lives is where #150's author will (or
won't) find it.

Spec pin as ADR-0022 fixed it: OKF v0.2, upstream commit
`3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`.

## Decision

**1. The binding statement is skill-local**, in
`plugin/skills/maintain-wiki/SKILL.md`'s `## lint` section (the *"What `lint`
may never reject on"* block), with a **bidirectional pointer** to the schema
docs: the skill body names the schema doc's *"Tolerated, never rejected"*
paragraph as the format's own restatement, and each schema copy names the skill
body as the binding one.

Four properties hold under this option and under no other:

1. **Plugin-owned.** The constraint binds a plugin-owned script (#150), so it
   lives on a plugin-owned surface that ships with the plugin.
2. **Present unconditionally.** `SKILL.md` is always there when `lint` runs.
3. **Co-located with the semantics it bounds.** The reader learning what `lint`
   checks reads the bound in the same section, not by following a link.
4. **Precedented.** This is ADR-0023's exact shape — skill-local rule plus a
   bidirectional pointer from the doc a reader would otherwise reach first.

**Architecture.** This sits directly under ADR-0022 decision 4 (which named the
clauses and left the surface open) and beside ADR-0024 (which wrote the format
the clauses qualify). It introduces no new file, no config key, no template, and
no agent — the whole decision is *which existing surface owns text*, which is
precisely the surface-vs-scope-width fork ADR-0023 records as warranting a
record even when the diff is small.

**2. The enumeration was completed to six, not the five #191 proposed.** The
pinned spec's §11 carries a sixth MUST — *missing any optional family* (§5.3,
e.g. no `verified` block at all) — that the issue's list omitted. Shipping the
issue verbatim would have made the plugin's own written bound **narrower than
the spec it cites**, and #150 would have inherited the gap as a licence to
reject something §11 protects. **The pinned spec is the arbiter, not the
proposal** — the issue is a claim about the artifact it modifies, and it was
wrong on a point of fact (`development-principles.md` principle **#13**). The
completed set, as written in all three copies: missing optional frontmatter
fields; missing any optional family (§5.3); an unknown `type` value; unknown
additional frontmatter keys; broken cross-links (§6.1); a missing `index.md` —
plus the MUST that a bare `verified` mapping is read as a one-element list.

**3. Advisory is not rejection, and the #150 strict-mode seam is named
explicitly.** §11 bounds what a consumer may *reject a bundle for*; `lint`
rejects nothing — it never fails, never refuses to read a page, never exits
non-zero. So reporting an orphan, a dead link, or an out-of-bundle link is fully
conformant. The bound on #150 is therefore stated as: it may **report** any of
the six cases, but must never turn one into an error, a hard failure, or a
non-zero exit — **and if it offers an opt-in strict/exit-code mode, a
§11-tolerated finding must not be what fails it.** That last clause is the load-
bearing one: #150's own body promises "advisory / non-zero-exit-neutral by
default … unless explicitly asked to," and that *"unless"* is the single most
likely place the two issues would silently disagree. A consuming repo may hold
itself to a stricter *local* policy in its own `docs/wiki-schema.md`; that is
project policy, never an OKF requirement and never a plugin default.

**4. The three-copy duplication is deliberate, with a declared winner on
conflict.** The enumeration now exists in `SKILL.md` (binding),
`plugin/skills/maintain-wiki/wiki-schema.template.md`, and this repo's
`docs/wiki-schema.md`. This is the repo's established **cite-and-repeat**
pattern rather than accidental drift: a skill or agent loaded standalone may
never read the shared doc, so each inline copy is load-bearing. The sync
obligation is real — all three move together — and the tie-break is written into
the text itself: **the skill body is binding; the schema copies are the page
format's own restatement of the same clauses.**

## Compromise

**Rejected: (B) schema-doc only, with a pointer from `lint`.** The smallest
diff, one canonical owner, zero duplication — genuinely attractive on the
"link, don't duplicate" rule. Rejected on two independent grounds:

- **Availability.** `docs/wiki-schema.md` is declared **`required: false`** in
  `maintain-wiki`'s `metadata.expects` — the skill is contractually required to
  work *without* it (it offers to scaffold it, and `lint` runs regardless).
  Worse, the doc is copied into consumer repos from
  `wiki-schema.template.md`, whose header explicitly invites editing ("edit it
  for your project"). A constraint binding a **plugin-owned script** would then
  live only in a file the plugin cannot assume exists and a consumer is invited
  to trim. That is a bound that can be edited away by someone who has no idea
  they are widening #150's licence to fail a build.
- **Tenancy.** §11's clauses are **consumer** obligations; the schema doc is a
  **producer** format spec (what a page contains, how pages are created and
  updated). Housing a consumer bound as the primary statement inside a producer
  spec puts it in front of the wrong reader.

**Rejected: (C) promote to a plugin-owned doc** — `plugin/docs/okf-consumer-constraints.md`,
or a skill-local sub-doc. This is **ADR-0023's rejected option (c)** with the
same failure mode: exactly **one citing use** today (`lint`, with #150 as a
future second), while a new doc costs a `docs/TOC.md` row and — for
`plugin/docs/` specifically — behavioral-surface semantics, since runtime-imported
reference content is part of the plugin's shipped behavior and carries a version
bump. It also **splits `lint`'s semantics across two files**, so the reader
learning what `lint` checks has to follow a link to learn what it may not
conclude. **The escape hatch is named rather than closed:** if #150 lands, or a
second consumer appears, and a standalone home becomes genuinely useful, promote
it then — via a **superseding ADR**, not a quiet move.

## Consequences

- **Two known out-of-bundle findings, inherited by #192.** This repo's wiki has
  exactly two links escaping the bundle — `wiki/audit-conventions-as-proto-lint.md:46`
  and `wiki/llm-wiki-pattern-in-gvt-dev.md:49`, both to
  `../docs/decisions/0015-…`. Under the new advisory out-of-bundle check these
  become standing, known findings. They are legal per §6.1 and are **not**
  defects; #192 decides whether to keep or re-target them.
- **The four `wiki-librarian` behaviors are deliberate ADDITIONS, and they ship
  UNVERIFIED against real data.** Routing by `type`/`tags` (§4.1), trust tier
  (§5.3), honoring `status: deprecated` (§5.4), and currency from `generated.at`
  / `stale_after` (§5.2, §5.5) are net-new agent behavior — explicitly distinct
  from the `sources[]` provenance **repair** in the same commit, which was
  forced by ADR-0024 deleting the `## Sources` body section the old step 4
  pointed at. The designer recommended **rejecting all four** and filing a
  follow-up; **the maintainer overrode that and accepted all four.** Recorded
  honestly, along with the cost: **none of the four can be exercised end-to-end
  until #192**, because no page in the dogfood wiki carries frontmatter at all.
  They ship unverified against real data **by decision, not by oversight**.
- **Two more rules ship unvalidated against real data.** Bundle-absolute
  `/x.md` link resolution has **0 instances** in the current corpus, and the
  nested-`index.md` orphan rule has none either — the wiki has no
  subdirectories. Both were exercised only against a throwaway scratchpad
  fixture. Handed to #192 for validation against the real bundle.
- **§11.1–11.2 conformance checking is deferred to #150, deliberately, and the
  boundary is now stated from `lint`'s side.** Whether every non-reserved `.md`
  under `<wikiDir>/` carries parseable frontmatter with a non-empty `type` is
  the mechanical checker's walk, not this verb's. `SKILL.md` now says so
  outright ("deliberately deferred, not forgotten … Neither side should assume
  the other already does it"), and the same boundary is being mirrored into
  #150's issue body so the two cannot drift apart unnoticed.
- **No conformance claim is made or implied.** Per ADR-0022 decision 4 the claim
  is always "the `<wikiDir>/` bundle is OKF v0.2 conformant", never "this repo
  is" — and it becomes true only when #192 lands. Nothing in #191 asserts it;
  this change specifies how a consumer must *behave*, not that any bundle
  currently conforms.
- **Three copies to keep in sync.** Any future change to the §11 enumeration
  must land in `SKILL.md`, `wiki-schema.template.md`, and `docs/wiki-schema.md`
  together. Nothing mechanical enforces this — `audit-conventions` has no
  cross-copy consistency check, and adding one would mean teaching it about wiki
  content, which ADR-0015 decision 2 keeps out of `audit.mjs`.
