import type { Command } from "commander";
import chalk from "chalk";
import {
  createVisualTestCase,
  getVisualTestCase,
  listVisualTestCases,
  updateVisualTestCase,
  archiveVisualTestCase,
} from "../../db/repositories/visual-testing.js";
import type { VisualStep } from "../../db/repositories/visual-testing.js";

export function registerVisualTcCommands(program: Command): void {
  const vtc = program
    .command("visual-tc")
    .description("Manage visual test cases — create, list, update, archive (BDD/traditional with visual steps)");

  // ── create ────────────────────────────────────────────────────────────────
  vtc
    .command("create")
    .description("Create a visual test case for a ticket")
    .requiredOption("--ticket <ticketId>", "Ticket ID (e.g. PROJ-123)")
    .requiredOption("--title <text>", "Test case title")
    .requiredOption("--type <type>", "direct_functional | impact_regression | general_regression")
    .requiredOption("--format <format>", "bdd | traditional")
    .requiredOption("--viewport <WxH>", "Viewport (e.g. 1280x720)")
    .requiredOption("--threshold <n>", "Default diff threshold 0.0–1.0", parseFloat)
    .option("--description <text>", "Optional description")
    // BDD options
    .option("--bdd-feature <text>", "Feature name (for BDD)")
    .option("--bdd-scenario <text>", "Scenario name (for BDD)")
    .option("--bdd-given <json>", "JSON array of Given steps")
    .option("--bdd-when <json>", "JSON array of When steps")
    .option("--bdd-then <json>", "JSON array of Then steps")
    // Traditional options
    .option("--trad-steps <json>", "JSON array of {step, expected} objects")
    .option("--trad-expected <text>", "Overall expected result")
    // Visual steps config
    .requiredOption(
      "--visual-steps <json>",
      "JSON array of visual step configs: [{stepIndex, diffType, fullPage, screenshotSelector?, threshold?}]",
    )
    // Metadata
    .option("--preconditions <json>", "JSON array of preconditions")
    .option("--impacted-files <json>", "JSON array of impacted file paths")
    .option("--labels <json>", "JSON array of label strings")
    .option("--ready", "Mark as ready (default: false)")
    .action((opts) => {
      const bddGiven = opts.bddGiven ? JSON.parse(opts.bddGiven) : undefined;
      const bddWhen = opts.bddWhen ? JSON.parse(opts.bddWhen) : undefined;
      const bddThen = opts.bddThen ? JSON.parse(opts.bddThen) : undefined;
      const tradSteps = opts.tradSteps ? JSON.parse(opts.tradSteps) : undefined;
      const visualSteps = JSON.parse(opts.visualSteps) as VisualStep[];
      const preconditions = opts.preconditions ? JSON.parse(opts.preconditions) : undefined;
      const impactedFiles = opts.impactedFiles ? JSON.parse(opts.impactedFiles) : undefined;

      const id = createVisualTestCase({
        ticketId: opts.ticket,
        title: opts.title,
        description: opts.description,
        type: opts.type,
        format: opts.format,
        viewport: opts.viewport,
        defaultThreshold: opts.threshold,
        bddFeature: opts.bddFeature,
        bddScenario: opts.bddScenario,
        bddGiven,
        bddWhen,
        bddThen,
        tradSteps,
        tradExpected: opts.tradExpected,
        visualSteps,
        preconditions,
        impactedFiles,
        labels: opts.labels ? JSON.parse(opts.labels) : undefined,
        testLayer: "ui",
        ready: opts.ready ?? false,
      });
      console.log(JSON.stringify({ visualTcId: id }));
    });

  // ── list ──────────────────────────────────────────────────────────────────
  vtc
    .command("list")
    .description("List visual test cases for a ticket")
    .requiredOption("--ticket <ticketId>", "Ticket ID")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const cases = listVisualTestCases(opts.ticket);

      if (opts.json) {
        console.log(JSON.stringify(cases));
        return;
      }

      if (cases.length === 0) {
        console.log(chalk.yellow("No visual test cases found."));
        return;
      }

      console.log(chalk.bold(`\nVisual Test Cases for ${opts.ticket} (${cases.length}):\n`));
      for (const tc of cases as Array<Record<string, unknown>>) {
        const visualSteps = JSON.parse((tc.visual_steps_json as string) ?? "[]") as VisualStep[];
        const readyStatus = tc.ready ? chalk.green("ready") : chalk.yellow("draft");
        console.log(
          `  ${chalk.cyan(tc.id as string)}  ${tc.title}  ${chalk.dim(`[${tc.type} · ${tc.format} · ${tc.viewport} · t=${tc.default_threshold} · ${visualSteps.length} visual steps · ${readyStatus}]`)}`,
        );
      }
      console.log();
    });

  // ── get ───────────────────────────────────────────────────────────────────
  vtc
    .command("get <id>")
    .description("Get a visual test case by ID")
    .action((id) => {
      const tc = getVisualTestCase(id);
      if (!tc) {
        console.error(chalk.red(`Visual test case not found: ${id}`));
        process.exit(1);
      }
      const row = tc as Record<string, unknown>;
      // Parse JSON fields
      row.visualSteps = JSON.parse((row.visual_steps_json as string) ?? "[]");
      row.bddGiven = row.bdd_given ? JSON.parse(row.bdd_given as string) : null;
      row.bddWhen = row.bdd_when ? JSON.parse(row.bdd_when as string) : null;
      row.bddThen = row.bdd_then ? JSON.parse(row.bdd_then as string) : null;
      row.tradSteps = row.trad_steps ? JSON.parse(row.trad_steps as string) : null;
      row.preconditions = row.preconditions ? JSON.parse(row.preconditions as string) : null;
      row.impactedFiles = row.impacted_files ? JSON.parse(row.impacted_files as string) : null;
      row.labels = JSON.parse((row.labels as string) ?? "[]");
      // Remove raw fields for cleaner output
      delete row.visual_steps_json;
      delete row.bdd_given;
      delete row.bdd_when;
      delete row.bdd_then;
      delete row.trad_steps;
      delete row.impacted_files;
      console.log(JSON.stringify(row, null, 2));
    });

  // ── update ────────────────────────────────────────────────────────────────
  vtc
    .command("update <id>")
    .description("Update fields on a visual test case")
    .option("--title <text>", "New title")
    .option("--description <text>", "New description")
    .option("--type <type>", "direct_functional | impact_regression | general_regression")
    .option("--format <format>", "bdd | traditional")
    .option("--viewport <WxH>", "New viewport")
    .option("--threshold <n>", "New default threshold", parseFloat)
    .option("--bdd-feature <text>", "Update BDD feature")
    .option("--bdd-scenario <text>", "Update BDD scenario")
    .option("--bdd-given <json>", "Update BDD Given steps")
    .option("--bdd-when <json>", "Update BDD When steps")
    .option("--bdd-then <json>", "Update BDD Then steps")
    .option("--trad-steps <json>", "Update traditional steps")
    .option("--trad-expected <text>", "Update traditional expected result")
    .option("--visual-steps <json>", "Update visual steps config")
    .option("--preconditions <json>", "Update preconditions")
    .option("--impacted-files <json>", "Update impacted files")
    .option("--labels <json>", "Update labels")
    .option("--ready", "Mark as ready")
    .option("--draft", "Mark as draft")
    .action((id, opts) => {
      const patch: Record<string, unknown> = {
        title: opts.title,
        description: opts.description,
        type: opts.type,
        format: opts.format,
        viewport: opts.viewport,
        defaultThreshold: opts.threshold,
        bddFeature: opts.bddFeature,
        bddScenario: opts.bddScenario,
        bddGiven: opts.bddGiven ? JSON.parse(opts.bddGiven) : undefined,
        bddWhen: opts.bddWhen ? JSON.parse(opts.bddWhen) : undefined,
        bddThen: opts.bddThen ? JSON.parse(opts.bddThen) : undefined,
        tradSteps: opts.tradSteps ? JSON.parse(opts.tradSteps) : undefined,
        tradExpected: opts.tradExpected,
        visualSteps: opts.visualSteps ? JSON.parse(opts.visualSteps) : undefined,
        preconditions: opts.preconditions ? JSON.parse(opts.preconditions) : undefined,
        impactedFiles: opts.impactedFiles ? JSON.parse(opts.impactedFiles) : undefined,
        labels: opts.labels ? JSON.parse(opts.labels) : undefined,
      };
      if (opts.ready) patch.ready = true;
      if (opts.draft) patch.ready = false;

      updateVisualTestCase(id, patch);
      console.log(JSON.stringify({ updated: true, id }));
    });

  // ── steps ─────────────────────────────────────────────────────────────────
  vtc
    .command("steps <id>")
    .description("Show visual steps config for a visual test case")
    .action((id) => {
      const tc = getVisualTestCase(id) as Record<string, unknown> | null;
      if (!tc) {
        console.error(chalk.red(`Visual test case not found: ${id}`));
        process.exit(1);
      }
      const visualSteps = JSON.parse((tc.visual_steps_json as string) ?? "[]") as VisualStep[];
      console.log(chalk.bold(`\nVisual Steps for "${tc.title}" (${visualSteps.length} steps with visual capture):\n`));
      visualSteps.forEach((s) => {
        const scope = s.fullPage
          ? chalk.green("full-page")
          : chalk.cyan(`scoped:${s.screenshotSelector || "(default)"}`);
        const threshold = s.threshold ? chalk.yellow(`t=${s.threshold}`) : chalk.dim(`t=${tc.default_threshold}(default)`);
        console.log(
          `  Step ${s.stepIndex}: [${chalk.blue(s.diffType)}] ${scope}  ${threshold}`,
        );
      });
      console.log();
    });

  // ── bdd ────────────────────────────────────────────────────────────────────
  vtc
    .command("bdd <id>")
    .description("Show BDD/traditional details for a visual test case")
    .action((id) => {
      const tc = getVisualTestCase(id) as Record<string, unknown> | null;
      if (!tc) {
        console.error(chalk.red(`Visual test case not found: ${id}`));
        process.exit(1);
      }

      console.log(chalk.bold(`\n"${tc.title}" (${tc.type} · ${tc.format})\n`));

      if (tc.description) {
        console.log(chalk.dim(`Description: ${tc.description}\n`));
      }

      if (tc.format === "bdd") {
        if (tc.bdd_feature) console.log(`Feature: ${tc.bdd_feature}`);
        if (tc.bdd_scenario) console.log(`Scenario: ${tc.bdd_scenario}`);

        if (tc.bdd_given) {
          const given = JSON.parse(tc.bdd_given as string) as string[];
          console.log(`\n${chalk.green("Given:")}`);
          given.forEach((g) => console.log(`  • ${g}`));
        }

        if (tc.bdd_when) {
          const when = JSON.parse(tc.bdd_when as string) as string[];
          console.log(`\n${chalk.blue("When:")}`);
          when.forEach((w) => console.log(`  • ${w}`));
        }

        if (tc.bdd_then) {
          const then = JSON.parse(tc.bdd_then as string) as string[];
          console.log(`\n${chalk.magenta("Then:")}`);
          then.forEach((t) => console.log(`  • ${t}`));
        }
      } else if (tc.format === "traditional") {
        if (tc.trad_steps) {
          const steps = JSON.parse(tc.trad_steps as string) as Array<{ step: string; expected: string }>;
          console.log(`${chalk.green("Steps:")}`);
          steps.forEach((s, i) => {
            console.log(`  ${i + 1}. ${s.step}`);
            console.log(`     Expected: ${s.expected}`);
          });
        }
        if (tc.trad_expected) {
          console.log(`\nOverall Expected: ${tc.trad_expected}`);
        }
      }

      if (tc.preconditions) {
        const preconds = JSON.parse(tc.preconditions as string) as string[];
        console.log(`\n${chalk.dim("Preconditions:")}`);
        preconds.forEach((p) => console.log(`  • ${p}`));
      }

      console.log();
    });

  // ── ready ──────────────────────────────────────────────────────────────────
  vtc
    .command("ready <id>")
    .description("Mark a visual test case as ready")
    .action((id) => {
      updateVisualTestCase(id, { ready: true });
      console.log(JSON.stringify({ marked: "ready", id }));
    });

  // ── draft ──────────────────────────────────────────────────────────────────
  vtc
    .command("draft <id>")
    .description("Mark a visual test case as draft")
    .action((id) => {
      updateVisualTestCase(id, { ready: false });
      console.log(JSON.stringify({ marked: "draft", id }));
    });

  // ── archive ───────────────────────────────────────────────────────────────
  vtc
    .command("archive <id>")
    .description("Archive (soft-delete) a visual test case")
    .action((id) => {
      archiveVisualTestCase(id);
      console.log(JSON.stringify({ archived: true, id }));
    });
}

