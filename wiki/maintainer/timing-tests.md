---
type: practice-note
title: 'Tests of Running Time'
description: 'How to write a test that checks that code runs in linear time, so that load on the machine does not turn it red and a quadratic implementation still fails.'
tags: [maintainer, testing]
status: stable
---
# Tests of Running Time

Rules for a test that checks how the running time of code grows with its input.

**Compare two sizes, not one time with a fixed limit.** Load on the machine slows a correct run past a fixed limit. The W11 8,000-item test in `plugin/skills/triage-issues/scripts/test/issue-refs.test.mjs` took 517 ms against its 500 ms limit during a full `commands.validate`, and 55.8 ms when its suite ran alone (#982). A fixed limit can also pass quadratic code. In one probe run, a variant of `extract` that deduplicates by scanning every key took 385 ms at 8,000 items.

**Take the median of several rounds of each size, not the shortest run.** Measured on 2026-11-23 while a full `commands.validate` ran, with ten rounds per sample, 1,000 and 8,000 items:

| Statistic | `extract` (100 samples) | Quadratic variant (10 samples) |
|---|---|---|
| Ratio of the shortest times | 8.2 to 36.1 | 39.1 to 141.3 |
| Ratio of the median times | 8.0 to 14.4 | 45.6 to 77.5 |

With the shortest times, the two ranges came close: in a second probe the same variant measured as low as 33.0. No limit separated them reliably. With the medians, a limit of 25 leaves about 1.7 times margin on each side. The median drops the slowed runs of either size. Why the shortest time of the large size stayed high under load was not measured.

**Run every round. Do not stop at the first round under the limit.** A slowed run of the small size lowers the ratio. Under load, one round gave 0.9 for `extract`. A test that stops at the first round under the limit lets quadratic code pass on a loaded machine.

**Choose the limit from measurements under load, and record them beside the test.** Measure the ratio for the real code and for at least one quadratic variant while a full `commands.validate` runs. Set the limit between the two ranges. Write the ranges, the sample counts and the date in a comment above the test.

**Prove the test with a quadratic mutation.** Run the test against a deliberately quadratic variant in a scratch copy of the scripts folder, so the worktree is never written. Check that only the timing test goes red. Run it once alone and once while a full `commands.validate` runs.

**Time with `process.hrtime.bigint()`, and make one warm-up call that is not counted.** `Date.now()` has a resolution of 1 ms, which is coarse for a run of a few milliseconds. The first call also compiles the code.
