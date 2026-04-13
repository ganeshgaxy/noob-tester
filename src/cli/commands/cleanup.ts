import type { Command } from "commander";
import { execSync } from "child_process";
import { rmSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { getDb, dataDir } from "../../db/client.js";
import { deleteAllSecrets } from "../../secrets/store.js";

/** Helper: delete all data for a list of run IDs within a transaction. */
function deleteRunData(db: ReturnType<typeof getDb>, runIds: string[]): void {
  if (runIds.length === 0) return;
  const ph = runIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM run_pack_entries WHERE run_id IN (${ph})`).run(
    ...runIds,
  );
  db.prepare(`DELETE FROM raw_outputs WHERE run_id IN (${ph})`).run(...runIds);
  db.prepare(`DELETE FROM issues WHERE run_id IN (${ph})`).run(...runIds);
  db.prepare(`DELETE FROM test_steps WHERE run_id IN (${ph})`).run(...runIds);
  db.prepare(`DELETE FROM test_plans WHERE run_id IN (${ph})`).run(...runIds);
  db.prepare(`DELETE FROM analyses WHERE run_id IN (${ph})`).run(...runIds);
  db.prepare(`DELETE FROM action_log WHERE run_id IN (${ph})`).run(...runIds);
  // Nullify FK refs in failure_patterns before deleting runs
  db.prepare(
    `UPDATE failure_patterns SET first_seen_run = NULL WHERE first_seen_run IN (${ph})`,
  ).run(...runIds);
  db.prepare(
    `UPDATE failure_patterns SET last_seen_run = NULL WHERE last_seen_run IN (${ph})`,
  ).run(...runIds);
  db.prepare(`DELETE FROM runs WHERE id IN (${ph})`).run(...runIds);
}

/** Helper: delete a session and all its linked data. */
function deleteSessionWithData(
  db: ReturnType<typeof getDb>,
  sessionId: string,
): number {
  // Clear current_run_id ref first
  db.prepare("UPDATE sessions SET current_run_id = NULL WHERE id = ?").run(
    sessionId,
  );

  const runs = db
    .prepare("SELECT id FROM runs WHERE session_id = ?")
    .all(sessionId) as Array<{ id: string }>;
  const runIds = runs.map((r) => r.id);

  deleteRunData(db, runIds);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  return runIds.length;
}

export function registerCleanupCommands(program: Command): void {
  const cleanup = program
    .command("cleanup")
    .description("Clean up sessions, data, secrets, and processes");

  // ── Kill watch server ──

  cleanup
    .command("watch")
    .description("Kill the noob-tester watch process")
    .option("-p, --port <port>", "Port to kill", "4040")
    .action((opts) => {
      try {
        const pids = execSync(`lsof -ti:${opts.port}`, {
          encoding: "utf-8",
        }).trim();
        if (!pids) {
          console.log(chalk.dim(`No process found on port ${opts.port}.`));
          return;
        }
        execSync(`lsof -ti:${opts.port} | xargs kill -9`, { stdio: "ignore" });
        console.log(
          chalk.green(
            `Killed process(es) on port ${opts.port}: ${pids.replace(/\n/g, ", ")}`,
          ),
        );
      } catch {
        console.log(chalk.dim(`No process found on port ${opts.port}.`));
      }
    });

  // ── Clean all data ──

  cleanup
    .command("all")
    .description(
      "Delete runs, sessions, analyses, test cases, issues (keeps secrets, repos, index)",
    )
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      if (!opts.yes) {
        console.log(
          chalk.red("This will delete ALL data. Run with --yes to confirm."),
        );
        return;
      }

      const db = getDb();
      db.pragma("foreign_keys = OFF");
      db.transaction(() => {
        for (const table of [
          "run_artifacts",
          "ui_map_forms",
          "ui_map_navigations",
          "ui_map_elements",
          "ui_map_pages",
          "ui_maps",
          "run_pack_entries",
          "raw_outputs",
          "issues",
          "test_steps",
          "test_plans",
          "test_cases",
          "tech_issues",
          "analyses",
          "action_log",
          "runs",
          "sessions",
          "failure_patterns",
          "rca_results",
          "a11y_issues",
          "coverage_map",
          "visual_diffs",
          "visual_baselines",
          "impact_areas",
          "coverage_gaps",
          "phase_transitions",
          "blockers",
          "reports",
          "ticket_context_index",
          "resource_stats",
          "api_map_chains",
          "api_map_responses",
          "api_map_params",
          "api_map_endpoints",
          "api_maps",
          "default_files",
        ]) {
          try {
            db.prepare(`DELETE FROM ${table}`).run();
          } catch {}
        }
      })();
      db.pragma("foreign_keys = ON");

      // Clean data directories from disk
      for (const dir of ["ticket-context", "evidence", "files"]) {
        const p = join(dataDir(), dir);
        if (existsSync(p)) rmSync(p, { recursive: true, force: true });
      }

      console.log(
        chalk.green("All data deleted (keeps secrets, repos, index)."),
      );
    });

  // ── Clean a specific session ──

  cleanup
    .command("session <sessionId>")
    .description("Delete a specific session and all its associated data")
    .option("--yes", "Skip confirmation")
    .action((sessionId, opts) => {
      const db = getDb();
      const session = db
        .prepare("SELECT id FROM sessions WHERE id = ?")
        .get(sessionId);
      if (!session) {
        console.log(chalk.red(`Session ${sessionId} not found.`));
        return;
      }

      const runCount = (
        db
          .prepare("SELECT COUNT(*) as c FROM runs WHERE session_id = ?")
          .get(sessionId) as { c: number }
      ).c;

      if (!opts.yes) {
        console.log(
          chalk.yellow(
            `This will delete session ${sessionId.slice(0, 8)} and ${runCount} linked run(s). Run with --yes to confirm.`,
          ),
        );
        return;
      }

      db.transaction(() => {
        const deleted = deleteSessionWithData(db, sessionId);
        console.log(
          chalk.green(
            `Deleted session ${sessionId.slice(0, 8)} and ${deleted} run(s).`,
          ),
        );
      })();
    });

  // ── Clean stale sessions ──

  cleanup
    .command("stale")
    .description("Delete all stale and crashed sessions and their data")
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      const db = getDb();

      // Mark stale
      db.prepare(
        `UPDATE sessions SET status = 'stale'
         WHERE status = 'active' AND last_heartbeat < datetime('now', '-5 minutes')`,
      ).run();

      const staleSessions = db
        .prepare("SELECT id FROM sessions WHERE status IN ('stale', 'crashed')")
        .all() as Array<{ id: string }>;

      if (staleSessions.length === 0) {
        console.log(chalk.dim("No stale or crashed sessions found."));
        return;
      }

      if (!opts.yes) {
        console.log(
          chalk.yellow(
            `Found ${staleSessions.length} stale/crashed session(s). Run with --yes to delete.`,
          ),
        );
        return;
      }

      let totalRuns = 0;
      db.transaction(() => {
        for (const s of staleSessions) {
          totalRuns += deleteSessionWithData(db, s.id);
        }
      })();

      console.log(
        chalk.green(
          `Deleted ${staleSessions.length} session(s) and ${totalRuns} run(s).`,
        ),
      );
    });

  // ── Clean all secrets ──

  cleanup
    .command("secrets")
    .description("Delete ALL secrets and profiles")
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      if (!opts.yes) {
        console.log(
          chalk.red("This will delete ALL secrets. Run with --yes to confirm."),
        );
        return;
      }

      deleteAllSecrets();
      console.log(chalk.green("All secrets and targets deleted."));
    });

  // ── Clean everything including secrets, repos, index ──

  cleanup
    .command("nuke")
    .description(
      "Delete EVERYTHING — all data, secrets, targets, repos, index. Full reset.",
    )
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      if (!opts.yes) {
        console.log(
          chalk.red(
            "This will delete EVERYTHING including secrets, targets, repos, and codebase index. Run with --yes to confirm.",
          ),
        );
        return;
      }

      const db = getDb();
      db.pragma("foreign_keys = OFF");
      db.transaction(() => {
        // Explicit critical tables first (belt-and-suspenders — never miss secrets)
        const criticalTables = [
          "secrets",
          "targets",
          "rca_results",
          "a11y_issues",
          "coverage_map",
          "visual_diffs",
          "visual_baselines",
          "resource_stats",
          "ticket_context_index",
          "reports",
          "api_map_chains",
          "api_map_responses",
          "api_map_params",
          "api_map_endpoints",
          "api_maps",
        ];
        for (const t of criticalTables) {
          try {
            db.prepare(`DELETE FROM "${t}"`).run();
          } catch {}
        }

        // Then dynamically get ALL remaining user tables
        const tables = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%' AND name NOT LIKE 'code_fts%' AND name NOT LIKE 'code_embeddings%' AND name NOT LIKE 'code_chunk_embeddings%' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as Array<{ name: string }>;
        for (const t of tables) {
          try {
            db.prepare(`DELETE FROM "${t.name}"`).run();
          } catch {}
        }
        // Clear FTS index
        try {
          db.prepare("DELETE FROM code_fts").run();
        } catch {}
      })();
      db.pragma("foreign_keys = ON");

      // Remove ALL data directories from disk
      const dirs = ["repos", "evidence", "ticket-context", "files"];
      for (const dir of dirs) {
        const fullPath = join(dataDir(), dir);
        if (existsSync(fullPath)) {
          rmSync(fullPath, { recursive: true, force: true });
        }
      }

      console.log(chalk.green("Everything deleted. Full reset complete."));
    });

  // ── Clean test cases ──

  // ── Clean repos, index, synced files ──

  cleanup
    .command("repos")
    .description(
      "Delete all repos, groups, codebase index, and synced files from disk",
    )
    .option("--name <name>", "Delete only a specific repo")
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      if (!opts.yes) {
        const msg = opts.name
          ? `Delete repo "${opts.name}", its index, and synced files`
          : "Delete ALL repos, groups, codebase index, and synced files";
        console.log(chalk.yellow(`${msg}. Run with --yes to confirm.`));
        return;
      }

      const db = getDb();

      if (opts.name) {
        // Single repo
        const repo = db
          .prepare("SELECT * FROM repos WHERE name = ?")
          .get(opts.name) as
          | { id: string; local_path: string | null }
          | undefined;
        if (!repo) {
          console.log(chalk.red(`Repo "${opts.name}" not found.`));
          return;
        }
        db.prepare("DELETE FROM code_fts WHERE repo_name = ?").run(opts.name);
        db.prepare("DELETE FROM import_graph WHERE repo_name = ?").run(
          opts.name,
        );
        db.prepare("DELETE FROM coverage_map WHERE repo_name = ?").run(
          opts.name,
        );
        db.prepare("DELETE FROM repo_group_members WHERE repo_id = ?").run(
          repo.id,
        );
        db.prepare("DELETE FROM repos WHERE id = ?").run(repo.id);
        // Clear cached stats for this repo
        try {
          db.prepare("DELETE FROM resource_stats WHERE key LIKE ?").run(
            `repo:${opts.name}:%`,
          );
          db.prepare("DELETE FROM resource_stats WHERE key LIKE ?").run(
            `coverage:${opts.name}`,
          );
        } catch {}
        if (repo.local_path && existsSync(repo.local_path)) {
          rmSync(repo.local_path, { recursive: true, force: true });
        }
        console.log(chalk.green(`Deleted repo "${opts.name}" and its index.`));
      } else {
        // All repos
        db.pragma("foreign_keys = OFF");
        db.transaction(() => {
          db.prepare("DELETE FROM code_fts").run();
          db.prepare("DELETE FROM import_graph").run();
          db.prepare("DELETE FROM coverage_map").run();
          db.prepare("DELETE FROM repo_group_members").run();
          db.prepare("DELETE FROM repo_groups").run();
          db.prepare("DELETE FROM repos").run();
          // Clear all repo/coverage cached stats
          try {
            db.prepare(
              "DELETE FROM resource_stats WHERE key LIKE 'repo:%' OR key LIKE 'coverage:%'",
            ).run();
          } catch {}
        })();
        db.pragma("foreign_keys = ON");

        const reposDir = join(dataDir(), "repos");
        if (existsSync(reposDir)) {
          rmSync(reposDir, { recursive: true, force: true });
        }
        console.log(
          chalk.green("All repos, groups, index, and synced files deleted."),
        );
      }
    });

  // ── Clean test cases ──

  // ── Clean tech issues ──

  cleanup
    .command("tech-issues")
    .description("Delete technical issues")
    .option("--ticket <ref>", "Delete only for a specific ticket")
    .option("--status <status>", "Delete only with this status (e.g. resolved)")
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      if (!opts.yes) {
        console.log(
          chalk.yellow(
            "This will delete tech issues. Run with --yes to confirm.",
          ),
        );
        return;
      }
      const db = getDb();
      let sql = "DELETE FROM tech_issues WHERE 1=1";
      const params: unknown[] = [];
      if (opts.ticket) {
        sql += " AND ticket_ref = ?";
        params.push(opts.ticket);
      }
      if (opts.status) {
        sql += " AND status = ?";
        params.push(opts.status);
      }
      const result = db.prepare(sql).run(...params);
      console.log(chalk.green(`Deleted ${result.changes} tech issue(s).`));
    });

  // ── Clean run packs ──

  cleanup
    .command("runpacks")
    .description("Delete run pack entries")
    .option("--ticket <id>", "Delete only run packs for a specific ticket")
    .option("--pack <runPackId>", "Delete only a specific run pack")
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      const db = getDb();

      if (!opts.yes) {
        let msg = "This will delete ";
        if (opts.ticket) msg += `run packs for ticket ${opts.ticket}`;
        else if (opts.pack) msg += `run pack ${opts.pack}`;
        else msg += "ALL run pack entries";
        console.log(chalk.yellow(`${msg}. Run with --yes to confirm.`));
        return;
      }

      let sql = "DELETE FROM run_pack_entries WHERE 1=1";
      const params: unknown[] = [];

      if (opts.ticket) {
        sql += " AND ticket_id = ?";
        params.push(opts.ticket);
      }
      if (opts.pack) {
        sql += " AND run_pack_id = ?";
        params.push(opts.pack);
      }

      const result = db.prepare(sql).run(...params);
      console.log(
        chalk.green(`Deleted ${result.changes} run pack entry(ies).`),
      );
    });

  // ── Clean test cases ──

  cleanup
    .command("testcases")
    .description("Delete test cases")
    .option("--ticket <ref>", "Delete only test cases for a specific ticket")
    .option("--run <runId>", "Delete only test cases for a specific run")
    .option(
      "--status <status>",
      "Delete only test cases with this status (e.g. passed, failed)",
    )
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      const db = getDb();

      if (!opts.yes) {
        let msg = "This will delete ";
        if (opts.ticket) msg += `test cases for ticket ${opts.ticket}`;
        else if (opts.run) msg += `test cases for run ${opts.run}`;
        else if (opts.status) msg += `test cases with status ${opts.status}`;
        else msg += "ALL test cases";
        console.log(chalk.yellow(`${msg}. Run with --yes to confirm.`));
        return;
      }

      let sql = "DELETE FROM test_cases WHERE 1=1";
      const params: unknown[] = [];

      if (opts.ticket) {
        sql += " AND ticket_ref = ?";
        params.push(opts.ticket);
      }
      if (opts.run) {
        sql += " AND run_id = ?";
        params.push(opts.run);
      }
      if (opts.status) {
        sql += " AND status = ?";
        params.push(opts.status);
      }

      const result = db.prepare(sql).run(...params);
      console.log(chalk.green(`Deleted ${result.changes} test case(s).`));
    });
}
