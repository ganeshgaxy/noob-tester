import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VisualStep {
  stepIndex: number; // which test step has screenshot
  diffType: "snapshot" | "screenshot"; // DOM diff vs pixel diff
  fullPage: boolean; // true = full page, false = use selector
  screenshotSelector?: string; // optional scope (e.g. ".thumbnail-preview")
  threshold?: number; // override default for this step (0.0–1.0)
}

export interface VisualTestCaseInput {
  ticketId: string;
  title: string;
  description?: string;
  type: "direct_functional" | "impact_regression" | "general_regression";
  format: "bdd" | "traditional";
  viewport: string; // required for visual
  defaultThreshold: number; // required for visual

  // BDD format
  bddFeature?: string;
  bddScenario?: string;
  bddGiven?: string[];
  bddWhen?: string[];
  bddThen?: string[];

  // Traditional format
  tradSteps?: Array<{ step: string; expected: string }>;
  tradExpected?: string;

  // Visual-specific
  visualSteps: VisualStep[]; // which steps capture visual diffs & how

  // Metadata
  preconditions?: string[];
  impactedFiles?: string[];
  labels?: string[];
  testLayer?: "ui";
  ready?: boolean;
}

export interface VisualRunInput {
  ticketId: string;
  mode: "baseline" | "verification";
  targetUrl: string;
  secretTarget?: string;
  secretRole?: string;
  sessionId?: string;
}

export interface VisualScreenshotInput {
  visualRunId: string;
  visualTcId: string;
  ticketId: string;
  stepIndex: number;
  stepLabel: string;
  viewport: string;
  filePath: string;
  targetUrl?: string;
  mode: "baseline" | "verification";
}

export interface VisualComparisonInput {
  visualRunId: string;
  visualTcId: string;
  ticketId: string;
  stepIndex: number;
  stepLabel: string;
  viewport: string;
  baselineId: string;
  currentId: string;
  diffPath?: string;
  diffScore?: number;
  threshold: number;
  passed: boolean;
}

// ── Visual Test Cases ─────────────────────────────────────────────────────────

export function createVisualTestCase(input: VisualTestCaseInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO visual_test_cases
       (id, ticket_id, title, description, type, format, viewport, default_threshold,
        bdd_feature, bdd_scenario, bdd_given, bdd_when, bdd_then,
        trad_steps, trad_expected, visual_steps_json, preconditions, impacted_files, labels, test_layer, ready)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.ticketId,
      input.title,
      input.description ?? null,
      input.type,
      input.format,
      input.viewport,
      input.defaultThreshold,
      input.bddFeature ?? null,
      input.bddScenario ?? null,
      input.bddGiven ? JSON.stringify(input.bddGiven) : null,
      input.bddWhen ? JSON.stringify(input.bddWhen) : null,
      input.bddThen ? JSON.stringify(input.bddThen) : null,
      input.tradSteps ? JSON.stringify(input.tradSteps) : null,
      input.tradExpected ?? null,
      JSON.stringify(input.visualSteps),
      input.preconditions ? JSON.stringify(input.preconditions) : null,
      input.impactedFiles ? JSON.stringify(input.impactedFiles) : null,
      JSON.stringify(input.labels ?? []),
      input.testLayer ?? "ui",
      input.ready ? 1 : 0,
    );
  return id;
}

export function getVisualTestCase(id: string): unknown {
  return getDb()
    .prepare("SELECT * FROM visual_test_cases WHERE id = ?")
    .get(id);
}

export function listVisualTestCases(ticketId: string): unknown[] {
  return getDb()
    .prepare(
      "SELECT * FROM visual_test_cases WHERE ticket_id = ? AND status = 'active' ORDER BY created_at ASC",
    )
    .all(ticketId) as unknown[];
}

export function updateVisualTestCase(
  id: string,
  patch: Partial<VisualTestCaseInput>,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    fields.push("title = ?");
    values.push(patch.title);
  }
  if (patch.description !== undefined) {
    fields.push("description = ?");
    values.push(patch.description);
  }
  if (patch.type !== undefined) {
    fields.push("type = ?");
    values.push(patch.type);
  }
  if (patch.format !== undefined) {
    fields.push("format = ?");
    values.push(patch.format);
  }
  if (patch.viewport !== undefined) {
    fields.push("viewport = ?");
    values.push(patch.viewport);
  }
  if (patch.defaultThreshold !== undefined) {
    fields.push("default_threshold = ?");
    values.push(patch.defaultThreshold);
  }
  if (patch.bddFeature !== undefined) {
    fields.push("bdd_feature = ?");
    values.push(patch.bddFeature ?? null);
  }
  if (patch.bddScenario !== undefined) {
    fields.push("bdd_scenario = ?");
    values.push(patch.bddScenario ?? null);
  }
  if (patch.bddGiven !== undefined) {
    fields.push("bdd_given = ?");
    values.push(patch.bddGiven ? JSON.stringify(patch.bddGiven) : null);
  }
  if (patch.bddWhen !== undefined) {
    fields.push("bdd_when = ?");
    values.push(patch.bddWhen ? JSON.stringify(patch.bddWhen) : null);
  }
  if (patch.bddThen !== undefined) {
    fields.push("bdd_then = ?");
    values.push(patch.bddThen ? JSON.stringify(patch.bddThen) : null);
  }
  if (patch.tradSteps !== undefined) {
    fields.push("trad_steps = ?");
    values.push(patch.tradSteps ? JSON.stringify(patch.tradSteps) : null);
  }
  if (patch.tradExpected !== undefined) {
    fields.push("trad_expected = ?");
    values.push(patch.tradExpected ?? null);
  }
  if (patch.visualSteps !== undefined) {
    fields.push("visual_steps_json = ?");
    values.push(JSON.stringify(patch.visualSteps));
  }
  if (patch.preconditions !== undefined) {
    fields.push("preconditions = ?");
    values.push(patch.preconditions ? JSON.stringify(patch.preconditions) : null);
  }
  if (patch.impactedFiles !== undefined) {
    fields.push("impacted_files = ?");
    values.push(patch.impactedFiles ? JSON.stringify(patch.impactedFiles) : null);
  }
  if (patch.labels !== undefined) {
    fields.push("labels = ?");
    values.push(JSON.stringify(patch.labels ?? []));
  }
  if (patch.testLayer !== undefined) {
    fields.push("test_layer = ?");
    values.push(patch.testLayer ?? "ui");
  }
  if (patch.ready !== undefined) {
    fields.push("ready = ?");
    values.push(patch.ready ? 1 : 0);
  }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb()
    .prepare(`UPDATE visual_test_cases SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function archiveVisualTestCase(id: string): void {
  getDb()
    .prepare(
      "UPDATE visual_test_cases SET status = 'archived', updated_at = datetime('now') WHERE id = ?",
    )
    .run(id);
}

// ── Visual Runs ───────────────────────────────────────────────────────────────

export function startVisualRun(input: VisualRunInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO visual_runs
       (id, ticket_id, mode, target_url, secret_target, secret_role, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.ticketId,
      input.mode,
      input.targetUrl,
      input.secretTarget ?? null,
      input.secretRole ?? null,
      input.sessionId ?? null,
    );
  return id;
}

export function getVisualRun(id: string): unknown {
  return getDb().prepare("SELECT * FROM visual_runs WHERE id = ?").get(id);
}

export function listVisualRuns(ticketId: string): unknown[] {
  return getDb()
    .prepare(
      "SELECT * FROM visual_runs WHERE ticket_id = ? ORDER BY created_at DESC",
    )
    .all(ticketId) as unknown[];
}

export function completeVisualRun(
  id: string,
  summary: {
    total: number;
    passed: number;
    failed: number;
    no_baseline: number;
  },
): void {
  getDb()
    .prepare(
      `UPDATE visual_runs
       SET status = 'completed', summary_json = ?, completed_at = datetime('now')
       WHERE id = ?`,
    )
    .run(JSON.stringify(summary), id);
}

// ── Visual Run Entries ────────────────────────────────────────────────────────

export function createVisualRunEntry(
  visualRunId: string,
  visualTcId: string,
  ticketId: string,
): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO visual_run_entries (id, visual_run_id, visual_tc_id, ticket_id)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, visualRunId, visualTcId, ticketId);
  return id;
}

export function updateVisualRunEntry(
  id: string,
  status: "running" | "passed" | "failed" | "skipped",
  resultJson?: Record<string, unknown>,
  telemetry?: {
    device?: string;
    dimension?: string;
    tracePath?: string;
    profilePath?: string;
    telemetryConfig?: string;
  },
): void {
  const db = getDb();
  const sets: string[] = [
    "status = ?",
    "result_json = ?",
    "completed_at = datetime('now')",
  ];
  const params: unknown[] = [
    status,
    resultJson ? JSON.stringify(resultJson) : null,
  ];

  if (telemetry?.device !== undefined) {
    sets.push("device = ?");
    params.push(telemetry.device);
  }
  if (telemetry?.dimension !== undefined) {
    sets.push("dimension = ?");
    params.push(telemetry.dimension);
  }
  if (telemetry?.tracePath !== undefined) {
    sets.push("trace_path = ?");
    params.push(telemetry.tracePath);
  }
  if (telemetry?.profilePath !== undefined) {
    sets.push("profile_path = ?");
    params.push(telemetry.profilePath);
  }
  if (telemetry?.telemetryConfig !== undefined) {
    sets.push("telemetry_config = ?");
    params.push(telemetry.telemetryConfig);
  }

  params.push(id);
  db.prepare(
    `UPDATE visual_run_entries SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...params);
}

export function listVisualRunEntries(visualRunId: string): unknown[] {
  return getDb()
    .prepare(
      "SELECT * FROM visual_run_entries WHERE visual_run_id = ? ORDER BY created_at ASC",
    )
    .all(visualRunId) as unknown[];
}

/**
 * Atomically claim the next pending entry in a visual run.
 * Sets status to 'running' and returns the entry joined with its test case data.
 * Returns null if no pending entries remain.
 */
export function claimNextVisualTestCase(
  visualRunId: string,
  opts?: { name?: string },
): (Record<string, unknown> & { tc: Record<string, unknown> }) | null {
  const db = getDb();

  const nameFilter = opts?.name ? " AND LOWER(vtc.title) LIKE LOWER(?)" : "";
  const params: unknown[] = [visualRunId];
  if (opts?.name) params.push(`%${opts.name}%`);

  const entry = db
    .prepare(
      `SELECT vre.* FROM visual_run_entries vre
       JOIN visual_test_cases vtc ON vre.visual_tc_id = vtc.id
       WHERE vre.visual_run_id = ? AND vre.status = 'pending'${nameFilter}
       ORDER BY vre.created_at ASC
       LIMIT 1`,
    )
    .get(...params) as Record<string, unknown> | undefined;

  if (!entry) return null;

  db.prepare(
    `UPDATE visual_run_entries
     SET status = 'running', completed_at = NULL
     WHERE id = ?`,
  ).run(entry.id);

  const tc = db
    .prepare("SELECT * FROM visual_test_cases WHERE id = ?")
    .get(entry.visual_tc_id) as Record<string, unknown>;

  return { ...entry, status: "running", tc };
}

// ── Visual Screenshots ────────────────────────────────────────────────────────

export function recordVisualScreenshot(input: VisualScreenshotInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO visual_screenshots
       (id, visual_run_id, visual_tc_id, ticket_id, step_index, step_label, viewport, file_path, target_url, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.visualRunId,
      input.visualTcId,
      input.ticketId,
      input.stepIndex,
      input.stepLabel,
      input.viewport,
      input.filePath,
      input.targetUrl ?? null,
      input.mode,
    );
  return id;
}

/**
 * Find the latest baseline screenshot matching the fingerprint:
 * ticket_id + visual_tc_id + step_index + viewport
 * target_url is intentionally excluded to allow cross-environment comparison.
 */
export function findBaselineScreenshot(
  ticketId: string,
  visualTcId: string,
  stepIndex: number,
  viewport: string,
): unknown | null {
  return (
    getDb()
      .prepare(
        `SELECT vs.* FROM visual_screenshots vs
         INNER JOIN visual_runs vr ON vr.id = vs.visual_run_id
         WHERE vs.ticket_id = ?
           AND vs.visual_tc_id = ?
           AND vs.step_index = ?
           AND vs.viewport = ?
           AND vs.mode = 'baseline'
           AND vr.status = 'completed'
         ORDER BY vs.created_at DESC
         LIMIT 1`,
      )
      .get(ticketId, visualTcId, stepIndex, viewport) ?? null
  );
}

export function listVisualScreenshots(visualRunId: string): unknown[] {
  return getDb()
    .prepare(
      "SELECT * FROM visual_screenshots WHERE visual_run_id = ? ORDER BY step_index ASC",
    )
    .all(visualRunId) as unknown[];
}

// ── Visual Comparisons ────────────────────────────────────────────────────────

export function recordVisualComparison(input: VisualComparisonInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO visual_comparisons
       (id, visual_run_id, visual_tc_id, ticket_id, step_index, step_label,
        viewport, baseline_id, current_id, diff_path, diff_score, threshold, passed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.visualRunId,
      input.visualTcId,
      input.ticketId,
      input.stepIndex,
      input.stepLabel,
      input.viewport,
      input.baselineId,
      input.currentId,
      input.diffPath ?? null,
      input.diffScore ?? null,
      input.threshold,
      input.passed ? 1 : 0,
    );
  return id;
}

export function listVisualComparisons(visualRunId: string): unknown[] {
  return getDb()
    .prepare(
      `SELECT vc.*,
              bs.file_path AS baseline_path,
              cs.file_path AS current_path
       FROM visual_comparisons vc
       INNER JOIN visual_screenshots bs ON bs.id = vc.baseline_id
       INNER JOIN visual_screenshots cs ON cs.id = vc.current_id
       WHERE vc.visual_run_id = ?
       ORDER BY vc.step_index ASC`,
    )
    .all(visualRunId) as unknown[];
}

export function getVisualRunSummary(visualRunId: string): {
  total: number;
  passed: number;
  failed: number;
  no_baseline: number;
} {
  const entries = listVisualRunEntries(visualRunId) as Array<
    Record<string, unknown>
  >;
  const total = entries.length;
  const passed = entries.filter((e) => e.status === "passed").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const skipped = entries.filter((e) => e.status === "skipped").length;
  return { total, passed, failed, no_baseline: skipped };
}

/**
 * Get run_pack logs and observations for a ticket (for display in visual runs).
 * Returns aggregated logs and observations from run_pack_entries.
 */
export function getRunPackLogsForTicket(
  ticketId: string,
): {
  logs: string[];
  observations: string[];
} {
  const db = getDb();
  const entries = db
    .prepare(
      "SELECT logs, observations FROM run_pack_entries WHERE ticket_id = ? AND (logs IS NOT NULL OR observations IS NOT NULL)",
    )
    .all(ticketId) as Array<{
    logs: string | null;
    observations: string | null;
  }>;

  const allLogs: string[] = [];
  const allObservations: string[] = [];

  for (const entry of entries) {
    if (entry.logs) {
      try {
        const parsed = JSON.parse(entry.logs);
        if (Array.isArray(parsed)) {
          allLogs.push(...parsed);
        }
      } catch {}
    }
    if (entry.observations) {
      try {
        const parsed = JSON.parse(entry.observations);
        if (Array.isArray(parsed)) {
          allObservations.push(...parsed);
        }
      } catch {}
    }
  }

  return { logs: allLogs, observations: allObservations };
}
