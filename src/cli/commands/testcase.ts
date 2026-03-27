import type { Command } from "commander";
import chalk from "chalk";
import {
  createTestCase,
  claimNextTestCase,
  updateTestCaseResult,
  releaseTestCase,
  releaseSessionClaims,
  getTestCasesByTicket,
  getTestCasesByRun,
  getTestCaseStats,
  markTestCaseReady,
  markTestCaseDraft,
  markAllReady,
  markAllDraft,
} from "../../db/repositories/testcases.js";
import { registerTestSelectionCommands } from "./test-selection.js";
import { registerRiskCommands } from "./risk.js";
import { registerAuditCommands } from "./audit.js";

export function registerTestCaseCommands(program: Command): void {
  const tc = program
    .command("testcase")
    .description("Manage test cases — create, claim, execute, and track");

  tc.command("create <runId>")
    .description("Create a test case")
    .requiredOption("--ticket <ref>", "Ticket reference (e.g. PROJ-123)")
    .requiredOption("--type <type>", "direct_functional | impact_regression | general_regression")
    .requiredOption("--format <fmt>", "bdd | traditional")
    .requiredOption("--title <text>", "Test case title")
    .option("--description <text>", "Description")
    .option("--preconditions <json>", "JSON array of preconditions")
    .option("--labels <json>", "JSON array of labels")
    .option("--repos <json>", "JSON array of repo URLs")
    // BDD
    .option("--bdd-feature <text>", "BDD feature name")
    .option("--bdd-scenario <text>", "BDD scenario name")
    .option("--bdd-given <json>", "JSON array of Given steps")
    .option("--bdd-when <json>", "JSON array of When steps")
    .option("--bdd-then <json>", "JSON array of Then steps")
    // Traditional
    .option("--trad-steps <json>", "JSON array of {step, expected}")
    .option("--trad-expected <text>", "Overall expected result")
    // Context
    .option("--impacted-files <json>", "JSON array of impacted file paths")
    .option("--related-mr <text>", "MR/PR reference")
    .option("--code-context <text>", "Relevant code context")
    .option("--ready", "Mark test case as ready for execution (default: draft)")
    .option("--plan-step <id>", "Link to a plan step ID")
    .option("--layer <layer>", "Test layer: ui | api | ui_api | database | ai | unit | other (default: ui)")
    .action((runId, opts) => {
      const id = createTestCase({
        runId,
        ticketRef: opts.ticket,
        repoUrls: opts.repos ? JSON.parse(opts.repos) : undefined,
        type: opts.type,
        format: opts.format,
        title: opts.title,
        description: opts.description,
        preconditions: opts.preconditions ? JSON.parse(opts.preconditions) : undefined,
        labels: opts.labels ? JSON.parse(opts.labels) : undefined,
        bddFeature: opts.bddFeature,
        bddScenario: opts.bddScenario,
        bddGiven: opts.bddGiven ? JSON.parse(opts.bddGiven) : undefined,
        bddWhen: opts.bddWhen ? JSON.parse(opts.bddWhen) : undefined,
        bddThen: opts.bddThen ? JSON.parse(opts.bddThen) : undefined,
        tradSteps: opts.tradSteps ? JSON.parse(opts.tradSteps) : undefined,
        tradExpected: opts.tradExpected,
        impactedFiles: opts.impactedFiles ? JSON.parse(opts.impactedFiles) : undefined,
        relatedMr: opts.relatedMr,
        codeContext: opts.codeContext,
        ready: opts.ready ?? false,
        planStepId: opts.planStep,
        testLayer: opts.layer,
      });
      console.log(JSON.stringify({ testCaseId: id }));
    });

  tc.command("claim <ticketRef> <sessionId>")
    .description("Claim the next available test case for execution (priority order)")
    .option("--fresh", "Also claim previously completed cases for re-execution")
    .action((ticketRef, sessionId, opts) => {
      const claimed = claimNextTestCase(ticketRef, sessionId, opts.fresh ?? false);
      if (!claimed) {
        console.log(JSON.stringify({ claimed: null, message: "No test cases available" }));
      } else {
        console.log(JSON.stringify(claimed, null, 2));
      }
    });

  tc.command("result <testCaseId>")
    .description("Record test case execution result")
    .requiredOption("--status <status>", "passed | failed | skipped | blocked")
    .requiredOption("--run <runId>", "Run ID that executed this test case")
    .option("--result <json>", "Execution result details as JSON")
    .action((testCaseId, opts) => {
      updateTestCaseResult(testCaseId, opts.status, opts.run, opts.result);
      console.log(JSON.stringify({ updated: true }));
    });

  tc.command("release <testCaseId>")
    .description("Release a claimed test case back to pending")
    .action((testCaseId) => {
      releaseTestCase(testCaseId);
      console.log(JSON.stringify({ released: true }));
    });

  tc.command("release-session <sessionId>")
    .description("Release all test cases claimed by a session")
    .action((sessionId) => {
      releaseSessionClaims(sessionId);
      console.log(JSON.stringify({ released: true }));
    });

  tc.command("list")
    .description("List test cases")
    .option("--ticket <ref>", "Filter by ticket reference")
    .option("--run <runId>", "Filter by run ID")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const cases = opts.ticket
        ? getTestCasesByTicket(opts.ticket)
        : opts.run
          ? getTestCasesByRun(opts.run)
          : [];

      if (!opts.ticket && !opts.run) {
        console.error("Provide --ticket or --run to filter");
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(cases, null, 2));
        return;
      }

      if ((cases as unknown[]).length === 0) {
        console.log(chalk.dim("No test cases found."));
        return;
      }

      const typePriority = { direct_functional: 1, impact_regression: 2, general_regression: 3 };
      console.log(chalk.bold("\nTest Cases:\n"));

      let currentType = "";
      for (const tc of cases as Array<Record<string, unknown>>) {
        if (tc.type !== currentType) {
          currentType = tc.type as string;
          const typeLabel =
            currentType === "direct_functional"
              ? chalk.green.bold("DIRECT FUNCTIONAL")
              : currentType === "impact_regression"
                ? chalk.yellow.bold("IMPACT REGRESSION")
                : chalk.blue.bold("GENERAL REGRESSION");
          console.log(`  ${typeLabel}\n`);
        }

        const statusColor =
          tc.status === "passed"
            ? chalk.green
            : tc.status === "failed"
              ? chalk.red
              : tc.status === "claimed" || tc.status === "running"
                ? chalk.yellow
                : chalk.dim;

        const formatTag = tc.format === "bdd" ? chalk.cyan("[BDD]") : chalk.magenta("[TRAD]");

        console.log(
          `    ${statusColor((tc.status as string).padEnd(8))} ${formatTag} ${tc.title}`
        );
        if (tc.claimed_by) {
          console.log(chalk.dim(`      claimed by: ${(tc.claimed_by as string).slice(0, 8)}`));
        }
      }
      console.log();
    });

  tc.command("stats <ticketRef>")
    .description("Show test case statistics for a ticket")
    .action((ticketRef) => {
      const stats = getTestCaseStats(ticketRef);
      console.log(JSON.stringify(stats, null, 2));
    });

  // ── Ready / Draft ──

  tc.command("mark-ready <id>")
    .description("Mark a test case as ready for execution")
    .action((id) => {
      markTestCaseReady(id);
      console.log(JSON.stringify({ ready: true }));
    });

  tc.command("mark-draft <id>")
    .description("Mark a test case as draft (not ready for execution)")
    .action((id) => {
      markTestCaseDraft(id);
      console.log(JSON.stringify({ ready: false }));
    });

  tc.command("ready-all <ticketRef>")
    .description("Mark all test cases for a ticket as ready")
    .action((ticketRef) => {
      const count = markAllReady(ticketRef);
      console.log(JSON.stringify({ marked: count }));
    });

  // Alias: "ready --ticket X" works the same as "ready-all X"
  tc.command("ready")
    .description("Mark test cases ready (alias for ready-all)")
    .requiredOption("--ticket <ref>", "Ticket ref")
    .option("--id <id>", "Mark a single test case ready")
    .action((opts) => {
      if (opts.id) {
        markTestCaseReady(opts.id);
        console.log(JSON.stringify({ marked: 1 }));
      } else {
        const count = markAllReady(opts.ticket);
        console.log(JSON.stringify({ marked: count }));
      }
    });

  tc.command("draft-all <ticketRef>")
    .description("Mark all test cases for a ticket as draft")
    .action((ticketRef) => {
      const count = markAllDraft(ticketRef);
      console.log(JSON.stringify({ marked: count }));
    });

  // ── Test Selection, Risk & Audit ──
  registerTestSelectionCommands(tc);
  registerRiskCommands(tc);
  registerAuditCommands(tc);

  // Alias: "draft --ticket X" works the same as "draft-all X"
  tc.command("draft")
    .description("Mark test cases draft (alias for draft-all)")
    .requiredOption("--ticket <ref>", "Ticket ref")
    .option("--id <id>", "Mark a single test case draft")
    .action((opts) => {
      if (opts.id) {
        markTestCaseDraft(opts.id);
        console.log(JSON.stringify({ marked: 1 }));
      } else {
        const count = markAllDraft(opts.ticket);
        console.log(JSON.stringify({ marked: count }));
      }
    });
}
