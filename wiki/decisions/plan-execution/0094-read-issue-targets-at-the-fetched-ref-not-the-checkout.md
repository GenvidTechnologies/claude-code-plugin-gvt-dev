---
type: decision-record
title: 'Issue targets are read at the fetched ref, not in the checkout, and `triage-issues` owns the fetch'
description: 'plan-next-issue checks how far the checkout is behind origin and reads targets at the fetched ref; triage-issues fetches and passes a read sha that the analyst reads and records.'
tags: [decisions, plan-execution]
status: stable
---
# 0094. Issue targets are read at the fetched ref, not in the checkout, and `triage-issues` owns the fetch

- **Status:** accepted
- **Date:** 2026-11-10
- **Issue:** #479

## Context

`git fetch` moves the `origin/*` refs. It does not move the working tree. `plan-next-issue` §1 said the fetch kept candidates ranked against fresh `origin/<default-branch>`, yet the already-shipped check in §2 read the target from the checkout. The `issue-triage-analyst` also read the checkout, and recorded `git rev-parse HEAD` as the commit it read. A checkout that is behind makes every one of those reads stale, and the recorded sha named a commit that is not the one the claim should be judged against.

Two reproductions were observed in consuming repos. In one, the checkout was one commit behind, and a false premise reached an issue body. In the other, the checkout was 10 commits behind, and 6 verification targets had changed (a comment on #479 records this second case).

ADR-0028 settled that §1 makes a single whole-remote fetch. ADR-0072 settled that triage verifies an issue's claims against the target artifact. ADR-0085 settled that a premise-freshness check reads the target and records `read at <sha>`. None of them said which tree the read uses.

## Decision

**Decision 1: `plan-next-issue` checks how far behind the checkout is, and reads at the fetched ref.** After the fetch, §1 runs `git log --oneline HEAD..origin/<default-branch>` whatever branch is checked out. The check also runs on the host-API fallback path, against the cached tracking ref. When it prints commits, the skill reports the commit count and reads every target at `origin/<default-branch>` (`git show origin/<default-branch>:<path>`). §2's already-shipped check names that tree. The skill never fast-forwards the checkout. If the host-API fallback finds the SHAs differ, or the lookup fails, the reads are at the last-fetched ref: the skill reports that sha as possibly stale and carries on.

**Decision 2: `triage-issues` owns the fetch and passes a read sha.** `triage-issues` §1 resolves `<default-branch>` from `repo.default_branch`, else from `git symbolic-ref --short refs/remotes/origin/HEAD` with the `origin/` prefix stripped, as `plan-task` does. Before it dispatches the analyst, it runs `git fetch origin` (whole remote, no refspec, as in ADR-0028), with the same host-API fallback as `plan-next-issue` §1 when the fetch fails on interactive auth, including the possibly-stale report when the SHAs differ. It passes the branch name and `git rev-parse origin/<default-branch>` in the dispatch. The analyst reads each `[artifact]` target with `git show <sha>:<path>` and records that sha in its verification note. When a dispatch names no sha, the analyst reads at `origin/<default-branch>`, records its `git rev-parse`, and says so in the report's Notes.

## Compromise

```
Decision 1
Option A (chosen): report the count, read at origin/<default-branch>, leave the checkout
Option B (rejected): offer git merge --ff-only
a working-tree write in a no-writes skill; possible only on a clean default-branch checkout

Decision 2
Option A (chosen): the orchestrating skill fetches and passes a read sha
Option B (rejected): the analyst compares the cached ref itself
the cached ref can still be stale, and the read-only agent would be assessing freshness
Option C (rejected): fix plan-next-issue only and file a follow-up for the analyst
leaves the second reproduction open; the analyst's note would keep naming HEAD
```

The fetch belongs to the orchestrating skill because the analyst is read-only by role. A is chosen in both decisions because each keeps the checkout untouched and names the ref that every read uses.

## Consequences

- One more local git command in `plan-next-issue` §1, and one fetch in `triage-issues` §1. When `triage-issues` runs inside `plan-next-issue`, it can reuse a fetch made moments earlier in the same run.
- The premise-freshness `read at <sha>` (ADR-0085) and the analyst's `read at <sha>` now name the same kind of ref.
- A user who wants the checkout current still has to move it. The skill reports the count and does nothing else.
- Some reads still come from the checkout and are out of scope here: the conventions doc, `.gvt-agent.json`, and the manifests (`.gitmodules`, `package.json`) that step 8's reference resolver reads from its `--root`.
- Remotes in submodules are not covered here. That gap stays with #368.
