import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type { RunArtifactRow } from "../types.js";

export interface StoreArtifactInput {
  runId: string;
  artifactType: "snapshot" | "screenshot" | "console" | "har" | "video" | "trace" | "network_error";
  filePath?: string;
  content?: string;
  runPackId?: string;
  entryId?: string;
  sessionId?: string;
  ticketId?: string;
  actionIndex?: number;
  actionDesc?: string;
  pageUrl?: string;
  metadata?: Record<string, unknown>;
}

export function storeArtifact(input: StoreArtifactInput): string {
  const id = uuid();
  getDb().prepare(
    `INSERT INTO run_artifacts
     (id, run_id, run_pack_id, entry_id, session_id, ticket_id, action_index, action_desc,
      page_url, artifact_type, file_path, content, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, input.runId,
    input.runPackId ?? null, input.entryId ?? null,
    input.sessionId ?? null, input.ticketId ?? null,
    input.actionIndex ?? 0, input.actionDesc ?? null,
    input.pageUrl ?? null, input.artifactType,
    input.filePath ?? null, input.content ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null
  );
  return id;
}

export function getArtifactsByRun(runId: string, type?: string): RunArtifactRow[] {
  if (type) {
    return getDb().prepare(
      "SELECT * FROM run_artifacts WHERE run_id = ? AND artifact_type = ? ORDER BY action_index, created_at"
    ).all(runId, type) as RunArtifactRow[];
  }
  return getDb().prepare(
    "SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY action_index, created_at"
  ).all(runId) as RunArtifactRow[];
}

export function getArtifactsByEntry(entryId: string): RunArtifactRow[] {
  return getDb().prepare(
    "SELECT * FROM run_artifacts WHERE entry_id = ? ORDER BY action_index, created_at"
  ).all(entryId) as RunArtifactRow[];
}

export function getArtifactsByUrl(runId: string, pageUrl: string): RunArtifactRow[] {
  return getDb().prepare(
    "SELECT * FROM run_artifacts WHERE run_id = ? AND page_url LIKE ? ORDER BY action_index, created_at"
  ).all(runId, `%${pageUrl}%`) as RunArtifactRow[];
}

export function getArtifactStats(runId: string) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT artifact_type, COUNT(*) as count FROM run_artifacts WHERE run_id = ? GROUP BY artifact_type"
  ).all(runId) as Array<{ artifact_type: string; count: number }>;
  return Object.fromEntries(rows.map(r => [r.artifact_type, r.count]));
}
