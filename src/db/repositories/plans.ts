import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type { TestPlanRow, TestStepRow, CoverageGapRow, BlockerRow } from "../types.js";
import type { TestPlan, TestStep } from "../../types/plan.js";

// ── Legacy functions (kept for backward compat) ──

export function saveTestPlan(runId: string, plan: TestPlan): string {
  const db = getDb();
  const planId = uuid();
  db.prepare(
    "INSERT INTO test_plans (id, run_id, plan_json) VALUES (?, ?, ?)"
  ).run(planId, runId, JSON.stringify(plan));

  const insertStep = db.prepare(
    `INSERT INTO test_steps
     (id, plan_id, run_id, step_order, description, confidence, category, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const step of plan.steps) {
    insertStep.run(step.id, planId, runId, step.order, step.description, step.confidence, step.category ?? null, step.status);
  }
  return planId;
}

export function getTestPlan(runId: string): TestPlan | null {
  const row = getDb()
    .prepare("SELECT * FROM test_plans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(runId) as TestPlanRow | undefined;
  return row ? (JSON.parse(row.plan_json) as TestPlan) : null;
}

export function getTestSteps(runId: string): TestStepRow[] {
  return getDb()
    .prepare("SELECT * FROM test_steps WHERE run_id = ? ORDER BY step_order")
    .all(runId) as TestStepRow[];
}

export function updateStepStatus(stepId: string, status: string, resultJson?: string, notes?: string): void {
  getDb().prepare(
    "UPDATE test_steps SET status = ?, executed_at = datetime('now'), result_json = ?, notes = ? WHERE id = ?"
  ).run(status, resultJson ?? null, notes ?? null, stepId);
}

// ── New structured functions ──

export interface CreatePlanInput {
  runId: string;
  ticketId: string;
  targetUrl?: string;
  strategy?: string;
  blockers?: string[];
  coverageGaps?: string[];
  mrRefs?: string[];
  planJson?: string;
  testNotes?: string;
  analysisRunId?: string;
}

export interface CreateStepInput {
  planId: string;
  runId: string;
  order: number;
  description: string;
  confidence: string;
  category?: string;
  priority?: number;
  testcaseId?: string;
  mrRef?: string;
  uimapPageId?: string;
  pageUrl?: string;
  source?: string;
}

export function createPlan(input: CreatePlanInput): string {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO test_plans (id, run_id, ticket_id, target_url, strategy, blockers, coverage_gaps, mr_refs, plan_json, test_notes, analysis_run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, input.runId, input.ticketId,
    input.targetUrl ?? null, input.strategy ?? null,
    JSON.stringify(input.blockers ?? []),
    JSON.stringify(input.coverageGaps ?? []),
    JSON.stringify(input.mrRefs ?? []),
    input.planJson ?? "{}",
    input.testNotes ?? null,
    input.analysisRunId ?? null
  );

  // Also normalize coverage gaps into dedicated table
  if (input.coverageGaps && input.coverageGaps.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO coverage_gaps (id, plan_id, run_id, gap_description)
       VALUES (?, ?, ?, ?)`
    );
    for (const gap of input.coverageGaps) {
      stmt.run(uuid(), id, input.runId, gap);
    }
  }

  // Also normalize blockers into dedicated table
  if (input.blockers && input.blockers.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO blockers (id, plan_id, run_id, ticket_id, description)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const b of input.blockers) {
      stmt.run(uuid(), id, input.runId, input.ticketId ?? null, b);
    }
  }

  return id;
}

export function addStep(input: CreateStepInput): string {
  const id = uuid();
  getDb().prepare(
    `INSERT INTO test_steps (id, plan_id, run_id, step_order, description, confidence, category, priority, testcase_id, mr_ref, uimap_page_id, page_url, source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(
    id, input.planId, input.runId, input.order,
    input.description, input.confidence,
    input.category ?? null, input.priority ?? 0,
    input.testcaseId ?? null, input.mrRef ?? null,
    input.uimapPageId ?? null, input.pageUrl ?? null,
    input.source ?? null
  );
  return id;
}

export function getAllPlanTickets() {
  return getDb().prepare(
    `SELECT p.ticket_id,
       COUNT(DISTINCT p.id) as plan_count,
       COUNT(s.id) as total_steps,
       SUM(CASE WHEN s.confidence = 'confident' THEN 1 ELSE 0 END) as confident,
       SUM(CASE WHEN s.confidence = 'uncertain' THEN 1 ELSE 0 END) as uncertain,
       SUM(CASE WHEN s.status = 'passed' THEN 1 ELSE 0 END) as passed,
       SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) as failed,
       MAX(p.created_at) as last_plan
     FROM test_plans p
     LEFT JOIN test_steps s ON s.plan_id = p.id
     WHERE p.ticket_id IS NOT NULL
     GROUP BY p.ticket_id
     ORDER BY MAX(p.created_at) DESC`
  ).all();
}

export function getPlansByTicket(ticketId: string) {
  return getDb().prepare(
    `SELECT p.*, r.input_ref, r.target_url as run_target,
       (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id) as step_count,
       (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id AND confidence = 'confident') as confident_count,
       (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id AND confidence = 'uncertain') as uncertain_count,
       (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id AND status = 'passed') as passed_count,
       (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id AND status = 'failed') as failed_count
     FROM test_plans p
     JOIN runs r ON p.run_id = r.id
     WHERE p.ticket_id = ?
     ORDER BY p.created_at DESC`
  ).all(ticketId);
}

export function getPlanDetail(planId: string) {
  const db = getDb();
  const plan = db.prepare("SELECT * FROM test_plans WHERE id = ?").get(planId);
  const steps = db.prepare(
    `SELECT s.*, tc.title as tc_title, tc.type as tc_type,
       p.url_pattern as uimap_url, p.page_title as uimap_title
     FROM test_steps s
     LEFT JOIN test_cases tc ON s.testcase_id = tc.id
     LEFT JOIN ui_map_pages p ON s.uimap_page_id = p.id
     WHERE s.plan_id = ?
     ORDER BY s.priority, s.step_order`
  ).all(planId);
  return { plan, steps };
}

export function deletePlan(planId: string): number {
  const db = getDb();
  db.prepare("DELETE FROM blockers WHERE plan_id = ?").run(planId);
  db.prepare("DELETE FROM coverage_gaps WHERE plan_id = ?").run(planId);
  db.prepare("DELETE FROM test_steps WHERE plan_id = ?").run(planId);
  return db.prepare("DELETE FROM test_plans WHERE id = ?").run(planId).changes;
}

export function deletePlansByTicket(ticketId: string): number {
  const db = getDb();
  const plans = db.prepare("SELECT id FROM test_plans WHERE ticket_id = ?").all(ticketId) as Array<{ id: string }>;
  for (const p of plans) {
    db.prepare("DELETE FROM blockers WHERE plan_id = ?").run(p.id);
    db.prepare("DELETE FROM coverage_gaps WHERE plan_id = ?").run(p.id);
    db.prepare("DELETE FROM test_steps WHERE plan_id = ?").run(p.id);
  }
  return db.prepare("DELETE FROM test_plans WHERE ticket_id = ?").run(ticketId).changes;
}

// ── Coverage Gaps ──

export function getCoverageGapsByPlan(planId: string): CoverageGapRow[] {
  return getDb()
    .prepare("SELECT * FROM coverage_gaps WHERE plan_id = ? ORDER BY created_at")
    .all(planId) as CoverageGapRow[];
}

export function getCoverageGapsByRun(runId: string): CoverageGapRow[] {
  return getDb()
    .prepare("SELECT * FROM coverage_gaps WHERE run_id = ? ORDER BY created_at")
    .all(runId) as CoverageGapRow[];
}

export function getCoverageGapStats() {
  return getDb()
    .prepare(
      `SELECT cg.category, COUNT(*) as count,
              COUNT(DISTINCT cg.plan_id) as plan_count
       FROM coverage_gaps cg
       GROUP BY cg.category
       ORDER BY count DESC`
    )
    .all();
}

// ── Blockers ──

export function getBlockersByPlan(planId: string): BlockerRow[] {
  return getDb()
    .prepare("SELECT * FROM blockers WHERE plan_id = ? ORDER BY created_at")
    .all(planId) as BlockerRow[];
}

export function getBlockersByTicket(ticketId: string): BlockerRow[] {
  return getDb()
    .prepare("SELECT * FROM blockers WHERE ticket_id = ? ORDER BY created_at")
    .all(ticketId) as BlockerRow[];
}

export function getBlockersByRun(runId: string): BlockerRow[] {
  return getDb()
    .prepare("SELECT * FROM blockers WHERE run_id = ? ORDER BY created_at")
    .all(runId) as BlockerRow[];
}

export function getAllBlockers(opts?: { openOnly?: boolean; limit?: number }) {
  const db = getDb();
  let sql = `SELECT b.*, p.ticket_id as plan_ticket
             FROM blockers b
             JOIN test_plans p ON b.plan_id = p.id`;
  const params: unknown[] = [];
  if (opts?.openOnly) {
    sql += " WHERE b.status = 'open'";
  }
  sql += " ORDER BY b.created_at DESC LIMIT ?";
  params.push(opts?.limit ?? 100);
  return db.prepare(sql).all(...params);
}

export function resolveBlocker(blockerId: string, resolution: string): void {
  getDb().prepare(
    `UPDATE blockers SET status = 'resolved', resolved_at = datetime('now'), resolution = ? WHERE id = ?`
  ).run(resolution, blockerId);
}

// ── Reverse step lookup ──

export function getStepsByTestCase(testcaseId: string): TestStepRow[] {
  return getDb()
    .prepare("SELECT * FROM test_steps WHERE testcase_id = ? ORDER BY step_order")
    .all(testcaseId) as TestStepRow[];
}
