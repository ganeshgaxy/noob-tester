import type { Command } from "commander";
import chalk from "chalk";
import {
  startVisualRun,
  getVisualRun,
  listVisualRuns,
  completeVisualRun,
  createVisualRunEntry,
  updateVisualRunEntry,
  listVisualRunEntries,
  claimNextVisualTestCase,
  recordVisualScreenshot,
  findBaselineScreenshot,
  listVisualScreenshots,
  recordVisualComparison,
  listVisualComparisons,
  getVisualRunSummary,
} from "../../db/repositories/visual-testing.js";

export function registerVisualRunCommands(program: Command): void {
  const vr = program
    .command("visual-run")
    .description(
      "Visual test runs — start, capture screenshots, compare, and complete",
    );

  // ── start ─────────────────────────────────────────────────────────────────
  vr.command("start")
    .description("Start a new visual run (baseline or verification)")
    .requiredOption("--ticket <ticketId>", "Ticket ID")
    .requiredOption("--mode <mode>", "baseline | verification")
    .requiredOption("--target-url <url>", "Target URL being tested")
    .option("--secret-target <name>", "Secret target name")
    .option("--secret-role <role>", "Secret role name")
    .option("--session <sessionId>", "Session ID")
    .action((opts) => {
      const id = startVisualRun({
        ticketId: opts.ticket,
        mode: opts.mode,
        targetUrl: opts.targetUrl,
        secretTarget: opts.secretTarget,
        secretRole: opts.secretRole,
        sessionId: opts.session,
      });
      console.log(JSON.stringify({ visualRunId: id }));
    });

  // ── entry-create ──────────────────────────────────────────────────────────
  vr.command("entry-create")
    .description("Create a run entry for one visual test case")
    .requiredOption("--run <runId>", "Visual run ID")
    .requiredOption("--tc <tcId>", "Visual test case ID")
    .requiredOption("--ticket <ticketId>", "Ticket ID")
    .action((opts) => {
      const id = createVisualRunEntry(opts.run, opts.tc, opts.ticket);
      console.log(JSON.stringify({ entryId: id }));
    });

  // ── entry-update ──────────────────────────────────────────────────────────
  vr.command("entry-update <entryId>")
    .description("Update a run entry status")
    .requiredOption("--status <status>", "running | passed | failed | skipped")
    .option("--result <json>", "JSON result object")
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
      updateVisualRunEntry(
        entryId,
        opts.status,
        opts.result ? JSON.parse(opts.result) : undefined,
        {
          device: opts.device,
          dimension: opts.dimension,
          tracePath: opts.tracePath,
          profilePath: opts.profilePath,
          telemetryConfig: opts.telemetryConfig,
        },
      );
      console.log(JSON.stringify({ updated: true, entryId }));
    });

  // ── capture ───────────────────────────────────────────────────────────────
  vr.command("capture")
    .description("Record a screenshot taken for a visual run step")
    .requiredOption("--run <runId>", "Visual run ID")
    .requiredOption("--tc <tcId>", "Visual test case ID")
    .requiredOption("--ticket <ticketId>", "Ticket ID")
    .requiredOption("--step-index <n>", "Step index (0-based)", parseInt)
    .requiredOption("--step-label <text>", "Step label")
    .requiredOption("--viewport <WxH>", "Viewport (e.g. 1280x720)")
    .requiredOption("--file <path>", "Absolute path to screenshot PNG")
    .requiredOption("--mode <mode>", "baseline | verification")
    .option("--target-url <url>", "URL at capture time")
    .action((opts) => {
      const id = recordVisualScreenshot({
        visualRunId: opts.run,
        visualTcId: opts.tc,
        ticketId: opts.ticket,
        stepIndex: opts.stepIndex,
        stepLabel: opts.stepLabel,
        viewport: opts.viewport,
        filePath: opts.file,
        targetUrl: opts.targetUrl,
        mode: opts.mode,
      });
      console.log(JSON.stringify({ screenshotId: id }));
    });

  // ── find-baseline ─────────────────────────────────────────────────────────
  vr.command("find-baseline")
    .description("Find the matching baseline screenshot for a step fingerprint")
    .requiredOption("--ticket <ticketId>", "Ticket ID")
    .requiredOption("--tc <tcId>", "Visual test case ID")
    .requiredOption("--step-index <n>", "Step index (0-based)", parseInt)
    .requiredOption("--viewport <WxH>", "Viewport")
    .action((opts) => {
      const row = findBaselineScreenshot(
        opts.ticket,
        opts.tc,
        opts.stepIndex,
        opts.viewport,
      );
      if (!row) {
        console.log(JSON.stringify({ found: false }));
      } else {
        console.log(JSON.stringify({ found: true, baseline: row }));
      }
    });

  // ── compare ───────────────────────────────────────────────────────────────
  vr.command("compare")
    .description("Record a diff comparison result for a step")
    .requiredOption("--run <runId>", "Visual run ID")
    .requiredOption("--tc <tcId>", "Visual test case ID")
    .requiredOption("--ticket <ticketId>", "Ticket ID")
    .requiredOption("--step-index <n>", "Step index (0-based)", parseInt)
    .requiredOption("--step-label <text>", "Step label")
    .requiredOption("--viewport <WxH>", "Viewport")
    .requiredOption("--baseline-id <id>", "Baseline screenshot ID")
    .requiredOption("--current-id <id>", "Current screenshot ID")
    .requiredOption("--threshold <n>", "Threshold used", parseFloat)
    .option("--diff-path <path>", "Path to diff PNG produced by agent-browser")
    .option(
      "--diff-score <n>",
      "Pixel diff score 0.0–1.0 from agent-browser",
      parseFloat,
    )
    .option("--passed", "Mark as passed (default: false)")
    .action((opts) => {
      const id = recordVisualComparison({
        visualRunId: opts.run,
        visualTcId: opts.tc,
        ticketId: opts.ticket,
        stepIndex: opts.stepIndex,
        stepLabel: opts.stepLabel,
        viewport: opts.viewport,
        baselineId: opts.baselineId,
        currentId: opts.currentId,
        diffPath: opts.diffPath,
        diffScore: opts.diffScore,
        threshold: opts.threshold,
        passed: opts.passed ?? false,
      });
      console.log(JSON.stringify({ comparisonId: id }));
    });

  // ── claim-next ────────────────────────────────────────────────────────────
  vr.command("claim-next <runId>")
    .description(
      "Claim the next pending visual test case entry in a run (sets it to running). Returns null if none remain.",
    )
    .option(
      "--name <title>",
      "Claim only an entry whose visual test case title contains this string (case-insensitive substring match)",
    )
    .action((runId, opts) => {
      const claimed = claimNextVisualTestCase(runId, { name: opts.name });
      if (!claimed) {
        const msg = opts.name
          ? `No pending entries matching "${opts.name}" in this visual run`
          : "No pending entries in this visual run";
        console.log(JSON.stringify({ claimed: false, message: msg }));
      } else {
        console.log(JSON.stringify({ claimed: true, entry: claimed }));
      }
    });

  // ── complete ──────────────────────────────────────────────────────────────
  vr.command("complete <runId>")
    .description("Mark a visual run as completed and compute summary")
    .action((runId) => {
      const summary = getVisualRunSummary(runId);
      completeVisualRun(runId, summary);
      console.log(JSON.stringify({ completed: true, runId, summary }));
    });

  // ── get ───────────────────────────────────────────────────────────────────
  vr.command("get <runId>")
    .description("Get details of a visual run")
    .option("--entries", "Include run entries")
    .option("--screenshots", "Include screenshots")
    .option("--comparisons", "Include comparisons")
    .action((runId, opts) => {
      const run = getVisualRun(runId) as Record<string, unknown> | null;
      if (!run) {
        console.error(chalk.red(`Visual run not found: ${runId}`));
        process.exit(1);
      }
      if (opts.entries) run.entries = listVisualRunEntries(runId);
      if (opts.screenshots) run.screenshots = listVisualScreenshots(runId);
      if (opts.comparisons) run.comparisons = listVisualComparisons(runId);
      console.log(JSON.stringify(run, null, 2));
    });

  // ── list ──────────────────────────────────────────────────────────────────
  vr.command("list")
    .description("List visual runs for a ticket")
    .requiredOption("--ticket <ticketId>", "Ticket ID")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const runs = listVisualRuns(opts.ticket);

      if (opts.json) {
        console.log(JSON.stringify(runs));
        return;
      }

      if (runs.length === 0) {
        console.log(chalk.yellow("No visual runs found."));
        return;
      }

      console.log(
        chalk.bold(`\nVisual Runs for ${opts.ticket} (${runs.length}):\n`),
      );
      for (const r of runs as Array<Record<string, unknown>>) {
        const modeTag =
          r.mode === "baseline"
            ? chalk.blue("[baseline]")
            : chalk.magenta("[verification]");
        const statusColor =
          r.status === "completed"
            ? chalk.green
            : r.status === "running"
              ? chalk.yellow
              : chalk.red;
        console.log(
          `  ${modeTag} ${chalk.cyan(r.id as string)}  ${statusColor(r.status as string)}  ${r.target_url}  ${chalk.dim(r.created_at as string)}`,
        );
      }
      console.log();
    });
}
