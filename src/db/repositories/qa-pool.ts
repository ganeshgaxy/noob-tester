import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export interface QaPoolAgent {
  id: string;
  ticket_id: string;
  agent_path: string;
  target: string | null;
  role: string;
  file: string | null;
  launch_dir: string | null;
  created_at: string;
}

export function addAgent(
  ticketId: string,
  agentPath: string,
  target: string | null,
  role: string,
  file: string | null,
  launchDir: string | null = null,
): string {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO qa_pool_agents (id, ticket_id, agent_path, target, role, file, launch_dir)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ticketId,
    agentPath,
    target ?? null,
    role,
    file ?? null,
    launchDir ?? null,
  );
  return id;
}

export function listAgents(ticketId: string): QaPoolAgent[] {
  return getDb()
    .prepare(
      "SELECT * FROM qa_pool_agents WHERE ticket_id = ? ORDER BY created_at ASC",
    )
    .all(ticketId) as QaPoolAgent[];
}

export function removeAgent(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM qa_pool_agents WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function getAgentsByTicket(ticketId: string): QaPoolAgent[] {
  return listAgents(ticketId);
}

export interface UpdateAgentFields {
  agent_path?: string;
  target?: string | null;
  role?: string;
  file?: string | null;
  launch_dir?: string | null;
}

/**
 * Update one or more fields of an existing qa_pool_agents row.
 * Returns true if a row was found and updated.
 */
export function updateAgent(id: string, fields: UpdateAgentFields): boolean {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (fields.agent_path !== undefined) {
    setClauses.push("agent_path = ?");
    values.push(fields.agent_path);
  }
  if (fields.target !== undefined) {
    setClauses.push("target = ?");
    values.push(fields.target ?? null);
  }
  if (fields.role !== undefined) {
    setClauses.push("role = ?");
    values.push(fields.role);
  }
  if (fields.file !== undefined) {
    setClauses.push("file = ?");
    values.push(fields.file ?? null);
  }
  if (fields.launch_dir !== undefined) {
    setClauses.push("launch_dir = ?");
    values.push(fields.launch_dir ?? null);
  }

  if (setClauses.length === 0) return false;

  values.push(id);
  const result = db
    .prepare(`UPDATE qa_pool_agents SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

/** Build the noob-explore invocation string for a stored agent config. */
export function buildInvocation(agent: QaPoolAgent): string {
  let s = `run with agent @${agent.agent_path} on jira ${agent.ticket_id}`;
  if (agent.target) s += ` with target ${agent.target}`;
  if (agent.role && agent.role !== "default") s += ` and role ${agent.role}`;
  if (agent.file) s += ` and file ${agent.file}`;
  return s;
}
