import type { Command } from "commander";
import chalk from "chalk";
import {
  computeAllRiskScores,
  getTestCasesByRisk,
} from "../../db/repositories/risk-scoring.js";

export function registerRiskCommands(testcaseCmd: Command): void {
  testcaseCmd
    .command("risk")
    .description("Compute risk scores for test cases based on failure patterns, flakiness, code churn")
    .requiredOption("--ticket <ref>", "Ticket reference")
    .option("--json", "Output as JSON")
    .action((opts) => {
      // Compute scores
      const result = computeAllRiskScores(opts.ticket);

      // Get ordered results
      const testCases = getTestCasesByRisk(opts.ticket);

      if (opts.json) {
        console.log(JSON.stringify({
          computed: result.computed,
          avgScore: result.avgScore,
          highRisk: result.highRisk,
          testCases,
        }, null, 2));
        return;
      }

      console.log(chalk.bold("\nRisk-based Prioritization\n"));
      console.log(`  Ticket:     ${opts.ticket}`);
      console.log(`  Computed:   ${result.computed} test cases`);
      console.log(`  Avg score:  ${result.avgScore}`);
      console.log(`  High risk:  ${chalk.red(String(result.highRisk))}`);

      if ((testCases as unknown[]).length === 0) {
        console.log(chalk.dim("\n  No ready test cases found."));
        console.log();
        return;
      }

      console.log(chalk.bold("\n  Test Cases (highest risk first):\n"));

      for (const tc of testCases as Array<Record<string, unknown>>) {
        const score = Number(tc.risk_score) || 0;
        const scoreColor = score >= 0.6 ? chalk.red : score >= 0.3 ? chalk.yellow : chalk.green;
        const bar = "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));
        console.log(
          `    ${scoreColor(score.toFixed(2))} ${chalk.dim(bar)} ${tc.title}`
        );
      }
      console.log();
    });
}
