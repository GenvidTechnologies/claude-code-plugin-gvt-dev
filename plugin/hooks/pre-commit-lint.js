/* global Buffer, require, process */
/**
 * Pre-commit hook for the genvid plugin.
 *
 * Runs the project's lint command before any `git commit` invocation in the
 * Bash tool. The lint command is read from .genvid-agent.json commands.lint.
 * Exits with code 2 to block the commit if lint fails.
 *
 * Wired in hooks/hooks.json as a PreToolUse hook matching the Bash tool.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0); // Malformed input — don't block.
  }

  const command = input.tool_input?.command || "";
  if (!/^git\s+commit\b/.test(command)) {
    process.exit(0);
  }

  const repoRoot = input.cwd || process.cwd();
  const configPath = path.join(repoRoot, ".genvid-agent.json");
  let lintCommand;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    lintCommand = config?.commands?.lint;
  } catch {
    // No .genvid-agent.json — project may not be on the convention contract
    // yet. Don't block; the user can run /genvid-dev:audit-conventions to migrate.
    process.exit(0);
  }

  if (!lintCommand || typeof lintCommand !== "string" || lintCommand.trim() === "") {
    process.exit(0); // No lint command defined — nothing to enforce.
  }

  try {
    execSync(lintCommand, { stdio: "pipe", cwd: repoRoot });
    process.exit(0);
  } catch {
    process.stderr.write(
      `Lint check failed. Fix lint errors before committing.\n` +
        `Command that failed: ${lintCommand}\n`,
    );
    process.exit(2);
  }
});
