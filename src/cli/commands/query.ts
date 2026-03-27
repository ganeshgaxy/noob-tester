import type { Command } from "commander";
import { getDb } from "../../db/client.js";
import { getIssuesByRun, queryPriorIssues, getFailurePatterns } from "../../db/repositories/issues.js";
import { getAnalysesByRun, getAnalysisByType } from "../../db/repositories/analyses.js";
import { getTestPlan, getTestSteps, getPlansByTicket, getPlanDetail } from "../../db/repositories/plans.js";
import { loadPriorRunContext, formatPriorContext } from "../context.js";
import { searchWithContext } from "../../indexer/index.js";

/** Find run IDs matching a ticket ref (input_ref). Returns newest first. */
function getRunIdsByTicket(ticket: string): string[] {
  return (
    getDb()
      .prepare("SELECT id FROM runs WHERE input_ref = ? ORDER BY created_at DESC")
      .all(ticket) as Array<{ id: string }>
  ).map((r) => r.id);
}

/** Get the latest run ID for a ticket. */
function getLatestRunId(ticket: string): string | null {
  const ids = getRunIdsByTicket(ticket);
  return ids[0] ?? null;
}

export function registerQueryCommands(program: Command): void {
  const query = program.command("query").description("Query stored data");

  // ── Runs by ticket ──

  query
    .command("runs")
    .description("List runs for a ticket")
    .option("--ticket <ref>", "Ticket reference")
    .option("--limit <n>", "Max results", "20")
    .action((opts) => {
      const db = getDb();
      if (opts.ticket) {
        const runs = db
          .prepare("SELECT * FROM runs WHERE input_ref = ? ORDER BY created_at DESC LIMIT ?")
          .all(opts.ticket, parseInt(opts.limit));
        console.log(JSON.stringify(runs, null, 2));
      } else {
        const runs = db
          .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?")
          .all(parseInt(opts.limit));
        console.log(JSON.stringify(runs, null, 2));
      }
    });

  // ── Issues ──

  query
    .command("issues")
    .description("Query issues")
    .option("--run <runId>", "Filter by run ID")
    .option("--ticket <ref>", "Filter by ticket (all runs for this ticket)")
    .option("--location <pattern>", "Filter by location pattern")
    .option("--category <cat>", "Filter by category")
    .option("--severity <sev>", "Filter by severity")
    .option("--limit <n>", "Max results", "50")
    .action((opts) => {
      if (opts.run) {
        console.log(JSON.stringify(getIssuesByRun(opts.run), null, 2));
      } else if (opts.ticket) {
        const runIds = getRunIdsByTicket(opts.ticket);
        if (runIds.length === 0) { console.log("[]"); return; }
        const ph = runIds.map(() => "?").join(",");
        const issues = getDb()
          .prepare(`SELECT * FROM issues WHERE run_id IN (${ph}) ORDER BY severity, category LIMIT ?`)
          .all(...runIds, parseInt(opts.limit));
        console.log(JSON.stringify(issues, null, 2));
      } else if (opts.location) {
        console.log(JSON.stringify(queryPriorIssues(opts.location, parseInt(opts.limit)), null, 2));
      } else {
        const db = getDb();
        let sql = "SELECT * FROM issues WHERE 1=1";
        const params: unknown[] = [];
        if (opts.category) { sql += " AND category = ?"; params.push(opts.category); }
        if (opts.severity) { sql += " AND severity = ?"; params.push(opts.severity); }
        sql += " ORDER BY created_at DESC LIMIT ?";
        params.push(parseInt(opts.limit));
        console.log(JSON.stringify(db.prepare(sql).all(...params), null, 2));
      }
    });

  // ── Failures ──

  query
    .command("failures")
    .description("Query known failure patterns across all runs")
    .option("--limit <n>", "Max results", "30")
    .action((opts) => {
      console.log(JSON.stringify(getFailurePatterns(parseInt(opts.limit)), null, 2));
    });

  // ── Analysis ──

  query
    .command("analysis")
    .description("Query analysis data by run ID or ticket")
    .option("--run <runId>", "Run ID")
    .option("--ticket <ref>", "Ticket ref (uses latest run)")
    .option("--type <type>", "Analysis type: gap | requirements | feasibility | impact")
    .action((opts) => {
      const runId = opts.run ?? (opts.ticket ? getLatestRunId(opts.ticket) : null);
      if (!runId) {
        console.error("Provide --run or --ticket");
        process.exit(1);
      }
      if (opts.type) {
        const a = getAnalysisByType(runId, opts.type);
        console.log(JSON.stringify(a ? JSON.parse(a.content_json) : null, null, 2));
      } else {
        console.log(JSON.stringify(getAnalysesByRun(runId), null, 2));
      }
    });

  // ── Plan ──

  query
    .command("plan")
    .description("Query test plan by ticket or run ID — returns latest plan with all sections and steps")
    .option("--run <runId>", "Run ID")
    .option("--ticket <ref>", "Ticket ref (returns latest plan)")
    .option("--json", "Output as JSON")
    .action((opts) => {
      if (opts.ticket) {
        // Get latest plan for this ticket from test_plans.ticket_id
        const plans = getPlansByTicket(opts.ticket) as Array<Record<string, unknown>>;
        if (plans.length === 0) {
          // Fallback to legacy: find plan via run
          const runId = getLatestRunId(opts.ticket);
          if (runId) {
            const legacyPlan = getTestPlan(runId);
            if (legacyPlan) { console.log(JSON.stringify(legacyPlan, null, 2)); return; }
          }
          console.log(JSON.stringify(null));
          return;
        }
        // Get latest plan detail (first in list, already sorted by created_at DESC)
        const detail = getPlanDetail(plans[0].id as string);
        console.log(JSON.stringify(detail, null, 2));
      } else if (opts.run) {
        const legacyPlan = getTestPlan(opts.run);
        console.log(JSON.stringify(legacyPlan, null, 2));
      } else {
        console.error("Provide --run or --ticket");
        process.exit(1);
      }
    });

  // ── Steps ──

  query
    .command("steps")
    .description("Query test steps by run ID or ticket")
    .option("--run <runId>", "Run ID")
    .option("--ticket <ref>", "Ticket ref (uses latest run)")
    .action((opts) => {
      const runId = opts.run ?? (opts.ticket ? getLatestRunId(opts.ticket) : null);
      if (!runId) {
        console.error("Provide --run or --ticket");
        process.exit(1);
      }
      console.log(JSON.stringify(getTestSteps(runId), null, 2));
    });

  // ── Codebase search ──

  query
    .command("codebase <search>")
    .description("Search indexed codebases (BM25 + import graph)")
    .option("--repos <names>", "Comma-separated repo names")
    .option("--expand", "Include related files via import graph")
    .option("--limit <n>", "Max results", "10")
    .action((search, opts) => {
      const repos = opts.repos
        ? (opts.repos as string).split(",").map((s: string) => s.trim())
        : undefined;
      const results = searchWithContext(search, {
        repos,
        limit: parseInt(opts.limit),
        expand: opts.expand ?? true,
      });
      console.log(JSON.stringify(results, null, 2));
    });

  // ── Repos for a run ──

  query
    .command("repos")
    .description("Get configured repo URLs for a run or ticket")
    .option("--run <runId>", "Run ID")
    .option("--ticket <ref>", "Ticket ref (uses latest run)")
    .action((opts) => {
      const runId = opts.run ?? (opts.ticket ? getLatestRunId(opts.ticket) : null);
      if (!runId) {
        console.error("Provide --run or --ticket");
        process.exit(1);
      }
      const run = getDb()
        .prepare("SELECT config_json FROM runs WHERE id = ?")
        .get(runId) as { config_json: string } | undefined;
      if (!run) {
        console.error(`Run ${runId} not found`);
        process.exit(1);
      }
      try {
        const config = JSON.parse(run.config_json);
        console.log(JSON.stringify(config.repos ?? [], null, 2));
      } catch {
        console.log("[]");
      }
    });

  // ── Context dump ──

  query
    .command("context")
    .description("Get full prior context dump for reuse")
    .option("--run <runId>", "Run ID")
    .option("--ticket <ref>", "Ticket ref (uses latest run)")
    .action((opts) => {
      const runId = opts.run ?? (opts.ticket ? getLatestRunId(opts.ticket) : null);
      if (!runId) {
        console.error("Provide --run or --ticket");
        process.exit(1);
      }
      const ctx = loadPriorRunContext(runId);
      if (!ctx) {
        console.error(`Run ${runId} not found`);
        process.exit(1);
      }
      console.log(formatPriorContext(ctx));
    });
}
