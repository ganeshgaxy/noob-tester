import { v4 as uuid } from "uuid";
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, statSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { getDb } from "../client.js";
import { dataDir } from "../client.js";
import type { TicketContextRow } from "../types.js";

/** Base directory for ticket context files. */
function contextDir(ticketId?: string): string {
  const base = join(dataDir(), "ticket-context");
  mkdirSync(base, { recursive: true });
  if (ticketId) {
    const dir = join(base, ticketId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  return base;
}

/** Convert context_type to a safe filename. e.g. "mr_diff:!423" → "mr_diff_423.json" */
function typeToFilename(contextType: string): string {
  return contextType.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
}

/**
 * Save content to the ticket context cache.
 * Writes content to filesystem, upserts index row in SQLite.
 */
export function saveContext(params: {
  ticketId: string;
  contextType: string;
  content: string;
  ttlMinutes?: number;
  source?: string;
}): string {
  const db = getDb();
  const dir = contextDir(params.ticketId);
  const filename = typeToFilename(params.contextType);
  const filePath = join(dir, filename);

  // Write content to file
  writeFileSync(filePath, params.content, "utf-8");
  const size = Buffer.byteLength(params.content, "utf-8");

  // Upsert index row
  const existing = db.prepare(
    "SELECT id FROM ticket_context_index WHERE ticket_id = ? AND context_type = ?"
  ).get(params.ticketId, params.contextType) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE ticket_context_index
       SET file_path = ?, fetched_at = datetime('now'), ttl_minutes = ?, source = ?, size_bytes = ?
       WHERE id = ?`
    ).run(filePath, params.ttlMinutes ?? 1440, params.source ?? null, size, existing.id);
    return existing.id;
  } else {
    const id = uuid();
    db.prepare(
      `INSERT INTO ticket_context_index (id, ticket_id, context_type, file_path, ttl_minutes, source, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.ticketId, params.contextType, filePath, params.ttlMinutes ?? 1440, params.source ?? null, size);
    return id;
  }
}

/**
 * Get cached context. Returns { cached: true, content, row } or { cached: false }.
 * Checks TTL — returns miss if stale.
 */
export function getContext(
  ticketId: string,
  contextType: string,
  opts?: { ignoreTtl?: boolean }
): { cached: boolean; content?: string; row?: TicketContextRow } {
  const db = getDb();

  let sql = `SELECT * FROM ticket_context_index WHERE ticket_id = ? AND context_type = ?`;
  const params: unknown[] = [ticketId, contextType];

  if (!opts?.ignoreTtl) {
    sql += ` AND datetime(fetched_at, '+' || ttl_minutes || ' minutes') > datetime('now')`;
  }

  const row = db.prepare(sql).get(...params) as TicketContextRow | undefined;
  if (!row) return { cached: false };

  // Read file content
  if (!existsSync(row.file_path)) {
    // Index exists but file is gone — clean up
    db.prepare("DELETE FROM ticket_context_index WHERE id = ?").run(row.id);
    return { cached: false };
  }

  const content = readFileSync(row.file_path, "utf-8");
  return { cached: true, content, row };
}

/**
 * Get all cached contexts for a ticket matching a type prefix.
 * e.g. getContextsByPrefix("PROJ-123", "mr_diff") returns all MR diffs.
 */
export function getContextsByPrefix(
  ticketId: string,
  typePrefix: string,
  opts?: { ignoreTtl?: boolean }
): Array<{ row: TicketContextRow; content: string }> {
  const db = getDb();

  let sql = `SELECT * FROM ticket_context_index WHERE ticket_id = ? AND context_type LIKE ?`;
  const params: unknown[] = [ticketId, typePrefix + "%"];

  if (!opts?.ignoreTtl) {
    sql += ` AND datetime(fetched_at, '+' || ttl_minutes || ' minutes') > datetime('now')`;
  }

  sql += " ORDER BY context_type";
  const rows = db.prepare(sql).all(...params) as TicketContextRow[];
  const results: Array<{ row: TicketContextRow; content: string }> = [];

  for (const row of rows) {
    if (!existsSync(row.file_path)) {
      db.prepare("DELETE FROM ticket_context_index WHERE id = ?").run(row.id);
      continue;
    }
    const content = readFileSync(row.file_path, "utf-8");
    results.push({ row, content });
  }
  return results;
}

/**
 * Invalidate (delete) cached context.
 * - Specific type: invalidate("PROJ-123", "mr_diff:!423")
 * - Type prefix:   invalidate("PROJ-123", "mr_diff") — deletes all mr_diff:* entries
 * - All for ticket: invalidate("PROJ-123")
 */
export function invalidateContext(ticketId: string, contextType?: string): number {
  const db = getDb();

  if (!contextType) {
    // Delete all for ticket
    const rows = db.prepare(
      "SELECT id, file_path FROM ticket_context_index WHERE ticket_id = ?"
    ).all(ticketId) as Array<{ id: string; file_path: string }>;
    for (const r of rows) {
      try { unlinkSync(r.file_path); } catch { /* file may not exist */ }
    }
    const result = db.prepare("DELETE FROM ticket_context_index WHERE ticket_id = ?").run(ticketId);
    // Remove ticket directory
    const dir = join(dataDir(), "ticket-context", ticketId);
    try { rmSync(dir, { recursive: true }); } catch { /* may not exist */ }
    return result.changes;
  }

  // Check for exact match first
  const exact = db.prepare(
    "SELECT id, file_path FROM ticket_context_index WHERE ticket_id = ? AND context_type = ?"
  ).get(ticketId, contextType) as { id: string; file_path: string } | undefined;

  if (exact) {
    try { unlinkSync(exact.file_path); } catch {}
    db.prepare("DELETE FROM ticket_context_index WHERE id = ?").run(exact.id);
    return 1;
  }

  // Prefix match (e.g. "mr_diff" matches "mr_diff:!423", "mr_diff:!425")
  const rows = db.prepare(
    "SELECT id, file_path FROM ticket_context_index WHERE ticket_id = ? AND context_type LIKE ?"
  ).all(ticketId, contextType + ":%") as Array<{ id: string; file_path: string }>;

  for (const r of rows) {
    try { unlinkSync(r.file_path); } catch {}
  }
  if (rows.length > 0) {
    db.prepare(
      "DELETE FROM ticket_context_index WHERE ticket_id = ? AND context_type LIKE ?"
    ).run(ticketId, contextType + ":%");
  }
  return rows.length;
}

/**
 * List all cached contexts for a ticket (index only, no file content).
 */
export function listContexts(ticketId: string): TicketContextRow[] {
  return getDb()
    .prepare("SELECT * FROM ticket_context_index WHERE ticket_id = ? ORDER BY context_type")
    .all(ticketId) as TicketContextRow[];
}

/**
 * List all tickets that have cached context.
 */
export function listCachedTickets() {
  return getDb()
    .prepare(
      `SELECT ticket_id,
              COUNT(*) as entry_count,
              SUM(size_bytes) as total_bytes,
              MIN(fetched_at) as oldest,
              MAX(fetched_at) as newest
       FROM ticket_context_index
       GROUP BY ticket_id
       ORDER BY MAX(fetched_at) DESC`
    )
    .all();
}

/**
 * Purge all stale entries (past TTL). Run periodically or on startup.
 */
export function purgeStale(): number {
  const db = getDb();
  const stale = db.prepare(
    `SELECT id, file_path FROM ticket_context_index
     WHERE datetime(fetched_at, '+' || ttl_minutes || ' minutes') < datetime('now')`
  ).all() as Array<{ id: string; file_path: string }>;

  for (const r of stale) {
    try { unlinkSync(r.file_path); } catch {}
  }

  if (stale.length > 0) {
    db.prepare(
      `DELETE FROM ticket_context_index
       WHERE datetime(fetched_at, '+' || ttl_minutes || ' minutes') < datetime('now')`
    ).run();
  }
  return stale.length;
}
