import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type { RunPackEntryRow } from "../types.js";

export interface CreateRunPackInput {
  ticketId: string;
  runId: string;
  sessionId?: string;
  targetUrl?: string;
  secretTarget?: string;
  secretRole?: string;
  captureConfig?: string[];
}

/**
 * Create an empty run pack for a ticket.
 * Test cases are added incrementally via addEntry / claimNext.
 */
export function createRunPack(input: CreateRunPackInput): string {
  const runPackId = uuid();
  getDb()
    .prepare(
      `INSERT INTO run_pack_entries
       (id, run_pack_id, ticket_id, run_id, session_id, test_case_id, fresh_or_existing, status,
        target_url, secret_target, secret_role, capture_config)
       VALUES (?, ?, ?, ?, ?, '__header__', 'fresh', 'header', ?, ?, ?, ?)`,
    )
    .run(
      uuid(),
      runPackId,
      input.ticketId,
      input.runId,
      input.sessionId ?? null,
      input.targetUrl ?? null,
      input.secretTarget ?? null,
      input.secretRole ?? null,
      input.captureConfig ? JSON.stringify(input.captureConfig) : null,
    );

  return runPackId;
}

/**
 * Get run pack metadata from the header row.
 */
/**
 * Resolve a short prefix (e.g. "f7d9ad6c") to the full run_pack_id UUID.
 */
export function resolveRunPackId(idOrPrefix: string): string | null {
  if (idOrPrefix.length >= 36) return idOrPrefix; // already full UUID
  const row = getDb()
    .prepare(
      "SELECT DISTINCT run_pack_id FROM run_pack_entries WHERE run_pack_id LIKE ? LIMIT 2",
    )
    .all(idOrPrefix + "%") as Array<{ run_pack_id: string }>;
  if (row.length === 1) return row[0].run_pack_id;
  return null; // ambiguous or not found
}

export function getRunPackMeta(runPackId: string) {
  return getDb()
    .prepare(
      "SELECT run_pack_id, ticket_id, run_id, target_url, secret_target, secret_role, capture_config, created_at FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id = '__header__'",
    )
    .get(runPackId) as
    | {
        run_pack_id: string;
        ticket_id: string;
        run_id: string;
        target_url: string | null;
        secret_target: string | null;
        secret_role: string | null;
        capture_config: string | null;
        created_at: string;
      }
    | undefined;
}

/**
 * Add a specific test case to a run pack.
 * Returns the new entry, or null if the test case is already in the pack.
 */
export function addEntry(
  runPackId: string,
  testCaseId: string,
  opts?: { runId?: string; sessionId?: string },
): RunPackEntryRow | null {
  const db = getDb();

  // Check if already in pack
  const existing = db
    .prepare(
      "SELECT id FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id = ?",
    )
    .get(runPackId, testCaseId);

  if (existing) return null;

  // Get pack metadata from header
  const header = db
    .prepare(
      "SELECT ticket_id, run_id FROM run_pack_entries WHERE run_pack_id = ? LIMIT 1",
    )
    .get(runPackId) as { ticket_id: string; run_id: string } | undefined;

  if (!header) return null;

  // Look up the test case title to denormalize into the entry
  const tc = db
    .prepare("SELECT title FROM test_cases WHERE id = ?")
    .get(testCaseId) as { title: string } | undefined;

  const id = uuid();
  db.prepare(
    `INSERT INTO run_pack_entries
     (id, run_pack_id, ticket_id, run_id, session_id, test_case_id, tc_title, fresh_or_existing, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'fresh', 'pending')`,
  ).run(
    id,
    runPackId,
    header.ticket_id,
    opts?.runId ?? header.run_id,
    opts?.sessionId ?? null,
    testCaseId,
    tc?.title ?? null,
  );

  return db
    .prepare("SELECT * FROM run_pack_entries WHERE id = ?")
    .get(id) as RunPackEntryRow;
}

/**
 * Pick the next test case not yet in the run pack, add it, and claim it.
 * This is the main entry point for noob-explore sessions.
 * Returns the entry + test case details, or null if all test cases are already in the pack.
 */
export function claimNextNewEntry(
  runPackId: string,
  ticketId: string,
  sessionId: string,
  opts?: {
    runId?: string;
    layer?: string;
    runner?: string;
    riskBased?: boolean;
    name?: string;
  },
) {
  const db = getDb();

  // Get test case IDs already in this run pack
  const existingTcIds = db
    .prepare(
      "SELECT test_case_id FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id != '__header__'",
    )
    .all(runPackId) as Array<{ test_case_id: string }>;

  const existingSet = new Set(existingTcIds.map((r) => r.test_case_id));

  // Find next ready test case not in the pack, by priority
  const layerFilter = opts?.layer ? " AND COALESCE(test_layer, 'ui') = ?" : "";
  const nameFilter = opts?.name ? " AND LOWER(title) LIKE LOWER(?)" : "";
  const params: unknown[] = [ticketId];
  if (opts?.layer) params.push(opts.layer);
  if (opts?.name) params.push(`%${opts.name}%`);

  const orderClause = opts?.riskBased
    ? "ORDER BY COALESCE(risk_score, 0) DESC, priority ASC, created_at ASC"
    : "ORDER BY priority ASC, created_at ASC";

  const allReady = db
    .prepare(
      `SELECT id FROM test_cases
       WHERE ticket_ref = ? AND ready = 1${layerFilter}${nameFilter}
       ${orderClause}`,
    )
    .all(...params) as Array<{ id: string }>;

  const nextTc = allReady.find((tc) => !existingSet.has(tc.id));
  if (!nextTc) return null;

  // Get pack metadata + test case title
  const header = db
    .prepare(
      "SELECT run_id FROM run_pack_entries WHERE run_pack_id = ? LIMIT 1",
    )
    .get(runPackId) as { run_id: string } | undefined;

  const tcRow = db
    .prepare("SELECT title FROM test_cases WHERE id = ?")
    .get(nextTc.id) as { title: string } | undefined;

  // Add and claim in one go
  const entryId = uuid();
  const runner =
    opts?.runner ??
    (opts?.layer === "api" ? "api" : opts?.layer === "ui_api" ? "api" : "ui");
  db.prepare(
    `INSERT INTO run_pack_entries
     (id, run_pack_id, ticket_id, run_id, session_id, test_case_id, tc_title, fresh_or_existing, status, started_at, runner)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'fresh', 'claimed', datetime('now'), ?)`,
  ).run(
    entryId,
    runPackId,
    ticketId,
    opts?.runId ?? header?.run_id ?? "",
    sessionId,
    nextTc.id,
    tcRow?.title ?? null,
    runner,
  );

  // Return entry joined with test case details
  return db
    .prepare(
      `SELECT rpe.*, tc.title as tc_title, tc.type as tc_type, tc.format as tc_format,
              tc.priority as tc_priority, tc.bdd_feature, tc.bdd_scenario,
              tc.bdd_given, tc.bdd_when, tc.bdd_then, tc.trad_steps, tc.trad_expected,
              tc.description as tc_description, tc.preconditions as tc_preconditions,
              tc.test_layer as tc_layer
       FROM run_pack_entries rpe
       JOIN test_cases tc ON rpe.test_case_id = tc.id
       WHERE rpe.id = ?`,
    )
    .get(entryId);
}

/**
 * Claim the next pending entry in a run pack for execution.
 * @param name - Optional substring filter on tc_title (case-insensitive)
 */
export function claimNextEntry(
  runPackId: string,
  sessionId: string,
  opts?: { name?: string },
): RunPackEntryRow | null {
  const db = getDb();

  const nameFilter = opts?.name ? " AND LOWER(rpe.tc_title) LIKE LOWER(?)" : "";
  const params: unknown[] = [runPackId];
  if (opts?.name) params.push(`%${opts.name}%`);

  const entry = db
    .prepare(
      `SELECT rpe.* FROM run_pack_entries rpe
       JOIN test_cases tc ON rpe.test_case_id = tc.id
       WHERE rpe.run_pack_id = ? AND rpe.status = 'pending' AND rpe.test_case_id != '__header__'${nameFilter}
       ORDER BY tc.priority ASC, rpe.created_at ASC
       LIMIT 1`,
    )
    .get(...params) as RunPackEntryRow | undefined;

  if (!entry) return null;

  db.prepare(
    `UPDATE run_pack_entries SET
       status = 'claimed',
       session_id = ?,
       started_at = datetime('now')
     WHERE id = ?`,
  ).run(sessionId, entry.id);

  return db
    .prepare("SELECT * FROM run_pack_entries WHERE id = ?")
    .get(entry.id) as RunPackEntryRow;
}

/**
 * Record the result of a run pack entry execution.
 */
export function updateEntryResult(
  entryId: string,
  status: "passed" | "failed" | "skipped" | "blocked",
  result?: {
    results?: string;
    logs?: string;
    observations?: string;
    issues?: string;
  },
): void {
  const db = getDb();

  // Only update fields that are explicitly provided — don't overwrite
  // auto-populated fields (e.g. logs from capture-page) with null.
  const sets: string[] = ["status = ?", "completed_at = datetime('now')"];
  const params: unknown[] = [status];

  if (result?.results !== undefined) {
    sets.push("results = ?");
    params.push(result.results);
  }
  if (result?.logs !== undefined) {
    sets.push("logs = ?");
    params.push(result.logs);
  }
  if (result?.observations !== undefined) {
    sets.push("observations = ?");
    params.push(result.observations);
  }
  if (result?.issues !== undefined) {
    sets.push("issues = ?");
    params.push(result.issues);
  }

  params.push(entryId);
  db.prepare(`UPDATE run_pack_entries SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params,
  );
}

export interface Artifact {
  type:
    | "screenshot"
    | "snapshot"
    | "video"
    | "har"
    | "console"
    | "trace"
    | "api_request";
  path: string;
  label?: string;
  timestamp?: string;
  step?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Add an artifact to a run pack entry (appends to JSON array).
 */
export function addEntryArtifact(entryId: string, artifact: Artifact): void {
  const db = getDb();
  const entry = db
    .prepare("SELECT artifacts FROM run_pack_entries WHERE id = ?")
    .get(entryId) as { artifacts: string | null } | undefined;

  if (!entry) return;

  let artifacts: Artifact[] = [];
  if (entry.artifacts) {
    try {
      artifacts = JSON.parse(entry.artifacts);
    } catch {
      artifacts = [];
    }
  }

  artifact.timestamp = artifact.timestamp ?? new Date().toISOString();
  artifacts.push(artifact);

  db.prepare("UPDATE run_pack_entries SET artifacts = ? WHERE id = ?").run(
    JSON.stringify(artifacts),
    entryId,
  );
}

/**
 * Get all artifacts for a run pack entry.
 */
export function getEntryArtifacts(entryId: string): Artifact[] {
  const entry = getDb()
    .prepare("SELECT artifacts FROM run_pack_entries WHERE id = ?")
    .get(entryId) as { artifacts: string | null } | undefined;

  if (!entry?.artifacts) return [];
  try {
    return JSON.parse(entry.artifacts);
  } catch {
    return [];
  }
}

/**
 * Add an observation to a run pack entry (appends to existing JSON array).
 */
export function addEntryObservation(
  entryId: string,
  observation: string,
): void {
  const db = getDb();
  const entry = db
    .prepare("SELECT observations FROM run_pack_entries WHERE id = ?")
    .get(entryId) as { observations: string | null } | undefined;

  if (!entry) return;

  let observations: string[] = [];
  if (entry.observations) {
    try {
      observations = JSON.parse(entry.observations);
    } catch {
      observations = [];
    }
  }
  observations.push(observation);

  db.prepare("UPDATE run_pack_entries SET observations = ? WHERE id = ?").run(
    JSON.stringify(observations),
    entryId,
  );
}

/**
 * Add a log entry to a run pack entry (appends to existing JSON array).
 */
export function addEntryLog(entryId: string, log: string): void {
  const db = getDb();
  const entry = db
    .prepare("SELECT logs FROM run_pack_entries WHERE id = ?")
    .get(entryId) as { logs: string | null } | undefined;

  if (!entry) return;

  let logs: string[] = [];
  if (entry.logs) {
    try {
      logs = JSON.parse(entry.logs);
    } catch {
      logs = [];
    }
  }
  logs.push(log);

  db.prepare("UPDATE run_pack_entries SET logs = ? WHERE id = ?").run(
    JSON.stringify(logs),
    entryId,
  );
}

/**
 * Resolve a run pack for a ticket: resume an existing pack with pending/claimed/failed entries,
 * or create a new one. Releases stale claims on resume. Returns { runPackId, resumed }.
 */
export function resolveRunPack(
  ticketId: string,
  opts: {
    runId: string;
    sessionId?: string;
    targetUrl?: string;
    secretTarget?: string;
    secretRole?: string;
    captureConfig?: string[];
    fresh?: boolean;
  },
): { runPackId: string; resumed: boolean } {
  const db = getDb();

  if (!opts.fresh) {
    // Count total ready test cases for this ticket
    const totalReady = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM test_cases WHERE ticket_ref = ? AND ready = 1",
        )
        .get(ticketId) as { c: number }
    ).c;

    // Find the most recent pack for this ticket (today or still running)
    const latestPack = db
      .prepare(
        `SELECT h.run_pack_id,
         COALESCE(e.entry_count, 0) as entry_count,
         COALESCE(e.pending, 0) as pending,
         COALESCE(e.claimed, 0) as claimed,
         COALESCE(e.failed, 0) as failed,
         COALESCE(e.passed, 0) as passed
       FROM run_pack_entries h
       LEFT JOIN (
         SELECT run_pack_id,
           COUNT(*) as entry_count,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed
         FROM run_pack_entries WHERE test_case_id != '__header__'
         GROUP BY run_pack_id
       ) e ON e.run_pack_id = h.run_pack_id
       WHERE h.ticket_id = ? AND h.test_case_id = '__header__'
         AND date(h.created_at) = date('now')
       ORDER BY h.created_at DESC LIMIT 1`,
      )
      .get(ticketId) as
      | {
          run_pack_id: string;
          entry_count: number;
          pending: number;
          claimed: number;
          failed: number;
          passed: number;
        }
      | undefined;

    if (latestPack) {
      // Resume if: has pending/claimed/failed entries, OR hasn't claimed all test cases yet
      const hasWorkRemaining =
        latestPack.pending > 0 ||
        latestPack.claimed > 0 ||
        latestPack.failed > 0;
      const hasUnclaimed = latestPack.entry_count < totalReady;

      if (hasWorkRemaining || hasUnclaimed) {
        releaseRunPackClaims(latestPack.run_pack_id);
        return { runPackId: latestPack.run_pack_id, resumed: true };
      }
    }
  }

  // No resumable pack found (or fresh forced) — create new
  const runPackId = createRunPack({
    ticketId,
    runId: opts.runId,
    sessionId: opts.sessionId,
    targetUrl: opts.targetUrl,
    secretTarget: opts.secretTarget,
    secretRole: opts.secretRole,
    captureConfig: opts.captureConfig,
  });

  return { runPackId, resumed: false };
}

/**
 * Get all entries for a run pack.
 */
export function getRunPackEntries(runPackId: string): RunPackEntryRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id != '__header__' ORDER BY created_at",
    )
    .all(runPackId) as RunPackEntryRow[];
}

/**
 * Get all run packs for a ticket (unique run_pack_ids with summary info).
 */
export function getRunPacksByTicket(ticketId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         run_pack_id,
         ticket_id,
         run_id,
         fresh_or_existing,
         MIN(created_at) as created_at,
         COUNT(*) as total,
         SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
         SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
         SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
       FROM run_pack_entries
       WHERE ticket_id = ? AND test_case_id != '__header__'
       GROUP BY run_pack_id
       ORDER BY MIN(created_at) DESC`,
    )
    .all(ticketId);
}

/**
 * Get all distinct ticket IDs that have run packs.
 */
export function getRunPackTicketIds() {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         ticket_id,
         COUNT(DISTINCT run_pack_id) as pack_count,
         COUNT(*) as total_entries,
         SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         MAX(created_at) as last_run
       FROM run_pack_entries
       WHERE test_case_id != '__header__'
       GROUP BY ticket_id
       ORDER BY MAX(created_at) DESC`,
    )
    .all();
}

/**
 * Get a single run pack entry by ID.
 */
export function getRunPackEntry(entryId: string): RunPackEntryRow | undefined {
  return getDb()
    .prepare("SELECT * FROM run_pack_entries WHERE id = ?")
    .get(entryId) as RunPackEntryRow | undefined;
}

/**
 * Get entries with test case details joined (for UI display).
 */
export function getRunPackEntriesWithTestCases(runPackId: string) {
  return getDb()
    .prepare(
      `SELECT rpe.*, tc.title as tc_title, tc.type as tc_type, tc.format as tc_format,
              tc.priority as tc_priority, tc.bdd_feature, tc.bdd_scenario,
              tc.bdd_given, tc.bdd_when, tc.bdd_then, tc.trad_steps, tc.trad_expected,
              tc.description as tc_description, tc.preconditions as tc_preconditions,
              tc.labels as tc_labels, tc.test_layer as tc_layer
       FROM run_pack_entries rpe
       JOIN test_cases tc ON rpe.test_case_id = tc.id
       WHERE rpe.run_pack_id = ?
       ORDER BY tc.priority ASC, rpe.created_at ASC`,
    )
    .all(runPackId);
}

/**
 * Populate a run pack with ALL ready test cases for a ticket, setting a given status.
 * Used to bulk-add entries as "blocked" or "pending" when execution can't proceed (e.g. login failure).
 * Skips test cases already in the pack. Returns count of entries added.
 */
export function populateRunPack(
  runPackId: string,
  ticketId: string,
  status: "pending" | "blocked" | "skipped",
  opts?: {
    runId?: string;
    sessionId?: string;
    reason?: string;
    layer?: string;
    runner?: string;
  },
): number {
  const db = getDb();

  const existingTcIds = db
    .prepare(
      "SELECT test_case_id FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id != '__header__'",
    )
    .all(runPackId) as Array<{ test_case_id: string }>;
  const existingSet = new Set(existingTcIds.map((r) => r.test_case_id));

  const layerFilter = opts?.layer ? " AND COALESCE(test_layer, 'ui') = ?" : "";
  const params: unknown[] = [ticketId];
  if (opts?.layer) params.push(opts.layer);

  const allReady = db
    .prepare(
      `SELECT id FROM test_cases WHERE ticket_ref = ? AND ready = 1${layerFilter} ORDER BY priority ASC, created_at ASC`,
    )
    .all(...params) as Array<{ id: string }>;

  const header = db
    .prepare(
      "SELECT run_id FROM run_pack_entries WHERE run_pack_id = ? LIMIT 1",
    )
    .get(runPackId) as { run_id: string } | undefined;

  let added = 0;
  const runner = opts?.runner ?? (opts?.layer === "api" ? "api" : null);
  const insert = db.prepare(
    `INSERT INTO run_pack_entries
     (id, run_pack_id, ticket_id, run_id, session_id, test_case_id, tc_title, fresh_or_existing, status, results, runner, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'fresh', ?, ?, ?, ${status !== "pending" ? "datetime('now')" : "NULL"})`,
  );

  const reason = opts?.reason ? JSON.stringify({ reason: opts.reason }) : null;

  for (const tc of allReady) {
    if (existingSet.has(tc.id)) continue;
    const tcRow = db
      .prepare("SELECT title FROM test_cases WHERE id = ?")
      .get(tc.id) as { title: string } | undefined;
    insert.run(
      uuid(),
      runPackId,
      ticketId,
      opts?.runId ?? header?.run_id ?? "",
      opts?.sessionId ?? null,
      tc.id,
      tcRow?.title ?? null,
      status,
      reason,
      runner,
    );
    added++;
  }

  return added;
}

/**
 * Release all claimed entries in a run pack back to pending.
 */
export function releaseRunPackClaims(runPackId: string): number {
  const result = getDb()
    .prepare(
      "UPDATE run_pack_entries SET status = 'pending', session_id = NULL, started_at = NULL WHERE run_pack_id = ? AND status = 'claimed'",
    )
    .run(runPackId);

  return result.changes;
}

/**
 * Reset a specific entry back to pending for rerun (by entry ID or test case title).
 */
export function retryEntry(entryId: string): boolean {
  const result = getDb()
    .prepare(
      "UPDATE run_pack_entries SET status = 'pending', session_id = NULL, started_at = NULL, completed_at = NULL, results = NULL, logs = NULL, observations = NULL, issues = NULL, artifacts = NULL WHERE id = ? AND test_case_id != '__header__'",
    )
    .run(entryId);
  return result.changes > 0;
}

/**
 * Reset entries matching a test case title (substring match) in a run pack.
 */
export function retryByName(runPackId: string, name: string): number {
  const result = getDb()
    .prepare(
      `UPDATE run_pack_entries SET status = 'pending', session_id = NULL, started_at = NULL, completed_at = NULL, results = NULL, logs = NULL, observations = NULL, issues = NULL, artifacts = NULL
       WHERE run_pack_id = ? AND test_case_id != '__header__'
       AND test_case_id IN (SELECT id FROM test_cases WHERE title LIKE ?)`,
    )
    .run(runPackId, `%${name}%`);
  return result.changes;
}

/**
 * Reset all failed/blocked entries in a run pack back to pending.
 */
export function retryFailed(runPackId: string): number {
  const result = getDb()
    .prepare(
      "UPDATE run_pack_entries SET status = 'pending', session_id = NULL, started_at = NULL, completed_at = NULL, results = NULL, logs = NULL, observations = NULL, issues = NULL, artifacts = NULL WHERE run_pack_id = ? AND status IN ('failed', 'blocked') AND test_case_id != '__header__'",
    )
    .run(runPackId);
  return result.changes;
}

/**
 * Reset ALL entries (including passed) in a run pack back to pending for full rerun.
 */
export function retryAll(runPackId: string): number {
  const result = getDb()
    .prepare(
      "UPDATE run_pack_entries SET status = 'pending', session_id = NULL, started_at = NULL, completed_at = NULL, results = NULL, logs = NULL, observations = NULL, issues = NULL, artifacts = NULL WHERE run_pack_id = ? AND test_case_id != '__header__'",
    )
    .run(runPackId);
  return result.changes;
}

/**
 * Delete all entries for a run pack.
 */
export function deleteRunPack(runPackId: string): number {
  const result = getDb()
    .prepare("DELETE FROM run_pack_entries WHERE run_pack_id = ?")
    .run(runPackId);
  return result.changes;
}

/**
 * Delete all run pack entries for a ticket.
 */
export function deleteRunPacksByTicket(ticketId: string): number {
  const result = getDb()
    .prepare("DELETE FROM run_pack_entries WHERE ticket_id = ?")
    .run(ticketId);
  return result.changes;
}
