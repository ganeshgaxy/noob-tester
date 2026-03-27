import { getDb } from "../client.js";

/**
 * Get all failed entries for a run pack (candidates for auto-retry).
 */
export function getFailedEntries(runPackId: string) {
  return getDb()
    .prepare(
      `SELECT rpe.*, tc.title as tc_title, tc.type as tc_type
       FROM run_pack_entries rpe
       JOIN test_cases tc ON rpe.test_case_id = tc.id
       WHERE rpe.run_pack_id = ? AND rpe.status IN ('failed', 'blocked')
         AND rpe.test_case_id != '__header__'
       ORDER BY rpe.created_at ASC`
    )
    .all(runPackId);
}

/**
 * Mark all failed entries for auto-retry: set status back to pending,
 * increment retry_count, store original_status.
 */
export function markForAutoRetry(runPackId: string): number {
  const result = getDb()
    .prepare(
      `UPDATE run_pack_entries SET
         original_status = CASE WHEN original_status IS NULL THEN status ELSE original_status END,
         status = 'pending',
         retry_count = retry_count + 1,
         session_id = NULL,
         started_at = NULL,
         completed_at = NULL,
         results = NULL,
         logs = NULL,
         observations = NULL,
         issues = NULL,
         artifacts = NULL
       WHERE run_pack_id = ? AND status IN ('failed', 'blocked')
         AND test_case_id != '__header__'
         AND retry_count < 1`
    )
    .run(runPackId);

  return result.changes;
}

/**
 * After retry completes, classify the result:
 * - If it passed on retry → likely_false_positive
 * - If it failed again → confirmed failure
 */
export function classifyRetryResult(
  entryId: string,
  retryStatus: string
): string {
  const db = getDb();

  const entry = db
    .prepare("SELECT retry_count, original_status FROM run_pack_entries WHERE id = ?")
    .get(entryId) as { retry_count: number; original_status: string | null } | undefined;

  if (!entry || entry.retry_count === 0) return "unknown";

  let confidence: string;

  if (retryStatus === "passed") {
    // Passed on retry → likely false positive
    confidence = "likely_false_positive";
    db.prepare(
      "UPDATE run_pack_entries SET is_false_positive = 1, failure_confidence = ? WHERE id = ?"
    ).run(confidence, entryId);
  } else {
    // Failed again → check known patterns for confidence
    confidence = computeFailureConfidence(db, entryId);
    db.prepare(
      "UPDATE run_pack_entries SET is_false_positive = 0, failure_confidence = ? WHERE id = ?"
    ).run(confidence, entryId);
  }

  return confidence;
}

/**
 * Apply failure confidence based on cross-referencing patterns and tech issues.
 */
export function applyFailureConfidence(entryId: string, confidence: string): void {
  getDb()
    .prepare(
      "UPDATE run_pack_entries SET failure_confidence = ? WHERE id = ?"
    )
    .run(confidence, entryId);
}

/**
 * Get false positive stats for a run pack.
 */
export function getFalsePositiveStats(runPackId: string): {
  totalFailed: number;
  retried: number;
  falsePositives: number;
  confirmedFailures: number;
  byConfidence: Record<string, number>;
} {
  const db = getDb();

  const totalFailed = (
    db.prepare(
      "SELECT COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND (status = 'failed' OR original_status = 'failed') AND test_case_id != '__header__'"
    ).get(runPackId) as { c: number }
  ).c;

  const retried = (
    db.prepare(
      "SELECT COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND retry_count > 0 AND test_case_id != '__header__'"
    ).get(runPackId) as { c: number }
  ).c;

  const falsePositives = (
    db.prepare(
      "SELECT COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND is_false_positive = 1 AND test_case_id != '__header__'"
    ).get(runPackId) as { c: number }
  ).c;

  const byConfidence = db
    .prepare(
      "SELECT failure_confidence, COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND failure_confidence IS NOT NULL AND test_case_id != '__header__' GROUP BY failure_confidence"
    )
    .all(runPackId) as Array<{ failure_confidence: string; c: number }>;

  return {
    totalFailed,
    retried,
    falsePositives,
    confirmedFailures: totalFailed - falsePositives,
    byConfidence: Object.fromEntries(
      byConfidence.map((r) => [r.failure_confidence, r.c])
    ),
  };
}

// ── Internal helpers ──

function computeFailureConfidence(db: ReturnType<typeof getDb>, entryId: string): string {
  const entry = db
    .prepare(
      `SELECT rpe.test_case_id, tc.impacted_files
       FROM run_pack_entries rpe
       JOIN test_cases tc ON rpe.test_case_id = tc.id
       WHERE rpe.id = ?`
    )
    .get(entryId) as { test_case_id: string; impacted_files: string | null } | undefined;

  if (!entry) return "unknown";

  // Check if matches a known issue
  const knownPattern = db
    .prepare(
      "SELECT id FROM failure_patterns WHERE is_known_issue = 1 LIMIT 1"
    )
    .get() as { id: string } | undefined;

  if (knownPattern) return "low"; // Known issue = low confidence it's a real failure

  // Check if matches any failure pattern (not known issue)
  const anyPattern = db
    .prepare(
      "SELECT id FROM failure_patterns WHERE occurrence_count >= 3 LIMIT 1"
    )
    .get() as { id: string } | undefined;

  if (anyPattern) return "medium"; // Matches a recurring pattern

  // Check if there's a resolved tech issue for these files
  if (entry.impacted_files) {
    const techIssue = db
      .prepare(
        "SELECT id FROM tech_issues WHERE status = 'resolved' LIMIT 1"
      )
      .get() as { id: string } | undefined;

    if (techIssue) return "low"; // Was a tech issue that got resolved
  }

  return "high"; // No matching patterns, first occurrence = likely real
}
