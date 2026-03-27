import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export interface TestCaseInput {
  runId: string;
  ticketRef: string;
  repoUrls?: string[];
  type: "direct_functional" | "impact_regression" | "general_regression";
  format: "bdd" | "traditional";
  title: string;
  description?: string;
  preconditions?: string[];
  labels?: string[];
  // BDD
  bddFeature?: string;
  bddScenario?: string;
  bddGiven?: string[];
  bddWhen?: string[];
  bddThen?: string[];
  // Traditional
  tradSteps?: Array<{ step: string; expected: string }>;
  tradExpected?: string;
  // Context
  impactedFiles?: string[];
  relatedMr?: string;
  codeContext?: string;
  ready?: boolean;
  planStepId?: string;
  // Layer
  testLayer?: "ui" | "api" | "ui_api" | "database" | "ai" | "unit" | "other";
}

const TYPE_PRIORITY: Record<string, number> = {
  direct_functional: 1,
  impact_regression: 2,
  general_regression: 3,
};

export function createTestCase(input: TestCaseInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO test_cases
       (id, run_id, ticket_ref, repo_urls, type, priority, format, title, description,
        preconditions, labels, bdd_feature, bdd_scenario, bdd_given, bdd_when, bdd_then,
        trad_steps, trad_expected, impacted_files, related_mr, code_context, ready, plan_step_id, test_layer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.runId,
      input.ticketRef,
      input.repoUrls ? JSON.stringify(input.repoUrls) : null,
      input.type,
      TYPE_PRIORITY[input.type] ?? 3,
      input.format,
      input.title,
      input.description ?? null,
      input.preconditions ? JSON.stringify(input.preconditions) : null,
      input.labels ? JSON.stringify(input.labels) : null,
      input.bddFeature ?? null,
      input.bddScenario ?? null,
      input.bddGiven ? JSON.stringify(input.bddGiven) : null,
      input.bddWhen ? JSON.stringify(input.bddWhen) : null,
      input.bddThen ? JSON.stringify(input.bddThen) : null,
      input.tradSteps ? JSON.stringify(input.tradSteps) : null,
      input.tradExpected ?? null,
      input.impactedFiles ? JSON.stringify(input.impactedFiles) : null,
      input.relatedMr ?? null,
      input.codeContext ?? null,
      input.ready ? 1 : 0,
      input.planStepId ?? null,
      input.testLayer ?? "ui"
    );
  return id;
}

/**
 * Claim the next available test case for a session.
 * Priority order: direct_functional (1) → impact_regression (2) → general_regression (3)
 * Within same priority, FIFO by created_at.
 *
 * @param fresh - if true, also claims previously completed (passed/failed) cases
 */
export function claimNextTestCase(
  ticketRef: string,
  sessionId: string,
  fresh: boolean = false,
  layer?: string
): unknown | null {
  const db = getDb();

  const statusFilter = fresh
    ? "status NOT IN ('claimed', 'running')"
    : "status = 'pending'";

  const layerFilter = layer ? " AND COALESCE(test_layer, 'ui') = ?" : "";

  // Only claim test cases marked as ready
  const params: unknown[] = [ticketRef];
  if (layer) params.push(layer);

  const row = db
    .prepare(
      `SELECT * FROM test_cases
       WHERE ticket_ref = ? AND ready = 1 AND ${statusFilter}${layerFilter}
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    )
    .get(...params);

  if (!row) return null;

  const tc = row as { id: string; status: string };

  // Save last status before claiming
  db.prepare(
    `UPDATE test_cases SET
       last_status = status,
       status = 'claimed',
       claimed_by = ?,
       claimed_at = datetime('now'),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(sessionId, tc.id);

  return db.prepare("SELECT * FROM test_cases WHERE id = ?").get(tc.id);
}

/**
 * Update test case after execution.
 */
export function updateTestCaseResult(
  testCaseId: string,
  status: "passed" | "failed" | "skipped" | "blocked",
  executionRunId: string,
  result?: string
): void {
  getDb()
    .prepare(
      `UPDATE test_cases SET
         status = ?,
         executed_at = datetime('now'),
         last_executed = datetime('now'),
         execution_run = ?,
         execution_result = ?,
         execution_count = execution_count + 1,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(status, executionRunId, result ?? null, testCaseId);
}

/**
 * Release a claimed test case (e.g. if session crashes).
 */
export function releaseTestCase(testCaseId: string): void {
  getDb()
    .prepare(
      `UPDATE test_cases SET
         status = COALESCE(last_status, 'pending'),
         claimed_by = NULL,
         claimed_at = NULL,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(testCaseId);
}

/**
 * Release all test cases claimed by a session.
 */
export function releaseSessionClaims(sessionId: string): void {
  getDb()
    .prepare(
      `UPDATE test_cases SET
         status = COALESCE(last_status, 'pending'),
         claimed_by = NULL,
         claimed_at = NULL,
         updated_at = datetime('now')
       WHERE claimed_by = ? AND status IN ('claimed', 'running')`
    )
    .run(sessionId);
}

export function getTestCasesByTicket(ticketRef: string) {
  return getDb()
    .prepare(
      "SELECT * FROM test_cases WHERE ticket_ref = ? ORDER BY priority, created_at"
    )
    .all(ticketRef);
}

export function getTestCasesByRun(runId: string) {
  return getDb()
    .prepare(
      "SELECT * FROM test_cases WHERE run_id = ? ORDER BY priority, created_at"
    )
    .all(runId);
}

// ── Ready / Draft ──

export function markTestCaseReady(testCaseId: string): void {
  getDb()
    .prepare("UPDATE test_cases SET ready = 1, updated_at = datetime('now') WHERE id = ?")
    .run(testCaseId);
}

export function markTestCaseDraft(testCaseId: string): void {
  getDb()
    .prepare("UPDATE test_cases SET ready = 0, updated_at = datetime('now') WHERE id = ?")
    .run(testCaseId);
}

export function markAllReady(ticketRef: string): number {
  const result = getDb()
    .prepare("UPDATE test_cases SET ready = 1, updated_at = datetime('now') WHERE ticket_ref = ? AND ready = 0")
    .run(ticketRef);
  return result.changes;
}

export function markAllDraft(ticketRef: string): number {
  const result = getDb()
    .prepare("UPDATE test_cases SET ready = 0, updated_at = datetime('now') WHERE ticket_ref = ? AND ready = 1")
    .run(ticketRef);
  return result.changes;
}

export function getTestCaseStats(ticketRef: string) {
  const db = getDb();
  const total = (
    db.prepare("SELECT COUNT(*) as c FROM test_cases WHERE ticket_ref = ?").get(ticketRef) as { c: number }
  ).c;
  const byStatus = db
    .prepare(
      "SELECT status, COUNT(*) as c FROM test_cases WHERE ticket_ref = ? GROUP BY status"
    )
    .all(ticketRef) as Array<{ status: string; c: number }>;
  const byType = db
    .prepare(
      "SELECT type, COUNT(*) as c FROM test_cases WHERE ticket_ref = ? GROUP BY type"
    )
    .all(ticketRef) as Array<{ type: string; c: number }>;
  const byLayer = db
    .prepare(
      "SELECT COALESCE(test_layer, 'ui') as layer, COUNT(*) as c FROM test_cases WHERE ticket_ref = ? GROUP BY test_layer"
    )
    .all(ticketRef) as Array<{ layer: string; c: number }>;

  const readyCount = (
    db.prepare("SELECT COUNT(*) as c FROM test_cases WHERE ticket_ref = ? AND ready = 1").get(ticketRef) as { c: number }
  ).c;
  const draftCount = total - readyCount;

  return {
    total,
    ready: readyCount,
    draft: draftCount,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.c])),
    byType: Object.fromEntries(byType.map((r) => [r.type, r.c])),
    byLayer: Object.fromEntries(byLayer.map((r) => [r.layer, r.c])),
  };
}
