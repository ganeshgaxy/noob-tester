import type { Command } from "commander";
import chalk from "chalk";
import {
  selectTestCasesForDiff,
} from "../../db/repositories/test-selection.js";

export function registerTestSelectionCommands(testcaseCmd: Command): void {
  testcaseCmd
    .command("select")
    .description("Select test cases affected by code changes (diff-based)")
    .requiredOption("--repo <repoName>", "Repository name")
    .requiredOption("--diff <baseBranch>", "Base branch to diff against (e.g. main, develop)")
    .option("--ticket <ref>", "Scope to a specific ticket")
    .option("--depth <n>", "Import graph expansion depth (default: 1)", parseInt)
    .option("--json", "Output as JSON")
    .action((opts) => {
      const result = selectTestCasesForDiff(opts.repo, opts.diff, {
        ticketRef: opts.ticket,
        depth: opts.depth,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(chalk.bold("\nTest Selection by Diff\n"));
      console.log(`  Repo:            ${opts.repo}`);
      console.log(`  Base branch:     ${opts.diff}`);
      console.log(`  Changed files:   ${result.totalChanged}`);
      console.log(`  Affected files:  ${chalk.yellow(String(result.totalAffected))} (with import graph)`);
      console.log(`  Test cases:      ${chalk.green(String(result.totalTestCases))}`);

      if (result.testCases.length === 0) {
        console.log(chalk.dim("\n  No test cases found covering the changed files."));
        console.log(chalk.dim("  Run 'coverage build' first to link test cases to source files."));
        console.log();
        return;
      }

      console.log(chalk.bold("\n  Selected Test Cases:\n"));

      const typeLabels: Record<string, string> = {
        direct_functional: chalk.green("DIRECT"),
        impact_regression: chalk.yellow("IMPACT"),
        general_regression: chalk.blue("GENERAL"),
      };

      for (const tc of result.testCases) {
        const typeTag = typeLabels[tc.type] ?? chalk.dim(tc.type);
        const layerTag = chalk.cyan(`[${tc.test_layer}]`);
        const confTag = tc.confidence < 1.0
          ? chalk.dim(` (${Math.round(tc.confidence * 100)}%)`)
          : "";
        console.log(`    ${typeTag} ${layerTag} ${tc.title}${confTag}`);
      }
      console.log();
    });
}
