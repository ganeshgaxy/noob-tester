import type { Command } from "commander";
import chalk from "chalk";
import {
  storeA11yIssue,
  storeAxeViolations,
  getA11yByRun,
  getA11yByPack,
  getA11yByPage,
  getA11ySummary,
  getA11yPackStats,
} from "../../db/repositories/a11y.js";

export function registerA11yCommands(program: Command): void {
  const a11y = program
    .command("a11y")
    .description(
      "Accessibility testing — store axe-core results, track WCAG violations",
    );

  a11y
    .command("scan <runId>")
    .description("Store axe-core violations JSON for a page")
    .requiredOption("--url <pageUrl>", "Page URL that was scanned")
    .requiredOption("--results <json>", "JSON array of axe-core violations")
    .option("--pack <id>", "Run pack ID")
    .option("--entry <id>", "Run pack entry ID")
    .option("--page-id <id>", "UI map page ID")
    .action((runId, opts) => {
      let violations: Array<Record<string, unknown>>;
      try {
        violations = JSON.parse(opts.results);
      } catch {
        console.error("Invalid JSON in --results");
        process.exit(1);
      }

      if (!Array.isArray(violations)) {
        console.error("--results must be a JSON array");
        process.exit(1);
      }

      const count = storeAxeViolations(runId, opts.url, violations, {
        runPackId: opts.pack,
        entryId: opts.entry,
        uiMapPageId: opts.pageId,
      });
      console.log(JSON.stringify({ stored: count, url: opts.url }));
    });

  a11y
    .command("add <runId>")
    .description("Store a single accessibility issue")
    .requiredOption("--url <pageUrl>", "Page URL")
    .requiredOption("--rule <ruleId>", "Axe rule ID (e.g. color-contrast)")
    .requiredOption("--impact <level>", "critical | serious | moderate | minor")
    .requiredOption("--description <text>", "Issue description")
    .option("--wcag <criteria>", "WCAG criteria (e.g. 1.4.3)")
    .option("--level <level>", "WCAG level: A | AA | AAA")
    .option("--html <snippet>", "HTML snippet of the element")
    .option("--selector <sel>", "CSS selector of the element")
    .option("--help-url <url>", "URL with remediation guidance")
    .option("--pack <id>", "Run pack ID")
    .option("--entry <id>", "Run pack entry ID")
    .option("--page-id <id>", "UI map page ID")
    .action((runId, opts) => {
      const id = storeA11yIssue({
        runId,
        pageUrl: opts.url,
        ruleId: opts.rule,
        impact: opts.impact,
        description: opts.description,
        wcagCriteria: opts.wcag,
        wcagLevel: opts.level,
        htmlSnippet: opts.html,
        selector: opts.selector,
        helpUrl: opts.helpUrl,
        runPackId: opts.pack,
        entryId: opts.entry,
        uiMapPageId: opts.pageId,
      });
      console.log(JSON.stringify({ a11yIssueId: id }));
    });

  a11y
    .command("list")
    .description("List accessibility issues")
    .option("--run <runId>", "Filter by run ID")
    .option("--pack <runPackId>", "Filter by run pack ID")
    .option("--page <url>", "Filter by page URL")
    .option("--json", "Output as JSON")
    .action((opts) => {
      if (!opts.run && !opts.pack && !opts.page) {
        console.error("Provide --run, --pack, or --page to filter");
        process.exit(1);
      }

      const issues = opts.run
        ? getA11yByRun(opts.run)
        : opts.pack
          ? getA11yByPack(opts.pack)
          : getA11yByPage(opts.page);

      if (opts.json) {
        console.log(JSON.stringify(issues));
        return;
      }

      if (issues.length === 0) {
        console.log(chalk.green("No accessibility issues found."));
        return;
      }

      const impactColor = (impact: string) =>
        impact === "critical"
          ? chalk.red
          : impact === "serious"
            ? chalk.yellow
            : impact === "moderate"
              ? chalk.cyan
              : chalk.dim;

      console.log(chalk.bold(`\nAccessibility Issues (${issues.length}):\n`));
      for (const issue of issues) {
        console.log(
          `  ${impactColor(issue.impact)(issue.impact.padEnd(10))} ` +
            `${chalk.bold(issue.rule_id)} — ${issue.description}`,
        );
        if (issue.selector) {
          console.log(`    ${chalk.dim("Selector:")} ${issue.selector}`);
        }
        if (issue.wcag_criteria) {
          console.log(
            `    ${chalk.dim("WCAG:")} ${issue.wcag_criteria} (Level ${issue.wcag_level ?? "?"})`,
          );
        }
      }
      console.log();
    });

  a11y
    .command("summary <runId>")
    .description("Show accessibility summary for a run")
    .option("--json", "Output as JSON")
    .action((runId, opts) => {
      const summary = getA11ySummary(runId);

      if (opts.json) {
        console.log(JSON.stringify(summary));
        return;
      }

      console.log(chalk.bold("\nAccessibility Summary:\n"));
      console.log(`  Total issues: ${summary.total}`);
      console.log(`  Pages scanned: ${summary.pageCount}`);
      console.log();
      for (const [impact, count] of Object.entries(summary.byImpact)) {
        const color =
          impact === "critical"
            ? chalk.red
            : impact === "serious"
              ? chalk.yellow
              : chalk.dim;
        console.log(`  ${color(impact.padEnd(10))} ${count}`);
      }
      if (summary.byRule.length > 0) {
        console.log(chalk.bold("\n  Top rules:"));
        for (const r of summary.byRule.slice(0, 10)) {
          console.log(`    ${String(r.count).padStart(3)}× ${r.rule_id}`);
        }
      }
      console.log();
    });
}
