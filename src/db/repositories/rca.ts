import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export type RcaClassification =
  | "env_issue"
  | "flaky_selector"
  | "actual_bug"
  | "test_data_issue"
  | "network"
  | "auth_issue"
  | "timeout"
  | "unknown";

export type RcaSuggestedAction =
  | "retry"
  | "fix_test"
  | "fix_app"
  | "fix_env"
  | "investigate"
  | "skip";

export interface RcaResultInput {
  runPackId: string;
  entryId: string;
  testCaseId: string;
  classification: RcaClassification;
  confidence: number;
  rootCause: string;
  evidenceSummary?: string;
  failurePatternId?: string;
  suggestedAction?: RcaSuggestedAction;
}

export interface RcaResultRow {
  id: string;
  run_pack_id: string;
  entry_id: string;
  test_case_id: string;
  classification: string;
  confidence: number;
  root_cause: string;
  evidence_summary: string | null;
  failure_pattern_id: string | null;
  suggested_action: string | null;
  created_at: string;
}

/**
 * Save an RCA result for a failed run pack entry.
 */
export function createRcaResult(input: RcaResultInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO rca_results
       (id, run_pack_id, entry_id, test_case_id, classification, confidence,
        root_cause, evidence_summary, failure_pattern_id, suggested_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.runPackId,
      input.entryId,
      input.testCaseId,
      input.classification,
      input.confidence,
      input.rootCause,
      input.evidenceSummary ?? null,
      input.failurePatternId ?? null,
      input.suggestedAction ?? null
    );

  // Update failure_patterns classification if linked
  if (input.failurePatternId) {
    updateFailurePatternClassification(
      input.failurePatternId,
      input.classification,
      input.confidence
    );
  }

  return id;
}

/**
 * Get all RCA results for a run pack.
 */
export function getRcaByPack(runPackId: string): RcaResultRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM rca_results WHERE run_pack_id = ? ORDER BY created_at ASC"
    )
    .all(runPackId) as RcaResultRow[];
}

/**
 * Get RCA result for a specific entry.
 */
export function getRcaByEntry(entryId: string): RcaResultRow | undefined {
  return getDb()
    .prepare("SELECT * FROM rca_results WHERE entry_id = ?")
    .get(entryId) as RcaResultRow | undefined;
}

/**
 * Update failure pattern with classification from RCA.
 */
export function updateFailurePatternClassification(
  patternId: string,
  classification: string,
  confidence: number
): void {
  getDb()
    .prepare(
      `UPDATE failure_patterns SET
         classification = ?,
         classification_confidence = ?,
         last_rca_at = datetime('now'),
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(classification, confidence, patternId);
}

/**
 * Get RCA summary counts by classification for a run pack.
 */
export function getRcaSummary(runPackId: string): {
  total: number;
  byClassification: Record<string, number>;
  byAction: Record<string, number>;
  avgConfidence: number;
} {
  const db = getDb();

  const total = (
    db
      .prepare("SELECT COUNT(*) as c FROM rca_results WHERE run_pack_id = ?")
      .get(runPackId) as { c: number }
  ).c;

  const byClass = db
    .prepare(
      "SELECT classification, COUNT(*) as c FROM rca_results WHERE run_pack_id = ? GROUP BY classification"
    )
    .all(runPackId) as Array<{ classification: string; c: number }>;

  const byAction = db
    .prepare(
      "SELECT suggested_action, COUNT(*) as c FROM rca_results WHERE run_pack_id = ? AND suggested_action IS NOT NULL GROUP BY suggested_action"
    )
    .all(runPackId) as Array<{ suggested_action: string; c: number }>;

  const avgConf = (
    db
      .prepare(
        "SELECT AVG(confidence) as avg FROM rca_results WHERE run_pack_id = ?"
      )
      .get(runPackId) as { avg: number | null }
  ).avg;

  return {
    total,
    byClassification: Object.fromEntries(byClass.map((r) => [r.classification, r.c])),
    byAction: Object.fromEntries(byAction.map((r) => [r.suggested_action, r.c])),
    avgConfidence: avgConf ?? 0,
  };
}

/**
 * Get all RCA results joined with test case info.
 */
export function getRcaWithTestCases(runPackId: string) {
  return getDb()
    .prepare(
      `SELECT r.*, tc.title as tc_title, tc.type as tc_type, tc.test_layer as tc_layer
       FROM rca_results r
       JOIN test_cases tc ON r.test_case_id = tc.id
       WHERE r.run_pack_id = ?
       ORDER BY r.confidence DESC, r.created_at ASC`
    )
    .all(runPackId);
}

/**
 * Delete all RCA results for a run pack (for re-analysis).
 */
export function deleteRcaByPack(runPackId: string): number {
  const result = getDb()
    .prepare("DELETE FROM rca_results WHERE run_pack_id = ?")
    .run(runPackId);
  return result.changes;
}
