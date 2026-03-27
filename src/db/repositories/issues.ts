import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import { getDb } from "../client.js";
import type { IssueRow } from "../types.js";

export function insertIssue(params: {
  runId: string;
  stepId?: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  location?: string;
  screenshotPath?: string;
  videoPath?: string;
  consoleLog?: string;
  networkData?: string;
  rawOutput?: string;
  isRetry?: boolean;
  retryCount?: number;
}): string {
  const db = getDb();
  const id = uuid();

  // Auto-attach latest screenshot/console from run_artifacts if not explicitly provided
  if (!params.screenshotPath && params.runId) {
    const latest = db.prepare(
      `SELECT file_path FROM run_artifacts
       WHERE run_id = ? AND artifact_type = 'screenshot'
       ${params.location ? "AND page_url = ?" : ""}
       ORDER BY created_at DESC LIMIT 1`
    ).get(...[params.runId, ...(params.location ? [params.location] : [])]) as { file_path: string } | undefined;
    if (latest) params.screenshotPath = latest.file_path;
  }
  if (!params.consoleLog && params.runId) {
    const latest = db.prepare(
      `SELECT file_path FROM run_artifacts
       WHERE run_id = ? AND artifact_type = 'console'
       ${params.location ? "AND page_url = ?" : ""}
       ORDER BY created_at DESC LIMIT 1`
    ).get(...[params.runId, ...(params.location ? [params.location] : [])]) as { file_path: string } | undefined;
    if (latest) params.consoleLog = latest.file_path;
  }

  db.prepare(
      `INSERT INTO issues
       (id, run_id, step_id, category, severity, title, description,
        location, screenshot_path, video_path, console_log, network_data,
        raw_output, is_retry, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      params.runId,
      params.stepId ?? null,
      params.category,
      params.severity,
      params.title,
      params.description,
      params.location ?? null,
      params.screenshotPath ?? null,
      params.videoPath ?? null,
      params.consoleLog ?? null,
      params.networkData ?? null,
      params.rawOutput ?? null,
      params.isRetry ? 1 : 0,
      params.retryCount ?? 0
    );

  // Update failure patterns
  upsertFailurePattern(params);

  return id;
}

export function getIssuesByRun(runId: string): IssueRow[] {
  return getDb()
    .prepare("SELECT * FROM issues WHERE run_id = ? ORDER BY severity, category")
    .all(runId) as IssueRow[];
}

export function getIssueCount(runId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as c FROM issues WHERE run_id = ?")
    .get(runId) as { c: number };
  return row.c;
}

export function queryPriorIssues(
  locationPattern: string,
  limit: number = 10
): IssueRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM issues
       WHERE location LIKE ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(`%${locationPattern}%`, limit) as IssueRow[];
}

function upsertFailurePattern(params: {
  runId: string;
  category: string;
  severity: string;
  title: string;
  location?: string;
}): void {
  const patternKey = `${params.category}|${params.location ?? ""}|${params.title}`;
  const patternHash = createHash("sha256")
    .update(patternKey)
    .digest("hex")
    .slice(0, 16);

  const db = getDb();
  const existing = db
    .prepare("SELECT id, occurrence_count FROM failure_patterns WHERE pattern_hash = ?")
    .get(patternHash) as { id: string; occurrence_count: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE failure_patterns SET
         occurrence_count = occurrence_count + 1,
         last_seen_run = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(params.runId, existing.id);
  } else {
    db.prepare(
      `INSERT INTO failure_patterns
       (id, pattern_hash, category, location_pattern, title_pattern,
        first_seen_run, last_seen_run, severity_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      patternHash,
      params.category,
      params.location ?? "",
      params.title,
      params.runId,
      params.runId,
      params.severity
    );
  }
}

export function getFailurePatterns(limit: number = 50) {
  return getDb()
    .prepare(
      `SELECT * FROM failure_patterns
       ORDER BY occurrence_count DESC, updated_at DESC
       LIMIT ?`
    )
    .all(limit);
}
