import type { Command } from "commander";
import chalk from "chalk";
import {
  setBaseline,
  compareAgainstBaseline,
  createDiff,
  getDiffsByRun,
  getUnreviewedDiffs,
  markDiffReviewed,
  acceptAsNewBaseline,
  getVisualRegressionStats,
} from "../../db/repositories/visual-regression.js";

export function registerVisualCommands(program: Command): void {
  const vis = program
    .command("visual")
    .description(
      "Visual regression testing — baselines, comparisons, and diff review",
    );

  vis
    .command("baseline")
    .description("Set a visual baseline for a page + viewport")
    .requiredOption("--page <pageId>", "UI map page ID")
    .requiredOption("--url <pattern>", "URL pattern for the page")
    .requiredOption("--screenshot <path>", "Path to the baseline screenshot")
    .option("--viewport <WxH>", "Viewport size (default: 1280x720)")
    .option("--run <runId>", "Source run ID")
    .option("--entry <entryId>", "Source run pack entry ID")
    .action((opts) => {
      const id = setBaseline(
        opts.page,
        opts.url,
        opts.viewport ?? "1280x720",
        opts.screenshot,
        { runId: opts.run, entryId: opts.entry },
      );
      console.log(JSON.stringify({ baselineId: id }));
    });

  vis
    .command("compare")
    .description(
      "Compare a screenshot against the baseline (hash-based quick check)",
    )
    .requiredOption("--page <pageId>", "UI map page ID")
    .requiredOption("--screenshot <path>", "Path to current screenshot")
    .option("--viewport <WxH>", "Viewport size (default: 1280x720)")
    .action((opts) => {
      const result = compareAgainstBaseline(
        opts.page,
        opts.screenshot,
        opts.viewport ?? "1280x720",
      );
      console.log(JSON.stringify(result));
    });

  vis
    .command("diff-save")
    .description("Save a visual diff result (after vision comparison)")
    .requiredOption("--baseline <id>", "Baseline ID")
    .requiredOption("--run <runId>", "Run ID")
    .requiredOption("--current <path>", "Path to current screenshot")
    .option("--entry <entryId>", "Run pack entry ID")
    .option(
      "--score <n>",
      "Diff score 0.0-1.0 (higher = more different)",
      parseFloat,
    )
    .option("--description <text>", "Description of visual differences")
    .option("--regression", "Mark as a visual regression")
    .action((opts) => {
      const id = createDiff(opts.baseline, opts.run, opts.current, {
        entryId: opts.entry,
        diffScore: opts.score,
        description: opts.description,
        isRegression: opts.regression ?? false,
      });
      console.log(JSON.stringify({ diffId: id }));
    });

  vis
    .command("list")
    .description("List visual diffs")
    .option("--run <runId>", "Filter by run ID")
    .option("--unreviewed", "Only show unreviewed diffs")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const diffs = opts.unreviewed
        ? getUnreviewedDiffs(opts.run)
        : opts.run
          ? getDiffsByRun(opts.run)
          : getUnreviewedDiffs();

      if (opts.json) {
        console.log(JSON.stringify(diffs));
        return;
      }

      if ((diffs as unknown[]).length === 0) {
        console.log(chalk.green("No visual diffs found."));
        return;
      }

      console.log(
        chalk.bold(`\nVisual Diffs (${(diffs as unknown[]).length}):\n`),
      );
      for (const d of diffs as Array<Record<string, unknown>>) {
        const regTag = d.is_regression ? chalk.red(" [REGRESSION]") : "";
        const reviewTag = d.reviewed
          ? chalk.green(" ✓reviewed")
          : chalk.yellow(" pending");
        const scoreTag =
          d.diff_score != null ? chalk.dim(` (${d.diff_score})`) : "";
        const url = d.url_pattern ?? "";
        console.log(`  ${url}${regTag}${reviewTag}${scoreTag}`);
        if (d.description)
          console.log(`    ${chalk.dim(String(d.description).slice(0, 120))}`);
      }
      console.log();
    });

  vis
    .command("accept <diffId>")
    .description("Accept current screenshot as new baseline (not a regression)")
    .action((diffId) => {
      const newBaselineId = acceptAsNewBaseline(diffId);
      if (!newBaselineId) {
        console.error("Diff not found");
        process.exit(1);
      }
      console.log(JSON.stringify({ accepted: true, newBaselineId }));
    });

  vis
    .command("review <diffId>")
    .description("Mark a diff as reviewed")
    .option("--regression", "Mark as a confirmed regression")
    .option("--ok", "Mark as acceptable (not a regression)")
    .action((diffId, opts) => {
      if (!opts.regression && !opts.ok) {
        console.error("Provide --regression or --ok");
        process.exit(1);
      }
      markDiffReviewed(diffId, opts.regression ?? false);
      console.log(
        JSON.stringify({
          reviewed: true,
          isRegression: opts.regression ?? false,
        }),
      );
    });

  vis
    .command("stats")
    .description("Show visual regression statistics")
    .option("--run <runId>", "Filter by run ID")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const stats = getVisualRegressionStats(opts.run);

      if (opts.json) {
        console.log(JSON.stringify(stats));
        return;
      }

      console.log(chalk.bold("\nVisual Regression Stats:\n"));
      console.log(`  Active baselines:  ${stats.totalBaselines}`);
      console.log(`  Total diffs:       ${stats.totalDiffs}`);
      console.log(
        `  Regressions:       ${stats.regressions > 0 ? chalk.red(String(stats.regressions)) : chalk.green("0")}`,
      );
      console.log(`  Reviewed:          ${stats.reviewed}`);
      console.log(
        `  Unreviewed:        ${stats.unreviewed > 0 ? chalk.yellow(String(stats.unreviewed)) : chalk.green("0")}`,
      );
      console.log();
    });
}
