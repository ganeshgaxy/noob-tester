import type { Command } from "commander";
import { v4 as uuid } from "uuid";
import chalk from "chalk";
import { showHistory, showStatus, generateReport, getRun } from "../../db/repositories/runs.js";
import { getDb } from "../../db/client.js";
import { getPlansByTicket, getPlanDetail } from "../../db/repositories/plans.js";
import { getTestCaseStats } from "../../db/repositories/testcases.js";
import { getRunPacksByTicket, getRunPackEntriesWithTestCases } from "../../db/repositories/runpacks.js";

export function registerReportCommands(program: Command): void {
  program
    .command("report")
    .description("Generate a comprehensive report for a ticket (all data) or a single run")
    .option("--ticket <id>", "Ticket ID — pulls analyses, plans, test cases, run packs, issues, UI maps")
    .option("--run <runId>", "Single run ID (legacy mode — issues only)")
    .option("--json", "Output as structured JSON (for /noob-report skill to analyze)")
    .action((opts) => {
      if (opts.ticket) {
        generateTicketReport(opts.ticket, opts.json ?? false);
      } else if (opts.run) {
        if (opts.json) {
          const data = gatherRunReport(opts.run);
          console.log(JSON.stringify(data, null, 2));
        } else {
          generateReport(opts.run);
        }
      } else {
        console.error("Provide --ticket <id> or --run <runId>");
        process.exit(1);
      }
    });

  program
    .command("report-save")
    .description("Save Claude's analysis report for a ticket")
    .requiredOption("--ticket <id>", "Ticket ID")
    .requiredOption("--verdict <v>", "PASS | FAIL | PARTIAL")
    .requiredOption("--summary <text>", "One-line verdict summary")
    .requiredOption("--analysis <text>", "Claude's full written analysis — findings, root causes, correlations, what went wrong and why")
    .option("--improvements <text>", "Claude's improvement plan — prioritized recommendations")
    .option("--run <runId>", "Run ID")
    .option("--session <sessionId>", "Session ID")
    .action((opts) => {
      const db = getDb();
      const id = uuid();

      // Also store the computed data snapshot for reference
      let rawDataJson: string | null = null;
      try {
        const data = gatherTicketReport(opts.ticket);
        rawDataJson = JSON.stringify(data);
      } catch {}

      db.prepare(
        `INSERT INTO reports (id, ticket_id, run_id, session_id, verdict, summary, analysis, improvements, raw_data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, opts.ticket, opts.run ?? null, opts.session ?? null,
        opts.verdict, opts.summary, opts.analysis,
        opts.improvements ?? null, rawDataJson
      );
      console.log(JSON.stringify({ reportId: id }));
    });

  program
    .command("report-get")
    .description("Get saved reports for a ticket")
    .requiredOption("--ticket <id>", "Ticket ID")
    .option("--latest", "Only the most recent report")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const db = getDb();
      const reports = db
        .prepare("SELECT id, ticket_id, run_id, verdict, summary, analysis, improvements, created_at FROM reports WHERE ticket_id = ? ORDER BY created_at DESC" + (opts.latest ? " LIMIT 1" : ""))
        .all(opts.ticket);

      if (opts.json) {
        console.log(JSON.stringify(reports, null, 2));
        return;
      }

      if ((reports as unknown[]).length === 0) {
        console.log("No reports saved for " + opts.ticket + ". Run /noob-report to generate one.");
        return;
      }

      for (const r of reports as Array<Record<string, unknown>>) {
        const verdictColor = r.verdict === "PASS" ? chalk.green.bold : r.verdict === "FAIL" ? chalk.red.bold : chalk.yellow.bold;
        console.log(chalk.bold.cyan(`\n══ Report: ${opts.ticket} — ${verdictColor(r.verdict)} ══`));
        console.log(chalk.dim(`  ${r.created_at}  ${(r.id as string).slice(0, 8)}\n`));
        console.log(chalk.bold("Summary:"));
        console.log(`  ${r.summary}\n`);
        console.log(chalk.bold("Analysis:"));
        console.log(`${r.analysis}\n`);
        if (r.improvements) {
          console.log(chalk.bold.cyan("Improvements:"));
          console.log(`${r.improvements}\n`);
        }
      }
    });

  program
    .command("history")
    .description("List past test runs")
    .option("--limit <n>", "Number of runs to show", "20")
    .option("--json", "Output as JSON")
    .action((opts) => {
      if (opts.json) {
        const rows = getDb()
          .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?")
          .all(parseInt(opts.limit));
        console.log(JSON.stringify(rows, null, 2));
      } else {
        showHistory(parseInt(opts.limit));
      }
    });

  program
    .command("status <runId>")
    .description("Show details of a run")
    .option("--json", "Output as JSON")
    .action((runId: string, opts: { json?: boolean }) => {
      if (opts.json) {
        const run = getRun(runId);
        console.log(JSON.stringify(run, null, 2));
      } else {
        showStatus(runId);
      }
    });
}

function gatherRunReport(runId: string) {
  const db = getDb();
  const run = getRun(runId);
  const issues = db
    .prepare("SELECT * FROM issues WHERE run_id = ? ORDER BY severity, category")
    .all(runId);
  const analyses = db
    .prepare("SELECT * FROM analyses WHERE run_id = ?")
    .all(runId);
  return { run, issues, analyses };
}

export function gatherTicketReport(ticketId: string): Record<string, unknown> {
  const { report } = buildTicketReportData(ticketId);
  return report;
}

function generateTicketReport(ticketId: string, asJson: boolean): void {
  const { report, insights, planTestNotes, issuesBySeverity, issues, testCaseStats, uiMapStats, uiMapFlakyElements, techIssues, totalExecuted, totalPassed, totalFailed, totalBlocked, uiExecuted, apiExecuted, runs, sessions, latestPlan, planSteps } = buildTicketReportData(ticketId);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printFormattedReport(ticketId, report, insights, planTestNotes, issuesBySeverity, issues, testCaseStats, uiMapStats, uiMapFlakyElements, techIssues, totalExecuted, totalPassed, totalFailed, totalBlocked, uiExecuted, apiExecuted, runs, sessions, latestPlan, planSteps);
}

function buildTicketReportData(ticketId: string) {
  const db = getDb();

  // ── 1. Runs ──
  const runs = db
    .prepare("SELECT * FROM runs WHERE input_ref = ? ORDER BY created_at DESC")
    .all(ticketId) as Array<Record<string, unknown>>;

  // ── 2. Analyses (across all runs) ──
  const runIds = runs.map(r => r.id as string);
  let analyses: unknown[] = [];
  if (runIds.length > 0) {
    const ph = runIds.map(() => "?").join(",");
    analyses = db
      .prepare(`SELECT a.*, r.input_ref as ticket FROM analyses a JOIN runs r ON a.run_id = r.id WHERE a.run_id IN (${ph}) ORDER BY a.analysis_type, a.created_at DESC`)
      .all(...runIds);
  }

  // ── 3. Plans ──
  const plans = getPlansByTicket(ticketId) as Array<Record<string, unknown>>;
  let latestPlan: unknown = null;
  let planSteps: unknown[] = [];
  let planTestNotes: string | null = null;
  if (plans.length > 0) {
    const detail = getPlanDetail(plans[0].id as string) as { plan: Record<string, unknown>; steps: unknown[] };
    latestPlan = detail.plan;
    planSteps = detail.steps;
    planTestNotes = (detail.plan.test_notes as string) ?? null;
    // Parse plan sections
    try {
      const sections = JSON.parse((detail.plan.plan_json as string) || "{}");
      (latestPlan as Record<string, unknown>).sections = sections;
    } catch {}
  }

  // ── 4. Test Cases ──
  const testCaseStats = getTestCaseStats(ticketId);
  const testCases = db
    .prepare("SELECT id, title, type, format, status, COALESCE(test_layer, 'ui') as test_layer, ready, execution_count, last_executed FROM test_cases WHERE ticket_ref = ? ORDER BY priority, created_at")
    .all(ticketId);

  // ── 5. Run Packs (execution results) ──
  const runPacks = getRunPacksByTicket(ticketId) as Array<Record<string, unknown>>;
  const packDetails: Array<{ packId: string; entries: unknown[] }> = [];
  for (const pack of runPacks) {
    const entries = getRunPackEntriesWithTestCases(pack.run_pack_id as string);
    packDetails.push({ packId: pack.run_pack_id as string, entries });
  }

  // ── 6. Issues (across all runs) ──
  let issues: unknown[] = [];
  if (runIds.length > 0) {
    const ph = runIds.map(() => "?").join(",");
    issues = db
      .prepare(`SELECT * FROM issues WHERE run_id IN (${ph}) ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 WHEN 'info' THEN 4 END, category`)
      .all(...runIds);
  }
  const issuesBySeverity: Record<string, number> = {};
  const issuesByCategory: Record<string, number> = {};
  for (const i of issues as Array<Record<string, unknown>>) {
    issuesBySeverity[i.severity as string] = (issuesBySeverity[i.severity as string] || 0) + 1;
    issuesByCategory[i.category as string] = (issuesByCategory[i.category as string] || 0) + 1;
  }

  // ── 7. UI Maps ──
  let uiMap: unknown = null;
  let uiMapStats: unknown = null;
  let uiMapPages: unknown[] = [];
  let uiMapFlakyElements: unknown[] = [];
  const mapRow = db
    .prepare("SELECT * FROM ui_maps WHERE ticket_ids LIKE ? LIMIT 1")
    .get(`%${ticketId}%`) as Record<string, unknown> | undefined;
  if (mapRow) {
    uiMap = mapRow;
    uiMapPages = db
      .prepare("SELECT id, url_pattern, page_title, status, auth_required FROM ui_map_pages WHERE ui_map_id = ? ORDER BY url_pattern")
      .all(mapRow.id as string);
    uiMapFlakyElements = db
      .prepare("SELECT e.selector, e.element_type, e.status, e.times_used, e.times_failed, p.url_pattern FROM ui_map_elements e JOIN ui_map_pages p ON e.page_id = p.id WHERE e.ui_map_id = ? AND e.status IN ('flaky', 'broken') ORDER BY e.times_failed DESC")
      .all(mapRow.id as string);
    const totalElements = (db.prepare("SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ?").get(mapRow.id) as { c: number }).c;
    const totalPages = uiMapPages.length;
    const totalNavs = (db.prepare("SELECT COUNT(*) as c FROM ui_map_navigations WHERE ui_map_id = ?").get(mapRow.id) as { c: number }).c;
    const totalForms = (db.prepare("SELECT COUNT(*) as c FROM ui_map_forms WHERE ui_map_id = ? ").get(mapRow.id) as { c: number }).c;
    uiMapStats = { totalPages, totalElements, totalNavs, totalForms, flakyCount: uiMapFlakyElements.length };
  }

  // ── 8. Tech Issues ──
  const techIssues = db
    .prepare("SELECT * FROM tech_issues WHERE ticket_ref = ? ORDER BY status, severity DESC")
    .all(ticketId);

  // ── 9. Sessions ──
  const sessions = db
    .prepare("SELECT id, task_summary as task, labels, status, created_at, ended_at FROM sessions WHERE ticket_refs LIKE ? ORDER BY created_at DESC")
    .all(`%${ticketId}%`);

  // ── Build execution summary ──
  let totalExecuted = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalBlocked = 0;
  let totalSkipped = 0;
  let uiExecuted = 0;
  let apiExecuted = 0;
  for (const pd of packDetails) {
    for (const e of pd.entries as Array<Record<string, unknown>>) {
      if (e.status === "passed") { totalPassed++; totalExecuted++; }
      else if (e.status === "failed") { totalFailed++; totalExecuted++; }
      else if (e.status === "blocked") { totalBlocked++; }
      else if (e.status === "skipped") { totalSkipped++; }
      if ((e.runner || "ui") === "ui") uiExecuted++;
      if (e.runner === "api") apiExecuted++;
    }
  }

  // ── 10. Compute Insights ──
  const insights = computeInsights({
    ticketId, runs, analyses, latestPlan, planSteps, planTestNotes, testCases,
    testCaseStats, issues, packDetails, uiMapPages, uiMapFlakyElements,
    uiMapStats, techIssues, totalExecuted, totalPassed, totalFailed,
    totalBlocked, totalSkipped, uiExecuted, apiExecuted, issuesBySeverity,
    issuesByCategory,
  });

  const report = {
    ticket: ticketId,
    generatedAt: new Date().toISOString(),

    insights,

    summary: {
      totalRuns: runs.length,
      totalSessions: (sessions as unknown[]).length,
      totalIssues: issues.length,
      issuesBySeverity,
      issuesByCategory,
      testCases: testCaseStats,
      execution: {
        totalExecuted,
        passed: totalPassed,
        failed: totalFailed,
        blocked: totalBlocked,
        skipped: totalSkipped,
        uiRuns: uiExecuted,
        apiRuns: apiExecuted,
      },
      hasAnalysis: analyses.length > 0,
      hasPlan: latestPlan !== null,
      hasTestNotes: planTestNotes !== null,
      hasUiMap: uiMap !== null,
    },

    analyses: (analyses as Array<Record<string, unknown>>).map(a => ({
      type: a.analysis_type,
      summary: a.summary,
      confidence: a.confidence,
      content: (() => { try { return JSON.parse(a.content_json as string); } catch { return a.content_json; } })(),
    })),

    plan: latestPlan ? {
      strategy: (latestPlan as Record<string, unknown>).strategy,
      testNotes: planTestNotes,
      sections: (latestPlan as Record<string, unknown>).sections,
      blockers: (() => { try { return JSON.parse((latestPlan as Record<string, unknown>).blockers as string || "[]"); } catch { return []; } })(),
      coverageGaps: (() => { try { return JSON.parse((latestPlan as Record<string, unknown>).coverage_gaps as string || "[]"); } catch { return []; } })(),
      totalSteps: planSteps.length,
      confidentSteps: (planSteps as Array<Record<string, unknown>>).filter(s => s.confidence === "confident").length,
      uncertainSteps: (planSteps as Array<Record<string, unknown>>).filter(s => s.confidence === "uncertain").length,
    } : null,

    testCases,
    issues,

    execution: {
      runPacks: runPacks.map((p, i) => ({
        packId: (p.run_pack_id as string).slice(0, 8),
        total: p.total,
        passed: p.passed,
        failed: p.failed,
        pending: p.pending,
        uiCount: p.ui_count,
        apiCount: p.api_count,
        entries: (packDetails[i]?.entries || []).map((e: Record<string, unknown>) => ({
          title: e.tc_title,
          type: e.tc_type,
          layer: e.tc_layer,
          runner: e.runner || "ui",
          status: e.status,
          results: (() => { try { return JSON.parse(e.results as string || "null"); } catch { return e.results; } })(),
          observations: (() => { try { return JSON.parse(e.observations as string || "[]"); } catch { return []; } })(),
          issues: (() => { try { return JSON.parse(e.issues as string || "[]"); } catch { return []; } })(),
        })),
      })),
    },

    uiMap: uiMap ? {
      name: (uiMap as Record<string, unknown>).name,
      stats: uiMapStats,
      pages: uiMapPages,
      flakyElements: uiMapFlakyElements,
    } : null,

    techIssues,
    sessions,
    runs: runs.map(r => ({ id: (r.id as string).slice(0, 8), status: r.status, summary: r.summary, createdAt: r.created_at })),
  };

  return { report, insights, planTestNotes, issuesBySeverity, issues, testCaseStats, uiMapStats, uiMapFlakyElements, techIssues, totalExecuted, totalPassed, totalFailed, totalBlocked, totalSkipped, uiExecuted, apiExecuted, runs, sessions, latestPlan, planSteps };
}

function printFormattedReport(ticketId: string, report: Record<string, unknown>, insights: Insight, planTestNotes: string | null, issuesBySeverity: Record<string, number>, issues: Array<Record<string, unknown>>, testCaseStats: { total: number; ready: number; draft: number; byType: Record<string, number>; byLayer: Record<string, number> }, uiMapStats: unknown, uiMapFlakyElements: unknown[], techIssues: Array<Record<string, unknown>>, totalExecuted: number, totalPassed: number, totalFailed: number, totalBlocked: number, uiExecuted: number, apiExecuted: number, runs: Array<Record<string, unknown>>, sessions: unknown[], latestPlan: unknown, planSteps: unknown[]) {
  console.log(chalk.bold.cyan(`\n══ Report: ${ticketId} ══\n`));

  // Verdict
  console.log(chalk.bold(`  Verdict: ${insights.verdict === "PASS" ? chalk.green.bold("PASS") : insights.verdict === "FAIL" ? chalk.red.bold("FAIL") : chalk.yellow.bold("PARTIAL")}`));
  console.log(`  ${insights.verdictReason}\n`);

  // Summary
  console.log(chalk.bold("Summary:"));
  console.log(`  Runs: ${runs.length}  Sessions: ${(sessions as unknown[]).length}  Issues: ${issues.length}`);
  console.log(`  Test Cases: ${testCaseStats.total} (${testCaseStats.ready} ready, ${testCaseStats.draft} draft)`);
  console.log(`  Executed: ${totalExecuted} (${totalPassed} passed, ${totalFailed} failed, ${totalBlocked} blocked, ${totalSkipped} skipped)`);
  if (uiExecuted || apiExecuted) console.log(`  Runners: ${uiExecuted} UI, ${apiExecuted} API`);
  if (totalExecuted > 0) console.log(`  Pass Rate: ${insights.passRate}%`);
  console.log();

  // Insights
  if (insights.riskHotspots.length > 0) {
    console.log(chalk.bold("Risk Hotspots:"));
    for (const h of insights.riskHotspots.slice(0, 5)) {
      console.log(chalk.red(`  ${h.location}: ${h.issueCount} issues (${h.severities})`));
    }
    console.log();
  }

  if (insights.issuePatterns.length > 0) {
    console.log(chalk.bold("Issue Patterns:"));
    for (const p of insights.issuePatterns) {
      console.log(`  ${chalk.yellow(p)}`);
    }
    console.log();
  }

  // Issues
  if (issues.length > 0) {
    console.log(chalk.bold("Issues by Severity:"));
    for (const [sev, count] of Object.entries(issuesBySeverity)) {
      const color = sev === "critical" ? chalk.red.bold : sev === "high" ? chalk.red : sev === "medium" ? chalk.yellow : chalk.dim;
      console.log(`  ${color(`${sev.toUpperCase()}: ${count}`)}`);
    }
    console.log();

    console.log(chalk.bold("Top Issues:"));
    for (const issue of (issues as Array<Record<string, unknown>>).slice(0, 10)) {
      const sevColor = issue.severity === "critical" ? chalk.red.bold : issue.severity === "high" ? chalk.red : issue.severity === "medium" ? chalk.yellow : chalk.dim;
      console.log(`  ${sevColor(`[${(issue.severity as string).toUpperCase()}]`)} ${chalk.cyan(`[${issue.category}]`)} ${issue.title}`);
      if (issue.location) console.log(chalk.dim(`    @ ${issue.location}`));
    }
    if (issues.length > 10) console.log(chalk.dim(`  ... and ${issues.length - 10} more`));
    console.log();
  }

  // Coverage gaps
  if (insights.coverageGaps.length > 0) {
    console.log(chalk.bold("Coverage Gaps:"));
    for (const g of insights.coverageGaps) {
      console.log(chalk.yellow(`  - ${g}`));
    }
    console.log();
  }

  // Test notes from plan
  if (planTestNotes) {
    console.log(chalk.bold("Test Notes:"));
    for (const line of planTestNotes.split("\n")) console.log(`  ${line}`);
    console.log();
  }

  // UI Map health
  if (uiMapStats) {
    const s = uiMapStats as Record<string, number>;
    console.log(chalk.bold("UI Map:"));
    console.log(`  Pages: ${s.totalPages}  Elements: ${s.totalElements}  Navigations: ${s.totalNavs}  Forms: ${s.totalForms}`);
    if (s.flakyCount > 0) console.log(chalk.yellow(`  Flaky/Broken: ${s.flakyCount} elements — affects test stability`));
    console.log();
  }

  // Tech issues
  if ((techIssues as unknown[]).length > 0) {
    console.log(chalk.bold("Tech Issues:"));
    for (const ti of (techIssues as Array<Record<string, unknown>>).slice(0, 5)) {
      console.log(`  [${ti.status}] ${ti.title}`);
    }
    console.log();
  }

  // Improvement plan
  if (insights.improvements.length > 0) {
    console.log(chalk.bold.cyan("Improvement Plan:"));
    for (let i = 0; i < insights.improvements.length; i++) {
      const imp = insights.improvements[i];
      const prioColor = imp.priority === "critical" ? chalk.red : imp.priority === "high" ? chalk.yellow : chalk.dim;
      console.log(`  ${i + 1}. ${prioColor(`[${imp.priority.toUpperCase()}]`)} ${imp.action}`);
      if (imp.reason) console.log(chalk.dim(`     ${imp.reason}`));
    }
    console.log();
  }

  console.log(chalk.dim(`Generated: ${new Date().toISOString()}\n`));
}

// ── Insights Engine ──

interface Insight {
  verdict: "PASS" | "FAIL" | "PARTIAL";
  verdictReason: string;
  passRate: number;
  riskHotspots: Array<{ location: string; issueCount: number; severities: string }>;
  issuePatterns: string[];
  coverageGaps: string[];
  analysisAccuracy: string[];
  testStability: string[];
  improvements: Array<{ priority: "critical" | "high" | "medium" | "low"; action: string; reason?: string }>;
}

function computeInsights(data: {
  ticketId: string;
  runs: Array<Record<string, unknown>>;
  analyses: unknown[];
  latestPlan: unknown;
  planSteps: unknown[];
  planTestNotes: string | null;
  testCases: unknown[];
  testCaseStats: { total: number; ready: number; draft: number; byType: Record<string, number>; byLayer: Record<string, number>; byStatus: Record<string, number> };
  issues: unknown[];
  packDetails: Array<{ packId: string; entries: unknown[] }>;
  uiMapPages: unknown[];
  uiMapFlakyElements: unknown[];
  uiMapStats: unknown;
  techIssues: unknown[];
  totalExecuted: number;
  totalPassed: number;
  totalFailed: number;
  totalBlocked: number;
  totalSkipped: number;
  uiExecuted: number;
  apiExecuted: number;
  issuesBySeverity: Record<string, number>;
  issuesByCategory: Record<string, number>;
}): Insight {
  const issuesArr = data.issues as Array<Record<string, unknown>>;
  const tcArr = data.testCases as Array<Record<string, unknown>>;
  const techArr = data.techIssues as Array<Record<string, unknown>>;

  // ── Verdict ──
  const criticalCount = data.issuesBySeverity["critical"] || 0;
  const highCount = data.issuesBySeverity["high"] || 0;
  const directFailed = data.packDetails.flatMap(pd => pd.entries as Array<Record<string, unknown>>)
    .filter(e => e.status === "failed" && e.tc_type === "direct_functional").length;

  let verdict: "PASS" | "FAIL" | "PARTIAL" = "PASS";
  let verdictReason = "";

  if (criticalCount > 0 || directFailed > 0) {
    verdict = "FAIL";
    const reasons: string[] = [];
    if (criticalCount > 0) reasons.push(`${criticalCount} critical issue${criticalCount > 1 ? "s" : ""}`);
    if (directFailed > 0) reasons.push(`${directFailed} direct functional test${directFailed > 1 ? "s" : ""} failed`);
    verdictReason = reasons.join(", ");
  } else if (highCount >= 3 || data.totalFailed > 0 || data.totalBlocked > 0) {
    verdict = "PARTIAL";
    const reasons: string[] = [];
    if (highCount >= 3) reasons.push(`${highCount} high severity issues`);
    if (data.totalFailed > 0) reasons.push(`${data.totalFailed} test${data.totalFailed > 1 ? "s" : ""} failed`);
    if (data.totalBlocked > 0) reasons.push(`${data.totalBlocked} blocked`);
    verdictReason = reasons.join(", ");
  } else if (data.totalExecuted === 0) {
    verdict = "PARTIAL";
    verdictReason = "No tests were executed";
  } else {
    verdictReason = `All ${data.totalPassed} test${data.totalPassed > 1 ? "s" : ""} passed, no critical or high issues`;
  }

  // ── Pass rate ──
  const passRate = data.totalExecuted > 0 ? Math.round((data.totalPassed / data.totalExecuted) * 100) : 0;

  // ── Risk hotspots (locations with most issues) ──
  const locationMap: Record<string, { count: number; severities: Set<string> }> = {};
  for (const i of issuesArr) {
    const loc = (i.location as string) || "unknown";
    if (!locationMap[loc]) locationMap[loc] = { count: 0, severities: new Set() };
    locationMap[loc].count++;
    locationMap[loc].severities.add(i.severity as string);
  }
  const riskHotspots = Object.entries(locationMap)
    .filter(([_, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([loc, v]) => ({ location: loc, issueCount: v.count, severities: [...v.severities].join(", ") }));

  // ── Issue patterns ──
  const issuePatterns: string[] = [];

  // Dominant category
  const topCategory = Object.entries(data.issuesByCategory).sort((a, b) => b[1] - a[1])[0];
  if (topCategory && topCategory[1] >= 3) {
    issuePatterns.push(`${topCategory[1]} ${topCategory[0]} issues — most common category. Investigate systemic ${topCategory[0]} problems.`);
  }

  // Repeated titles (same issue found multiple times)
  const titleCounts: Record<string, number> = {};
  for (const i of issuesArr) { titleCounts[i.title as string] = (titleCounts[i.title as string] || 0) + 1; }
  const repeatedIssues = Object.entries(titleCounts).filter(([_, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
  for (const [title, count] of repeatedIssues.slice(0, 3)) {
    issuePatterns.push(`"${title}" appeared ${count} times — likely a systemic issue, not a one-off`);
  }

  // UI vs API failure comparison
  const uiEntries = data.packDetails.flatMap(pd => pd.entries as Array<Record<string, unknown>>).filter(e => (e.runner || "ui") === "ui");
  const apiEntries = data.packDetails.flatMap(pd => pd.entries as Array<Record<string, unknown>>).filter(e => e.runner === "api");
  const uiFailed = uiEntries.filter(e => e.status === "failed").length;
  const apiFailed = apiEntries.filter(e => e.status === "failed").length;
  if (uiEntries.length > 0 && apiEntries.length > 0) {
    const uiPassRate = uiEntries.length > 0 ? Math.round(((uiEntries.filter(e => e.status === "passed").length) / uiEntries.length) * 100) : 0;
    const apiPassRate = apiEntries.length > 0 ? Math.round(((apiEntries.filter(e => e.status === "passed").length) / apiEntries.length) * 100) : 0;
    if (Math.abs(uiPassRate - apiPassRate) > 30) {
      issuePatterns.push(`UI pass rate ${uiPassRate}% vs API pass rate ${apiPassRate}% — significant gap between layers`);
    }
  }

  // ── Coverage gaps ──
  const coverageGaps: string[] = [];

  // Layers not tested
  const allLayers = ["ui", "api", "ui_api"];
  const testedLayers = new Set(tcArr.map(tc => tc.test_layer as string));
  for (const layer of allLayers) {
    if (!testedLayers.has(layer) && data.testCaseStats.total > 0) {
      coverageGaps.push(`No ${layer} layer test cases — ${layer === "api" ? "backend endpoints not directly tested" : layer === "ui_api" ? "UI-to-API integration not verified" : "UI interactions not tested"}`);
    }
  }

  // Draft test cases not executed
  if (data.testCaseStats.draft > 0) {
    coverageGaps.push(`${data.testCaseStats.draft} test case${data.testCaseStats.draft > 1 ? "s" : ""} still in draft — not executed`);
  }

  // Plan blockers
  if (data.latestPlan) {
    try {
      const blockers = JSON.parse((data.latestPlan as Record<string, unknown>).blockers as string || "[]");
      if (Array.isArray(blockers) && blockers.length > 0) {
        coverageGaps.push(`Plan has ${blockers.length} blocker${blockers.length > 1 ? "s" : ""}: ${blockers.slice(0, 2).join("; ")}`);
      }
    } catch {}
    try {
      const gaps = JSON.parse((data.latestPlan as Record<string, unknown>).coverage_gaps as string || "[]");
      if (Array.isArray(gaps) && gaps.length > 0) {
        for (const g of gaps.slice(0, 3)) coverageGaps.push(`Plan gap: ${typeof g === "string" ? g : JSON.stringify(g)}`);
      }
    } catch {}
  }

  // Uncertain plan steps
  const uncertainSteps = (data.planSteps as Array<Record<string, unknown>>).filter(s => s.confidence === "uncertain");
  if (uncertainSteps.length > 0) {
    coverageGaps.push(`${uncertainSteps.length} plan step${uncertainSteps.length > 1 ? "s" : ""} marked uncertain — may have gaps in test coverage`);
  }

  // No analysis performed
  if ((data.analyses as unknown[]).length === 0) {
    coverageGaps.push("No analysis was performed — impact, requirements, and feasibility are unknown");
  }

  // ── Analysis accuracy (did impact analysis predict the right areas?) ──
  const analysisAccuracy: string[] = [];
  const impactAnalysis = (data.analyses as Array<Record<string, unknown>>).find(a => a.analysis_type === "impact");
  if (impactAnalysis) {
    try {
      const content = JSON.parse(impactAnalysis.content_json as string);
      const predictedAreas = (content.impacted_areas || []).map((a: Record<string, unknown>) => a.path || a.area || "").filter(Boolean);
      if (predictedAreas.length > 0 && issuesArr.length > 0) {
        const issueLocations = new Set(issuesArr.map(i => i.location as string).filter(Boolean));
        const predicted = predictedAreas.filter((p: string) => [...issueLocations].some(loc => loc.includes(p) || p.includes(loc)));
        if (predicted.length > 0) {
          analysisAccuracy.push(`Impact analysis correctly predicted ${predicted.length} of ${issueLocations.size} issue locations`);
        }
        const missed = [...issueLocations].filter(loc => !predictedAreas.some((p: string) => loc.includes(p) || p.includes(loc)));
        if (missed.length > 0) {
          analysisAccuracy.push(`${missed.length} issue location${missed.length > 1 ? "s" : ""} not predicted by impact analysis: ${missed.slice(0, 3).join(", ")}`);
        }
      }
    } catch {}
  }

  // ── Test stability ──
  const testStability: string[] = [];

  // Flaky selectors
  if ((data.uiMapFlakyElements as unknown[]).length > 0) {
    testStability.push(`${(data.uiMapFlakyElements as unknown[]).length} flaky/broken UI selectors — causes intermittent test failures`);
  }

  // Tech issues
  const unresolvedTech = techArr.filter(t => t.status !== "resolved" && t.status !== "wont_fix");
  if (unresolvedTech.length > 0) {
    testStability.push(`${unresolvedTech.length} unresolved tech issue${unresolvedTech.length > 1 ? "s" : ""} — may affect test reliability`);
  }

  // Tests that were retried (execution_count > 1)
  const retriedTests = tcArr.filter(tc => (tc.execution_count as number) > 1);
  if (retriedTests.length > 0) {
    testStability.push(`${retriedTests.length} test case${retriedTests.length > 1 ? "s" : ""} executed multiple times — indicates instability or reruns`);
  }

  // ── Improvement plan ──
  const improvements: Array<{ priority: "critical" | "high" | "medium" | "low"; action: string; reason?: string }> = [];

  if (criticalCount > 0) {
    improvements.push({ priority: "critical", action: "Fix all critical issues before release", reason: `${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} found` });
  }
  if (highCount > 0) {
    improvements.push({ priority: "high", action: "Address high severity issues", reason: `${highCount} high issue${highCount > 1 ? "s" : ""} — fix before release or document known limitations` });
  }
  if (riskHotspots.length > 0) {
    improvements.push({ priority: "high", action: `Investigate risk hotspot: ${riskHotspots[0].location}`, reason: `${riskHotspots[0].issueCount} issues concentrated in one location` });
  }
  if (data.testCaseStats.draft > 0) {
    improvements.push({ priority: "medium", action: `Review and execute ${data.testCaseStats.draft} draft test cases`, reason: "Untested scenarios may hide issues" });
  }
  if (!testedLayers.has("api") && data.testCaseStats.total > 0) {
    improvements.push({ priority: "medium", action: "Add API layer test cases", reason: "Backend endpoints not directly tested — UI tests alone miss API-level bugs" });
  }
  if ((data.uiMapFlakyElements as unknown[]).length > 0) {
    improvements.push({ priority: "medium", action: `Fix ${(data.uiMapFlakyElements as unknown[]).length} flaky UI selectors`, reason: "Flaky selectors cause false test failures and erode trust in results" });
  }
  if (unresolvedTech.length > 0) {
    improvements.push({ priority: "medium", action: `Resolve ${unresolvedTech.length} tech issues`, reason: "Unresolved tech issues may be causing test failures or blocking execution" });
  }
  if ((data.analyses as unknown[]).length === 0) {
    improvements.push({ priority: "low", action: "Run /noob-analyze before next test cycle", reason: "Impact analysis helps predict risk areas and focus testing" });
  }
  if (data.totalBlocked > 0) {
    improvements.push({ priority: "high", action: `Unblock ${data.totalBlocked} blocked test${data.totalBlocked > 1 ? "s" : ""}`, reason: "Blocked tests represent untested functionality — often auth or environment issues" });
  }
  if (topCategory && topCategory[0] === "performance" && topCategory[1] >= 2) {
    improvements.push({ priority: "medium", action: "Investigate performance issues", reason: `${topCategory[1]} performance issues found — may indicate backend bottlenecks` });
  }
  if (topCategory && topCategory[0] === "accessibility" && topCategory[1] >= 2) {
    improvements.push({ priority: "medium", action: "Address accessibility issues", reason: `${topCategory[1]} a11y issues — WCAG compliance at risk` });
  }

  return {
    verdict,
    verdictReason,
    passRate,
    riskHotspots,
    issuePatterns,
    coverageGaps,
    analysisAccuracy,
    testStability,
    improvements,
  };
}
