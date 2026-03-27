import { getDb } from "../db/client.js";
import { getAnalysesByRun } from "../db/repositories/analyses.js";
import { getTestPlan, getTestSteps } from "../db/repositories/plans.js";
import { getIssuesByRun, getFailurePatterns } from "../db/repositories/issues.js";
import type { RunRow, TestStepRow, AnalysisRow } from "../db/types.js";

export interface PriorContext {
  runSummary: string;
  gapAnalysis: object | null;
  requirementsAnalysis: object | null;
  feasibilityAnalysis: object | null;
  testPlan: object | null;
  failedSteps: TestStepRow[];
  issues: object[];
  trickySteps: TestStepRow[];
}

export function loadPriorRunContext(runId: string): PriorContext | null {
  const run = getDb()
    .prepare("SELECT * FROM runs WHERE id = ?")
    .get(runId) as RunRow | undefined;

  if (!run) return null;

  const analyses = getAnalysesByRun(runId);
  const plan = getTestPlan(runId);
  const steps = getTestSteps(runId);
  const issues = getIssuesByRun(runId);

  return {
    runSummary: run.summary ?? "No summary available",
    gapAnalysis: findAnalysis(analyses, "gap"),
    requirementsAnalysis: findAnalysis(analyses, "requirements"),
    feasibilityAnalysis: findAnalysis(analyses, "feasibility"),
    testPlan: plan,
    failedSteps: steps.filter((s) => s.status === "failed"),
    issues,
    trickySteps: steps.filter(
      (s) => s.confidence === "uncertain"
    ),
  };
}

export function formatPriorContext(ctx: PriorContext): string {
  const sections: string[] = [];

  sections.push(`PRIOR RUN SUMMARY: ${ctx.runSummary}`);
  if (ctx.gapAnalysis) sections.push(`GAP ANALYSIS:\n${JSON.stringify(ctx.gapAnalysis, null, 2)}`);
  if (ctx.requirementsAnalysis) sections.push(`REQUIREMENTS ANALYSIS:\n${JSON.stringify(ctx.requirementsAnalysis, null, 2)}`);
  if (ctx.testPlan) sections.push(`TEST PLAN:\n${JSON.stringify(ctx.testPlan, null, 2)}`);
  if (ctx.failedSteps.length > 0) sections.push(`FAILED STEPS:\n${JSON.stringify(ctx.failedSteps, null, 2)}`);
  if (ctx.trickySteps.length > 0) sections.push(`TRICKY STEPS:\n${JSON.stringify(ctx.trickySteps, null, 2)}`);
  if (ctx.issues.length > 0) sections.push(`ISSUES (${ctx.issues.length}):\n${JSON.stringify(ctx.issues.slice(0, 20), null, 2)}`);

  const patterns = getFailurePatterns(20);
  if (patterns.length > 0) sections.push(`KNOWN FAILURE PATTERNS:\n${JSON.stringify(patterns, null, 2)}`);

  return sections.join("\n\n");
}

function findAnalysis(analyses: AnalysisRow[], type: string): object | null {
  const row = analyses.find((a) => a.analysis_type === type);
  if (!row) return null;
  try { return JSON.parse(row.content_json); } catch { return null; }
}
