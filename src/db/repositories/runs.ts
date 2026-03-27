import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type { RunRow } from "../types.js";
import type { RunConfig, RunStatus } from "../../types/run.js";
import type { InputType } from "../../types/run.js";
import chalk from "chalk";
import { logPhaseTransition } from "./phase-transitions.js";

export function createRun(
  config: RunConfig,
  inputType: InputType,
  inputRef: string,
  inputFull: string
): string {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO runs (id, status, input_type, input_ref, input_full, target_url, config_json, capture_config, secret_target, secret_role)
     VALUES (?, 'running', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    inputType,
    inputRef,
    inputFull,
    config.targetUrl ?? null,
    JSON.stringify(config),
    config.capture ? JSON.stringify(config.capture) : null,
    config.secretTarget ?? null,
    config.secretRole ?? null
  );
  return id;
}

/**
 * Resolve a run for a given input ref: reuse an existing running/pending run, or create new.
 * Returns { runId, resumed }.
 */
export function resolveRun(
  config: RunConfig,
  inputType: InputType,
  inputRef: string,
  inputFull: string,
  opts?: { fresh?: boolean }
): { runId: string; resumed: boolean } {
  const db = getDb();

  if (!opts?.fresh) {
    // Find existing run for same input_ref:
    // - running/pending: always resume
    // - completed/failed from today: resume (same-day retry)
    const existing = db.prepare(
      `SELECT id, status FROM runs
       WHERE input_ref = ? AND (
         status IN ('running', 'pending')
         OR (status IN ('completed', 'failed') AND date(created_at) = date('now'))
       )
       ORDER BY created_at DESC LIMIT 1`
    ).get(inputRef) as { id: string; status: string } | undefined;

    if (existing) {
      // Update config fields + reopen if completed/failed
      const sets: string[] = ["updated_at = datetime('now')"];
      const params: unknown[] = [];
      if (existing.status !== "running" && existing.status !== "pending") {
        sets.push("status = 'running'");
      }
      if (config.targetUrl) { sets.push("target_url = ?"); params.push(config.targetUrl); }
      if (config.capture) { sets.push("capture_config = ?"); params.push(JSON.stringify(config.capture)); }
      if (config.secretTarget) { sets.push("secret_target = ?"); params.push(config.secretTarget); }
      if (config.secretRole) { sets.push("secret_role = ?"); params.push(config.secretRole); }
      params.push(existing.id);
      db.prepare(`UPDATE runs SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      return { runId: existing.id, resumed: true };
    }
  }

  const runId = createRun(config, inputType, inputRef, inputFull);
  return { runId, resumed: false };
}

export function updateRunPhase(runId: string, phase: number): void {
  const db = getDb();
  const current = db.prepare("SELECT phase, session_id FROM runs WHERE id = ?").get(runId) as { phase: number; session_id: string | null } | undefined;
  if (current && current.phase !== phase) {
    logPhaseTransition(runId, current.session_id, current.phase, phase);
  }
  db.prepare("UPDATE runs SET phase = ?, updated_at = datetime('now') WHERE id = ?")
    .run(phase, runId);
}

export function updateRunCost(
  runId: string,
  costDelta: number,
  tokensDelta: number
): void {
  getDb()
    .prepare(
      `UPDATE runs SET
        total_cost = total_cost + ?,
        total_tokens = total_tokens + ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(costDelta, tokensDelta, runId);
}

export function completeRun(
  runId: string,
  status: RunStatus,
  summary?: string
): void {
  getDb()
    .prepare(
      `UPDATE runs SET status = ?, summary = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(status, summary ?? null, runId);
}

export function getRun(runId: string): RunRow | undefined {
  return getDb()
    .prepare("SELECT * FROM runs WHERE id = ?")
    .get(runId) as RunRow | undefined;
}

export function getRunCost(runId: string): number {
  const row = getDb()
    .prepare("SELECT total_cost FROM runs WHERE id = ?")
    .get(runId) as { total_cost: number } | undefined;
  return row?.total_cost ?? 0;
}

// ── CLI utility functions ──

export function showHistory(limit: number): void {
  const rows = getDb()
    .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as RunRow[];

  if (rows.length === 0) {
    console.log(chalk.dim("No runs found."));
    return;
  }

  console.log(chalk.bold("\nPast runs:\n"));
  for (const r of rows) {
    const status =
      r.status === "completed"
        ? chalk.green(r.status)
        : r.status === "failed"
          ? chalk.red(r.status)
          : chalk.yellow(r.status);
    console.log(
      `  ${chalk.dim(r.id.slice(0, 8))}  ${status}  ${r.input_type}:${r.input_ref.slice(0, 40)}  $${r.total_cost.toFixed(2)}  ${r.created_at}`
    );
  }
  console.log();
}

export function showStatus(runId: string): void {
  const run = getRun(runId);
  if (!run) {
    console.log(chalk.red(`Run ${runId} not found.`));
    return;
  }

  const db = getDb();
  const issueCount = (
    db.prepare("SELECT COUNT(*) as c FROM issues WHERE run_id = ?").get(runId) as {
      c: number;
    }
  ).c;
  const actionCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM action_log WHERE run_id = ?")
      .get(runId) as { c: number }
  ).c;

  console.log(chalk.bold(`\nRun ${run.id}\n`));
  console.log(`  Status:   ${run.status}`);
  console.log(`  Phase:    ${run.phase}`);
  console.log(`  Input:    ${run.input_type}: ${run.input_ref}`);
  console.log(`  Target:   ${run.target_url ?? "N/A"}`);
  console.log(`  Cost:     $${run.total_cost.toFixed(2)}`);
  console.log(`  Tokens:   ${run.total_tokens}`);
  console.log(`  Actions:  ${actionCount}`);
  console.log(`  Issues:   ${issueCount}`);
  console.log(`  Created:  ${run.created_at}`);
  if (run.summary) {
    console.log(`  Summary:  ${run.summary}`);
  }
  console.log();
}

export function generateReport(runId: string): void {
  const run = getRun(runId);
  if (!run) {
    console.log(chalk.red(`Run ${runId} not found.`));
    return;
  }

  const db = getDb();
  const issues = db
    .prepare("SELECT * FROM issues WHERE run_id = ? ORDER BY severity, category")
    .all(runId) as Array<{
    category: string;
    severity: string;
    title: string;
    description: string;
    location: string | null;
  }>;

  console.log(chalk.bold(`\n══ Report: ${run.id} ══\n`));
  console.log(`Input: ${run.input_type}: ${run.input_ref}`);
  console.log(`Target: ${run.target_url ?? "N/A"}`);
  console.log(`Status: ${run.status}`);
  console.log(`Cost: $${run.total_cost.toFixed(2)}`);

  if (issues.length === 0) {
    console.log(chalk.green("\nNo issues found."));
  } else {
    console.log(chalk.bold(`\n${issues.length} Issues Found:\n`));
    for (const issue of issues) {
      const sevColor =
        issue.severity === "critical"
          ? chalk.red.bold
          : issue.severity === "high"
            ? chalk.red
            : issue.severity === "medium"
              ? chalk.yellow
              : chalk.dim;
      console.log(
        `  ${sevColor(`[${issue.severity.toUpperCase()}]`)} ${chalk.cyan(`[${issue.category}]`)} ${issue.title}`
      );
      console.log(chalk.dim(`    ${issue.description.slice(0, 120)}`));
      if (issue.location) {
        console.log(chalk.dim(`    @ ${issue.location}`));
      }
    }
  }

  if (run.summary) {
    console.log(chalk.bold("\nSummary:"));
    console.log(`  ${run.summary}`);
  }
  console.log();
}
