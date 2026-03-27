import type { Command } from "commander";
import chalk from "chalk";
import {
  createRcaResult,
  getRcaByPack,
  getRcaByEntry,
  getRcaSummary,
  getRcaWithTestCases,
  deleteRcaByPack,
} from "../../db/repositories/rca.js";
import { resolveRunPackId } from "../../db/repositories/runpacks.js";

/** Resolve a short ID prefix to full UUID, exit if not found. */
function resolveId(idOrPrefix: string): string {
  const full = resolveRunPackId(idOrPrefix);
  if (!full) {
    console.error(`Run pack "${idOrPrefix}" not found`);
    process.exit(1);
  }
  return full;
}

export function registerRcaCommands(program: Command): void {
  const rca = program
    .command("rca")
    .description("Root cause analysis — classify failures, track patterns, suggest actions");

  rca
    .command("save")
    .description("Save an RCA result for a failed run pack entry")
    .requiredOption("--pack <id>", "Run pack ID")
    .requiredOption("--entry <id>", "Run pack entry ID")
    .requiredOption("--testcase <id>", "Test case ID")
    .requiredOption(
      "--classification <type>",
      "env_issue | flaky_selector | actual_bug | test_data_issue | network | auth_issue | timeout | unknown"
    )
    .requiredOption("--confidence <n>", "Confidence 0.0–1.0", parseFloat)
    .requiredOption("--cause <text>", "Root cause explanation")
    .option("--evidence <text>", "Summary of evidence examined")
    .option("--pattern <id>", "Link to failure_patterns ID")
    .option(
      "--action <type>",
      "Suggested action: retry | fix_test | fix_app | fix_env | investigate | skip"
    )
    .action((opts) => {
      const packId = resolveId(opts.pack);
      const id = createRcaResult({
        runPackId: packId,
        entryId: opts.entry,
        testCaseId: opts.testcase,
        classification: opts.classification,
        confidence: opts.confidence,
        rootCause: opts.cause,
        evidenceSummary: opts.evidence,
        failurePatternId: opts.pattern,
        suggestedAction: opts.action,
      });
      console.log(JSON.stringify({ rcaId: id }));
    });

  rca
    .command("list")
    .description("List RCA results for a run pack")
    .requiredOption("--pack <id>", "Run pack ID")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const packId = resolveId(opts.pack);
      const results = getRcaWithTestCases(packId);

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if ((results as unknown[]).length === 0) {
        console.log(chalk.dim("No RCA results for this pack."));
        return;
      }

      console.log(chalk.bold("\nRoot Cause Analysis:\n"));
      for (const r of results as Array<Record<string, unknown>>) {
        const classColor =
          r.classification === "actual_bug"
            ? chalk.red
            : r.classification === "env_issue" || r.classification === "network"
              ? chalk.yellow
              : r.classification === "flaky_selector"
                ? chalk.magenta
                : chalk.dim;

        console.log(
          `  ${classColor(String(r.classification).padEnd(16))} ` +
            `${chalk.dim(`(${Math.round(Number(r.confidence) * 100)}%)`)} ${r.tc_title}`
        );
        console.log(`    ${chalk.dim("Cause:")} ${r.root_cause}`);
        if (r.suggested_action) {
          console.log(`    ${chalk.dim("Action:")} ${r.suggested_action}`);
        }
      }
      console.log();
    });

  rca
    .command("summary")
    .description("Show RCA summary counts for a run pack")
    .requiredOption("--pack <id>", "Run pack ID")
    .action((opts) => {
      const packId = resolveId(opts.pack);
      const summary = getRcaSummary(packId);
      console.log(JSON.stringify(summary, null, 2));
    });

  rca
    .command("get <entryId>")
    .description("Get RCA result for a specific run pack entry")
    .action((entryId) => {
      const result = getRcaByEntry(entryId);
      if (!result) {
        console.log(JSON.stringify({ rca: null }));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  rca
    .command("clear")
    .description("Clear all RCA results for a run pack (for re-analysis)")
    .requiredOption("--pack <id>", "Run pack ID")
    .action((opts) => {
      const packId = resolveId(opts.pack);
      const deleted = deleteRcaByPack(packId);
      console.log(JSON.stringify({ cleared: deleted }));
    });
}
