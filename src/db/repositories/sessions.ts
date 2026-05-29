import { v4 as uuid } from "uuid";
import { hostname } from "os";
import { getDb } from "../client.js";
import { logPhaseTransition } from "./phase-transitions.js";

const STALE_THRESHOLD_MINUTES = 5;

export interface SessionRow {
  id: string;
  created_at: string;
  last_heartbeat: string;
  ended_at: string | null;
  status: string;
  pid: number | null;
  hostname: string | null;
  task_summary: string | null;
  current_run_id: string | null;
  current_phase: number;
  metadata_json: string | null;
  labels: string | null;
  ticket_refs: string | null;
  stream_port: number | null;
}

const STREAM_PORT_MIN = 7700;
const STREAM_PORT_MAX = 7799;

/**
 * Allocate a unique stream port for a session by finding the first port in
 * the [STREAM_PORT_MIN, STREAM_PORT_MAX] range not used by any session.
 * Returns null if no ports are available.
 */
export function allocateStreamPort(): number | null {
  const db = getDb();
  const usedRows = db
    .prepare(
      "SELECT stream_port FROM sessions WHERE stream_port IS NOT NULL",
    )
    .all() as Array<{ stream_port: number }>;
  const used = new Set(usedRows.map((r) => r.stream_port));
  for (let port = STREAM_PORT_MIN; port <= STREAM_PORT_MAX; port++) {
    if (!used.has(port)) return port;
  }
  return null;
}

export function createSession(opts: {
  taskSummary?: string;
  labels?: string[];
  ticketRefs?: string[];
  metadata?: Record<string, unknown>;
  streamPort?: number | null;
}): { id: string; streamPort: number | null } {
  const id = uuid();
  const streamPort =
    opts.streamPort !== undefined ? opts.streamPort : allocateStreamPort();
  getDb()
    .prepare(
      `INSERT INTO sessions (id, pid, hostname, task_summary, labels, ticket_refs, metadata_json, stream_port)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      process.pid,
      hostname(),
      opts.taskSummary ?? null,
      opts.labels ? JSON.stringify(opts.labels) : null,
      opts.ticketRefs ? JSON.stringify(opts.ticketRefs) : null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      streamPort,
    );
  return { id, streamPort };
}

export function heartbeatSession(
  sessionId: string,
  opts?: {
    runId?: string;
    phase?: number;
    taskSummary?: string;
    labels?: string[];
    ticketRefs?: string[];
  },
): void {
  const db = getDb();
  const sets = ["last_heartbeat = datetime('now')"];
  const params: unknown[] = [];

  if (opts?.runId !== undefined) {
    sets.push("current_run_id = ?");
    params.push(opts.runId);
  }
  if (opts?.phase !== undefined) {
    // Get current state before updating
    const current = db
      .prepare(
        "SELECT current_phase, current_run_id FROM sessions WHERE id = ?",
      )
      .get(sessionId) as
      | { current_phase: number; current_run_id: string | null }
      | undefined;
    const runId = opts.runId ?? current?.current_run_id;

    sets.push("current_phase = ?");
    params.push(opts.phase);

    if (runId && current && current.current_phase !== opts.phase) {
      // Log transition (only if phase actually changed for this session)
      logPhaseTransition(runId, sessionId, current.current_phase, opts.phase);

      // Also update the run's phase (so next session sees the correct from_phase)
      db.prepare(
        "UPDATE runs SET phase = ?, updated_at = datetime('now') WHERE id = ? AND phase < ?",
      ).run(opts.phase, runId, opts.phase);
    }
  }
  if (opts?.taskSummary !== undefined) {
    sets.push("task_summary = ?");
    params.push(opts.taskSummary);
  }
  if (opts?.labels !== undefined) {
    sets.push("labels = ?");
    params.push(JSON.stringify(opts.labels));
  }
  if (opts?.ticketRefs !== undefined) {
    // Merge with existing ticket refs (don't replace)
    const existing = db
      .prepare("SELECT ticket_refs FROM sessions WHERE id = ?")
      .get(sessionId) as { ticket_refs: string | null } | undefined;
    const existingRefs: string[] = existing?.ticket_refs
      ? JSON.parse(existing.ticket_refs)
      : [];
    const merged = [...new Set([...existingRefs, ...opts.ticketRefs])];
    sets.push("ticket_refs = ?");
    params.push(JSON.stringify(merged));
  }

  params.push(sessionId);
  db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params,
  );
}

export function endSession(
  sessionId: string,
  status: string = "completed",
): void {
  getDb()
    .prepare(
      `UPDATE sessions SET status = ?, ended_at = datetime('now'), last_heartbeat = datetime('now')
       WHERE id = ?`,
    )
    .run(status, sessionId);
}

export function getSession(sessionId: string): SessionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as SessionRow | undefined;
}

/**
 * List sessions. Automatically marks stale sessions
 * (no heartbeat in STALE_THRESHOLD_MINUTES).
 */
export function listSessions(opts?: {
  activeOnly?: boolean;
  limit?: number;
}): SessionRow[] {
  const db = getDb();

  // Mark stale sessions
  db.prepare(
    `UPDATE sessions SET status = 'stale'
     WHERE status = 'active'
       AND last_heartbeat < datetime('now', ?)
    `,
  ).run(`-${STALE_THRESHOLD_MINUTES} minutes`);

  let sql = "SELECT * FROM sessions";
  const params: unknown[] = [];

  if (opts?.activeOnly) {
    sql += " WHERE status = 'active'";
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(opts?.limit ?? 50);

  return db.prepare(sql).all(...params) as SessionRow[];
}

/**
 * Get active session count.
 */
export function activeSessionCount(): number {
  const db = getDb();

  // Mark stale first
  db.prepare(
    `UPDATE sessions SET status = 'stale'
     WHERE status = 'active'
       AND last_heartbeat < datetime('now', ?)
    `,
  ).run(`-${STALE_THRESHOLD_MINUTES} minutes`);

  const row = db
    .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'")
    .get() as { c: number };
  return row.c;
}

/**
 * Link a run to a session.
 */
export function linkRunToSession(runId: string, sessionId: string): void {
  getDb()
    .prepare("UPDATE runs SET session_id = ? WHERE id = ?")
    .run(sessionId, runId);
}
