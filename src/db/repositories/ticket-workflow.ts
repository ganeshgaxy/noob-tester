import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export type TicketWorkflowStatus =
  | "new"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TicketWorkflowPhase =
  | "analyze"
  | "plan"
  | "test"
  | "review"
  | "done";

export interface TicketWorkflow {
  id: string;
  ticket_id: string;
  status: TicketWorkflowStatus;
  current_phase: TicketWorkflowPhase | null;
  progress: number;
  active: number;
  ready: number;
  added_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_run_id: string | null;
  last_session_id: string | null;
  error_message: string | null;
  notes: string | null;
  metadata_json: string | null;
  git_repo: string | null;
  mr_pr_link: string | null;
}

export interface TicketWorkflowSummary extends TicketWorkflow {
  run_count: number;
  issue_count: number;
  plan_count: number;
  test_case_count: number;
  visual_test_case_count: number;
  blocker_count: number;
  analysis_count: number;
}

/**
 * Resets added_at to the current datetime so the ticket is treated as "today's" ticket
 * by scheduler filters that check the added_at date.
 */
export function touchTicketAddedAt(ticketId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE ticket_workflow SET added_at = datetime('now') WHERE ticket_id = ?",
  ).run(ticketId);
}

export function upsertTicketWorkflow(
  ticketId: string,
  fields: Partial<Omit<TicketWorkflow, "id" | "ticket_id" | "added_at">> = {},
): TicketWorkflow {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM ticket_workflow WHERE ticket_id = ?")
    .get(ticketId) as TicketWorkflow | undefined;

  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const vals: unknown[] = [];

    if (fields.status !== undefined) {
      sets.push("status = ?");
      vals.push(fields.status);
    }
    if (fields.current_phase !== undefined) {
      sets.push("current_phase = ?");
      vals.push(fields.current_phase);
    }
    if (fields.progress !== undefined) {
      sets.push("progress = ?");
      vals.push(fields.progress);
    }
    if (fields.active !== undefined) {
      sets.push("active = ?");
      vals.push(fields.active);
    }
    if (fields.started_at !== undefined) {
      sets.push("started_at = ?");
      vals.push(fields.started_at);
    }
    if (fields.completed_at !== undefined) {
      sets.push("completed_at = ?");
      vals.push(fields.completed_at);
    }
    if (fields.last_run_id !== undefined) {
      sets.push("last_run_id = ?");
      vals.push(fields.last_run_id);
    }
    if (fields.last_session_id !== undefined) {
      sets.push("last_session_id = ?");
      vals.push(fields.last_session_id);
    }
    if (fields.error_message !== undefined) {
      sets.push("error_message = ?");
      vals.push(fields.error_message);
    }
    if (fields.notes !== undefined) {
      sets.push("notes = ?");
      vals.push(fields.notes);
    }
    if (fields.metadata_json !== undefined) {
      sets.push("metadata_json = ?");
      vals.push(fields.metadata_json);
    }
    if (fields.git_repo !== undefined) {
      sets.push("git_repo = ?");
      vals.push(fields.git_repo);
    }
    if (fields.mr_pr_link !== undefined) {
      sets.push("mr_pr_link = ?");
      vals.push(fields.mr_pr_link);
    }
    if (fields.ready !== undefined) {
      sets.push("ready = ?");
      vals.push(fields.ready ? 1 : 0);
    }

    vals.push(ticketId);
    db.prepare(
      `UPDATE ticket_workflow SET ${sets.join(", ")} WHERE ticket_id = ?`,
    ).run(...vals);
    return db
      .prepare("SELECT * FROM ticket_workflow WHERE ticket_id = ?")
      .get(ticketId) as TicketWorkflow;
  }

  const id = uuid();
  db.prepare(
    `
    INSERT INTO ticket_workflow (id, ticket_id, status, current_phase, progress, active, started_at, completed_at, last_run_id, last_session_id, error_message, notes, metadata_json, git_repo, mr_pr_link, ready)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    ticketId,
    fields.status ?? "new",
    fields.current_phase ?? null,
    fields.progress ?? 0,
    fields.active ?? 0,
    fields.started_at ?? null,
    fields.completed_at ?? null,
    fields.last_run_id ?? null,
    fields.last_session_id ?? null,
    fields.error_message ?? null,
    fields.notes ?? null,
    fields.metadata_json ?? null,
    fields.git_repo ?? null,
    fields.mr_pr_link ?? null,
    fields.ready !== undefined ? (fields.ready ? 1 : 0) : 0,
  );
  return db
    .prepare("SELECT * FROM ticket_workflow WHERE ticket_id = ?")
    .get(ticketId) as TicketWorkflow;
}

export function getTicketWorkflow(
  ticketId: string,
): TicketWorkflow | undefined {
  return getDb()
    .prepare("SELECT * FROM ticket_workflow WHERE ticket_id = ?")
    .get(ticketId) as TicketWorkflow | undefined;
}

export function listTicketWorkflows(
  filter: { status?: TicketWorkflowStatus; active?: boolean } = {},
): TicketWorkflow[] {
  let sql = "SELECT * FROM ticket_workflow";
  const conditions: string[] = [];
  const vals: unknown[] = [];

  if (filter.status) {
    conditions.push("status = ?");
    vals.push(filter.status);
  }
  if (filter.active !== undefined) {
    conditions.push("active = ?");
    vals.push(filter.active ? 1 : 0);
  }

  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY added_at DESC";

  return getDb()
    .prepare(sql)
    .all(...vals) as TicketWorkflow[];
}

export function listTicketWorkflowSummaries(
  filter: { status?: TicketWorkflowStatus; active?: boolean } = {},
): TicketWorkflowSummary[] {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  if (filter.status) {
    conditions.push("tw.status = ?");
    vals.push(filter.status);
  }
  if (filter.active !== undefined) {
    conditions.push("tw.active = ?");
    vals.push(filter.active ? 1 : 0);
  }
  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";

  const sql = `
    SELECT
      tw.*,
      COALESCE(r.run_count, 0)              AS run_count,
      COALESCE(i.issue_count, 0)            AS issue_count,
      COALESCE(p.plan_count, 0)             AS plan_count,
      COALESCE(a.analysis_count, 0)         AS analysis_count,
      COALESCE(tc.test_case_count, 0)       AS test_case_count,
      COALESCE(vtc.visual_test_case_count, 0) AS visual_test_case_count,
      COALESCE(b.blocker_count, 0)          AS blocker_count
    FROM ticket_workflow tw
    LEFT JOIN (
      SELECT input_ref, COUNT(*) AS run_count
      FROM runs WHERE input_type = 'ticket' GROUP BY input_ref
    ) r ON r.input_ref = tw.ticket_id
    LEFT JOIN (
      SELECT r2.input_ref, COUNT(*) AS issue_count
      FROM issues i2 JOIN runs r2 ON i2.run_id = r2.id
      WHERE r2.input_type = 'ticket' GROUP BY r2.input_ref
    ) i ON i.input_ref = tw.ticket_id
    LEFT JOIN (
      SELECT r2.input_ref, COUNT(*) AS plan_count
      FROM test_plans p2 JOIN runs r2 ON p2.run_id = r2.id
      WHERE r2.input_type = 'ticket' GROUP BY r2.input_ref
    ) p ON p.input_ref = tw.ticket_id
    LEFT JOIN (
      SELECT r2.input_ref, COUNT(*) AS analysis_count
      FROM analyses a2 JOIN runs r2 ON a2.run_id = r2.id
      WHERE r2.input_type = 'ticket' GROUP BY r2.input_ref
    ) a ON a.input_ref = tw.ticket_id
    LEFT JOIN (
      SELECT ticket_ref, COUNT(*) AS test_case_count
      FROM test_cases GROUP BY ticket_ref
    ) tc ON tc.ticket_ref = tw.ticket_id
    LEFT JOIN (
      SELECT ticket_id, COUNT(*) AS visual_test_case_count
      FROM visual_test_cases GROUP BY ticket_id
    ) vtc ON vtc.ticket_id = tw.ticket_id
    LEFT JOIN (
      SELECT ticket_id, COUNT(*) AS blocker_count
      FROM blockers GROUP BY ticket_id
    ) b ON b.ticket_id = tw.ticket_id
    ${where}
    ORDER BY tw.added_at DESC
  `;

  return getDb()
    .prepare(sql)
    .all(...vals) as TicketWorkflowSummary[];
}

export function getTicketWorkflowSummary(
  ticketId: string,
): TicketWorkflowSummary | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM ticket_workflow WHERE ticket_id = ?")
    .get(ticketId) as TicketWorkflow | undefined;
  if (!row) return undefined;

  const runCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM runs WHERE input_ref = ? AND input_type = 'ticket'",
      )
      .get(ticketId) as { c: number }
  ).c;

  const issueCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM issues WHERE run_id IN (SELECT id FROM runs WHERE input_ref = ? AND input_type = 'ticket')",
      )
      .get(ticketId) as { c: number }
  ).c;

  const planCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM test_plans WHERE run_id IN (SELECT id FROM runs WHERE input_ref = ? AND input_type = 'ticket')",
      )
      .get(ticketId) as { c: number }
  ).c;

  const analysisCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM analyses WHERE run_id IN (SELECT id FROM runs WHERE input_ref = ? AND input_type = 'ticket')",
      )
      .get(ticketId) as { c: number }
  ).c;

  const testCaseCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM test_cases WHERE ticket_ref = ?")
      .get(ticketId) as { c: number }
  ).c;

  const visualTestCaseCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM visual_test_cases WHERE ticket_id = ?",
      )
      .get(ticketId) as { c: number }
  ).c;

  const blockerCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM blockers WHERE ticket_id = ?")
      .get(ticketId) as { c: number }
  ).c;

  return {
    ...row,
    run_count: runCount,
    issue_count: issueCount,
    plan_count: planCount,
    analysis_count: analysisCount,
    test_case_count: testCaseCount,
    visual_test_case_count: visualTestCaseCount,
    blocker_count: blockerCount,
  };
}

export function setTicketActive(ticketId: string, active: boolean): void {
  getDb()
    .prepare(
      "UPDATE ticket_workflow SET active = ?, updated_at = datetime('now') WHERE ticket_id = ?",
    )
    .run(active ? 1 : 0, ticketId);
}

export function setTicketReady(ticketId: string, ready: boolean): void {
  getDb()
    .prepare(
      "UPDATE ticket_workflow SET ready = ?, updated_at = datetime('now') WHERE ticket_id = ?",
    )
    .run(ready ? 1 : 0, ticketId);
}

export function transitionStatus(
  ticketId: string,
  status: TicketWorkflowStatus,
  phase?: TicketWorkflowPhase,
): void {
  const db = getDb();
  const sets: string[] = ["status = ?", "updated_at = datetime('now')"];
  const vals: unknown[] = [status];

  if (phase) {
    sets.push("current_phase = ?");
    vals.push(phase);
  }
  if (status === "running" && phase === "analyze") {
    sets.push("started_at = COALESCE(started_at, datetime('now'))");
  }
  if (status === "completed" || status === "failed" || status === "cancelled") {
    sets.push("completed_at = datetime('now')");
    sets.push("active = 0");
  }

  vals.push(ticketId);
  db.prepare(
    `UPDATE ticket_workflow SET ${sets.join(", ")} WHERE ticket_id = ?`,
  ).run(...vals);
}

export function deleteTicketWorkflow(ticketId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM ticket_workflow WHERE ticket_id = ?")
    .run(ticketId);
  return result.changes > 0;
}

// ── Workflow Polling History ──

/**
 * Record that a workflow scheduler ran for a given ticket+agent today.
 * Uses INSERT OR IGNORE so duplicate calls for the same day are safe.
 */
export function recordWorkflowPollingRun(
  ticketId: string,
  agentPath: string,
): void {
  const runDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO workflow_polling_history (id, ticket_id, agent_path, run_date)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?)`,
    )
    .run(ticketId, agentPath, runDate);
}

export interface WorkflowPollingHistoryRow {
  id: string;
  ticket_id: string;
  agent_path: string;
  run_date: string;
  created_at: string;
}

/**
 * Returns all polling history rows for a ticket, newest first.
 */
export function listPollingHistoryForTicket(
  ticketId: string,
): WorkflowPollingHistoryRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM workflow_polling_history WHERE ticket_id = ? ORDER BY run_date DESC, created_at DESC`,
    )
    .all(ticketId) as WorkflowPollingHistoryRow[];
}

/**
 * Delete a single workflow polling history row by id.
 */
export function deleteWorkflowPollingRun(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM workflow_polling_history WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

/**
 * Returns true if this ticket+agent combination was already run today.
 */
export function wasPolledToday(ticketId: string, agentPath: string): boolean {
  const runDate = new Date().toISOString().slice(0, 10);
  const row = getDb()
    .prepare(
      `SELECT 1 FROM workflow_polling_history
       WHERE ticket_id = ? AND agent_path = ? AND run_date = ? LIMIT 1`,
    )
    .get(ticketId, agentPath, runDate);
  return !!row;
}
