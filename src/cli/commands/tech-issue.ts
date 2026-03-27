import type { Command } from "commander";
import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import chalk from "chalk";
import { getDb } from "../../db/client.js";

export function registerTechIssueCommands(program: Command): void {
  const ti = program
    .command("tech-issue")
    .description("Manage technical issues encountered during testing (timeouts, crashes, env problems)");

  ti.command("log <runId>")
    .description("Log a technical issue")
    .requiredOption("--title <text>", "Brief title")
    .requiredOption("--description <text>", "Detailed description of what happened")
    .option("--category <cat>", "timeout|crash|network_failure|js_error|element_not_found|auth_issue|env_issue|unknown", "unknown")
    .option("--severity <sev>", "critical|high|medium|low", "medium")
    .option("--url <url>", "URL where it happened")
    .option("--page-area <area>", "Page area or selector")
    .option("--step <text>", "Test step being executed")
    .requiredOption("--ticket <ref>", "Ticket reference")
    .option("--session <id>", "Session ID")
    .option("--test-case <id>", "Test case ID")
    .option("--error <text>", "Error message")
    .option("--console <text>", "Console output")
    .option("--network <text>", "Network/HAR data")
    .option("--screenshot <path>", "Screenshot path")
    .option("--recovery <json>", "JSON array of recovery attempts [{attempt, result, duration_ms}]")
    .option("--outcome <text>", "recovered|failed|skipped")
    .action((runId, opts) => {
      const db = getDb();

      // Check for existing similar issue (dedup by pattern hash)
      const patternKey = `${opts.ticket ?? ""}|${opts.category}|${opts.url ?? ""}|${opts.title}`;
      const patternHash = createHash("sha256").update(patternKey).digest("hex").slice(0, 16);

      const existing = db.prepare("SELECT id, occurrence_count FROM tech_issues WHERE pattern_hash = ?")
        .get(patternHash) as { id: string; occurrence_count: number } | undefined;

      if (existing) {
        // Update existing — increment count, update last_seen
        db.prepare(`
          UPDATE tech_issues SET
            occurrence_count = occurrence_count + 1,
            last_seen = datetime('now'),
            updated_at = datetime('now'),
            recovery_attempts = COALESCE(?, recovery_attempts),
            final_outcome = COALESCE(?, final_outcome)
          WHERE id = ?
        `).run(opts.recovery ?? null, opts.outcome ?? null, existing.id);
        console.log(JSON.stringify({ techIssueId: existing.id, recurring: true, occurrences: existing.occurrence_count + 1 }));
        return;
      }

      const id = uuid();
      db.prepare(`
        INSERT INTO tech_issues (
          id, title, description, error_message, console_output, network_data, screenshot_path,
          url, page_area, step_description, ticket_ref, run_id, session_id, test_case_id,
          category, severity, recovery_attempts, final_outcome, pattern_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, opts.title, opts.description,
        opts.error ?? null, opts.console ?? null, opts.network ?? null, opts.screenshot ?? null,
        opts.url ?? null, opts.pageArea ?? null, opts.step ?? null,
        opts.ticket ?? null, runId, opts.session ?? null, opts.testCase ?? null,
        opts.category, opts.severity,
        opts.recovery ?? null, opts.outcome ?? null, patternHash
      );

      console.log(JSON.stringify({ techIssueId: id, recurring: false }));
    });

  ti.command("resolve <id>")
    .description("Update resolution status of a tech issue")
    .requiredOption("--status <status>", "unresolved|investigating|workaround_found|resolved|wont_fix")
    .option("--workaround <text>", "Workaround description (how to get past this)")
    .option("--resolution <text>", "Resolution description (how it was fixed)")
    .action((id, opts) => {
      getDb().prepare(`
        UPDATE tech_issues SET
          status = ?, workaround = COALESCE(?, workaround),
          resolution = COALESCE(?, resolution),
          resolved_at = CASE WHEN ? IN ('resolved', 'workaround_found') THEN datetime('now') ELSE resolved_at END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(opts.status, opts.workaround ?? null, opts.resolution ?? null, opts.status, id);
      console.log(JSON.stringify({ updated: true }));
    });

  ti.command("check")
    .description("Check for known tech issues at a URL or for a ticket (run before each step)")
    .option("--url <url>", "URL to check")
    .option("--ticket <ref>", "Ticket to check")
    .option("--category <cat>", "Filter by category")
    .action((opts) => {
      const db = getDb();
      let sql = "SELECT * FROM tech_issues WHERE 1=1";
      const params: unknown[] = [];

      if (opts.url) { sql += " AND url LIKE ?"; params.push(`%${opts.url}%`); }
      if (opts.ticket) { sql += " AND ticket_ref = ?"; params.push(opts.ticket); }
      if (opts.category) { sql += " AND category = ?"; params.push(opts.category); }

      sql += " ORDER BY occurrence_count DESC, severity, updated_at DESC LIMIT 20";
      const issues = db.prepare(sql).all(...params);
      console.log(JSON.stringify(issues, null, 2));
    });

  ti.command("list")
    .description("List tech issues")
    .option("--ticket <ref>", "Filter by ticket")
    .option("--status <status>", "Filter by status")
    .option("--category <cat>", "Filter by category")
    .option("--limit <n>", "Max results", "30")
    .option("--json", "JSON output")
    .action((opts) => {
      const db = getDb();
      let sql = "SELECT * FROM tech_issues WHERE 1=1";
      const params: unknown[] = [];

      if (opts.ticket) { sql += " AND ticket_ref = ?"; params.push(opts.ticket); }
      if (opts.status) { sql += " AND status = ?"; params.push(opts.status); }
      if (opts.category) { sql += " AND category = ?"; params.push(opts.category); }
      sql += " ORDER BY occurrence_count DESC, updated_at DESC LIMIT ?";
      params.push(parseInt(opts.limit));

      const issues = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

      if (opts.json) {
        console.log(JSON.stringify(issues, null, 2));
        return;
      }

      if (issues.length === 0) {
        console.log(chalk.dim("No tech issues found."));
        return;
      }

      console.log(chalk.bold(`\n  Technical Issues (${issues.length})\n`));
      for (const i of issues) {
        const statusColor = i.status === "resolved" || i.status === "workaround_found"
          ? chalk.green : i.status === "investigating" ? chalk.yellow : chalk.red;
        const catColor = i.category === "timeout" ? chalk.yellow
          : i.category === "crash" ? chalk.red : chalk.dim;

        console.log(
          `  ${statusColor((i.status as string).padEnd(18))} ` +
          `${catColor(`[${i.category}]`.padEnd(20))} ` +
          `${i.title}` +
          (i.occurrence_count as number > 1 ? chalk.yellow(` (x${i.occurrence_count})`) : "")
        );
        if (i.url) console.log(chalk.dim(`    @ ${i.url}`));
        if (i.workaround) console.log(chalk.green(`    Workaround: ${i.workaround}`));
        if (i.ticket_ref) console.log(chalk.dim(`    Ticket: ${i.ticket_ref}`));
      }
      console.log();
    });
}
