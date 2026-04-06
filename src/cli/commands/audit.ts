import type { Command } from "commander";
import chalk from "chalk";
import {
  auditReport,
  findDuplicates,
  findNeverFailed,
  findOrphaned,
  findStale,
} from "../../db/repositories/test-audit.js";

export function registerAuditCommands(testcaseCmd: Command): void {
  testcaseCmd
    .command("audit")
    .description(
      "Audit test suite — find duplicates, never-failed, orphaned, and stale test cases",
    )
    .option("--ticket <ref>", "Scope to a specific ticket")
    .option("--duplicates", "Only show near-duplicate test cases")
    .option("--never-failed", "Only show test cases that have never failed")
    .option(
      "--orphaned",
      "Only show test cases with no recent activity (across all tickets)",
    )
    .option("--stale", "Only show test cases not executed in 30+ days")
    .option(
      "--threshold <n>",
      "Similarity threshold for duplicates (0.0-1.0, default: 0.65)",
      parseFloat,
    )
    .option("--json", "Output as JSON")
    .action((opts) => {
      // Single-mode shortcuts
      if (opts.duplicates) {
        const dupes = findDuplicates(opts.ticket, opts.threshold ?? 0.65);
        if (opts.json) {
          console.log(JSON.stringify(dupes));
          return;
        }
        printDuplicates(dupes);
        return;
      }
      if (opts.neverFailed) {
        const nf = findNeverFailed(opts.ticket);
        if (opts.json) {
          console.log(JSON.stringify(nf));
          return;
        }
        printNeverFailed(nf);
        return;
      }
      if (opts.orphaned) {
        const orphans = findOrphaned();
        if (opts.json) {
          console.log(JSON.stringify(orphans));
          return;
        }
        printOrphaned(orphans);
        return;
      }
      if (opts.stale) {
        const staleList = findStale(30, opts.ticket);
        if (opts.json) {
          console.log(JSON.stringify(staleList));
          return;
        }
        printStale(staleList);
        return;
      }

      // Full audit
      const report = auditReport(opts.ticket);

      if (opts.json) {
        console.log(JSON.stringify(report));
        return;
      }

      const scope = opts.ticket ? `ticket ${opts.ticket}` : "all tickets";
      console.log(chalk.bold(`\nTest Case Audit — ${scope}\n`));
      console.log(`  Total test cases:  ${report.stats.total}`);
      console.log(
        `  Duplicates:        ${report.stats.duplicateCount > 0 ? chalk.yellow(String(report.stats.duplicateCount)) : chalk.green("0")} pairs`,
      );
      console.log(
        `  Never failed:      ${report.stats.neverFailedCount > 0 ? chalk.yellow(String(report.stats.neverFailedCount)) : chalk.green("0")}`,
      );
      console.log(
        `  Orphaned:          ${report.stats.orphanedCount > 0 ? chalk.yellow(String(report.stats.orphanedCount)) : chalk.green("0")}`,
      );
      console.log(
        `  Stale (30+ days):  ${report.stats.staleCount > 0 ? chalk.yellow(String(report.stats.staleCount)) : chalk.green("0")}`,
      );

      if (report.duplicates.length > 0) {
        console.log();
        printDuplicates(report.duplicates.slice(0, 10));
      }
      if (report.neverFailed.length > 0) {
        console.log();
        printNeverFailed(report.neverFailed.slice(0, 10));
      }
      if (report.orphaned.length > 0) {
        console.log();
        printOrphaned(report.orphaned.slice(0, 10));
      }
      if (report.stale.length > 0) {
        console.log();
        printStale(report.stale.slice(0, 10));
      }
      console.log();
    });
}

function printDuplicates(
  dupes: Array<{
    testCaseA: { title: string };
    testCaseB: { title: string };
    similarity: number;
  }>,
) {
  console.log(chalk.bold("  Near-Duplicate Pairs:"));
  for (const d of dupes) {
    console.log(
      `    ${chalk.yellow(`${Math.round(d.similarity * 100)}%`)} ${d.testCaseA.title}`,
    );
    console.log(`    ${chalk.dim("  ≈")} ${d.testCaseB.title}`);
  }
}

function printNeverFailed(
  items: Array<{ title: string; execution_count: number }>,
) {
  console.log(chalk.bold("  Never-Failed Test Cases:"));
  for (const nf of items) {
    console.log(
      `    ${chalk.dim(`${nf.execution_count}× executed`)} ${nf.title}`,
    );
  }
}

function printOrphaned(items: Array<{ title: string; ticket_ref: string }>) {
  console.log(chalk.bold("  Orphaned (no activity in 90 days):"));
  for (const o of items) {
    console.log(`    ${chalk.dim(o.ticket_ref)} ${o.title}`);
  }
}

function printStale(items: Array<{ title: string; days_since: number }>) {
  console.log(chalk.bold("  Stale (30+ days since execution):"));
  for (const s of items) {
    console.log(`    ${chalk.dim(`${s.days_since}d ago`)} ${s.title}`);
  }
}
