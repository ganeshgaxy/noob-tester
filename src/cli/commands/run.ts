import type { Command } from "commander";
import {
  createRun,
  resolveRun,
  updateRunPhase,
  completeRun,
  getRun,
} from "../../db/repositories/runs.js";
import { getDb } from "../../db/client.js";

export function registerRunCommands(program: Command): void {
  const run = program.command("run").description("Manage test runs");

  run
    .command("create")
    .description("Create a new test run")
    .requiredOption(
      "--input-type <type>",
      "Input type: ticket | confluence | text | file",
    )
    .requiredOption(
      "--input-ref <ref>",
      "Input reference (ticket key, page id, text, path)",
    )
    .option("--input-full <text>", "Full input text (defaults to input-ref)")
    .option("--target-url <url>", "Base URL of the application to test")
    .option("--repo <url...>", "GitLab repo URL(s) to analyze (repeatable)")
    .option(
      "--reuse-run <runId>",
      "Reuse analysis/plan from a prior run (skip Phase 1 & 2)",
    )
    .option("--fresh", "Ignore all prior data, start from scratch")
    .option(
      "--force",
      "Override existing data — regenerate analysis/plan/testcases even if they exist for this ticket",
    )
    .option(
      "--capture <types>",
      "Comma-separated capture types: screenshot,snapshot,video,har,console,trace (default: all)",
    )
    .option(
      "--secret-target <name>",
      "Secret target name for login credentials",
    )
    .option(
      "--secret-role <role>",
      "Secret role within the target (default: default)",
    )
    .option("--config <json>", "Extra config as JSON", "{}")
    .action((opts) => {
      const config = {
        targetUrl: opts.targetUrl,
        repos: opts.repo ?? [],
        reuseRunId: opts.reuseRun ?? null,
        fresh: opts.fresh ?? false,
        force: opts.force ?? false,
        capture: opts.capture
          ? (opts.capture as string).split(",").map((s: string) => s.trim())
          : undefined,
        secretTarget: opts.secretTarget ?? undefined,
        secretRole: opts.secretRole ?? undefined,
        ...JSON.parse(opts.config),
      };

      const id = createRun(
        config,
        opts.inputType,
        opts.inputRef,
        opts.inputFull ?? opts.inputRef,
      );

      // Link to prior run if reusing
      if (opts.reuseRun && !opts.fresh) {
        getDb()
          .prepare("UPDATE runs SET reuse_run_id = ? WHERE id = ?")
          .run(opts.reuseRun, id);
      }

      const result: Record<string, unknown> = { runId: id };
      if (opts.reuseRun && !opts.fresh) {
        result.reusingFrom = opts.reuseRun;
        result.skipPhases = [1, 2];
      }
      if (opts.fresh) {
        result.fresh = true;
      }
      if (opts.force) {
        result.force = true;
      }
      if (config.capture) {
        result.capture = config.capture;
      }
      if (config.secretTarget) {
        result.secretTarget = config.secretTarget;
        result.secretRole = config.secretRole ?? "default";
      }

      console.log(JSON.stringify(result));
    });

  run
    .command("resolve")
    .description("Resume an existing running/pending run or create a new one")
    .requiredOption(
      "--input-type <type>",
      "Input type: ticket | confluence | text | file",
    )
    .requiredOption(
      "--input-ref <ref>",
      "Input reference (ticket key, page id, text, path)",
    )
    .option("--input-full <text>", "Full input text (defaults to input-ref)")
    .option("--target-url <url>", "Base URL of the application to test")
    .option("--repo <url...>", "GitLab repo URL(s) (repeatable)")
    .option("--capture <types>", "Comma-separated capture types")
    .option("--secret-target <name>", "Secret target name")
    .option("--secret-role <role>", "Secret role")
    .option("--fresh", "Force create a new run, skip resume check")
    .option("--config <json>", "Extra config as JSON", "{}")
    .action((opts) => {
      const config = {
        targetUrl: opts.targetUrl,
        repos: opts.repo ?? [],
        capture: opts.capture
          ? (opts.capture as string).split(",").map((s: string) => s.trim())
          : undefined,
        secretTarget: opts.secretTarget ?? undefined,
        secretRole: opts.secretRole ?? undefined,
        ...JSON.parse(opts.config),
      };

      const { runId, resumed } = resolveRun(
        config,
        opts.inputType,
        opts.inputRef,
        opts.inputFull ?? opts.inputRef,
        { fresh: opts.fresh },
      );

      const result: Record<string, unknown> = { runId, resumed };
      if (config.capture) result.capture = config.capture;
      if (config.secretTarget) result.secretTarget = config.secretTarget;
      console.log(JSON.stringify(result));
    });

  run
    .command("update <runId>")
    .description("Update a run's phase or status")
    .option("--phase <n>", "Set current phase", parseInt)
    .option("--status <status>", "Set status")
    .action((runId, opts) => {
      if (opts.phase) updateRunPhase(runId, opts.phase);
      if (opts.status) completeRun(runId, opts.status);
      const r = getRun(runId);
      console.log(JSON.stringify(r));
    });

  run
    .command("complete <runId>")
    .description("Mark a run as completed or failed")
    .requiredOption("--status <status>", "completed | failed")
    .option("--summary <text>", "Run summary")
    .action((runId, opts) => {
      completeRun(runId, opts.status, opts.summary);
      const r = getRun(runId);
      console.log(JSON.stringify(r));
    });

  run
    .command("get <runId>")
    .description("Get run details as JSON")
    .action((runId) => {
      const r = getRun(runId);
      if (!r) {
        console.error(`Run ${runId} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify(r));
    });
}
