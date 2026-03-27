/**
 * Chain commands — composite operations that replace multi-command bash sequences.
 * Each command replaces 4-11 individual CLI calls + jq parsing.
 */

import type { Command } from "commander";
import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { v4 as uuid } from "uuid";
import chalk from "chalk";
import { getDb, dataDir } from "../../db/client.js";
import { resolveProfile, getTargetByName } from "../../secrets/store.js";
import { syncRepo, indexRepoDiff, ensureRepos, switchRepoBranch } from "../../indexer/index.js";
import { listRepos } from "../../db/repositories/repos.js";
import { scanSnapshotIntoPage } from "../../db/repositories/uimaps.js";
import { storeAxeViolations } from "../../db/repositories/a11y.js";
import { addEntryLog, addEntryObservation } from "../../db/repositories/runpacks.js";

function evidenceDir(): string {
  const dir = join(dataDir(), "evidence");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runCmd(cmd: string, timeout = 15000): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout }).trim();
  } catch (err) {
    return "";
  }
}

export function registerChainCommands(program: Command): void {

  // ══════════════════════════════════════════════════════════════
  // 1. INIT — session + run + runpack in one command
  // Replaces: session start → jq → run resolve → jq → session link → runpack resolve → jq
  // ══════════════════════════════════════════════════════════════

  program
    .command("init")
    .description("Initialize session + run + run pack in one command (replaces 4 commands + 3 jq calls)")
    .requiredOption("--ticket <id>", "Ticket ID")
    .option("--target-url <url>", "Target URL to test")
    .option("--task <text>", "Session task description")
    .option("--labels <labels>", "Session labels (comma-separated: analyze,plan,testcase,explore,report)")
    .option("--input-type <type>", "Input type: ticket, confluence, text, file (default: ticket)")
    .option("--secret-target <name>", "Secret target name for login credentials")
    .option("--secret-role <role>", "Secret role (default: default)")
    .option("--capture <types>", "Capture types: screenshot,snapshot,video,har,console,trace (default: all)")
    .option("--fresh", "Force new run and run pack")
    .action((opts) => {
      const db = getDb();
      const ticket = opts.ticket;
      const task = opts.task ?? `Testing ${ticket}`;
      const labels = opts.labels ?? "explore";
      const inputType = opts.inputType ?? "ticket";

      // Always resolve target URL from secret-target when provided —
      // the secret target's stored URL is the authoritative one.
      // Agents often pass a generic URL from the plan (e.g. "https://staging.showpad.com")
      // but the secret target knows the exact org-specific URL.
      if (opts.secretTarget) {
        const target = getTargetByName(opts.secretTarget);
        if (target?.url) {
          opts.targetUrl = target.url;
        }
      }

      // 1. Session start
      const sessionId = uuid();
      db.prepare(
        `INSERT INTO sessions (id, status, task_summary, labels, ticket_refs)
         VALUES (?, 'active', ?, ?, ?)`
      ).run(sessionId, task, JSON.stringify(labels.split(",")), JSON.stringify([ticket]));

      // 2. Run resolve
      let runId: string;
      let runResumed = false;

      if (!opts.fresh) {
        const existing = db.prepare(
          "SELECT id FROM runs WHERE input_ref = ? AND status IN ('running', 'pending') ORDER BY created_at DESC LIMIT 1"
        ).get(ticket) as { id: string } | undefined;

        if (existing) {
          runId = existing.id;
          runResumed = true;
        }
      }

      if (!runId!) {
        runId = uuid();
        const config: Record<string, unknown> = {};
        if (opts.targetUrl) config.targetUrl = opts.targetUrl;
        db.prepare(
          `INSERT INTO runs (id, input_type, input_ref, input_full, target_url, config_json, status, session_id, capture_config, secret_target, secret_role)
           VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`
        ).run(
          runId, inputType, ticket, ticket, opts.targetUrl ?? null,
          JSON.stringify(config), sessionId,
          opts.capture ? JSON.stringify(opts.capture.split(",")) : null,
          opts.secretTarget ?? null, opts.secretRole ?? null
        );
      }

      // 3. Session link
      db.prepare("UPDATE sessions SET current_run_id = ? WHERE id = ?").run(runId, sessionId);

      // 4. Runpack resolve
      let runPackId: string;
      let packResumed = false;

      if (!opts.fresh) {
        // Find resumable pack
        const latestPack = db.prepare(
          `SELECT h.run_pack_id
           FROM run_pack_entries h
           WHERE h.ticket_id = ? AND h.test_case_id = '__header__'
           ORDER BY h.created_at DESC LIMIT 1`
        ).get(ticket) as { run_pack_id: string } | undefined;

        // Always resume the latest pack for this ticket. New pack only via --fresh.
        if (latestPack) {
          runPackId = latestPack.run_pack_id;
          packResumed = true;
          // Release stale claims
          db.prepare(
            "UPDATE run_pack_entries SET status = 'pending', session_id = NULL, started_at = NULL WHERE run_pack_id = ? AND status = 'claimed'"
          ).run(runPackId);
        }
      }

      if (!runPackId!) {
        runPackId = uuid();
        db.prepare(
          `INSERT INTO run_pack_entries
           (id, run_pack_id, ticket_id, run_id, session_id, test_case_id, fresh_or_existing, status,
            target_url, secret_target, secret_role, capture_config)
           VALUES (?, ?, ?, ?, ?, '__header__', 'fresh', 'header', ?, ?, ?, ?)`
        ).run(
          uuid(), runPackId, ticket, runId, sessionId,
          opts.targetUrl ?? null, opts.secretTarget ?? null, opts.secretRole ?? null,
          opts.capture ? JSON.stringify(opts.capture.split(",")) : null
        );
      }

      console.log(JSON.stringify({
        sessionId,
        runId,
        runPackId,
        runResumed,
        packResumed,
        evidenceDir: evidenceDir(),
      }));
    });

  // ══════════════════════════════════════════════════════════════
  // 2. FINISH — run complete + session end in one command
  // Replaces: run complete → session end
  // ══════════════════════════════════════════════════════════════

  program
    .command("finish")
    .description("Complete run and end session in one command")
    .requiredOption("--run <runId>", "Run ID")
    .requiredOption("--session <sessionId>", "Session ID")
    .option("--status <status>", "Run status: completed, failed (default: completed)")
    .option("--summary <text>", "Run summary")
    .action((opts) => {
      const db = getDb();
      const status = opts.status ?? "completed";

      db.prepare(
        "UPDATE runs SET status = ?, summary = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(status, opts.summary ?? null, opts.run);

      db.prepare(
        "UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?"
      ).run(opts.session);

      console.log(JSON.stringify({ finished: true, runStatus: status }));
    });

  // ══════════════════════════════════════════════════════════════
  // 3. CAPTURE-PAGE — snapshot + screenshot + console + HAR + register all
  // Replaces: 4× agent-browser + 4× capture store + uimap page + uimap scan
  // ══════════════════════════════════════════════════════════════

  program
    .command("capture-page")
    .description("Capture snapshot, screenshot, console, HAR for a page and register all artifacts")
    .requiredOption("--run <runId>", "Run ID")
    .requiredOption("--url <pageUrl>", "Page URL")
    .requiredOption("--action <n>", "Action/step number", parseInt)
    .option("--pack <runPackId>", "Run pack ID")
    .option("--entry <entryId>", "Run pack entry ID")
    .option("--session <sessionId>", "Session ID")
    .option("--ticket <id>", "Ticket ID")
    .option("--desc <text>", "Action description")
    .option("--page-name <name>", "Page name for file naming (default: action-N)")
    .option("--map <mapId>", "UI map ID — if provided, also records page + scans elements")
    .option("--page-title <title>", "Page title for UI map")
    .option("--prev-page <pageId>", "Previous page ID — records navigation from prev to current")
    .action((opts) => {
      const dir = evidenceDir();
      const pageName = opts.pageName ?? `action-${opts.action}`;
      const db = getDb();

      const snapshotPath = join(dir, `snapshot-${pageName}.txt`);
      const screenshotPath = join(dir, `screenshot-${pageName}.png`);
      const consolePath = join(dir, `console-${pageName}.txt`);
      const harPath = join(dir, `har-${pageName}.json`);

      const captured: string[] = [];

      // Capture snapshot
      const snapshotContent = runCmd(`agent-browser snapshot`);
      if (snapshotContent) {
        writeFileSync(snapshotPath, snapshotContent);
        captured.push("snapshot");
      }

      // Capture screenshot
      const ssResult = runCmd(`agent-browser screenshot "${screenshotPath}"`);
      if (existsSync(screenshotPath)) captured.push("screenshot");

      // Capture console
      const consoleContent = runCmd(`agent-browser console`);
      if (consoleContent) {
        writeFileSync(consolePath, consoleContent);
        captured.push("console");
      }

      // Capture HAR
      const harContent = runCmd(`agent-browser har`);
      if (harContent) {
        writeFileSync(harPath, harContent);
        captured.push("har");
      }

      // Remove previous artifacts for this entry + action to prevent duplicates (e.g. agent retries with different URL)
      if (opts.entry) {
        db.prepare(
          "DELETE FROM run_artifacts WHERE entry_id = ? AND action_index = ?"
        ).run(opts.entry, opts.action);
      }

      // Register all captured artifacts in DB
      const storeArtifact = (type: string, filePath: string) => {
        const id = uuid();
        db.prepare(
          `INSERT INTO run_artifacts (id, run_id, run_pack_id, entry_id, session_id, ticket_id, action_index, action_desc, page_url, artifact_type, file_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id, opts.run, opts.pack ?? null, opts.entry ?? null,
          opts.session ?? null, opts.ticket ?? null,
          opts.action, opts.desc ?? null, opts.url, type, filePath
        );
      };

      if (captured.includes("snapshot")) storeArtifact("snapshot", snapshotPath);
      if (captured.includes("screenshot")) storeArtifact("screenshot", screenshotPath);
      if (captured.includes("console")) storeArtifact("console", consolePath);
      if (captured.includes("har")) storeArtifact("har", harPath);

      // Auto-log capture to entry timeline + observation
      if (opts.entry && captured.length > 0) {
        const desc = opts.desc ?? `Action ${opts.action}`;
        addEntryLog(opts.entry, `[${opts.action}] ${desc} — ${captured.join(", ")} captured`);
        addEntryObservation(opts.entry, desc);
      }

      // Run axe-core accessibility scan
      let a11yCount = 0;
      let a11ySummary: Array<{ rule: string; impact: string; description: string; nodes: number }> = [];
      try {
        const axeScript = '(async () => { if (!window.axe) { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"; await new Promise((ok, fail) => { s.onload = ok; s.onerror = fail; document.head.appendChild(s); }); } const results = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] }); return JSON.stringify(results.violations); })()';
        const axeRaw = execSync(`agent-browser eval '${axeScript}'`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }).trim();
        if (axeRaw) {
          // agent-browser eval returns JSON-encoded value — parse twice: outer quotes then inner JSON
          const inner = JSON.parse(axeRaw);
          const violations = typeof inner === "string" ? JSON.parse(inner) : inner;
          if (Array.isArray(violations) && violations.length > 0) {
            a11yCount = storeAxeViolations(opts.run, opts.url, violations, {
              runPackId: opts.pack,
              entryId: opts.entry,
              uiMapPageId: null,
              ticketId: opts.ticket,
            });
            // Build summary for agent to analyse
            a11ySummary = violations.map((v: { id: string; impact?: string; description?: string; nodes?: unknown[] }) => ({
              rule: v.id,
              impact: v.impact ?? "unknown",
              description: v.description ?? "",
              nodes: v.nodes?.length ?? 0,
            }));
            if (opts.entry && a11yCount > 0) {
              addEntryLog(opts.entry, `[${opts.action}] a11y: ${a11yCount} issue(s) — ${a11ySummary.map(v => `${v.impact}: ${v.rule} (${v.nodes} elements)`).join(", ")}`);
            }
          }
        }
      } catch {}

      // UI map recording if map ID provided
      let pageId: string | null = null;
      if (opts.map && captured.includes("snapshot")) {
        // Upsert page
        const existing = db.prepare(
          "SELECT id FROM ui_map_pages WHERE ui_map_id = ? AND url_pattern = ?"
        ).get(opts.map, opts.url) as { id: string } | undefined;

        if (existing) {
          pageId = existing.id;
          db.prepare(
            "UPDATE ui_map_pages SET snapshot_path = ?, screenshot_path = ?, last_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
          ).run(snapshotPath, screenshotPath, pageId);
        } else {
          pageId = uuid();
          db.prepare(
            `INSERT INTO ui_map_pages (id, ui_map_id, url_pattern, page_title, snapshot_path, screenshot_path, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`
          ).run(pageId, opts.map, opts.url, opts.pageTitle ?? null, snapshotPath, screenshotPath);
        }

        // Scan elements from snapshot into UI map
        try {
          const snapshotText = readFileSync(snapshotPath, "utf-8");
          scanSnapshotIntoPage(pageId, opts.map, snapshotText, {
            ticketIds: opts.ticket ? [opts.ticket] : undefined,
            runId: opts.run,
            sessionId: opts.session,
          });
        } catch {}

        // Record navigation if prev-page provided
        if (opts.prevPage && pageId) {
          // Verify prev-page exists before inserting navigation (avoids FK constraint failure)
          const prevExists = db.prepare(
            "SELECT id FROM ui_map_pages WHERE id = ?"
          ).get(opts.prevPage);

          if (prevExists) {
            const existingNav = db.prepare(
              "SELECT id FROM ui_map_navigations WHERE ui_map_id = ? AND from_page_id = ? AND to_page_id = ?"
            ).get(opts.map, opts.prevPage, pageId) as { id: string } | undefined;

            if (!existingNav) {
              db.prepare(
                `INSERT INTO ui_map_navigations (id, ui_map_id, from_page_id, to_page_id, nav_type, status, times_used, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'click', 'active', 1, datetime('now'), datetime('now'))`
              ).run(uuid(), opts.map, opts.prevPage, pageId);
            } else {
              db.prepare(
                "UPDATE ui_map_navigations SET times_used = times_used + 1, updated_at = datetime('now') WHERE id = ?"
              ).run(existingNav.id);
            }
          }
        }
      }

      console.log(JSON.stringify({
        captured,
        files: {
          snapshot: captured.includes("snapshot") ? snapshotPath : null,
          screenshot: captured.includes("screenshot") ? screenshotPath : null,
          console: captured.includes("console") ? consolePath : null,
          har: captured.includes("har") ? harPath : null,
        },
        pageId,
        a11yIssues: a11yCount,
        a11yViolations: a11ySummary.length > 0 ? a11ySummary : undefined,
      }));
    });

  // ══════════════════════════════════════════════════════════════
  // 4. CLAIM-SMART — intelligent claim with retry detection
  // Replaces: runpack list → check failed → retry → claim → claim-next → done check
  // ══════════════════════════════════════════════════════════════

  program
    .command("claim-smart")
    .description("Smart claim: claim pending entry, or pull next unclaimed test case. No auto-retry — use `runpack retry` for that.")
    .requiredOption("--pack <runPackId>", "Run pack ID")
    .requiredOption("--ticket <id>", "Ticket ID")
    .requiredOption("--session <sessionId>", "Session ID")
    .option("--run <runId>", "Run ID")
    .option("--layer <layer>", "Test layer: ui, api, ui_api")
    .option("--risk", "Order by risk score (highest first)")
    .action((opts) => {
      const db = getDb();
      const packId = opts.pack;

      // Guard: refuse to claim if session is not active
      const session = db.prepare(
        "SELECT status FROM sessions WHERE id = ?"
      ).get(opts.session) as { status: string } | undefined;
      if (session && session.status !== "active") {
        console.log(JSON.stringify({ error: "Session is not active", sessionStatus: session.status, hint: "Do not call claim-smart after ending the session. One test case per invocation." }));
        return;
      }

      // Step 1: Try to claim a pending entry already in the pack
      const pending = db.prepare(
        `SELECT rpe.* FROM run_pack_entries rpe
         JOIN test_cases tc ON rpe.test_case_id = tc.id
         WHERE rpe.run_pack_id = ? AND rpe.status = 'pending' AND rpe.test_case_id != '__header__'
         ORDER BY tc.priority ASC, rpe.created_at ASC LIMIT 1`
      ).get(packId) as Record<string, unknown> | undefined;

      if (pending) {
        db.prepare(
          "UPDATE run_pack_entries SET status = 'claimed', session_id = ?, started_at = datetime('now') WHERE id = ?"
        ).run(opts.session, pending.id);

        const entry = db.prepare(
          `SELECT rpe.*, tc.title as tc_title, tc.type as tc_type, tc.format as tc_format,
                  tc.priority as tc_priority, tc.bdd_feature, tc.bdd_scenario,
                  tc.bdd_given, tc.bdd_when, tc.bdd_then, tc.trad_steps, tc.trad_expected,
                  tc.description as tc_description, tc.preconditions as tc_preconditions,
                  tc.test_layer as tc_layer
           FROM run_pack_entries rpe JOIN test_cases tc ON rpe.test_case_id = tc.id
           WHERE rpe.id = ?`
        ).get(pending.id);

        console.log(JSON.stringify(entry));
        return;
      }

      // Step 2: No pending entries — pull next unclaimed test case from the ticket
      // (works for both fresh packs and packs where all entries are done/failed/blocked)
      const totalEntries = (db.prepare(
        "SELECT COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id != '__header__'"
      ).get(packId) as { c: number }).c;

      {
        const layerFilter = opts.layer ? " AND COALESCE(test_layer, 'ui') = ?" : "";
        const orderClause = opts.risk
          ? "ORDER BY COALESCE(risk_score, 0) DESC, priority ASC, created_at ASC"
          : "ORDER BY priority ASC, created_at ASC";
        const params: unknown[] = [opts.ticket];
        if (opts.layer) params.push(opts.layer);

        const existingTcIds = db.prepare(
          "SELECT test_case_id FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id != '__header__'"
        ).all(packId) as Array<{ test_case_id: string }>;
        const existingSet = new Set(existingTcIds.map(r => r.test_case_id));

        const allReady = db.prepare(
          `SELECT id FROM test_cases WHERE ticket_ref = ? AND ready = 1${layerFilter} ${orderClause}`
        ).all(...params) as Array<{ id: string }>;

        const nextTc = allReady.find(tc => !existingSet.has(tc.id));

        if (nextTc) {
          const header = db.prepare(
            "SELECT run_id FROM run_pack_entries WHERE run_pack_id = ? LIMIT 1"
          ).get(packId) as { run_id: string } | undefined;

          const entryId = uuid();
          const runner = opts.layer === "api" ? "api" : opts.layer === "ui_api" ? "api" : "ui";
          db.prepare(
            `INSERT INTO run_pack_entries
             (id, run_pack_id, ticket_id, run_id, session_id, test_case_id, fresh_or_existing, status, started_at, runner)
             VALUES (?, ?, ?, ?, ?, ?, 'fresh', 'claimed', datetime('now'), ?)`
          ).run(entryId, packId, opts.ticket, opts.run ?? header?.run_id ?? "", opts.session, nextTc.id, runner);

          const entry = db.prepare(
            `SELECT rpe.*, tc.title as tc_title, tc.type as tc_type, tc.format as tc_format,
                    tc.priority as tc_priority, tc.bdd_feature, tc.bdd_scenario,
                    tc.bdd_given, tc.bdd_when, tc.bdd_then, tc.trad_steps, tc.trad_expected,
                    tc.description as tc_description, tc.preconditions as tc_preconditions,
                    tc.test_layer as tc_layer
             FROM run_pack_entries rpe JOIN test_cases tc ON rpe.test_case_id = tc.id
             WHERE rpe.id = ?`
          ).get(entryId);

          console.log(JSON.stringify(entry));
          return;
        }
      }

      // Step 3: All done — report status breakdown
      const statusCounts = db.prepare(
        `SELECT status, COUNT(*) as c FROM run_pack_entries
         WHERE run_pack_id = ? AND test_case_id != '__header__'
         GROUP BY status`
      ).all(packId) as Array<{ status: string; c: number }>;
      const byStatus: Record<string, number> = {};
      for (const s of statusCounts) byStatus[s.status] = s.c;

      console.log(JSON.stringify({
        done: true,
        message: "All test cases executed",
        totalEntries,
        passed: byStatus["passed"] ?? 0,
        failed: byStatus["failed"] ?? 0,
        blocked: byStatus["blocked"] ?? 0,
        skipped: byStatus["skipped"] ?? 0,
      }));
    });

  // ══════════════════════════════════════════════════════════════
  // 5. AUTH-RESOLVE — get credentials for a target+role, resolve 1Password
  // Replaces: runpack meta → secrets get-profile → jq parsing for email/password/token
  // ══════════════════════════════════════════════════════════════

  program
    .command("auth-resolve")
    .description("Resolve credentials for a target+role (resolves 1Password refs, returns email/password/token)")
    .option("--pack <runPackId>", "Get target+role from run pack metadata")
    .option("--target <name>", "Target name (overrides pack)")
    .option("--role <role>", "Role (overrides pack, default: default)")
    .action((opts) => {
      const db = getDb();
      let targetName = opts.target;
      let role = opts.role ?? "default";

      // Get from pack metadata if provided
      if (opts.pack && !targetName) {
        const meta = db.prepare(
          "SELECT target_url, secret_target, secret_role FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id = '__header__'"
        ).get(opts.pack) as { target_url: string | null; secret_target: string | null; secret_role: string | null } | undefined;

        if (meta) {
          targetName = meta.secret_target;
          role = meta.secret_role ?? "default";
        }
      }

      if (!targetName) {
        console.log(JSON.stringify({ error: "No target specified. Use --target or --pack with stored secret_target." }));
        return;
      }

      // Resolve secrets
      try {
        const profile = resolveProfile(targetName, role);
        // Find email and password using flexible key matching
        const keys = Object.keys(profile);
        const email = profile["LOGIN_EMAIL"] ?? profile["EMAIL"] ?? profile["_EMAIL"]
          ?? profile["username"] ?? profile["USERNAME"] ?? profile["_USERNAME"] ?? null;
        const password = profile["LOGIN_PASSWORD"] ?? profile["PASSWORD"] ?? profile["_PASSWORD"]
          ?? profile["password"] ?? profile["_password"] ?? null;
        const apiToken = profile["API_TOKEN"] ?? profile["api_token"] ?? profile["TOKEN"] ?? null;
        const otpSecret = profile["OTP_SECRET"] ?? profile["LOGIN_OTP_SECRET"] ?? null;

        console.log(JSON.stringify({
          target: targetName,
          role,
          email,
          password,
          apiToken,
          otpSecret,
          allKeys: keys,
          raw: profile,
        }));
      } catch (err) {
        console.log(JSON.stringify({ error: String(err), target: targetName, role }));
      }
    });

  // ══════════════════════════════════════════════════════════════
  // 6. REPOS SETUP-FOR-TICKET — discover + sync + index in one
  // Replaces: repos discover → repos path → repos sync --branch --reindex
  // ══════════════════════════════════════════════════════════════

  const repos = program.commands.find(c => c.name() === "repos");
  if (repos) {
    repos
      .command("setup-for-ticket")
      .description("Discover, sync, and index all repos for a ticket in one command")
      .requiredOption("--ticket <id>", "Ticket ID")
      .option("--url <urls...>", "Additional repo URLs")
      .option("--branch <branch>", "Switch all repos to this branch and reindex")
      .action((opts) => {

        // Step 1: Discover repos from provided URLs
        const urls: string[] = opts.url ?? [];
        if (urls.length > 0) {
          try {
            const result = ensureRepos(urls);
            console.log(chalk.dim(`  Discovered ${result.length} repo(s)`));
          } catch (err) {
            console.log(chalk.dim(`  Discover: ${err}`));
          }
        }

        // Step 2: Get all repos for this ticket
        const db = getDb();
        const repoNames = new Set<string>();

        // From runs
        const runs = db.prepare("SELECT config_json FROM runs WHERE input_ref = ?").all(opts.ticket) as Array<{ config_json: string }>;
        for (const r of runs) {
          try {
            const config = JSON.parse(r.config_json);
            if (config.repos) for (const url of config.repos) repoNames.add(url);
          } catch {}
        }

        // From all registered repos (they were discovered above)
        const allRepos = listRepos() as Array<{ name: string; local_path: string | null }>;

        // Step 3: Sync and index each repo
        const results: Record<string, { synced: boolean; indexed: boolean; branch?: string }> = {};
        for (const repo of allRepos) {
          if (!repo.local_path) continue;
          try {
            syncRepo(repo.name);

            if (opts.branch) {
              switchRepoBranch(repo.name, opts.branch);
            }

            const indexResult = indexRepoDiff(repo.name);
            results[repo.name] = { synced: true, indexed: true, branch: opts.branch };
          } catch (err) {
            results[repo.name] = { synced: false, indexed: false };
          }
        }

        console.log(JSON.stringify({ ticket: opts.ticket, repos: results }));
      });
  }

  // ══════════════════════════════════════════════════════════════
  // 7. API-REQUEST — curl + parse + store artifact + log in one
  // Replaces: curl → parse status/body/timing → capture store → runpack log → runpack observe → apimap call
  // ══════════════════════════════════════════════════════════════

  program
    .command("api-request")
    .description("Execute an API request, validate, store artifact, and log result in one command")
    .requiredOption("--method <method>", "HTTP method: GET, POST, PUT, DELETE, PATCH")
    .requiredOption("--url <url>", "Full URL to request")
    .option("--body <json>", "Request body (JSON)")
    .option("--header <headers...>", "Headers (repeatable: 'Key: Value')")
    .option("--auth <token>", "Authorization Bearer token")
    .option("--expect <code>", "Expected HTTP status code", parseInt)
    .option("--run <runId>", "Run ID for artifact storage")
    .option("--pack <runPackId>", "Run pack ID")
    .option("--entry <entryId>", "Run pack entry ID")
    .option("--action <n>", "Action/step number", parseInt)
    .option("--ticket <id>", "Ticket ID")
    .option("--session <sessionId>", "Session ID")
    .option("--apimap-endpoint <id>", "API map endpoint ID to record call")
    .action((opts) => {
      const method = opts.method.toUpperCase();
      const url = opts.url;
      const dir = evidenceDir();

      // Build curl command
      let curlCmd = `curl -s -w "\\n---NOOB_META---\\nHTTP_STATUS:%{http_code}\\nTIME_TOTAL:%{time_total}\\nSIZE_DOWNLOAD:%{size_download}" -X ${method} "${url}"`;
      curlCmd += ' -H "Content-Type: application/json"';
      if (opts.auth) curlCmd += ` -H "Authorization: Bearer ${opts.auth}"`;
      if (opts.header) {
        for (const h of opts.header) curlCmd += ` -H "${h}"`;
      }
      if (opts.body) curlCmd += ` -d '${opts.body}'`;

      // Execute
      let rawResponse: string;
      try {
        rawResponse = execSync(curlCmd, { encoding: "utf-8", timeout: 30000 });
      } catch (err) {
        console.log(JSON.stringify({
          error: "Request failed",
          method, url,
          message: err instanceof Error ? err.message : String(err),
        }));
        return;
      }

      // Parse response
      const metaIdx = rawResponse.indexOf("---NOOB_META---");
      const body = metaIdx >= 0 ? rawResponse.slice(0, metaIdx).trim() : rawResponse;
      const meta = metaIdx >= 0 ? rawResponse.slice(metaIdx) : "";

      const statusMatch = meta.match(/HTTP_STATUS:(\d+)/);
      const timingMatch = meta.match(/TIME_TOTAL:([\d.]+)/);
      const sizeMatch = meta.match(/SIZE_DOWNLOAD:(\d+)/);

      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      const timing = timingMatch ? parseFloat(timingMatch[1]) : 0;
      const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

      // Validation
      const expected = opts.expect;
      const passed = expected ? status === expected : status >= 200 && status < 400;
      const timingSlow = timing > 3;

      // Store artifact
      if (opts.run) {
        const artifactPath = join(dir, `api-${opts.action ?? 0}-${method.toLowerCase()}.txt`);
        const artifactContent = `REQUEST: ${method} ${url}\n${opts.body ? `BODY: ${opts.body}\n` : ""}RESPONSE: ${status} (${timing.toFixed(2)}s)\n\n${body}`;
        writeFileSync(artifactPath, artifactContent);

        const db = getDb();
        db.prepare(
          `INSERT INTO run_artifacts (id, run_id, run_pack_id, entry_id, session_id, ticket_id, action_index, action_desc, page_url, artifact_type, file_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'api_request', ?)`
        ).run(
          uuid(), opts.run, opts.pack ?? null, opts.entry ?? null,
          opts.session ?? null, opts.ticket ?? null,
          opts.action ?? 0, `${method} ${url} → ${status}`, url, artifactPath
        );
      }

      // Log to entry
      if (opts.entry) {
        const db = getDb();
        // Add log
        const entry = db.prepare("SELECT logs FROM run_pack_entries WHERE id = ?").get(opts.entry) as { logs: string | null } | undefined;
        let logs: string[] = [];
        try { logs = JSON.parse(entry?.logs ?? "[]"); } catch {}
        logs.push(`${method} ${url} → ${status} (${timing.toFixed(2)}s)`);
        db.prepare("UPDATE run_pack_entries SET logs = ? WHERE id = ?").run(JSON.stringify(logs), opts.entry);
      }

      // API map call tracking
      if (opts.apimapEndpoint) {
        const db = getDb();
        const ep = db.prepare("SELECT times_called, times_succeeded, times_failed, avg_response_ms FROM api_map_endpoints WHERE id = ?")
          .get(opts.apimapEndpoint) as { times_called: number; times_succeeded: number; times_failed: number; avg_response_ms: number } | undefined;
        if (ep) {
          const isSuccess = status >= 200 && status < 400;
          const newCalled = ep.times_called + 1;
          const newAvg = ((ep.avg_response_ms * ep.times_called) + (timing * 1000)) / newCalled;
          db.prepare(
            `UPDATE api_map_endpoints SET times_called = ?, times_succeeded = ?, times_failed = ?, avg_response_ms = ?, last_status_code = ?, last_called_at = datetime('now'), last_called_run = ? WHERE id = ?`
          ).run(
            newCalled,
            isSuccess ? ep.times_succeeded + 1 : ep.times_succeeded,
            isSuccess ? ep.times_failed : ep.times_failed + 1,
            Math.round(newAvg),
            status, opts.run ?? null, opts.apimapEndpoint
          );
        }
      }

      console.log(JSON.stringify({
        method, url, status, timing: Math.round(timing * 1000),
        size, passed, timingSlow,
        expected: expected ?? null,
        body: body.slice(0, 2000),
      }));
    });
}
