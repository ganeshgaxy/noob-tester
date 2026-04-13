import type { Command } from "commander";
import chalk from "chalk";
import {
  createRunPack,
  addEntry,
  claimNextEntry,
  claimNextNewEntry,
  updateEntryResult,
  addEntryObservation,
  addEntryLog,
  addEntryArtifact,
  getRunPackEntries,
  getRunPacksByTicket,
  getRunPackTicketIds,
  getRunPackEntriesWithTestCases,
  getRunPackMeta,
  populateRunPack,
  resolveRunPack,
  releaseRunPackClaims,
  retryEntry,
  retryByName,
  retryFailed,
  retryAll,
  resolveRunPackId,
  deleteRunPack,
  deleteRunPacksByTicket,
} from "../../db/repositories/runpacks.js";
import {
  markForAutoRetry,
  classifyRetryResult,
  getFalsePositiveStats,
} from "../../db/repositories/false-positives.js";

/** Resolve a short ID prefix to full UUID, exit if not found. */
function resolveId(idOrPrefix: string): string {
  const full = resolveRunPackId(idOrPrefix);
  if (!full) {
    console.error(`Run pack "${idOrPrefix}" not found`);
    process.exit(1);
  }
  return full;
}

export function registerRunPackCommands(program: Command): void {
  const rp = program
    .command("runpack")
    .description(
      "Manage run packs — create, claim, execute, and track test runs per ticket",
    );

  rp.command("create")
    .description("Create an empty run pack for a ticket")
    .requiredOption("--ticket <id>", "Ticket ID (e.g. FEAT-7679)")
    .requiredOption("--run <runId>", "Run ID to associate with")
    .option("--session <sessionId>", "Session ID")
    .option("--target-url <url>", "Target URL to test")
    .option(
      "--secret-target <name>",
      "Secret target name for login credentials",
    )
    .option(
      "--secret-role <role>",
      "Secret role within the target (default: default)",
    )
    .option(
      "--capture <types>",
      "Comma-separated capture types: screenshot,snapshot,video,har,console,trace",
    )
    .action((opts) => {
      const captureConfig = opts.capture
        ? (opts.capture as string).split(",").map((s: string) => s.trim())
        : undefined;
      const runPackId = createRunPack({
        ticketId: opts.ticket,
        runId: opts.run,
        sessionId: opts.session,
        targetUrl: opts.targetUrl,
        secretTarget: opts.secretTarget,
        secretRole: opts.secretRole,
        captureConfig,
      });
      const result: Record<string, unknown> = {
        runPackId,
        ticketId: opts.ticket,
        runId: opts.run,
      };
      if (opts.targetUrl) result.targetUrl = opts.targetUrl;
      if (opts.secretTarget) result.secretTarget = opts.secretTarget;
      if (captureConfig) result.capture = captureConfig;
      console.log(JSON.stringify(result));
    });

  rp.command("meta <runPackId>")
    .description("Get run pack metadata (target, credentials, capture config)")
    .action((runPackIdArg) => {
      const runPackId = resolveId(runPackIdArg);
      const meta = getRunPackMeta(runPackId);
      if (!meta) {
        console.error(`Run pack ${runPackIdArg} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify(meta));
    });

  rp.command("resolve")
    .description(
      "Resume an existing run pack or create a new one (default: resume-first)",
    )
    .requiredOption("--ticket <id>", "Ticket ID")
    .requiredOption("--run <runId>", "Run ID")
    .option("--session <sessionId>", "Session ID")
    .option("--target-url <url>", "Target URL (used when creating new)")
    .option(
      "--secret-target <name>",
      "Secret target name (used when creating new)",
    )
    .option("--secret-role <role>", "Secret role (used when creating new)")
    .option(
      "--capture <types>",
      "Comma-separated capture types (used when creating new)",
    )
    .option("--fresh", "Force create a new pack, skip resume check")
    .action((opts) => {
      const captureConfig = opts.capture
        ? (opts.capture as string).split(",").map((s: string) => s.trim())
        : undefined;
      const result = resolveRunPack(opts.ticket, {
        runId: opts.run,
        sessionId: opts.session,
        targetUrl: opts.targetUrl,
        secretTarget: opts.secretTarget,
        secretRole: opts.secretRole,
        captureConfig,
        fresh: opts.fresh,
      });
      const meta = getRunPackMeta(result.runPackId);
      console.log(
        JSON.stringify({
          runPackId: result.runPackId,
          resumed: result.resumed,
          ticketId: opts.ticket,
          targetUrl: meta?.target_url ?? opts.targetUrl ?? null,
          secretTarget: meta?.secret_target ?? opts.secretTarget ?? null,
        }),
      );
    });

  rp.command("add <runPackId> <testCaseId>")
    .description("Add a specific test case to a run pack")
    .option("--run <runId>", "Override run ID for this entry")
    .option("--session <sessionId>", "Session ID")
    .action((rpId, testCaseId, opts) => {
      const runPackId = resolveId(rpId);
      const entry = addEntry(runPackId, testCaseId, {
        runId: opts.run,
        sessionId: opts.session,
      });
      if (!entry) {
        console.log(
          JSON.stringify({
            added: false,
            message: "Test case already in pack or pack not found",
          }),
        );
      } else {
        console.log(JSON.stringify({ added: true, entryId: entry.id }));
      }
    });

  rp.command("claim <runPackId> <sessionId>")
    .description("Claim the next pending entry already in the run pack")
    .option(
      "--name <title>",
      "Claim only an entry whose test case title contains this string (case-insensitive substring match)",
    )
    .action((rpId, sessionId, opts) => {
      const runPackId = resolveId(rpId);
      const entry = claimNextEntry(runPackId, sessionId, { name: opts.name });
      if (!entry) {
        const msg = opts.name
          ? `No pending entries matching "${opts.name}" in this run pack`
          : "No pending entries in this run pack";
        console.log(JSON.stringify({ claimed: null, message: msg }));
      } else {
        console.log(JSON.stringify(entry));
      }
    });

  rp.command("claim-next <runPackId> <ticketId> <sessionId>")
    .description(
      "Pick the next test case not yet in the pack, add it, and claim it (used by noob-explore and noob-api-explore)",
    )
    .option("--run <runId>", "Override run ID for this entry")
    .option(
      "--layer <layer>",
      "Filter by test layer: ui | api | ui_api | database | ai | unit | other",
    )
    .option(
      "--runner <runner>",
      "Runner type: ui | api (auto-detected from layer if omitted)",
    )
    .option(
      "--risk",
      "Order by risk score (highest risk first) instead of priority",
    )
    .option(
      "--name <title>",
      "Claim only a test case whose title contains this string (case-insensitive substring match)",
    )
    .action((rpId, ticketId, sessionId, opts) => {
      const runPackId = resolveId(rpId);
      const entry = claimNextNewEntry(runPackId, ticketId, sessionId, {
        runId: opts.run,
        layer: opts.layer,
        runner: opts.runner,
        riskBased: opts.risk ?? false,
        name: opts.name,
      });
      if (!entry) {
        const msg = opts.name
          ? `No unclaimed test cases matching "${opts.name}" in this run pack`
          : "All test cases are already in the run pack";
        console.log(JSON.stringify({ claimed: null, message: msg }));
      } else {
        console.log(JSON.stringify(entry));
      }
    });

  rp.command("populate <runPackId> <ticketId>")
    .description(
      "Add ALL ready test cases to the pack with a given status (e.g. blocked on login failure)",
    )
    .requiredOption("--status <status>", "pending | blocked | skipped")
    .option(
      "--reason <text>",
      "Reason for the status (e.g. 'Login failed: invalid credentials')",
    )
    .option("--run <runId>", "Run ID")
    .option("--session <sessionId>", "Session ID")
    .option(
      "--layer <layer>",
      "Only add test cases with this layer: ui | api | ui_api | etc.",
    )
    .option("--runner <runner>", "Set runner type on added entries: ui | api")
    .action((rpId, ticketId, opts) => {
      const runPackId = resolveId(rpId);
      const count = populateRunPack(runPackId, ticketId, opts.status, {
        runId: opts.run,
        sessionId: opts.session,
        reason: opts.reason,
        layer: opts.layer,
        runner: opts.runner,
      });
      console.log(
        JSON.stringify({
          populated: count,
          status: opts.status,
          layer: opts.layer ?? "all",
        }),
      );
    });

  rp.command("result <entryId>")
    .description("Record the execution result for a run pack entry")
    .requiredOption("--status <status>", "passed | failed | skipped | blocked")
    .option("--results <json>", "Execution result details as JSON")
    .option("--logs <json>", "Execution logs as JSON")
    .option("--observations <json>", "Observations as JSON")
    .option("--issues <json>", "Issues found as JSON")
    .option("--device <device>", "Browser device type (default: web)")
    .option(
      "--dimension <dimension>",
      "Viewport dimension preset (default: standard)",
    )
    .option("--trace-path <path>", "Path to the saved Playwright trace file")
    .option("--profile-path <path>", "Path to the saved CPU profile file")
    .option(
      "--telemetry-config <json>",
      "Telemetry configuration as JSON (trace, profiler, console, errors flags)",
    )
    .action((entryId, opts) => {
      updateEntryResult(entryId, opts.status, {
        results: opts.results,
        logs: opts.logs,
        observations: opts.observations,
        issues: opts.issues,
        device: opts.device,
        dimension: opts.dimension,
        tracePath: opts.tracePath,
        profilePath: opts.profilePath,
        telemetryConfig: opts.telemetryConfig,
      });
      console.log(JSON.stringify({ updated: true }));
    });

  rp.command("artifact <entryId>")
    .description(
      "Attach an artifact (screenshot, snapshot, video, HAR, console, trace) to a run pack entry",
    )
    .requiredOption(
      "--type <type>",
      "screenshot | snapshot | video | har | console | trace",
    )
    .requiredOption("--path <filePath>", "Path to artifact file")
    .option(
      "--label <text>",
      "Human-readable label (e.g. 'After login', 'Step 3 failure')",
    )
    .option("--step <n>", "Step number this artifact belongs to", parseInt)
    .option("--metadata <json>", "Extra JSON metadata")
    .action((entryId, opts) => {
      addEntryArtifact(entryId, {
        type: opts.type,
        path: opts.path,
        label: opts.label,
        step: opts.step,
        metadata: opts.metadata ? JSON.parse(opts.metadata) : undefined,
      });
      console.log(JSON.stringify({ added: true }));
    });

  rp.command("observe <entryId>")
    .description("Add an observation to a run pack entry")
    .requiredOption("--text <text>", "Observation text")
    .action((entryId, opts) => {
      addEntryObservation(entryId, opts.text);
      console.log(JSON.stringify({ added: true }));
    });

  rp.command("log <entryId>")
    .description("Add a log entry to a run pack entry")
    .requiredOption("--text <text>", "Log text")
    .action((entryId, opts) => {
      addEntryLog(entryId, opts.text);
      console.log(JSON.stringify({ added: true }));
    });

  rp.command("list")
    .description("List run packs")
    .option("--ticket <id>", "Filter by ticket ID")
    .option("--pack <runPackId>", "Show entries for a specific run pack")
    .option("--json", "Output as JSON")
    .action((opts) => {
      if (opts.pack) {
        const packId = resolveId(opts.pack);
        const entries = opts.json
          ? getRunPackEntries(packId)
          : getRunPackEntriesWithTestCases(packId);
        if (opts.json) {
          console.log(JSON.stringify(entries));
          return;
        }
        if ((entries as unknown[]).length === 0) {
          console.log(chalk.dim("No entries in this run pack."));
          return;
        }
        console.log(chalk.bold(`\nRun Pack ${packId.slice(0, 8)}\n`));
        for (const e of entries as Array<Record<string, unknown>>) {
          const statusColor =
            e.status === "passed"
              ? chalk.green
              : e.status === "failed"
                ? chalk.red
                : e.status === "claimed"
                  ? chalk.yellow
                  : chalk.dim;
          console.log(
            `  ${statusColor((e.status as string).padEnd(8))} ${e.tc_title || e.test_case_id}`,
          );
        }
        console.log();
        return;
      }

      if (opts.ticket) {
        const packs = getRunPacksByTicket(opts.ticket);
        if (opts.json) {
          console.log(JSON.stringify(packs));
          return;
        }
        if ((packs as unknown[]).length === 0) {
          console.log(chalk.dim(`No run packs for ${opts.ticket}.`));
          return;
        }
        console.log(chalk.bold(`\nRun Packs for ${opts.ticket}\n`));
        for (const p of packs as Array<Record<string, unknown>>) {
          const id = (p.run_pack_id as string).slice(0, 8);
          console.log(
            `  ${chalk.blue(id)} ${chalk.green(`${p.passed}P`)} ${chalk.red(`${p.failed}F`)} ${chalk.dim(`${p.pending}pend`)} ${chalk.dim(`total:${p.total}`)} ${chalk.dim(p.created_at as string)}`,
          );
        }
        console.log();
        return;
      }

      const tickets = getRunPackTicketIds();
      if (opts.json) {
        console.log(JSON.stringify(tickets));
        return;
      }
      if ((tickets as unknown[]).length === 0) {
        console.log(chalk.dim("No run packs found."));
        return;
      }
      console.log(chalk.bold("\nRun Packs by Ticket\n"));
      for (const j of tickets as Array<Record<string, unknown>>) {
        console.log(
          `  ${chalk.blue(j.ticket_id as string).padEnd(20)} ${chalk.dim(`${j.pack_count} packs`)} ${chalk.green(`${j.passed}P`)} ${chalk.red(`${j.failed}F`)} ${chalk.dim(`${j.pending}pend`)} ${chalk.dim(`last: ${j.last_run}`)}`,
        );
      }
      console.log();
    });

  rp.command("release <runPackId>")
    .description("Release all claimed entries in a run pack back to pending")
    .action((rpId) => {
      const runPackId = resolveId(rpId);
      const count = releaseRunPackClaims(runPackId);
      console.log(JSON.stringify({ released: count }));
    });

  rp.command("retry")
    .description("Reset entries back to pending for rerun")
    .option("--entry <entryId>", "Retry a specific entry by ID")
    .option(
      "--name <text>",
      "Retry entries matching test case name (substring match, requires --pack)",
    )
    .option(
      "--pack <runPackId>",
      "Target run pack (with --name: retry by name; alone: retry all failed/blocked)",
    )
    .option(
      "--all <runPackId>",
      "Retry ALL entries in a pack (including passed)",
    )
    .action((opts) => {
      if (opts.entry) {
        const ok = retryEntry(opts.entry);
        console.log(JSON.stringify({ retried: ok }));
      } else if (opts.name && opts.pack) {
        const packId = resolveId(opts.pack);
        const count = retryByName(packId, opts.name);
        console.log(JSON.stringify({ retried: count, name: opts.name }));
      } else if (opts.all) {
        const packId = resolveId(opts.all);
        const count = retryAll(packId);
        console.log(JSON.stringify({ retried: count, mode: "all" }));
      } else if (opts.pack) {
        const packId = resolveId(opts.pack);
        const count = retryFailed(packId);
        console.log(JSON.stringify({ retried: count, mode: "failed" }));
      } else {
        console.error("Provide --entry, --name --pack, --pack, or --all");
        process.exit(1);
      }
    });

  rp.command("delete")
    .description("Delete run pack entries")
    .option("--pack <runPackId>", "Delete a specific run pack")
    .option("--ticket <id>", "Delete all run packs for a ticket")
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      if (!opts.pack && !opts.ticket) {
        console.error("Provide --pack or --ticket to delete");
        process.exit(1);
      }
      const packId = opts.pack ? resolveId(opts.pack) : null;
      if (!opts.yes) {
        const target = packId
          ? `run pack ${packId.slice(0, 8)}`
          : `all run packs for ${opts.ticket}`;
        console.log(
          chalk.yellow(
            `This will delete ${target}. Run with --yes to confirm.`,
          ),
        );
        return;
      }
      if (packId) {
        const count = deleteRunPack(packId);
        console.log(chalk.green(`Deleted ${count} entry(ies) from run pack.`));
      } else {
        const count = deleteRunPacksByTicket(opts.ticket);
        console.log(
          chalk.green(`Deleted ${count} entry(ies) for ${opts.ticket}.`),
        );
      }
    });

  // ── False Positive Reduction ──

  rp.command("auto-retry <runPackId>")
    .description(
      "Mark all failed/blocked entries for auto-retry (max 1 retry per entry)",
    )
    .action((runPackIdArg) => {
      const runPackId = resolveId(runPackIdArg);
      const count = markForAutoRetry(runPackId);
      console.log(JSON.stringify({ retriedEntries: count }));
    });

  rp.command("classify-retry <entryId>")
    .description(
      "Classify a retried entry result (likely_false_positive or confirmed failure)",
    )
    .requiredOption(
      "--status <status>",
      "Retry result: passed | failed | blocked",
    )
    .action((entryId, opts) => {
      const confidence = classifyRetryResult(entryId, opts.status);
      console.log(JSON.stringify({ entryId, confidence }));
    });

  rp.command("false-positives <runPackId>")
    .description("Show false positive analysis for a run pack")
    .option("--json", "Output as JSON")
    .action((runPackIdArg, opts) => {
      const runPackId = resolveId(runPackIdArg);
      const stats = getFalsePositiveStats(runPackId);

      if (opts.json) {
        console.log(JSON.stringify(stats));
        return;
      }

      console.log(chalk.bold("\nFalse Positive Analysis\n"));
      console.log(`  Total failed:        ${stats.totalFailed}`);
      console.log(`  Retried:             ${stats.retried}`);
      console.log(
        `  False positives:     ${chalk.yellow(String(stats.falsePositives))}`,
      );
      console.log(
        `  Confirmed failures:  ${chalk.red(String(stats.confirmedFailures))}`,
      );
      if (Object.keys(stats.byConfidence).length > 0) {
        console.log(chalk.bold("\n  By confidence:"));
        for (const [conf, count] of Object.entries(stats.byConfidence)) {
          const color =
            conf === "likely_false_positive"
              ? chalk.yellow
              : conf === "high"
                ? chalk.red
                : conf === "low"
                  ? chalk.green
                  : chalk.dim;
          console.log(`    ${color(conf.padEnd(24))} ${count}`);
        }
      }
      console.log();
    });
}
