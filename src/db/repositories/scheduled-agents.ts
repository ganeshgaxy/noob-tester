import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export interface ScheduledAgent {
  id: string;
  agent_path: string;
  ticket_id: string;
  cron_expression: string;
  parameters?: Record<string, any>;
  status: "active" | "paused" | "disabled";
  description?: string;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentExecutionHistory {
  id: string;
  schedule_id: string;
  session_id?: string;
  run_id?: string;
  started_at?: string;
  completed_at?: string;
  status: "running" | "success" | "failed" | "skipped";
  exit_code?: number;
  logs?: string;
  error_message?: string;
  created_at: string;
}

export function createScheduledAgent(input: {
  agent_path: string;
  ticket_id: string;
  cron_expression: string;
  parameters?: Record<string, any>;
  status?: "active" | "paused" | "disabled";
  description?: string;
}): string {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO scheduled_agents (id, agent_path, ticket_id, cron_expression, parameters, status, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    input.agent_path,
    input.ticket_id,
    input.cron_expression,
    input.parameters ? JSON.stringify(input.parameters) : null,
    input.status ?? "active",
    input.description ?? null
  );
  return id;
}

export function getScheduledAgent(id: string): ScheduledAgent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM scheduled_agents WHERE id = ?").get(id) as any;
  if (!row) return null;
  return {
    ...row,
    parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
  };
}

export function listScheduledAgents(opts?: { ticket?: string; status?: string }): ScheduledAgent[] {
  const db = getDb();
  let sql = "SELECT * FROM scheduled_agents WHERE 1=1";
  const params: any[] = [];
  if (opts?.ticket) {
    sql += " AND ticket_id = ?";
    params.push(opts.ticket);
  }
  if (opts?.status) {
    sql += " AND status = ?";
    params.push(opts.status);
  }
  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(row => ({
    ...row,
    parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
  }));
}

export function updateScheduledAgent(id: string, updates: Partial<ScheduledAgent>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.agent_path !== undefined) {
    fields.push("agent_path = ?");
    values.push(updates.agent_path);
  }
  if (updates.ticket_id !== undefined) {
    fields.push("ticket_id = ?");
    values.push(updates.ticket_id);
  }
  if (updates.cron_expression !== undefined) {
    fields.push("cron_expression = ?");
    values.push(updates.cron_expression);
  }
  if (updates.parameters !== undefined) {
    fields.push("parameters = ?");
    values.push(JSON.stringify(updates.parameters));
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.next_run_at !== undefined) {
    fields.push("next_run_at = ?");
    values.push(updates.next_run_at);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE scheduled_agents SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteScheduledAgent(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM agent_execution_history WHERE schedule_id = ?").run(id);
  db.prepare("DELETE FROM scheduled_agents WHERE id = ?").run(id);
}

export function updateLastRun(id: string, nextRunAt?: string): void {
  const db = getDb();
  db.prepare("UPDATE scheduled_agents SET last_run_at = datetime('now'), next_run_at = ? WHERE id = ?").run(
    nextRunAt ?? null,
    id
  );
}

// ── Execution History ──

export function recordExecution(input: {
  schedule_id: string;
  session_id?: string;
  run_id?: string;
  status: "running" | "success" | "failed" | "skipped";
  exit_code?: number;
  logs?: string;
  error_message?: string;
}): string {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO agent_execution_history (id, schedule_id, session_id, run_id, started_at, status, exit_code, logs, error_message, created_at)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, datetime('now'))`
  ).run(
    id,
    input.schedule_id,
    input.session_id ?? null,
    input.run_id ?? null,
    input.status,
    input.exit_code ?? null,
    input.logs ?? null,
    input.error_message ?? null
  );
  return id;
}

export function completeExecution(id: string, updates: { status: string; exit_code?: number; logs?: string }): void {
  const db = getDb();
  db.prepare(
    "UPDATE agent_execution_history SET status = ?, exit_code = ?, logs = ?, completed_at = datetime('now') WHERE id = ?"
  ).run(updates.status, updates.exit_code ?? null, updates.logs ?? null, id);
}

export function getExecutionHistory(scheduleId: string, limit: number = 50): AgentExecutionHistory[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_execution_history WHERE schedule_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(scheduleId, limit) as AgentExecutionHistory[];
}

export function getRecentExecutions(limit: number = 20): AgentExecutionHistory[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_execution_history ORDER BY created_at DESC LIMIT ?")
    .all(limit) as AgentExecutionHistory[];
}
