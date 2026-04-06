import type { Command } from "commander";
import chalk from "chalk";
import * as readline from "readline";
import { getDb } from "../../db/client.js";
import { requireAuth } from "./auth.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SyncPayload {
  featureId?: string;
  ticketRef: string;
  data: {
    runs: unknown[];
    testPlans: unknown[];
    analyses: unknown[];
    issues: unknown[];
    testCases: unknown[];
    testSteps: unknown[];
    runPackEntries: unknown[];
  };
}

interface SyncResponse {
  success: boolean;
  featureId: string;
  featureCreated: boolean;
  synced: {
    runs: { inserted: number; updated: number };
    testPlans: { inserted: number; updated: number };
    analyses: { inserted: number; updated: number };
    issues: { inserted: number; updated: number };
    testCases: { inserted: number; updated: number };
    testSteps: { inserted: number; updated: number };
    runPackEntries: { inserted: number; updated: number };
  };
  syncedAt: string;
  error?: string;
}

interface CompareResponse {
  exists: boolean;
  featureId?: string;
  counts: {
    runs: number;
    testPlans: number;
    analyses: number;
    testCases: number;
    runPackEntries: number;
  };
  latestSyncedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Data gathering functions - LATEST ONLY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get only the LATEST run for a ticket (most recent)
 */
function getLatestRun(ticket: string): unknown | null {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT * FROM runs WHERE input_ref = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(ticket) ?? null
  );
}

/**
 * Get the latest test plan (from the latest run)
 */
function getLatestTestPlan(runId: string): unknown | null {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT * FROM test_plans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(runId) ?? null
  );
}

/**
 * Get the latest analysis (from the latest run)
 */
function getLatestAnalysis(runId: string): unknown | null {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT * FROM analyses WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(runId) ?? null
  );
}

/**
 * Get the latest run pack entries for a ticket
 */
function getLatestRunPackEntries(ticket: string): unknown[] {
  const db = getDb();

  // Check if run_pack_entries table has test_case_id column using PRAGMA
  try {
    const columns = db
      .prepare("PRAGMA table_info(run_pack_entries)")
      .all() as Array<{ name: string }>;
    const hasTestCaseId = columns.some((col) => col.name === "test_case_id");
    if (!hasTestCaseId) {
      // Column doesn't exist, return empty (table needs migration)
      return [];
    }
  } catch {
    // Table doesn't exist or other error
    return [];
  }

  // Get the most recent run pack for this ticket
  const latestPack = db
    .prepare(
      `SELECT DISTINCT run_pack_id FROM run_pack_entries
     WHERE ticket_id = ? AND test_case_id != '__header__'
     ORDER BY created_at DESC LIMIT 1`,
    )
    .get(ticket) as { run_pack_id: string } | undefined;

  if (!latestPack) return [];

  // Return all entries from that run pack
  return db
    .prepare(
      `SELECT * FROM run_pack_entries
     WHERE run_pack_id = ? AND test_case_id != '__header__'
     ORDER BY created_at ASC`,
    )
    .all(latestPack.run_pack_id);
}

/**
 * Get issues from the latest run
 */
function getIssuesByRun(runId: string): unknown[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM issues WHERE run_id = ?`).all(runId);
}

/**
 * Get test cases from the latest run
 */
function getTestCasesByRun(runId: string): unknown[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM test_cases WHERE run_id = ?`).all(runId);
}

/**
 * Get test steps for the given test case IDs
 */
function getTestStepsByTestCases(testCaseIds: string[]): unknown[] {
  if (testCaseIds.length === 0) return [];
  const db = getDb();

  // Check if test_steps table has test_case_id column using PRAGMA
  try {
    const columns = db.prepare("PRAGMA table_info(test_steps)").all() as Array<{
      name: string;
    }>;
    const hasTestCaseId = columns.some((col) => col.name === "test_case_id");
    if (!hasTestCaseId) {
      // Column doesn't exist, return empty (table needs migration)
      return [];
    }
  } catch {
    // Table doesn't exist or other error
    return [];
  }

  const placeholders = testCaseIds.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM test_steps WHERE test_case_id IN (${placeholders})`)
    .all(...testCaseIds);
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

async function compareWithAntTest(
  ticketRef: string,
  accessToken: string,
  anttestUrl: string,
): Promise<CompareResponse> {
  const res = await fetch(
    `${anttestUrl}/api/cli/sync/compare?ticketRef=${encodeURIComponent(ticketRef)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Compare failed: ${res.status} ${errText}`);
  }

  return res.json() as Promise<CompareResponse>;
}

async function pushToAntTest(
  payload: SyncPayload,
  accessToken: string,
  anttestUrl: string,
): Promise<SyncResponse> {
  const res = await fetch(`${anttestUrl}/api/cli/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sync failed: ${res.status} ${errText}`);
  }

  return res.json() as Promise<SyncResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerSyncCommands(program: Command): void {
  const sync = program
    .command("sync")
    .description("Sync local data to AntTest cloud");

  // Push command
  sync
    .command("push")
    .description("Push latest local data to AntTest (replaces existing data)")
    .requiredOption("--ticket <ref>", "Ticket reference (e.g., PROJ-123)")
    .option(
      "--feature <id>",
      "AntTest feature ID to sync to (auto-creates if not provided)",
    )
    .option("--force", "Skip confirmation prompt and replace existing data")
    .option("--dry-run", "Show what would be synced without syncing")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const session = requireAuth();

      try {
        // Gather LATEST local data only
        const latestRun = getLatestRun(opts.ticket) as { id: string } | null;
        const runs = latestRun ? [latestRun] : [];
        const runId = latestRun?.id;

        const testPlans = runId
          ? [getLatestTestPlan(runId)].filter(Boolean)
          : [];
        const analyses = runId
          ? [getLatestAnalysis(runId)].filter(Boolean)
          : [];
        const issues = runId ? getIssuesByRun(runId) : [];
        const testCases = runId
          ? (getTestCasesByRun(runId) as { id: string }[])
          : [];
        const testCaseIds = testCases.map((tc) => tc.id);
        const testSteps = getTestStepsByTestCases(testCaseIds);
        const runPackEntries = getLatestRunPackEntries(opts.ticket);

        const payload: SyncPayload = {
          ticketRef: opts.ticket,
          featureId: opts.feature,
          data: {
            runs,
            testPlans,
            analyses,
            issues,
            testCases,
            testSteps,
            runPackEntries,
          },
        };

        // Summary
        const summary = {
          ticket: opts.ticket,
          featureId: opts.feature || "(auto-create)",
          counts: {
            runs: runs.length,
            testPlans: testPlans.length,
            analyses: analyses.length,
            issues: issues.length,
            testCases: testCases.length,
            testSteps: testSteps.length,
            runPackEntries: runPackEntries.length,
          },
        };

        if (opts.dryRun) {
          if (opts.json) {
            console.log(JSON.stringify(summary));
          } else {
            console.log(chalk.blue("Dry run - would sync (latest only):"));
            console.log(`  Runs:            ${summary.counts.runs}`);
            console.log(`  Test Plans:      ${summary.counts.testPlans}`);
            console.log(`  Analyses:        ${summary.counts.analyses}`);
            console.log(`  Issues:          ${summary.counts.issues}`);
            console.log(`  Test Cases:      ${summary.counts.testCases}`);
            console.log(`  Test Steps:      ${summary.counts.testSteps}`);
            console.log(`  Run Pack Entries: ${summary.counts.runPackEntries}`);
          }
          return;
        }

        // Check if there's anything to sync
        const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
        if (total === 0) {
          console.log(chalk.yellow("Nothing to sync."));
          return;
        }

        // Check for existing data on the server (conflict detection)
        if (!opts.force) {
          console.log(chalk.dim("→ Checking for existing data..."));
          const existing = await compareWithAntTest(
            opts.ticket,
            session.access_token,
            session.anttest_url,
          );

          if (existing.exists) {
            const existingTotal = Object.values(existing.counts).reduce(
              (a, b) => a + b,
              0,
            );
            if (existingTotal > 0) {
              console.log(chalk.yellow("\n⚠ Existing data found on AntTest:"));
              console.log(`  Runs:            ${existing.counts.runs}`);
              console.log(`  Test Plans:      ${existing.counts.testPlans}`);
              console.log(`  Analyses:        ${existing.counts.analyses}`);
              console.log(`  Test Cases:      ${existing.counts.testCases}`);
              console.log(
                `  Run Pack Entries: ${existing.counts.runPackEntries}`,
              );
              if (existing.latestSyncedAt) {
                console.log(
                  chalk.dim(`  Last synced:     ${existing.latestSyncedAt}`),
                );
              }
              console.log(
                chalk.yellow(
                  "\nThis will REPLACE the existing data with your latest local data.",
                ),
              );

              const answer = await prompt("Continue? (yes/no): ");
              if (answer !== "yes" && answer !== "y") {
                console.log(chalk.dim("Sync cancelled."));
                return;
              }
            }
          }
        }

        console.log(chalk.blue(`\n→ Syncing ${total} items to AntTest...`));

        // Push to server
        const result = await pushToAntTest(
          payload,
          session.access_token,
          session.anttest_url,
        );

        if (opts.json) {
          console.log(JSON.stringify(result));
        } else {
          console.log(chalk.green("✓ Sync complete"));
          if (result.featureCreated) {
            console.log(
              chalk.cyan(`  Feature:         ${result.featureId} (created)`),
            );
          } else {
            console.log(chalk.dim(`  Feature:         ${result.featureId}`));
          }
          const {
            runs,
            testPlans,
            analyses,
            issues,
            testCases,
            testSteps,
            runPackEntries,
          } = result.synced;
          console.log(
            `  Runs:            ${runs.inserted} new, ${runs.updated} updated`,
          );
          console.log(
            `  Test Plans:      ${testPlans.inserted} new, ${testPlans.updated} updated`,
          );
          console.log(
            `  Analyses:        ${analyses.inserted} new, ${analyses.updated} updated`,
          );
          console.log(
            `  Issues:          ${issues.inserted} new, ${issues.updated} updated`,
          );
          console.log(
            `  Test Cases:      ${testCases.inserted} new, ${testCases.updated} updated`,
          );
          console.log(
            `  Test Steps:      ${testSteps?.inserted ?? 0} new, ${testSteps?.updated ?? 0} updated`,
          );
          console.log(
            `  Run Pack Entries: ${runPackEntries?.inserted ?? 0} new, ${runPackEntries?.updated ?? 0} updated`,
          );
          console.log(chalk.dim(`  Synced at:       ${result.syncedAt}`));
        }
      } catch (err) {
        console.error(chalk.red(`✗ Sync failed: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Status command - show what would be synced (latest only)
  sync
    .command("status")
    .description("Show sync status for a ticket (latest data only)")
    .requiredOption("--ticket <ref>", "Ticket reference (e.g., PROJ-123)")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const latestRun = getLatestRun(opts.ticket) as { id: string } | null;
      const runs = latestRun ? [latestRun] : [];
      const runId = latestRun?.id;

      const testPlans = runId ? [getLatestTestPlan(runId)].filter(Boolean) : [];
      const analyses = runId ? [getLatestAnalysis(runId)].filter(Boolean) : [];
      const issues = runId ? getIssuesByRun(runId) : [];
      const testCases = runId
        ? (getTestCasesByRun(runId) as { id: string }[])
        : [];
      const testCaseIds = testCases.map((tc) => tc.id);
      const testSteps = getTestStepsByTestCases(testCaseIds);
      const runPackEntries = getLatestRunPackEntries(opts.ticket);

      const status = {
        ticket: opts.ticket,
        counts: {
          runs: runs.length,
          testPlans: testPlans.length,
          analyses: analyses.length,
          issues: issues.length,
          testCases: testCases.length,
          testSteps: testSteps.length,
          runPackEntries: runPackEntries.length,
        },
      };

      if (opts.json) {
        console.log(JSON.stringify(status));
      } else {
        console.log(chalk.bold(`Sync Status (Latest Only): ${opts.ticket}\n`));
        console.log(`  Runs:            ${status.counts.runs}`);
        console.log(`  Test Plans:      ${status.counts.testPlans}`);
        console.log(`  Analyses:        ${status.counts.analyses}`);
        console.log(`  Issues:          ${status.counts.issues}`);
        console.log(`  Test Cases:      ${status.counts.testCases}`);
        console.log(`  Test Steps:      ${status.counts.testSteps}`);
        console.log(`  Run Pack Entries: ${status.counts.runPackEntries}`);
      }
    });
}
