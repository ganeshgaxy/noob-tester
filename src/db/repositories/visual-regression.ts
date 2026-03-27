import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { getDb } from "../client.js";

export interface VisualBaselineRow {
  id: string;
  ui_map_page_id: string;
  url_pattern: string;
  viewport: string;
  baseline_path: string;
  baseline_hash: string | null;
  source_run_id: string | null;
  source_entry_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VisualDiffRow {
  id: string;
  baseline_id: string;
  run_id: string;
  entry_id: string | null;
  current_path: string;
  diff_score: number | null;
  description: string | null;
  is_regression: number;
  reviewed: number;
  created_at: string;
}

/**
 * Compute SHA-256 hash of a file.
 */
function hashFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Set or update a visual baseline for a page + viewport.
 * Supersedes any existing active baseline.
 */
export function setBaseline(
  pageId: string,
  urlPattern: string,
  viewport: string,
  screenshotPath: string,
  opts?: { runId?: string; entryId?: string }
): string {
  const db = getDb();
  const hash = hashFile(screenshotPath);

  // Supersede existing active baseline
  db.prepare(
    `UPDATE visual_baselines SET status = 'superseded', updated_at = datetime('now')
     WHERE ui_map_page_id = ? AND viewport = ? AND status = 'active'`
  ).run(pageId, viewport);

  const id = uuid();
  db.prepare(
    `INSERT INTO visual_baselines
     (id, ui_map_page_id, url_pattern, viewport, baseline_path, baseline_hash,
      source_run_id, source_entry_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(
    id, pageId, urlPattern, viewport, screenshotPath, hash,
    opts?.runId ?? null, opts?.entryId ?? null
  );

  return id;
}

/**
 * Get the active baseline for a page + viewport.
 */
export function getBaseline(
  pageId: string,
  viewport?: string
): VisualBaselineRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM visual_baselines
       WHERE ui_map_page_id = ? AND viewport = ? AND status = 'active'`
    )
    .get(pageId, viewport ?? "1280x720") as VisualBaselineRow | undefined;
}

/**
 * Compare a current screenshot against the baseline.
 * Returns: { hasBaseline, hashMatch, baselinePath, baselineId } or null.
 */
export function compareAgainstBaseline(
  pageId: string,
  screenshotPath: string,
  viewport?: string
): {
  hasBaseline: boolean;
  hashMatch: boolean;
  baselinePath: string | null;
  baselineId: string | null;
  baselineHash: string | null;
  currentHash: string | null;
} {
  const baseline = getBaseline(pageId, viewport);

  if (!baseline) {
    return {
      hasBaseline: false,
      hashMatch: false,
      baselinePath: null,
      baselineId: null,
      baselineHash: null,
      currentHash: null,
    };
  }

  const currentHash = hashFile(screenshotPath);
  const hashMatch = !!(currentHash && baseline.baseline_hash && currentHash === baseline.baseline_hash);

  return {
    hasBaseline: true,
    hashMatch,
    baselinePath: baseline.baseline_path,
    baselineId: baseline.id,
    baselineHash: baseline.baseline_hash,
    currentHash,
  };
}

/**
 * Save a visual diff result (after Claude vision comparison).
 */
export function createDiff(
  baselineId: string,
  runId: string,
  currentPath: string,
  opts?: {
    entryId?: string;
    diffScore?: number;
    description?: string;
    isRegression?: boolean;
  }
): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO visual_diffs
       (id, baseline_id, run_id, entry_id, current_path, diff_score, description, is_regression)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, baselineId, runId, opts?.entryId ?? null,
      currentPath, opts?.diffScore ?? null,
      opts?.description ?? null, opts?.isRegression ? 1 : 0
    );
  return id;
}

/**
 * Get all diffs for a run.
 */
export function getDiffsByRun(runId: string): VisualDiffRow[] {
  return getDb()
    .prepare("SELECT * FROM visual_diffs WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId) as VisualDiffRow[];
}

/**
 * Get unreviewed diffs (optionally by run pack).
 */
export function getUnreviewedDiffs(runId?: string) {
  const filter = runId ? " AND run_id = ?" : "";
  const params = runId ? [runId] : [];
  return getDb()
    .prepare(
      `SELECT vd.*, vb.url_pattern, vb.viewport, vb.baseline_path
       FROM visual_diffs vd
       JOIN visual_baselines vb ON vd.baseline_id = vb.id
       WHERE vd.reviewed = 0${filter}
       ORDER BY vd.is_regression DESC, vd.created_at ASC`
    )
    .all(...params);
}

/**
 * Mark a diff as reviewed.
 */
export function markDiffReviewed(diffId: string, isRegression: boolean): void {
  getDb()
    .prepare(
      "UPDATE visual_diffs SET reviewed = 1, is_regression = ? WHERE id = ?"
    )
    .run(isRegression ? 1 : 0, diffId);
}

/**
 * Accept the current screenshot as the new baseline (promotes diff's current image).
 */
export function acceptAsNewBaseline(diffId: string): string | null {
  const db = getDb();
  const diff = db
    .prepare("SELECT * FROM visual_diffs WHERE id = ?")
    .get(diffId) as VisualDiffRow | undefined;

  if (!diff) return null;

  const baseline = db
    .prepare("SELECT * FROM visual_baselines WHERE id = ?")
    .get(diff.baseline_id) as VisualBaselineRow | undefined;

  if (!baseline) return null;

  // Mark diff as reviewed (not a regression — accepted)
  markDiffReviewed(diffId, false);

  // Create new baseline from the diff's current screenshot
  return setBaseline(
    baseline.ui_map_page_id,
    baseline.url_pattern,
    baseline.viewport,
    diff.current_path,
    { runId: diff.run_id, entryId: diff.entry_id ?? undefined }
  );
}

/**
 * Get visual regression stats.
 */
export function getVisualRegressionStats(runId?: string): {
  totalDiffs: number;
  regressions: number;
  reviewed: number;
  unreviewed: number;
  totalBaselines: number;
} {
  const db = getDb();
  const filter = runId ? " WHERE run_id = ?" : "";
  const params = runId ? [runId] : [];

  const totalDiffs = (
    db.prepare(`SELECT COUNT(*) as c FROM visual_diffs${filter}`).get(...params) as { c: number }
  ).c;

  const regressions = (
    db.prepare(`SELECT COUNT(*) as c FROM visual_diffs WHERE is_regression = 1${runId ? " AND run_id = ?" : ""}`).get(...params) as { c: number }
  ).c;

  const reviewed = (
    db.prepare(`SELECT COUNT(*) as c FROM visual_diffs WHERE reviewed = 1${runId ? " AND run_id = ?" : ""}`).get(...params) as { c: number }
  ).c;

  const totalBaselines = (
    db.prepare("SELECT COUNT(*) as c FROM visual_baselines WHERE status = 'active'").get() as { c: number }
  ).c;

  return {
    totalDiffs,
    regressions,
    reviewed,
    unreviewed: totalDiffs - reviewed,
    totalBaselines,
  };
}
