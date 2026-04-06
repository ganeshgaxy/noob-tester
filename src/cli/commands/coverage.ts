import type { Command } from "commander";
import chalk from "chalk";
import {
  populateCoverageFromTestCases,
  getUncoveredFiles,
  getCoverageByFile,
  getCoverageStats,
  clearCoverageMap,
} from "../../db/repositories/coverage-map.js";
import { updateCoverageStats } from "../../db/repositories/resource-stats.js";

export function registerCoverageCommands(program: Command): void {
  const cov = program
    .command("coverage")
    .description(
      "Code-level coverage mapping — link test cases to source files, find gaps",
    );

  cov
    .command("build <repoName>")
    .description(
      "Build coverage map from test case impacted_files + import graph expansion",
    )
    .action((repoName) => {
      const result = populateCoverageFromTestCases(repoName);
      try {
        updateCoverageStats(repoName);
      } catch {}
      console.log(
        JSON.stringify({
          repo: repoName,
          directLinks: result.directLinks,
          expandedLinks: result.expandedLinks,
          totalLinks: result.directLinks + result.expandedLinks,
        }),
      );
    });

  cov
    .command("stats <repoName>")
    .description("Show coverage statistics for a repo")
    .option("--json", "Output as JSON")
    .action((repoName, opts) => {
      const stats = getCoverageStats(repoName);

      if (opts.json) {
        console.log(JSON.stringify(stats));
        return;
      }

      console.log(chalk.bold("\nCoverage Stats: ") + repoName);
      console.log(`  Total files:    ${stats.totalFiles}`);
      console.log(
        `  Covered:        ${chalk.green(String(stats.coveredFiles))}`,
      );
      console.log(
        `  Uncovered:      ${chalk.red(String(stats.uncoveredFiles))}`,
      );
      const covColor =
        stats.coveragePercent >= 70
          ? chalk.green
          : stats.coveragePercent >= 40
            ? chalk.yellow
            : chalk.red;
      console.log(`  Coverage:       ${covColor(`${stats.coveragePercent}%`)}`);
      console.log(`  Direct links:   ${stats.directLinks}`);
      console.log(`  Expanded links: ${stats.expandedLinks}`);
      console.log();
    });

  cov
    .command("uncovered <repoName>")
    .description("List source files with no test case coverage")
    .option("--limit <n>", "Limit results", parseInt)
    .option("--json", "Output as JSON")
    .action((repoName, opts) => {
      let files = getUncoveredFiles(repoName);
      if (opts.limit) files = files.slice(0, opts.limit);

      if (opts.json) {
        console.log(JSON.stringify(files));
        return;
      }

      if (files.length === 0) {
        console.log(chalk.green("All indexed files have test case coverage."));
        return;
      }

      console.log(chalk.bold(`\nUncovered Files (${files.length}):\n`));
      for (const f of files) {
        const importerTag =
          f.importer_count > 0
            ? chalk.yellow(` (${f.importer_count} importers)`)
            : "";
        console.log(`  ${chalk.red("✗")} ${f.file_path}${importerTag}`);
      }
      console.log();
    });

  cov
    .command("file <repoName> <filePath>")
    .description("Show which test cases cover a specific file")
    .option("--json", "Output as JSON")
    .action((repoName, filePath, opts) => {
      const links = getCoverageByFile(repoName, filePath);

      if (opts.json) {
        console.log(JSON.stringify(links));
        return;
      }

      if (links.length === 0) {
        console.log(chalk.dim(`No test cases cover ${filePath}`));
        return;
      }

      console.log(chalk.bold(`\nTest cases covering ${filePath}:\n`));
      for (const l of links) {
        const confTag =
          l.confidence < 1.0
            ? chalk.dim(` (${l.link_type}, ${Math.round(l.confidence * 100)}%)`)
            : "";
        console.log(`  ${chalk.green("✓")} ${l.title} [${l.type}]${confTag}`);
      }
      console.log();
    });

  cov
    .command("clear <repoName>")
    .description(
      "Clear coverage map for a repo (rebuild with 'coverage build')",
    )
    .action((repoName) => {
      const deleted = clearCoverageMap(repoName);
      console.log(JSON.stringify({ cleared: deleted }));
    });
}
