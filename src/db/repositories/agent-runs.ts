import { getDb } from "../client.js";
import { randomUUID } from "crypto";

export type AgentRunStatus = "running" | "done" | "failed" | "killed";

export interface AgentRun {
  id: string;
  page: string;
  agent_name: string | null;
  ticket_id: string | null;
  command: string;
  status: AgentRunStatus;
  exit_code: number | null;
  started_at: string;
  ended_at: string | null;
}

export function createAgentRun(fields: {
  page: string;
  agent_name?: string | null;
  ticket_id?: string | null;
  command: string;
}): AgentRun {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO agent_runs (id, page, agent_name, ticket_id, command) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    id,
    fields.page,
    fields.agent_name ?? null,
    fields.ticket_id ?? null,
    fields.command,
  );
  return getAgentRun(id)!;
}

export function getAgentRun(id: string): AgentRun | null {
  const db = getDb();
  return (
    (db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as AgentRun) ??
    null
  );
}

export function listAgentRunsByTicket(ticketId: string): AgentRun[] {
  return getDb()
    .prepare(
      "SELECT * FROM agent_runs WHERE ticket_id = ? ORDER BY started_at DESC",
    )
    .all(ticketId) as AgentRun[];
}

export function listAgentRuns(page?: string): AgentRun[] {
  const db = getDb();
  if (page) {
    return db
      .prepare(
        "SELECT * FROM agent_runs WHERE page = ? ORDER BY started_at DESC",
      )
      .all(page) as AgentRun[];
  }
  return db
    .prepare("SELECT * FROM agent_runs ORDER BY started_at DESC")
    .all() as AgentRun[];
}

export function finishAgentRun(
  id: string,
  status: AgentRunStatus,
  exitCode: number,
): void {
  const db = getDb();
  db.prepare(
    `UPDATE agent_runs SET status = ?, exit_code = ?, ended_at = datetime('now') WHERE id = ?`,
  ).run(status, exitCode, id);
}

export function killAgentRun(id: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE agent_runs SET status = 'killed', ended_at = datetime('now') WHERE id = ? AND status = 'running'`,
  ).run(id);
}

/**
 * Returns true if the ticket has at least one completed (non-running) agent run recorded.
 * When sameDay is true, only runs started today (UTC) are considered.
 * When agentPaths is provided (non-empty), only runs whose agent_name matches
 * one of the path filenames are considered.
 */
export function hasAgentRunForTicket(
  ticketId: string,
  sameDay: boolean,
  agentPaths?: string[],
): boolean {
  const db = getDb();
  const dayClause = sameDay ? " AND started_at >= date('now')" : "";

  // Resolve full paths → filenames (that's what agent_name stores)
  const agentNames =
    agentPaths && agentPaths.length > 0
      ? agentPaths.map((p) => p.split("/").pop()).filter(Boolean)
      : null;

  if (agentNames && agentNames.length > 0) {
    const placeholders = agentNames.map(() => "?").join(",");
    const row = db
      .prepare(
        `SELECT 1 FROM agent_runs WHERE ticket_id = ? AND status != 'running'${dayClause} AND agent_name IN (${placeholders}) LIMIT 1`,
      )
      .get(ticketId, ...agentNames);
    return !!row;
  }

  const row = db
    .prepare(
      `SELECT 1 FROM agent_runs WHERE ticket_id = ? AND status != 'running'${dayClause} LIMIT 1`,
    )
    .get(ticketId);
  return !!row;
}

export function deleteAgentRun(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM agent_runs WHERE id = ?").run(id);
}
