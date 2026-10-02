# 0052. An option placed after `--` in a pathspec-scoped commit is parsed as a pathspec, not consumed as a flag

- **Status:** accepted
- **Date:** 2026-09-11
- **Issue:** #490 (filed alongside #480, which produced ADR-0048's `git rm --cached` amendment)

## Context

ADR-0048 closes with a standing instruction for exactly this situation: *"If a mechanism explaining
that repo's original error ever surfaces, it belongs in a follow-up record rather than a rewrite of
this one, since this decision's scope is the falsified premise, not a diagnosis of that incident."*
This record is that follow-up, filed per that instruction rather than as an edit to 0048's own body.

Everything after `--` in a git command line is a pathspec by definition — that is what the separator
means, not a git quirk. So an option written after it is not rejected or ignored; it is read as a
path. Measured on git 2.55.0.windows.5, in a throwaway repo: `git commit -- a.txt b.txt -F msg.txt`
reports `error: pathspec '-F' did not match any file(s) known to git` **and**
`error: pathspec 'msg.txt' did not match any file(s) known to git`, exits **1**, and commits nothing,
while `git status --porcelain` reports the tree as clean of anything wrong — every real path was
staged correctly, and it is the separator, not a tracking problem, that swallowed the option. This is
not specific to `-F`: `git commit -- a.txt --no-verify` fails identically, confirming the mechanism is
positional rather than tied to one flag. The remedy is reordering, not diagnosis: options before the
separator, `git commit -F msg.txt -- a.txt b.txt`, which exits 0.

**The tell distinguishes this from ADR-0048's two measured causes.** In both of ADR-0048's forms —
`git add`'s `fatal: pathspec 'X' did not match any files` and the pathspec-scoped commit's own
`error: pathspec 'X' did not match any file(s) known to git` — the unmatched string names a real,
mistracked path, and `git status --porcelain` is exactly where the record points a reader to find out
why. Here the unmatched "path" is a flag, and the porcelain output shows nothing wrong at all, because
nothing is actually mistracked. A reader who runs `git status --porcelain` looking for the mistracked
file this error form usually means will find a clean tree and can mistake that for a puzzle rather
than the actual answer, which is upstream in argument order.

**Why this recurs here specifically.** This repo's own convention for a multi-line commit body is
`-F <file>` rather than an inline `-m`, and the mnemonic shape of a pathspec-scoped commit is
"`git commit` **the files**" — which pulls toward drafting the pathspec list first and appending
`-F msg.txt` afterward, landing the option in precisely the position the separator swallows. The
hazard is not a general git footgun; it is this repo's two conventions — pathspec-scoped commits and
`-F`-file commit bodies — combining to produce the one argument order that fails.

## Decision

**Document the mechanism, its distinguishing tell, and its remedy; make no claim beyond that.** The
remedy paragraph already shipped in `plugin/skills/plan-task/SKILL.md` (landed in `0db0d2e`, the
commit this record and ADR-0048's amendment both document): reorder so options precede the `--`
separator. This record is the rationale trail for that paragraph, not a second place stating the
rule — a future editor should find the mechanism explained once, here, and cited from anywhere else
that needs it.

**On construct3-chef#207 — a candidate explanation, explicitly not a confirmed one.** ADR-0048
records that #207's shell history is unavailable and that repo's original argument order is
therefore unrecoverable, and its own re-probe of that invocation — "same filenames, `-F msg.txt`,
three pathspecs" — succeeded at exit 0. This record's mechanism explains why a *reconstruction* of
that command would tend to succeed even where the original reportedly failed: rebuilding a pathspec
command from an incident report, without the original session's exact keystrokes in hand, is drafted
in the natural order — paths, then the file-body option — and that is the order that works. It is
plausible that the original #207 invocation instead had the option trailing after its own pathspecs,
and that this exact mechanism is what failed there.

**That plausibility is as far as the evidence goes.** #207's actual argument order was never captured
and cannot be recovered, so this record does not claim to explain #207 — it identifies one mechanism
that would produce the observed shape (report says fail, reconstruction says succeed) if it applied,
and states that it cannot be confirmed against the original invocation. ADR-0048 was explicit that its
own #207 diagnosis was "inference, not measurement"; this record keeps that same distinction rather
than quietly upgrading a plausible mechanism into a solved incident.

## Compromise

**What this record does not do: close #207.** #207 remains exactly as unresolved as ADR-0048 left
it — one more candidate mechanism is on record, not an answer. Asserting that this record solves #207
was considered and rejected: it is unfalsifiable given the unrecoverable shell history, and claiming
it would undo the epistemic care ADR-0048 itself took in naming its own #207 read as inference. The
honest position is weaker and stated as such.

**Filing this as a new record rather than folding it into ADR-0048's amendment was also considered.**
Rejected because the two findings have different shapes and different confidence levels: ADR-0048's
`git rm --cached` amendment is a measured mechanism with no open question attached, while this
record's bearing on #207 is explicitly a candidate, not a fact — collapsing them into one record would
make it harder for a future reader to see which parts of the combined text are measured and which are
a hypothesis about an incident that cannot be re-run.

## Consequences

- The `plan-task` remedy paragraph (`0db0d2e`) already states the fix; this record supplies the
  mechanism and the tell so a future editor doesn't have to re-derive either from the error text alone.
- A future reader debugging a `pathspec ... did not match` error should check option placement — an
  unmatched "path" that is actually a flag, alongside an otherwise-clean `git status --porcelain` — as
  a third possibility alongside ADR-0048's two mistracked-path forms and its `git rm --cached` amendment.
- #207 stays open as an unresolved incident. If that repo's shell history or an equivalent record of
  the original invocation ever surfaces, it would let someone check whether this mechanism actually
  applied there, rather than only whether it plausibly could have.
