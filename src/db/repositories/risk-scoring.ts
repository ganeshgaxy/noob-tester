import { execSync } from "child_process";
import { getDb } from "../client.js";
import { getRepo } from "./repos.js";

export interface RiskFactors {
  failurePatternScore: number;
  flakinessScore: number;
  codeChurnScore: number;
  recencyScore: number;
  historicalFailureScore: number;
}

export interface RiskResult {
  testCaseId: string;
  riskScore: number;
  factors: RiskFactors;
}

const WEIGHTS = {
  failurePattern: 0.3,
  flakiness: 0.2,
  codeChurn: 0.25,
  recency: 0.15,
  historicalFailure: 0.1,
};

/**
 * Compute risk score for a single test case.
 */
export function computeRiskScore(testCaseId: string): RiskResult {
  const db = getDb();

  const tc = db
    .prepare("SELECT id, impacted_files, test_layer, execution_count, last_executed FROM test_cases WHERE id = ?")
    .get(testCaseId) as {
    id: string;
    impacted_files: string | null;
    test_layer: string | null;
    execution_count: number;
    last_executed: string | null;
  } | undefined;

  if (!tc) return { testCaseId, riskScore: 0, factors: emptyFactors() };

  const impactedFiles = parseJsonArray(tc.impacted_files);

  // 1. Failure pattern frequency (0-1)
  const failurePatternScore = computeFailurePatternScore(db, impactedFiles);

  // 2. Element/endpoint flakiness (0-1)
  const flakinessScore = computeFlakinessScore(db, tc.test_layer ?? "ui", impactedFiles);

  // 3. Code churn — recent commits to impacted files (0-1)
  const codeChurnScore = computeCodeChurnScore(impactedFiles);

  // 4. Recency — files changed after last execution (0-1)
  const recencyScore = computeRecencyScore(tc.last_executed, impactedFiles);

  // 5. Historical failure rate (0-1)
  const historicalFailureScore = computeHistoricalFailureScore(db, testCaseId, tc.execution_count);

  const factors: RiskFactors = {
    failurePatternScore,
    flakinessScore,
    codeChurnScore,
    recencyScore,
    historicalFailureScore,
  };

  const riskScore = Math.min(1.0,
    failurePatternScore * WEIGHTS.failurePattern +
    flakinessScore * WEIGHTS.flakiness +
    codeChurnScore * WEIGHTS.codeChurn +
    recencyScore * WEIGHTS.recency +
    historicalFailureScore * WEIGHTS.historicalFailure
  );

  return { testCaseId, riskScore: Math.round(riskScore * 100) / 100, factors };
}

/**
 * Compute and store risk scores for all test cases under a ticket.
 */
export function computeAllRiskScores(ticketRef: string): {
  computed: number;
  avgScore: number;
  highRisk: number;
} {
  const db = getDb();
  const testCases = db
    .prepare("SELECT id FROM test_cases WHERE ticket_ref = ? AND ready = 1")
    .all(ticketRef) as Array<{ id: string }>;

  let totalScore = 0;
  let highRisk = 0;

  const update = db.prepare(
    "UPDATE test_cases SET risk_score = ?, risk_factors = ?, updated_at = datetime('now') WHERE id = ?"
  );

  const updateAll = db.transaction(() => {
    for (const tc of testCases) {
      const result = computeRiskScore(tc.id);
      update.run(result.riskScore, JSON.stringify(result.factors), tc.id);
      totalScore += result.riskScore;
      if (result.riskScore >= 0.6) highRisk++;
    }
  });

  updateAll();

  return {
    computed: testCases.length,
    avgScore: testCases.length > 0 ? Math.round((totalScore / testCases.length) * 100) / 100 : 0,
    highRisk,
  };
}

/**
 * Get test cases ordered by risk score.
 */
export function getTestCasesByRisk(ticketRef: string) {
  return getDb()
    .prepare(
      `SELECT id, title, type, test_layer, priority, risk_score, risk_factors, status
       FROM test_cases
       WHERE ticket_ref = ? AND ready = 1
       ORDER BY risk_score DESC, priority ASC`
    )
    .all(ticketRef);
}

// ── Scoring helpers ──

function emptyFactors(): RiskFactors {
  return {
    failurePatternScore: 0,
    flakinessScore: 0,
    codeChurnScore: 0,
    recencyScore: 0,
    historicalFailureScore: 0,
  };
}

function parseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeFailurePatternScore(db: ReturnType<typeof getDb>, impactedFiles: string[]): number {
  if (impactedFiles.length === 0) return 0;

  // Check failure_patterns matching any impacted file location
  let totalOccurrences = 0;
  for (const f of impactedFiles) {
    const matches = db
      .prepare(
        "SELECT SUM(occurrence_count) as total FROM failure_patterns WHERE location_pattern LIKE ?"
      )
      .get(`%${f}%`) as { total: number | null };
    totalOccurrences += matches.total ?? 0;
  }

  // Normalize: 10+ occurrences = 1.0
  return Math.min(1.0, totalOccurrences / 10);
}

function computeFlakinessScore(
  db: ReturnType<typeof getDb>,
  testLayer: string,
  impactedFiles: string[]
): number {
  if (impactedFiles.length === 0) return 0;

  if (testLayer === "ui" || testLayer === "ui_api") {
    // Check ui_map_elements on pages related to impacted files
    const flakyCount = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM ui_map_elements WHERE status IN ('flaky', 'broken')"
        )
        .get() as { c: number }
    ).c;

    const totalElements = (
      db
        .prepare("SELECT COUNT(*) as c FROM ui_map_elements")
        .get() as { c: number }
    ).c;

    return totalElements > 0 ? Math.min(1.0, flakyCount / Math.max(totalElements * 0.1, 1)) : 0;
  }

  if (testLayer === "api") {
    // Check api_map_endpoints health
    const flakyEndpoints = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM api_map_endpoints WHERE status IN ('flaky', 'failing')"
        )
        .get() as { c: number }
    ).c;

    const totalEndpoints = (
      db
        .prepare("SELECT COUNT(*) as c FROM api_map_endpoints")
        .get() as { c: number }
    ).c;

    return totalEndpoints > 0 ? Math.min(1.0, flakyEndpoints / Math.max(totalEndpoints * 0.2, 1)) : 0;
  }

  return 0;
}

function computeCodeChurnScore(impactedFiles: string[]): number {
  if (impactedFiles.length === 0) return 0;

  // Find repos that have these files indexed
  const db = getDb();
  const repos = db
    .prepare("SELECT DISTINCT name, local_path FROM repos WHERE local_path IS NOT NULL")
    .all() as Array<{ name: string; local_path: string }>;

  let totalCommits = 0;
  for (const repo of repos) {
    for (const f of impactedFiles) {
      try {
        const output = execSync(
          `git log --oneline --since="30 days" -- "${f}"`,
          { cwd: repo.local_path, encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }
        ).trim();
        totalCommits += output ? output.split("\n").filter(Boolean).length : 0;
      } catch {
        // File might not exist in this repo
      }
    }
  }

  // Normalize: 20+ commits in 30 days = 1.0
  return Math.min(1.0, totalCommits / 20);
}

function computeRecencyScore(lastExecuted: string | null, impactedFiles: string[]): number {
  if (!lastExecuted || impactedFiles.length === 0) return 0.5; // Unknown = medium risk

  // Check if any impacted file was modified after last execution
  const db = getDb();
  const repos = db
    .prepare("SELECT DISTINCT name, local_path FROM repos WHERE local_path IS NOT NULL")
    .all() as Array<{ name: string; local_path: string }>;

  for (const repo of repos) {
    for (const f of impactedFiles) {
      try {
        const output = execSync(
          `git log -1 --format="%aI" -- "${f}"`,
          { cwd: repo.local_path, encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }
        ).trim();
        if (output && new Date(output) > new Date(lastExecuted)) {
          return 1.0; // File changed after last execution
        }
      } catch {
        continue;
      }
    }
  }

  return 0;
}

function computeHistoricalFailureScore(
  db: ReturnType<typeof getDb>,
  testCaseId: string,
  executionCount: number
): number {
  if (executionCount === 0) return 0.3; // Never run = some risk

  const failedCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM run_pack_entries WHERE test_case_id = ? AND status = 'failed'"
      )
      .get(testCaseId) as { c: number }
  ).c;

  return Math.min(1.0, failedCount / Math.max(executionCount, 1));
}
