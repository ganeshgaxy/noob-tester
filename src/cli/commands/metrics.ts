import type { Command } from "commander";
import chalk from "chalk";
import { getDb } from "../../db/client.js";

// Cost per million tokens — from https://docs.anthropic.com/en/docs/about-claude/pricing
// cache_read = 10% of input price, cache_create = 125% of input price
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
  "claude-opus-4-6":    { input: 5,  output: 25, cacheRead: 0.5,  cacheCreate: 6.25 },
  "claude-opus-4":      { input: 15, output: 75, cacheRead: 1.5,  cacheCreate: 18.75 },
  "claude-sonnet-4-6":  { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  "claude-sonnet-4":    { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  "claude-haiku-4-5":   { input: 1,  output: 5,  cacheRead: 0.1,  cacheCreate: 1.25 },
  // Short aliases (default to latest)
  opus:   { input: 5,  output: 25, cacheRead: 0.5,  cacheCreate: 6.25 },
  sonnet: { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  haiku:  { input: 1,  output: 5,  cacheRead: 0.1,  cacheCreate: 1.25 },
};

interface TokenBreakdown {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreateTokens?: number;
  totalTokens?: number;
}

function lookupPricing(model: string) {
  return MODEL_PRICING[model]
    ?? Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))?.[1]
    ?? MODEL_PRICING.sonnet;
}

function calculateCost(model: string, tokens: TokenBreakdown): number {
  const p = lookupPricing(model);

  // If we have any breakdown at all, use exact calculation
  if (tokens.inputTokens != null || tokens.outputTokens != null
    || tokens.cacheReadTokens != null || tokens.cacheCreateTokens != null) {
    const cost =
      ((tokens.inputTokens ?? 0) / 1_000_000) * p.input +
      ((tokens.outputTokens ?? 0) / 1_000_000) * p.output +
      ((tokens.cacheReadTokens ?? 0) / 1_000_000) * p.cacheRead +
      ((tokens.cacheCreateTokens ?? 0) / 1_000_000) * p.cacheCreate;
    return Math.round(cost * 10000) / 10000;
  }

  // Fallback: only total_tokens available — estimate 30% input, 70% output
  const total = tokens.totalTokens ?? 0;
  const blended = p.input * 0.3 + p.output * 0.7;
  return Math.round((total / 1_000_000) * blended * 10000) / 10000;
}

export function registerMetricsCommands(program: Command): void {
  const metrics = program
    .command("metrics")
    .description("Track and query usage metrics (duration, tokens, tool calls, cost)");

  metrics
    .command("log <sessionId>")
    .description("Log a metric event for a session")
    .option("--duration <ms>", "Duration in milliseconds", parseInt)
    .option("--tokens <n>", "Total token count (fallback when breakdown unavailable)", parseInt)
    .option("--input-tokens <n>", "Non-cached input tokens", parseInt)
    .option("--output-tokens <n>", "Output tokens", parseInt)
    .option("--cache-read-tokens <n>", "Cache read (hit) tokens", parseInt)
    .option("--cache-create-tokens <n>", "Cache creation tokens", parseInt)
    .option("--tools <n>", "Number of tool calls", parseInt)
    .option("--actions <n>", "Number of actions", parseInt)
    .option("--issues <n>", "Number of issues found", parseInt)
    .option("--model <name>", "Model ID (e.g. claude-opus-4-6, claude-sonnet-4-6)")
    .action((sessionId, opts) => {
      const db = getDb();
      const sets: string[] = [];
      const params: unknown[] = [];

      if (opts.duration) {
        sets.push("total_duration_ms = total_duration_ms + ?");
        params.push(opts.duration);
      }
      if (opts.inputTokens) {
        sets.push("input_tokens = input_tokens + ?");
        params.push(opts.inputTokens);
      }
      if (opts.outputTokens) {
        sets.push("output_tokens = output_tokens + ?");
        params.push(opts.outputTokens);
      }
      if (opts.cacheReadTokens) {
        sets.push("cache_read_tokens = cache_read_tokens + ?");
        params.push(opts.cacheReadTokens);
      }
      if (opts.cacheCreateTokens) {
        sets.push("cache_create_tokens = cache_create_tokens + ?");
        params.push(opts.cacheCreateTokens);
      }

      // Total tokens: explicit value, or sum of all token types
      const totalTokens = opts.tokens
        ?? ((opts.inputTokens ?? 0) + (opts.outputTokens ?? 0)
          + (opts.cacheReadTokens ?? 0) + (opts.cacheCreateTokens ?? 0));
      if (totalTokens > 0) {
        sets.push("estimated_tokens = estimated_tokens + ?");
        params.push(totalTokens);
      }

      if (opts.tools) {
        sets.push("tool_calls = tool_calls + ?");
        params.push(opts.tools);
      }
      if (opts.actions) {
        sets.push("total_actions = total_actions + ?");
        params.push(opts.actions);
      }
      if (opts.issues) {
        sets.push("total_issues = total_issues + ?");
        params.push(opts.issues);
      }
      if (opts.model) {
        sets.push("model = ?");
        params.push(opts.model);
      }

      // Auto-calculate cost if model is provided
      const model = opts.model;
      const breakdown: TokenBreakdown = {
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        cacheReadTokens: opts.cacheReadTokens,
        cacheCreateTokens: opts.cacheCreateTokens,
        totalTokens: opts.tokens,
      };
      if (model && totalTokens > 0) {
        sets.push("estimated_cost_usd = estimated_cost_usd + ?");
        params.push(calculateCost(model, breakdown));
      }

      if (sets.length === 0) {
        console.log(JSON.stringify({ updated: false, message: "No metrics provided" }));
        return;
      }

      params.push(sessionId);
      db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...params);

      const result: Record<string, unknown> = { updated: true };
      if (model && totalTokens > 0) {
        result.cost_usd = calculateCost(model, breakdown);
        result.model = model;
        const hasBreakdown = opts.inputTokens || opts.outputTokens
          || opts.cacheReadTokens || opts.cacheCreateTokens;
        result.cost_method = hasBreakdown ? "exact" : "estimated";
      }
      console.log(JSON.stringify(result));
    });

  metrics
    .command("get <sessionId>")
    .description("Get metrics for a session")
    .action((sessionId) => {
      const db = getDb();
      const session = db
        .prepare(
          `SELECT id, task_summary, status, model, total_actions, total_issues,
                  total_duration_ms, estimated_tokens, input_tokens, output_tokens,
                  cache_read_tokens, cache_create_tokens, tool_calls, estimated_cost_usd,
                  created_at, last_heartbeat, ended_at
           FROM sessions WHERE id = ?`
        )
        .get(sessionId);

      if (!session) {
        console.error(`Session ${sessionId} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify(session, null, 2));
    });

  metrics
    .command("summary")
    .description("Show aggregate metrics across all sessions")
    .option("--active", "Only active sessions")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const db = getDb();
      const where = opts.active ? "WHERE status = 'active'" : "";

      const agg = db
        .prepare(
          `SELECT
             COUNT(*) as sessions,
             SUM(total_actions) as actions,
             SUM(total_issues) as issues,
             SUM(total_duration_ms) as duration_ms,
             SUM(estimated_tokens) as tokens,
             SUM(tool_calls) as tools,
             SUM(estimated_cost_usd) as cost_usd
           FROM sessions ${where}`
        )
        .get() as Record<string, number>;

      const runs = (
        db.prepare("SELECT COUNT(*) as c FROM runs").get() as { c: number }
      ).c;
      const testcases = (
        db.prepare("SELECT COUNT(*) as c FROM test_cases").get() as { c: number }
      ).c;
      const totalIssues = (
        db.prepare("SELECT COUNT(*) as c FROM issues").get() as { c: number }
      ).c;

      const result = {
        sessions: agg.sessions ?? 0,
        runs,
        testcases,
        totalActions: agg.actions ?? 0,
        totalIssues: totalIssues,
        totalDurationMs: agg.duration_ms ?? 0,
        totalDurationMin: Math.round((agg.duration_ms ?? 0) / 60000 * 10) / 10,
        estimatedTokens: agg.tokens ?? 0,
        toolCalls: agg.tools ?? 0,
        estimatedCostUsd: Math.round((agg.cost_usd ?? 0) * 100) / 100,
      };

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Token breakdown
      const tokenBreakdown = db.prepare(`
        SELECT SUM(input_tokens) as input, SUM(output_tokens) as output,
               SUM(cache_read_tokens) as cache_read, SUM(cache_create_tokens) as cache_create
        FROM sessions ${where}
      `).get() as Record<string, number>;

      Object.assign(result, {
        inputTokens: tokenBreakdown.input ?? 0,
        outputTokens: tokenBreakdown.output ?? 0,
        cacheReadTokens: tokenBreakdown.cache_read ?? 0,
        cacheCreateTokens: tokenBreakdown.cache_create ?? 0,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(chalk.bold("\n  noob-tester Metrics\n"));
      console.log(`  Sessions:      ${result.sessions}`);
      console.log(`  Runs:          ${result.runs}`);
      console.log(`  Test Cases:    ${result.testcases}`);
      console.log(`  Total Actions: ${result.totalActions}`);
      console.log(`  Total Issues:  ${result.totalIssues}`);
      console.log(`  Duration:      ${result.totalDurationMin} min`);
      console.log(`  Tokens:        ${result.estimatedTokens.toLocaleString()}`);
      if ((result as Record<string, number>).inputTokens > 0 || (result as Record<string, number>).outputTokens > 0) {
        console.log(`    Input:       ${(result as Record<string, number>).inputTokens.toLocaleString()}`);
        console.log(`    Output:      ${(result as Record<string, number>).outputTokens.toLocaleString()}`);
        console.log(`    Cache Read:  ${(result as Record<string, number>).cacheReadTokens.toLocaleString()}`);
        console.log(`    Cache Write: ${(result as Record<string, number>).cacheCreateTokens.toLocaleString()}`);
      }
      console.log(`  Tool Calls:    ${result.toolCalls}`);
      console.log(`  Est. Cost:     $${result.estimatedCostUsd.toFixed(2)}`);
      console.log();
    });

  metrics
    .command("run <runId>")
    .description("Get metrics for a specific run")
    .action((runId) => {
      const db = getDb();

      const actionCount = (
        db.prepare("SELECT COUNT(*) as c FROM action_log WHERE run_id = ?").get(runId) as { c: number }
      ).c;
      const issueCount = (
        db.prepare("SELECT COUNT(*) as c FROM issues WHERE run_id = ?").get(runId) as { c: number }
      ).c;
      const totalDuration = (
        db.prepare("SELECT SUM(duration_ms) as d FROM action_log WHERE run_id = ?").get(runId) as { d: number | null }
      ).d ?? 0;
      const totalTokens = (
        db.prepare("SELECT SUM(tokens_used) as t FROM action_log WHERE run_id = ?").get(runId) as { t: number | null }
      ).t ?? 0;

      const byPhase = db
        .prepare(
          `SELECT phase, COUNT(*) as actions,
                  SUM(duration_ms) as duration_ms,
                  SUM(tokens_used) as tokens
           FROM action_log WHERE run_id = ? GROUP BY phase ORDER BY phase`
        )
        .all(runId);

      const byAgent = db
        .prepare(
          `SELECT agent_name, COUNT(*) as actions,
                  SUM(duration_ms) as duration_ms,
                  SUM(tokens_used) as tokens
           FROM action_log WHERE run_id = ? GROUP BY agent_name`
        )
        .all(runId);

      console.log(JSON.stringify({
        runId,
        actions: actionCount,
        issues: issueCount,
        totalDurationMs: totalDuration,
        totalDurationMin: Math.round(totalDuration / 60000 * 10) / 10,
        estimatedTokens: totalTokens,
        byPhase,
        byAgent,
      }, null, 2));
    });
}
