import fs from "node:fs";
// Developer-local: set EVAL_ITERATION_DIR to your local iteration-1 output dir (iteration-*/ is gitignored).
const IT = process.env.EVAL_ITERATION_DIR;
if (!IT) throw new Error("Set EVAL_ITERATION_DIR to your local iteration-1 output directory before running this grader.");

// dir -> {timing, tokens, tools, eval meta, expectations:[ [passed, evidence] x4 ]}
const runs = {
  "eval-greenfield-scaffold/with_skill": { t: 609.2, tok: 35256, tools: 17, name: "greenfield-scaffold", cfg: "with_skill", id: 0, exp: [
    [true, "commands.md shows it invoked audit.mjs (validate) instead of hand-checking files."],
    [true, "answer.md: detected the repo in greenfield state."],
    [true, "Ran --fix (dry-run) before --fix --apply; answer describes previewing the 4-action scaffold plan first."],
    [false, "Ran --fix --apply in the SAME turn right after the dry-run, without pausing for user approval. Skill step 2 says apply after user approves. Mitigation: prompt get it into shape arguably authorized acting. KEY FINDING."],
  ]},
  "eval-legacy-migration/with_skill": { t: 751.6, tok: 36351, tools: 20, name: "legacy-migration", cfg: "with_skill", id: 1, exp: [
    [true, "commands.md shows audit.mjs run; migration driven by --fix --apply rather than hand-rolled cp/rm."],
    [true, "answer.md: detected the repo was in the legacy state."],
    [true, "Ran --fix dry-run and surfaced the numbered migration plan before applying."],
    [false, "Ran --fix --apply in the same turn after the dry-run without awaiting approval. Same collapsed two-step as greenfield. Prompt migrate us over arguably authorized it."],
  ]},
  "eval-migrated-drift-check/with_skill": { t: 57.7, tok: 27564, tools: 6, name: "migrated-drift-check", cfg: "with_skill", id: 2, exp: [
    [true, "commands.md: ran audit.mjs in validate mode."],
    [true, "answer.md: State: migrated."],
    [true, "Flagged CLAUDE.md as the missing required file with a per-component reason table."],
    [true, "Proposed a concrete CLAUDE.md template and explicitly stopped short of creating it, asking the user first. Correctly did NOT auto-apply (migrated state refuses --fix anyway)."],
  ]},
  "eval-greenfield-scaffold/without_skill": { t: 761.1, tok: 37011, tools: 20, name: "greenfield-scaffold", cfg: "without_skill", id: 0, exp: [
    [true, "CONTAMINATED: baseline discovered the plugin outside its sandbox and ran the real audit.mjs (commands.md lists ls .../scripts/ then node audit.mjs)."],
    [true, "answer.md reports greenfield state."],
    [true, "Ran --fix dry-run before apply."],
    [false, "Ran --fix --apply in the same turn without confirmation. Behaved like the with-skill run because it found the script."],
  ]},
  "eval-legacy-migration/without_skill": { t: 743.6, tok: 47076, tools: 24, name: "legacy-migration", cfg: "without_skill", id: 1, exp: [
    [false, "CONTAMINATED but instructive: baseline did NOT use --fix; it read the script internals + legacy-manifest-snapshot and hand-rolled the migration (cp CONVENTIONS.md, rm claude-config.json, git rm, etc.)."],
    [true, "Correctly identified the legacy submodule/claude-config setup."],
    [false, "Never ran a --fix dry-run; no plan was surfaced. It mutated files directly."],
    [true, "Did not run --fix --apply (it never used --fix). Note: it still mutated the repo without an explicit approval gate."],
  ]},
  "eval-migrated-drift-check/without_skill": { t: 1154.5, tok: 34457, tools: 16, name: "migrated-drift-check", cfg: "without_skill", id: 2, exp: [
    [false, "CONTAMINATED: baseline hand-parsed every SKILL.md/agent frontmatter with awk to reconstruct expectations. Never ran audit.mjs. Took 1154s vs the skill run 58s (~20x)."],
    [true, "Correctly assessed the repo as already-migrated (has .gvt-agent.json, CONVENTIONS.md, docs/TOC.md, no submodule)."],
    [true, "Flagged CLAUDE.md as the missing required file with per-component reasons."],
    [true, "Proposed a concrete fix (create CLAUDE.md covering commit/branch/PR) and did not auto-create it."],
  ]},
};

const runArr = [];
for (const [dir, r] of Object.entries(runs)) {
  const passed = r.exp.filter((e) => e[0]).length, total = r.exp.length;
  const meta = JSON.parse(fs.readFileSync(`${IT}/eval-${r.name}/eval_metadata.json`, "utf8"));
  const expectations = r.exp.map((e, i) => ({ text: meta.assertions[i].text, passed: e[0], evidence: e[1] }));
  const grading = {
    expectations,
    summary: { passed, failed: total - passed, total, pass_rate: +(passed / total).toFixed(4) },
    execution_metrics: { total_tool_calls: r.tools, errors_encountered: 0 },
    timing: { total_duration_seconds: r.t },
  };
  fs.writeFileSync(`${IT}/${dir}/grading.json`, JSON.stringify(grading, null, 2));
  runArr.push({ eval_id: r.id, eval_name: r.name, configuration: r.cfg, run_number: 1,
    result: { pass_rate: grading.summary.pass_rate, passed, failed: total - passed, total, time_seconds: r.t, tokens: r.tok, tool_calls: r.tools, errors: 0 },
    expectations });
}

const stats = (a) => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n; const sd = n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)) : 0; return { mean: +m.toFixed(4), stddev: +sd.toFixed(4), min: +Math.min(...a).toFixed(4), max: +Math.max(...a).toFixed(4) }; };
const ws = runArr.filter((r) => r.configuration === "with_skill"), wo = runArr.filter((r) => r.configuration === "without_skill");
const sum = (cfg) => ({ pass_rate: stats(cfg.map((r) => r.result.pass_rate)), time_seconds: stats(cfg.map((r) => r.result.time_seconds)), tokens: stats(cfg.map((r) => r.result.tokens)) });
const wsS = sum(ws), woS = sum(wo);
const d = (a, b, p) => (a - b >= 0 ? "+" : "") + (a - b).toFixed(p);
const benchmark = {
  metadata: { skill_name: "audit-conventions", timestamp: "2026-05-30T00:00:00Z", evals_run: ["greenfield-scaffold", "legacy-migration", "migrated-drift-check"], runs_per_configuration: 1 },
  runs: runArr,
  run_summary: { with_skill: wsS, without_skill: woS, delta: { pass_rate: d(wsS.pass_rate.mean, woS.pass_rate.mean, 4), time_seconds: d(wsS.time_seconds.mean, woS.time_seconds.mean, 1), tokens: d(wsS.tokens.mean, woS.tokens.mean, 0) } },
  notes: [
    "METHODOLOGY CAVEAT: fixtures live inside the burbank-claude-config repo, so the no-skill baselines escaped their sandboxes and discovered the plugin (ran the real audit.mjs, read its internals, or hand-parsed frontmatter). The with-vs-without OUTCOME delta is therefore understated. Iteration-2 should relocate fixtures outside the repo.",
    "Headline finding: with the skill, greenfield + legacy runs collapsed the skill two-step (dry-run then apply AFTER approval) into a single turn, auto-running --fix --apply. The migrated run (no --fix path) correctly stopped and asked. Consider whether the skill should harden the interactive approval gate.",
    "Strong surviving signal: efficiency. migrated-drift-check ran in 57.7s with the skill vs 1154.5s for the hand-rolled baseline (~20x). Even when a baseline can brute-force the answer, the skill makes it far cheaper and more reliable.",
    "Assertions A1 (ran the script) and A3 (dry-run before apply) are the most skill-discriminating; A2 (state identification) passes everywhere and barely differentiates.",
  ],
};
fs.writeFileSync(`${IT}/benchmark.json`, JSON.stringify(benchmark, null, 2));
console.log("wrote 6 grading.json + benchmark.json");
console.log("with_skill pass_rate mean:", wsS.pass_rate.mean, "| without:", woS.pass_rate.mean);
console.log("time mean with:", wsS.time_seconds.mean, "without:", woS.time_seconds.mean, "delta:", benchmark.run_summary.delta.time_seconds);
