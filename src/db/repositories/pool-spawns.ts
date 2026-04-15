import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export interface PoolSpawn {
  id: string;
  ticket_id: string;
  agent_path: string;
  pid: number;
  status: "running" | "completed" | "killed" | "error";
  spawn_type: "pool" | "visual-pool";
  created_at: string;
  completed_at: string | null;
  exit_code: number | null;
  notes: string | null;
}

/** Record a newly spawned pool agent */
export function recordSpawn(
  ticketId: string,
  agentPath: string,
  pid: number,
  spawnType: "pool" | "visual-pool",
): string {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO pool_spawns (id, ticket_id, agent_path, pid, status, spawn_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, ticketId, agentPath, pid, "running", spawnType);
  return id;
}

/** List all spawns for a ticket */
export function listSpawnsForTicket(ticketId: string): PoolSpawn[] {
  return getDb()
    .prepare("SELECT * FROM pool_spawns WHERE ticket_id = ? ORDER BY created_at DESC")
    .all(ticketId) as PoolSpawn[];
}

/** Get active (running) spawns for a ticket */
export function getActiveSpawnsForTicket(ticketId: string): PoolSpawn[] {
  return getDb()
    .prepare(
      "SELECT * FROM pool_spawns WHERE ticket_id = ? AND status = 'running' ORDER BY created_at DESC",
    )
    .all(ticketId) as PoolSpawn[];
}

/** Mark a spawn as completed */
export function markSpawnCompleted(
  id: string,
  exitCode: number | null,
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE pool_spawns
       SET status = ?, exit_code = ?, completed_at = datetime('now')
       WHERE id = ?`,
    )
    .run(exitCode === 0 ? "completed" : "error", exitCode, id);
  return result.changes > 0;
}

/** Mark a spawn as killed */
export function markSpawnKilled(id: string, notes?: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE pool_spawns
       SET status = ?, notes = ?, completed_at = datetime('now')
       WHERE id = ?`,
    )
    .run("killed", notes || null, id);
  return result.changes > 0;
}

/** Get spawn by ID */
export function getSpawn(id: string): PoolSpawn | null {
  return (
    (getDb().prepare("SELECT * FROM pool_spawns WHERE id = ?").get(id) as PoolSpawn | undefined) || null
  );
}

/** Get spawn by PID */
export function getSpawnByPid(pid: number): PoolSpawn | null {
  return (
    (getDb().prepare("SELECT * FROM pool_spawns WHERE pid = ?").get(pid) as PoolSpawn | undefined) || null
  );
}

/** Kill all active spawns for a ticket (mark as killed, but doesn't actually kill processes) */
export function killAllSpawnsForTicket(ticketId: string): number {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE pool_spawns
       SET status = ?, completed_at = datetime('now'), notes = ?
       WHERE ticket_id = ? AND status = 'running'`,
    )
    .run("killed", "killed by user via UI/CLI", ticketId);
  return result.changes;
}

/** Get PIDs of all active spawns for a ticket (for actual process killing) */
export function getActiveSpawnPids(ticketId: string): number[] {
  const spawns = getActiveSpawnsForTicket(ticketId);
  return spawns.map((s) => s.pid);
}
