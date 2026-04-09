import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { execSync } from "child_process";
import {
  readFileSync,
  existsSync,
  statSync,
  rmSync,
  readdirSync,
  unlinkSync,
  readlinkSync,
  mkdirSync,
  symlinkSync,
  copyFileSync,
  writeFileSync,
} from "fs";
import { extname, resolve as resolvePath, join } from "path";
import { homedir } from "os";
import { getDb, dataDir } from "../db/client.js";
import { getDashboardHtml } from "./dashboard.js";
import { getDocsHtml } from "./docs.js";
import {
  getAllSecretsMasked,
  addTarget,
  setSecret,
  deleteSecret,
  deleteRole,
  deleteTarget,
  resolveProfile,
  importFromOnePassword,
} from "../secrets/store.js";
import chalk from "chalk";
import { gatherTicketReport } from "../cli/commands/report.js";
import {
  getResourceStatsFromCache,
  refreshAllStats,
  getStat,
} from "../db/repositories/resource-stats.js";
import {
  removeAgent as removeQaPoolAgent,
  buildInvocation,
} from "../db/repositories/qa-pool.js";

interface WatchOptions {
  port: number;
  sessionId?: string;
}

export function startWatchServer(opts: WatchOptions): void {
  const sseClients: Set<ServerResponse> = new Set();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${opts.port}`);

    // CORS for local dev
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml(opts.port, opts.sessionId));
      return;
    }

    if (url.pathname === "/api/docs") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDocsHtml());
      return;
    }

    if (url.pathname === "/api/stream") {
      // SSE endpoint
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      sseClients.add(res);

      let heartbeatInterval: NodeJS.Timeout | null = null;

      const sendState = () => {
        try {
          const data = gatherState(opts.sessionId);
          const jsonStr = JSON.stringify(data);
          res.write(`data: ${jsonStr}\n\n`);
        } catch (err) {
          console.error("SSE gatherState failed:", err);
          // Send minimal fallback state on error
          res.write(
            `data: {"sessions":[],"runs":[],"recentIssues":[],"stats":{"activeSessions":0,"totalIssues":0,"totalRuns":0},"timestamp":"${new Date().toISOString()}"}\n\n`,
          );
        }
      };

      // Send initial state
      sendState();

      // Send heartbeats every 45 seconds
      heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
        } catch {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 45000);

      req.on("close", () => {
        sseClients.delete(res);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      });

      return;
    }

    if (url.pathname === "/api/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(gatherState(opts.sessionId)));
      return;
    }

    if (url.pathname === "/api/session" && url.searchParams.has("id")) {
      const id = url.searchParams.get("id")!;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(gatherSessionDetail(id)));
      return;
    }

    if (url.pathname === "/api/issues" && url.searchParams.has("run")) {
      const runId = url.searchParams.get("run")!;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getIssuesForRun(runId)));
      return;
    }

    if (url.pathname === "/api/actions" && url.searchParams.has("run")) {
      const runId = url.searchParams.get("run")!;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getActionsForRun(runId)));
      return;
    }

    // ── Secrets API ──

    if (url.pathname === "/api/secrets" && req.method === "GET") {
      const target = url.searchParams.get("target") ?? undefined;
      const role = url.searchParams.get("role") ?? undefined;
      const resolve = url.searchParams.get("resolve") === "true";
      if (resolve && target && role) {
        try {
          const resolved = resolveProfile(target, role);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(resolved));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getAllSecretsMasked()));
      }
      return;
    }

    if (url.pathname === "/api/secrets/target" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { name, url: targetUrl, description } = JSON.parse(body);
          if (!name) {
            res.writeHead(400);
            res.end('{"error":"name required"}');
            return;
          }
          addTarget(name, targetUrl, description);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/secrets" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { target, role, key, value } = JSON.parse(body);
          if (!target || !key || !value) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: "target, key, and value required" }),
            );
            return;
          }
          setSecret(target, role ?? "default", key, value);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/secrets" && req.method === "DELETE") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { target, role, key } = JSON.parse(body);
          if (key && target) {
            deleteSecret(target, role ?? "default", key);
          } else if (target && role) {
            deleteRole(target, role);
          } else if (target) {
            deleteTarget(target);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/secrets/import-op" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { opRef, target, role, live } = JSON.parse(body);
          if (!opRef || !target) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "opRef and target required" }));
            return;
          }
          const imported = importFromOnePassword(
            opRef,
            target,
            role ?? "default",
            {
              live: live ?? false,
            },
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ imported }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // ── QA Pool API ──

    if (url.pathname === "/api/qa-pool" && req.method === "GET") {
      const db = getDb();
      const agents = db
        .prepare(
          "SELECT * FROM qa_pool_agents ORDER BY ticket_id, created_at ASC",
        )
        .all() as any[];
      const enriched = agents.map((a) => ({
        ...a,
        invocation: buildInvocation(a),
        agentExists: existsSync(a.agent_path),
      }));
      const byTicket: Record<string, any[]> = {};
      for (const a of enriched) {
        if (!byTicket[a.ticket_id]) byTicket[a.ticket_id] = [];
        byTicket[a.ticket_id].push(a);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          agents: enriched,
          byTicket,
          ticketIds: Object.keys(byTicket).sort(),
        }),
      );
      return;
    }

    if (url.pathname === "/api/qa-pool" && req.method === "DELETE") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { id } = JSON.parse(body);
          if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "id required" }));
            return;
          }
          const removed = removeQaPoolAgent(id);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: removed }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // ── Default Files API ──

    if (url.pathname === "/api/files" && req.method === "GET") {
      const db = getDb();
      const rows = db
        .prepare(
          "SELECT id, label, file_path, file_type, mime_type, file_size, description, created_at, updated_at FROM default_files ORDER BY file_type, label",
        )
        .all();
      // Check if files still exist on disk
      const enriched = (rows as any[]).map((r) => ({
        ...r,
        exists: existsSync(r.file_path),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(enriched));
      return;
    }

    const fileMimeMap: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".csv": "text/csv",
      ".txt": "text/plain",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".json": "application/json",
      ".xml": "application/xml",
      ".zip": "application/zip",
    };

    if (url.pathname === "/api/files" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          const {
            label,
            file_type,
            mime_type,
            description,
            file_name,
            file_data,
            file_path,
          } = JSON.parse(raw);
          if (!label) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "label is required" }));
            return;
          }
          const id = uuidv4();
          const filesDir = join(dataDir(), "files");
          mkdirSync(filesDir, { recursive: true });
          let destPath: string;
          let size: number;
          let detectedMime = mime_type || "";

          if (file_data && file_name) {
            // Browser upload: base64-encoded file content
            const buf = Buffer.from(file_data, "base64");
            size = buf.length;
            destPath = join(filesDir, id + "-" + file_name);
            writeFileSync(destPath, buf);
            if (!detectedMime) {
              const ext = extname(file_name).toLowerCase();
              detectedMime = fileMimeMap[ext] || "application/octet-stream";
            }
          } else if (file_path) {
            // CLI/path-based: copy from local path
            const resolved = resolvePath(file_path);
            if (!existsSync(resolved)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "File not found: " + resolved }));
              return;
            }
            size = statSync(resolved).size;
            const origName = resolved.split("/").pop() || "file";
            destPath = join(filesDir, id + "-" + origName);
            copyFileSync(resolved, destPath);
            if (!detectedMime) {
              const ext = extname(resolved).toLowerCase();
              detectedMime = fileMimeMap[ext] || "application/octet-stream";
            }
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "file_data+file_name or file_path is required",
              }),
            );
            return;
          }

          const db = getDb();
          db.prepare(
            "INSERT INTO default_files (id, label, file_path, file_type, mime_type, file_size, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ).run(
            id,
            label,
            destPath,
            file_type || "document",
            detectedMime,
            size,
            description || null,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id, label, file_path: destPath }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/files" && req.method === "DELETE") {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const { id } = JSON.parse(body);
          if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "id required" }));
            return;
          }
          const db = getDb();
          db.prepare("DELETE FROM default_files WHERE id = ?").run(id);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ deleted: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // ── Run Packs API ──

    if (url.pathname === "/api/runpacks/tickets" && req.method === "GET") {
      const db = getDb();
      // Show all ticket_ids that have run packs (including empty packs with only header rows)
      const tickets = db
        .prepare(
          `SELECT
           h.ticket_id,
           COUNT(DISTINCT h.run_pack_id) as pack_count,
           COALESCE(e.total_entries, 0) as total_entries,
           COALESCE(e.passed, 0) as passed,
           COALESCE(e.failed, 0) as failed,
           COALESCE(e.pending, 0) as pending,
           COALESCE(e.claimed, 0) as claimed,
           MAX(h.created_at) as last_run
         FROM run_pack_entries h
         LEFT JOIN (
           SELECT ticket_id,
             COUNT(*) as total_entries,
             SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
             SUM(CASE WHEN COALESCE(runner, 'ui') = 'ui' THEN 1 ELSE 0 END) as ui_count,
             SUM(CASE WHEN runner = 'api' THEN 1 ELSE 0 END) as api_count
           FROM run_pack_entries WHERE test_case_id != '__header__'
           GROUP BY ticket_id
         ) e ON e.ticket_id = h.ticket_id
         WHERE h.test_case_id = '__header__'
         GROUP BY h.ticket_id
         ORDER BY MAX(h.created_at) DESC`,
        )
        .all();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tickets));
      return;
    }

    if (url.pathname === "/api/runpacks" && req.method === "GET") {
      const db = getDb();
      const ticketId = url.searchParams.get("ticket");
      const packId = url.searchParams.get("pack");

      if (packId) {
        // Get entries with test case details for a specific run pack
        const entries = db
          .prepare(
            `SELECT rpe.*, tc.title as tc_title, tc.type as tc_type, tc.format as tc_format,
                  tc.priority as tc_priority, tc.bdd_feature, tc.bdd_scenario,
                  tc.bdd_given, tc.bdd_when, tc.bdd_then, tc.trad_steps, tc.trad_expected,
                  tc.description as tc_description, tc.preconditions as tc_preconditions,
                  tc.labels as tc_labels, tc.test_layer as tc_layer
           FROM run_pack_entries rpe
           JOIN test_cases tc ON rpe.test_case_id = tc.id
           WHERE rpe.run_pack_id = ?
           ORDER BY tc.priority ASC, rpe.created_at ASC`,
          )
          .all(packId);
        // Also get pack metadata from header
        const meta = db
          .prepare(
            "SELECT target_url, secret_target, secret_role, capture_config FROM run_pack_entries WHERE run_pack_id = ? AND test_case_id = '__header__'",
          )
          .get(packId) as Record<string, unknown> | undefined;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ entries, meta: meta ?? null }));
      } else if (ticketId) {
        // Get run pack summaries for a ticket — include header metadata
        const packs = db
          .prepare(
            `SELECT
             rpe.run_pack_id,
             rpe.ticket_id,
             rpe.run_id,
             rpe.fresh_or_existing,
             MIN(rpe.created_at) as created_at,
             COUNT(*) as total,
             SUM(CASE WHEN rpe.status = 'passed' THEN 1 ELSE 0 END) as passed,
             SUM(CASE WHEN rpe.status = 'failed' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN rpe.status = 'pending' THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN rpe.status = 'claimed' THEN 1 ELSE 0 END) as claimed,
             SUM(CASE WHEN rpe.status = 'skipped' THEN 1 ELSE 0 END) as skipped,
             SUM(CASE WHEN rpe.status = 'blocked' THEN 1 ELSE 0 END) as blocked,
             SUM(CASE WHEN COALESCE(rpe.runner, 'ui') = 'ui' THEN 1 ELSE 0 END) as ui_count,
             SUM(CASE WHEN rpe.runner = 'api' THEN 1 ELSE 0 END) as api_count,
             h.target_url,
             h.secret_target,
             h.capture_config
           FROM run_pack_entries rpe
           LEFT JOIN run_pack_entries h ON h.run_pack_id = rpe.run_pack_id AND h.test_case_id = '__header__'
           WHERE rpe.ticket_id = ? AND rpe.test_case_id != '__header__'
           GROUP BY rpe.run_pack_id
           ORDER BY MIN(rpe.created_at) DESC`,
          )
          .all(ticketId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(packs));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Provide ?ticket=<id> or ?pack=<runPackId>",
          }),
        );
      }
      return;
    }

    // ── Issues API ──

    if (url.pathname === "/api/issues/tickets" && req.method === "GET") {
      const db = getDb();
      const tickets = db
        .prepare(
          `SELECT
           r.input_ref as ticket,
           COUNT(i.id) as total,
           SUM(CASE WHEN i.severity = 'critical' THEN 1 ELSE 0 END) as critical,
           SUM(CASE WHEN i.severity = 'high' THEN 1 ELSE 0 END) as high,
           SUM(CASE WHEN i.severity = 'medium' THEN 1 ELSE 0 END) as medium,
           SUM(CASE WHEN i.severity = 'low' THEN 1 ELSE 0 END) as low,
           SUM(CASE WHEN i.severity = 'info' THEN 1 ELSE 0 END) as info,
           MAX(i.created_at) as last_issue
         FROM issues i
         JOIN runs r ON i.run_id = r.id
         WHERE r.input_ref IS NOT NULL AND r.input_ref != ''
         GROUP BY r.input_ref
         ORDER BY MAX(i.created_at) DESC`,
        )
        .all();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tickets));
      return;
    }

    if (url.pathname === "/api/issues/by-ticket" && req.method === "GET") {
      const ticket = url.searchParams.get("ticket");
      if (!ticket) {
        res.writeHead(400);
        res.end('{"error":"ticket required"}');
        return;
      }
      const db = getDb();
      const issues = db
        .prepare(
          `SELECT i.*, r.input_ref as ticket
         FROM issues i
         JOIN runs r ON i.run_id = r.id
         WHERE r.input_ref = ?
         ORDER BY
           CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 WHEN 'info' THEN 4 END,
           i.category, i.created_at DESC`,
        )
        .all(ticket);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(issues));
      return;
    }

    if (url.pathname === "/api/issues/delete" && req.method === "DELETE") {
      const issueId = url.searchParams.get("id");
      if (!issueId) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();
      const result = db.prepare("DELETE FROM issues WHERE id = ?").run(issueId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: result.changes > 0 }));
      return;
    }

    if (url.pathname === "/api/issues/detail" && req.method === "GET") {
      const issueId = url.searchParams.get("id");
      if (!issueId) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();

      const issue = db
        .prepare("SELECT * FROM issues WHERE id = ?")
        .get(issueId) as Record<string, unknown> | undefined;
      if (!issue) {
        res.writeHead(404);
        res.end('{"error":"not found"}');
        return;
      }

      // Related run
      const run = issue.run_id
        ? db.prepare("SELECT * FROM runs WHERE id = ?").get(issue.run_id)
        : null;

      // Related test step
      const step = issue.step_id
        ? db.prepare("SELECT * FROM test_steps WHERE id = ?").get(issue.step_id)
        : null;

      // Related run pack entry (find by run_id)
      const runpackEntry = issue.run_id
        ? db
            .prepare(
              "SELECT rpe.*, tc.title as tc_title, tc.type as tc_type, tc.format as tc_format FROM run_pack_entries rpe LEFT JOIN test_cases tc ON rpe.test_case_id = tc.id WHERE rpe.run_id = ? AND rpe.test_case_id != '__header__' ORDER BY rpe.created_at DESC LIMIT 1",
            )
            .get(issue.run_id)
        : null;

      // Related analyses for this run
      const analyses = issue.run_id
        ? db
            .prepare(
              "SELECT id, analysis_type, summary, confidence FROM analyses WHERE run_id = ?",
            )
            .all(issue.run_id)
        : [];

      // Related tech issues (match by URL or run)
      let techIssues: unknown[] = [];
      if (issue.location) {
        techIssues = db
          .prepare(
            "SELECT * FROM tech_issues WHERE url LIKE ? ORDER BY updated_at DESC LIMIT 5",
          )
          .all("%" + (issue.location as string) + "%");
      }
      if (techIssues.length === 0 && issue.run_id) {
        techIssues = db
          .prepare(
            "SELECT * FROM tech_issues WHERE run_id = ? ORDER BY updated_at DESC LIMIT 5",
          )
          .all(issue.run_id);
      }

      // Related UI map elements (match by URL)
      let uimapPage: unknown = null;
      let uimapElements: unknown[] = [];
      if (issue.location) {
        const loc = issue.location as string;
        const urlPattern = loc.startsWith("http") ? new URL(loc).pathname : loc;
        uimapPage = db
          .prepare(
            "SELECT p.*, m.name as map_name FROM ui_map_pages p JOIN ui_maps m ON p.ui_map_id = m.id WHERE p.url_pattern LIKE ? LIMIT 1",
          )
          .get("%" + urlPattern + "%");
        if (uimapPage) {
          uimapElements = db
            .prepare(
              "SELECT * FROM ui_map_elements WHERE page_id = ? AND status != 'removed' ORDER BY element_type LIMIT 20",
            )
            .all((uimapPage as Record<string, unknown>).id);
        }
      }

      // Artifacts scoped to this issue — match by location (page URL) or step_id
      let artifacts: unknown[] = [];
      let runArtifacts: unknown[] = [];

      if (issue.run_id) {
        // Legacy runpack artifacts — filter by location match
        const entries = db
          .prepare(
            "SELECT artifacts FROM run_pack_entries WHERE run_id = ? AND artifacts IS NOT NULL AND test_case_id != '__header__'",
          )
          .all(issue.run_id) as Array<{ artifacts: string }>;
        for (const e of entries) {
          try {
            const parsed = JSON.parse(e.artifacts) as Array<
              Record<string, unknown>
            >;
            // Keep artifacts that match the issue's location or have no location filter
            if (issue.location) {
              const loc = issue.location as string;
              artifacts = artifacts.concat(
                parsed.filter(
                  (a) =>
                    !a.path ||
                    (a.label &&
                      String(a.label)
                        .toLowerCase()
                        .includes(loc.split("/").pop()?.toLowerCase() || "")),
                ),
              );
              // If no location matches, include all (better than nothing)
              if (artifacts.length === 0) artifacts = parsed;
            } else {
              artifacts = artifacts.concat(parsed);
            }
          } catch {}
        }

        // New run_artifacts table — filter by page_url matching issue location
        if (issue.location) {
          const loc = issue.location as string;
          const urlPart = loc.startsWith("http")
            ? (() => {
                try {
                  return new URL(loc).pathname;
                } catch {
                  return loc;
                }
              })()
            : loc;
          runArtifacts = db
            .prepare(
              "SELECT * FROM run_artifacts WHERE run_id = ? AND page_url LIKE ? ORDER BY action_index, created_at",
            )
            .all(issue.run_id, "%" + urlPart + "%");
          // Fallback: if no URL match, get the closest by action time
          if (runArtifacts.length === 0) {
            runArtifacts = db
              .prepare(
                "SELECT * FROM run_artifacts WHERE run_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT 10",
              )
              .all(issue.run_id, issue.created_at);
          }
        } else {
          // No location — get artifacts around the issue creation time
          runArtifacts = db
            .prepare(
              "SELECT * FROM run_artifacts WHERE run_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT 10",
            )
            .all(issue.run_id, issue.created_at);
        }
      }

      // Full UI map data for sitemap canvas (all pages + navs for the map)
      let uimapFull = null;
      if (uimapPage) {
        const mapId = (uimapPage as Record<string, unknown>).ui_map_id;
        const allPages = db
          .prepare("SELECT * FROM ui_map_pages WHERE ui_map_id = ?")
          .all(mapId);
        const allNavs = db
          .prepare("SELECT * FROM ui_map_navigations WHERE ui_map_id = ?")
          .all(mapId);
        const allElements = db
          .prepare("SELECT * FROM ui_map_elements WHERE ui_map_id = ?")
          .all(mapId);
        uimapFull = {
          pages: allPages,
          navigations: allNavs,
          elements: allElements,
          highlightPageId: (uimapPage as Record<string, unknown>).id,
        };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          issue,
          run,
          step,
          runpackEntry,
          analyses,
          techIssues,
          uimapPage,
          uimapElements,
          artifacts,
          runArtifacts,
          uimapFull,
        }),
      );
      return;
    }

    // ── Test Cases API ──

    if (url.pathname === "/api/testcases" && req.method === "GET") {
      const ticket = url.searchParams.get("ticket");
      const runId = url.searchParams.get("run");
      const db = getDb();
      let cases: unknown[];
      if (ticket) {
        cases = db
          .prepare(
            "SELECT * FROM test_cases WHERE ticket_ref = ? ORDER BY priority, created_at",
          )
          .all(ticket);
      } else if (runId) {
        cases = db
          .prepare(
            "SELECT * FROM test_cases WHERE run_id = ? ORDER BY priority, created_at",
          )
          .all(runId);
      } else {
        cases = db
          .prepare(
            "SELECT * FROM test_cases ORDER BY priority, created_at LIMIT 100",
          )
          .all();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cases));
      return;
    }

    if (url.pathname === "/api/testcases/delete" && req.method === "DELETE") {
      const ticket = url.searchParams.get("ticket");
      if (!ticket) {
        res.writeHead(400);
        res.end('{"error":"ticket required"}');
        return;
      }
      const db = getDb();
      const result = db
        .prepare("DELETE FROM test_cases WHERE ticket_ref = ?")
        .run(ticket);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: result.changes }));
      return;
    }

    if (url.pathname === "/api/testcases/stats" && req.method === "GET") {
      const db = getDb();
      const byStatus = db
        .prepare("SELECT status, COUNT(*) as c FROM test_cases GROUP BY status")
        .all() as Array<{ status: string; c: number }>;
      const byType = db
        .prepare("SELECT type, COUNT(*) as c FROM test_cases GROUP BY type")
        .all() as Array<{ type: string; c: number }>;
      const byLayer = db
        .prepare(
          "SELECT COALESCE(test_layer, 'ui') as layer, COUNT(*) as c FROM test_cases GROUP BY test_layer",
        )
        .all() as Array<{ layer: string; c: number }>;
      const total = (
        db.prepare("SELECT COUNT(*) as c FROM test_cases").get() as {
          c: number;
        }
      ).c;
      const tickets = db
        .prepare(
          "SELECT DISTINCT ticket_ref FROM test_cases ORDER BY ticket_ref",
        )
        .all() as Array<{ ticket_ref: string }>;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          total,
          byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.c])),
          byType: Object.fromEntries(byType.map((r) => [r.type, r.c])),
          byLayer: Object.fromEntries(byLayer.map((r) => [r.layer, r.c])),
          tickets: tickets.map((t) => t.ticket_ref),
        }),
      );
      return;
    }

    // ── Report API ──

    if (url.pathname === "/api/report" && req.method === "GET") {
      const ticketId = url.searchParams.get("ticket");
      if (!ticketId) {
        res.writeHead(400);
        res.end('{"error":"ticket required"}');
        return;
      }
      try {
        const report = gatherTicketReport(ticketId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(report));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    if (url.pathname === "/api/report/saved" && req.method === "GET") {
      const ticketId = url.searchParams.get("ticket");
      if (!ticketId) {
        res.writeHead(400);
        res.end('{"error":"ticket required"}');
        return;
      }
      const db = getDb();
      const reports = db
        .prepare(
          "SELECT id, ticket_id, run_id, verdict, summary, analysis, improvements, created_at FROM reports WHERE ticket_id = ? ORDER BY created_at DESC",
        )
        .all(ticketId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reports));
      return;
    }

    if (url.pathname === "/api/report/tickets" && req.method === "GET") {
      const db = getDb();
      // Get all tickets that have runs (potential report targets)
      const tickets = db
        .prepare(
          `SELECT input_ref as ticket,
           COUNT(*) as run_count,
           MAX(created_at) as last_run
         FROM runs
         WHERE input_ref IS NOT NULL AND input_ref != ''
         GROUP BY input_ref
         ORDER BY MAX(created_at) DESC`,
        )
        .all();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tickets));
      return;
    }

    // ── Repos API ──

    if (url.pathname === "/api/repos/delete" && req.method === "DELETE") {
      const name = url.searchParams.get("name");
      if (!name) {
        res.writeHead(400);
        res.end('{"error":"name required"}');
        return;
      }
      const db = getDb();
      const repo = db
        .prepare("SELECT id, local_path FROM repos WHERE name = ?")
        .get(name) as { id: string; local_path: string | null } | undefined;
      if (!repo) {
        res.writeHead(404);
        res.end('{"error":"not found"}');
        return;
      }
      // Delete DB entries
      db.prepare("DELETE FROM repo_group_members WHERE repo_id = ?").run(
        repo.id,
      );
      db.prepare("DELETE FROM code_fts WHERE repo_name = ?").run(name);
      db.prepare("DELETE FROM import_graph WHERE repo_name = ?").run(name);
      db.prepare("DELETE FROM repos WHERE id = ?").run(repo.id);
      // Delete local folder from dedicated location
      const repoPath = dataDir() + "/repos/" + name;
      let localDeleted = false;
      if (existsSync(repoPath)) {
        try {
          rmSync(repoPath, { recursive: true, force: true });
          localDeleted = true;
        } catch {}
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: true, localDeleted }));
      return;
    }

    if (url.pathname === "/api/repos" && req.method === "GET") {
      const db = getDb();
      const repos = db
        .prepare("SELECT * FROM repos ORDER BY name")
        .all() as Array<{
        id: string;
        name: string;
        url: string;
        description: string | null;
        local_path: string | null;
        last_synced: string | null;
        current_branch: string | null;
        last_commit: string | null;
        last_indexed: string | null;
      }>;
      const groups = db
        .prepare("SELECT * FROM repo_groups ORDER BY name")
        .all() as Array<{
        id: string;
        name: string;
        description: string | null;
      }>;

      // Use cached stats — fallback to live query if cache is empty for any repo
      let needsRefresh = false;
      const reposWithStats = repos.map((r) => {
        const cachedFiles = getStat(`repo:${r.name}:indexed_files`);
        const cachedImports = getStat(`repo:${r.name}:indexed_imports`);
        if (cachedFiles === null && r.local_path) needsRefresh = true;
        const pathExists = r.local_path ? existsSync(r.local_path) : false;
        return {
          ...r,
          indexed_files: cachedFiles ? parseInt(cachedFiles) : 0,
          indexed_imports: cachedImports ? parseInt(cachedImports) : 0,
          path_exists: pathExists,
        };
      });

      // If any repo has no cached stats but has a local_path, populate cache in background
      // and return live-computed values for this request
      if (needsRefresh) {
        const liveStats = repos.map((r) => {
          let ftsCount = 0,
            importCount = 0;
          try {
            ftsCount = (
              db
                .prepare(
                  "SELECT COUNT(DISTINCT file_path) as c FROM code_fts WHERE repo_name = ?",
                )
                .get(r.name) as { c: number }
            ).c;
          } catch {}
          try {
            importCount = (
              db
                .prepare(
                  "SELECT COUNT(*) as c FROM import_graph WHERE repo_name = ?",
                )
                .get(r.name) as { c: number }
            ).c;
          } catch {}
          // Populate the cache for next time
          try {
            db.prepare(
              "INSERT INTO resource_stats (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            ).run(`repo:${r.name}:indexed_files`, String(ftsCount));
            db.prepare(
              "INSERT INTO resource_stats (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            ).run(`repo:${r.name}:indexed_imports`, String(importCount));
          } catch {}
          return {
            ...r,
            indexed_files: ftsCount,
            indexed_imports: importCount,
          };
        });
        reposWithStats.length = 0;
        reposWithStats.push(...liveStats);
      }

      const groupsWithMembers = groups.map((g) => {
        const members = db
          .prepare(
            `
          SELECT r.name FROM repos r
          JOIN repo_group_members m ON r.id = m.repo_id
          WHERE m.group_id = ?
        `,
          )
          .all(g.id) as Array<{ name: string }>;
        return { ...g, repos: members.map((m) => m.name) };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ repos: reposWithStats, groups: groupsWithMembers }),
      );
      return;
    }

    // ── Analyses API ──

    if (url.pathname === "/api/analyses" && req.method === "GET") {
      const db = getDb();
      const runId = url.searchParams.get("run");

      if (runId) {
        const analyses = db
          .prepare(
            "SELECT * FROM analyses WHERE run_id = ? ORDER BY created_at",
          )
          .all(runId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(analyses));
      } else {
        // All analyses with run info
        const analyses = db
          .prepare(
            `
          SELECT a.*, r.input_type, r.input_ref, r.target_url, r.session_id
          FROM analyses a
          JOIN runs r ON a.run_id = r.id
          ORDER BY a.created_at DESC LIMIT 100
        `,
          )
          .all();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(analyses));
      }
      return;
    }

    if (url.pathname === "/api/analyses/delete" && req.method === "DELETE") {
      const db = getDb();
      const runId = url.searchParams.get("run");
      if (!runId) {
        res.writeHead(400);
        res.end('{"error":"run param required"}');
        return;
      }
      const result = db
        .prepare("DELETE FROM analyses WHERE run_id = ?")
        .run(runId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: result.changes }));
      return;
    }

    // ── Metrics API ──

    if (url.pathname === "/api/metrics" && req.method === "GET") {
      const db = getDb();
      const agg = db
        .prepare(
          `
        SELECT COUNT(*) as sessions,
               SUM(total_actions) as actions,
               SUM(total_issues) as issues,
               SUM(total_duration_ms) as duration_ms,
               SUM(estimated_tokens) as tokens,
               SUM(input_tokens) as input_tokens,
               SUM(output_tokens) as output_tokens,
               SUM(cache_read_tokens) as cache_read_tokens,
               SUM(cache_create_tokens) as cache_create_tokens,
               SUM(tool_calls) as tools,
               SUM(estimated_cost_usd) as cost_usd
        FROM sessions
      `,
        )
        .get() as Record<string, number>;

      const runs = (
        db.prepare("SELECT COUNT(*) as c FROM runs").get() as { c: number }
      ).c;
      const testcases = (
        db.prepare("SELECT COUNT(*) as c FROM test_cases").get() as {
          c: number;
        }
      ).c;
      const totalIssues = (
        db.prepare("SELECT COUNT(*) as c FROM issues").get() as { c: number }
      ).c;

      // Per-session breakdown
      const sessionMetrics = db
        .prepare(
          `
        SELECT id, task_summary, status, model, total_actions, total_issues,
               total_duration_ms, estimated_tokens, input_tokens, output_tokens,
               cache_read_tokens, cache_create_tokens, tool_calls, estimated_cost_usd,
               created_at, last_heartbeat
        FROM sessions ORDER BY created_at DESC LIMIT 50
      `,
        )
        .all();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          aggregate: {
            sessions: agg.sessions ?? 0,
            runs,
            testcases,
            actions: agg.actions ?? 0,
            issues: totalIssues,
            durationMs: agg.duration_ms ?? 0,
            durationMin: Math.round(((agg.duration_ms ?? 0) / 60000) * 10) / 10,
            tokens: agg.tokens ?? 0,
            inputTokens: agg.input_tokens ?? 0,
            outputTokens: agg.output_tokens ?? 0,
            cacheReadTokens: agg.cache_read_tokens ?? 0,
            cacheCreateTokens: agg.cache_create_tokens ?? 0,
            toolCalls: agg.tools ?? 0,
            costUsd: Math.round((agg.cost_usd ?? 0) * 100) / 100,
          },
          sessions: sessionMetrics,
        }),
      );
      return;
    }

    if (url.pathname === "/api/metrics/resources" && req.method === "GET") {
      const forceRefresh = url.searchParams.has("refresh");

      // If no cached data yet, or force refresh, or any repo has 0 bytes but has a local_path, recompute
      // Always refresh if: no DB stats cached, forced, or any repo missing disk_bytes key
      const dbStatsCached = getStat("db:bytes");
      let needsRefresh = forceRefresh || !dbStatsCached;
      if (!needsRefresh) {
        const db2 = getDb();
        const reposWithPaths = db2
          .prepare(
            "SELECT name, local_path FROM repos WHERE local_path IS NOT NULL",
          )
          .all() as Array<{ name: string; local_path: string }>;
        for (const r of reposWithPaths) {
          const cached = getStat(`repo:${r.name}:disk_bytes`);
          if (cached === null) {
            needsRefresh = true;
            break;
          } // key never set
        }
      }
      if (needsRefresh) {
        try {
          refreshAllStats();
        } catch {}
      }

      const cached = getResourceStatsFromCache();
      const reposTotal = cached.repos.repos.reduce(
        (s, r) => ({
          bytes: s.bytes + Math.max(0, r.bytes),
          fileCount: s.fileCount + r.fileCount,
        }),
        { bytes: 0, fileCount: 0 },
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          database: cached.database,
          evidence: cached.evidence,
          ticketContext: cached.ticketContext,
          repos: {
            bytes: reposTotal.bytes,
            fileCount: reposTotal.fileCount,
            repos: cached.repos.repos,
          },
          index: cached.index,
          lastUpdated: cached.lastUpdated,
        }),
      );
      return;
    }

    // ── UI Maps API ──

    if (url.pathname === "/api/uimaps" && req.method === "GET") {
      const db = getDb();
      const maps = db
        .prepare("SELECT * FROM ui_maps ORDER BY updated_at DESC")
        .all() as Array<Record<string, unknown>>;
      // Add stats to each map
      const result = maps.map((m) => {
        const pages = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM ui_map_pages WHERE ui_map_id = ?",
            )
            .get(m.id) as { c: number }
        ).c;
        const elements = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ?",
            )
            .get(m.id) as { c: number }
        ).c;
        const navs = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM ui_map_navigations WHERE ui_map_id = ?",
            )
            .get(m.id) as { c: number }
        ).c;
        const forms = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM ui_map_forms WHERE ui_map_id = ?",
            )
            .get(m.id) as { c: number }
        ).c;
        const working = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ? AND status = 'working'",
            )
            .get(m.id) as { c: number }
        ).c;
        const flaky = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ? AND status = 'flaky'",
            )
            .get(m.id) as { c: number }
        ).c;
        const broken = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ? AND status = 'broken'",
            )
            .get(m.id) as { c: number }
        ).c;
        return {
          ...m,
          stats: {
            pages,
            elements,
            navigations: navs,
            forms,
            working,
            flaky,
            broken,
          },
        };
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    if (url.pathname === "/api/uimaps/delete" && req.method === "DELETE") {
      const mapId = url.searchParams.get("id");
      if (!mapId) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();
      const pages = db
        .prepare("SELECT id FROM ui_map_pages WHERE ui_map_id = ?")
        .all(mapId) as Array<{ id: string }>;
      for (const p of pages) {
        db.prepare("DELETE FROM ui_map_forms WHERE page_id = ?").run(p.id);
        db.prepare("DELETE FROM ui_map_elements WHERE page_id = ?").run(p.id);
      }
      db.prepare("DELETE FROM ui_map_navigations WHERE ui_map_id = ?").run(
        mapId,
      );
      db.prepare("DELETE FROM ui_map_pages WHERE ui_map_id = ?").run(mapId);
      const result = db.prepare("DELETE FROM ui_maps WHERE id = ?").run(mapId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: result.changes > 0 }));
      return;
    }

    if (url.pathname === "/api/uimaps/page/delete" && req.method === "DELETE") {
      const pageId = url.searchParams.get("id");
      if (!pageId) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();
      db.prepare("DELETE FROM ui_map_forms WHERE page_id = ?").run(pageId);
      db.prepare(
        "DELETE FROM ui_map_navigations WHERE from_page_id = ? OR to_page_id = ?",
      ).run(pageId, pageId);
      db.prepare("DELETE FROM ui_map_elements WHERE page_id = ?").run(pageId);
      const result = db
        .prepare("DELETE FROM ui_map_pages WHERE id = ?")
        .run(pageId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: result.changes > 0 }));
      return;
    }

    if (url.pathname === "/api/uimaps/detail" && req.method === "GET") {
      const mapId = url.searchParams.get("id");
      if (!mapId) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();
      const map = db.prepare("SELECT * FROM ui_maps WHERE id = ?").get(mapId);
      const pages = db
        .prepare(
          "SELECT * FROM ui_map_pages WHERE ui_map_id = ? ORDER BY url_pattern",
        )
        .all(mapId) as Array<Record<string, unknown>>;
      const elements = db
        .prepare(
          "SELECT * FROM ui_map_elements WHERE ui_map_id = ? ORDER BY page_id, element_type",
        )
        .all(mapId);
      const navs = db
        .prepare(
          "SELECT * FROM ui_map_navigations WHERE ui_map_id = ? ORDER BY from_page_id",
        )
        .all(mapId);
      const forms = db
        .prepare(
          "SELECT * FROM ui_map_forms WHERE ui_map_id = ? ORDER BY page_id",
        )
        .all(mapId);

      // Enrich pages with issue counts, tech issue status, console error counts
      for (const p of pages) {
        const urlPattern = p.url_pattern as string;
        // Issue counts by severity
        const issues = db
          .prepare(
            "SELECT severity, COUNT(*) as c FROM issues WHERE location LIKE ? GROUP BY severity",
          )
          .all("%" + urlPattern + "%") as Array<{
          severity: string;
          c: number;
        }>;
        p.issue_counts = Object.fromEntries(
          issues.map((i) => [i.severity, i.c]),
        );
        p.total_issues = issues.reduce((s, i) => s + i.c, 0);

        // Tech issues
        const techIssues = db
          .prepare(
            "SELECT status, COUNT(*) as c FROM tech_issues WHERE url LIKE ? GROUP BY status",
          )
          .all("%" + urlPattern + "%") as Array<{ status: string; c: number }>;
        p.tech_issues = Object.fromEntries(
          techIssues.map((t) => [t.status, t.c]),
        );
        p.has_unresolved_tech = techIssues.some(
          (t) => t.status === "unresolved",
        );

        // Console errors from run_artifacts
        const consoleErrors = (
          db
            .prepare(
              "SELECT COUNT(*) as c FROM run_artifacts WHERE page_url LIKE ? AND artifact_type IN ('console', 'network_error')",
            )
            .get("%" + urlPattern + "%") as { c: number }
        ).c;
        p.console_errors = consoleErrors;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ map, pages, elements, navigations: navs, forms }),
      );
      return;
    }

    // ── Plans API ──

    if (url.pathname === "/api/plans/tickets" && req.method === "GET") {
      const db = getDb();
      const tickets = db
        .prepare(
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
         ORDER BY MAX(p.created_at) DESC`,
        )
        .all();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tickets));
      return;
    }

    if (url.pathname === "/api/plans/delete" && req.method === "DELETE") {
      const planId = url.searchParams.get("id");
      if (!planId) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();
      db.prepare("DELETE FROM blockers WHERE plan_id = ?").run(planId);
      db.prepare("DELETE FROM coverage_gaps WHERE plan_id = ?").run(planId);
      db.prepare("DELETE FROM test_steps WHERE plan_id = ?").run(planId);
      const result = db
        .prepare("DELETE FROM test_plans WHERE id = ?")
        .run(planId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: result.changes > 0 }));
      return;
    }

    if (url.pathname === "/api/plans" && req.method === "GET") {
      const ticketId = url.searchParams.get("ticket");
      const planId = url.searchParams.get("id");
      const db = getDb();

      if (planId) {
        const plan = db
          .prepare("SELECT * FROM test_plans WHERE id = ?")
          .get(planId) as any;
        const steps = db
          .prepare(
            `SELECT s.*, tc.title as tc_title, tc.type as tc_type,
             p.url_pattern as uimap_url, p.page_title as uimap_title
           FROM test_steps s
           LEFT JOIN test_cases tc ON s.testcase_id = tc.id
           LEFT JOIN ui_map_pages p ON s.uimap_page_id = p.id
           WHERE s.plan_id = ?
           ORDER BY s.priority, s.step_order`,
          )
          .all(planId);
        // Include linked analysis if available
        let linkedAnalyses: unknown[] = [];
        if (plan?.analysis_run_id) {
          linkedAnalyses = db
            .prepare("SELECT * FROM analyses WHERE run_id = ?")
            .all(plan.analysis_run_id);
        }
        // Include normalized coverage gaps and blockers
        const coverageGaps = db
          .prepare(
            "SELECT * FROM coverage_gaps WHERE plan_id = ? ORDER BY created_at",
          )
          .all(planId);
        const normalizedBlockers = db
          .prepare(
            "SELECT * FROM blockers WHERE plan_id = ? ORDER BY created_at",
          )
          .all(planId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            plan,
            steps,
            linkedAnalyses,
            coverageGaps,
            blockers: normalizedBlockers,
          }),
        );
      } else if (ticketId) {
        const plans = db
          .prepare(
            `SELECT p.*, r.input_ref, r.target_url as run_target,
             (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id) as step_count,
             (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id AND confidence = 'confident') as confident_count,
             (SELECT COUNT(*) FROM test_steps WHERE plan_id = p.id AND confidence = 'uncertain') as uncertain_count
           FROM test_plans p
           JOIN runs r ON p.run_id = r.id
           WHERE p.ticket_id = ?
           ORDER BY p.created_at DESC`,
          )
          .all(ticketId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(plans));
      } else {
        res.writeHead(400);
        res.end('{"error":"ticket or id required"}');
      }
      return;
    }

    // ── Impact Areas API ──

    if (url.pathname === "/api/impact-areas" && req.method === "GET") {
      const db = getDb();
      const analysisId = url.searchParams.get("analysis");
      const runId = url.searchParams.get("run");

      if (analysisId) {
        const areas = db
          .prepare(
            "SELECT * FROM impact_areas WHERE analysis_id = ? ORDER BY severity, area_type",
          )
          .all(analysisId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(areas));
      } else if (runId) {
        const areas = db
          .prepare(
            "SELECT * FROM impact_areas WHERE run_id = ? ORDER BY severity, area_type",
          )
          .all(runId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(areas));
      } else {
        // Stats view
        const stats = db
          .prepare(
            `SELECT area_type, severity, COUNT(*) as count
           FROM impact_areas GROUP BY area_type, severity ORDER BY count DESC`,
          )
          .all();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(stats));
      }
      return;
    }

    // ── Coverage Gaps API ──

    if (url.pathname === "/api/coverage-gaps" && req.method === "GET") {
      const db = getDb();
      const planId = url.searchParams.get("plan");
      const runId = url.searchParams.get("run");

      if (planId) {
        const gaps = db
          .prepare(
            "SELECT * FROM coverage_gaps WHERE plan_id = ? ORDER BY created_at",
          )
          .all(planId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(gaps));
      } else if (runId) {
        const gaps = db
          .prepare(
            "SELECT * FROM coverage_gaps WHERE run_id = ? ORDER BY created_at",
          )
          .all(runId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(gaps));
      } else {
        const stats = db
          .prepare(
            `SELECT cg.category, COUNT(*) as count, COUNT(DISTINCT cg.plan_id) as plan_count
           FROM coverage_gaps cg GROUP BY cg.category ORDER BY count DESC`,
          )
          .all();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(stats));
      }
      return;
    }

    // ── Phase Transitions API ──

    if (url.pathname === "/api/phase-transitions" && req.method === "GET") {
      const db = getDb();
      const runId = url.searchParams.get("run");
      const sessionId = url.searchParams.get("session");

      if (runId) {
        const transitions = db
          .prepare(
            "SELECT * FROM phase_transitions WHERE run_id = ? ORDER BY transitioned_at",
          )
          .all(runId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(transitions));
      } else if (sessionId) {
        const transitions = db
          .prepare(
            "SELECT * FROM phase_transitions WHERE session_id = ? ORDER BY transitioned_at",
          )
          .all(sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(transitions));
      } else {
        const recent = db
          .prepare(
            "SELECT * FROM phase_transitions ORDER BY transitioned_at DESC LIMIT 50",
          )
          .all();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(recent));
      }
      return;
    }

    // ── API Maps API ──

    if (url.pathname === "/api/apimaps" && req.method === "GET") {
      const db = getDb();
      const id = url.searchParams.get("id");
      if (id) {
        // Full map data for canvas
        const map = db.prepare("SELECT * FROM api_maps WHERE id = ?").get(id);
        if (!map) {
          res.writeHead(404);
          res.end('{"error":"not found"}');
          return;
        }
        const endpoints = db
          .prepare(
            "SELECT * FROM api_map_endpoints WHERE api_map_id = ? ORDER BY path, method",
          )
          .all(id);
        const params = db
          .prepare("SELECT * FROM api_map_params WHERE api_map_id = ?")
          .all(id);
        const responses = db
          .prepare("SELECT * FROM api_map_responses WHERE api_map_id = ?")
          .all(id);
        const chains = db
          .prepare("SELECT * FROM api_map_chains WHERE api_map_id = ?")
          .all(id);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ map, endpoints, params, responses, chains }));
      } else {
        // List all maps with stats
        const maps = db
          .prepare(
            `
          SELECT m.*,
            (SELECT COUNT(*) FROM api_map_endpoints WHERE api_map_id = m.id) as endpoint_count,
            (SELECT COUNT(*) FROM api_map_chains WHERE api_map_id = m.id) as chain_count,
            (SELECT SUM(times_called) FROM api_map_endpoints WHERE api_map_id = m.id) as total_calls,
            (SELECT SUM(CASE WHEN status = 'flaky' THEN 1 ELSE 0 END) FROM api_map_endpoints WHERE api_map_id = m.id) as flaky_count,
            (SELECT SUM(CASE WHEN status = 'failing' THEN 1 ELSE 0 END) FROM api_map_endpoints WHERE api_map_id = m.id) as failing_count
          FROM api_maps m ORDER BY m.updated_at DESC
        `,
          )
          .all();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(maps));
      }
      return;
    }

    if (url.pathname === "/api/apimaps/endpoint" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();
      const endpoint = db
        .prepare("SELECT * FROM api_map_endpoints WHERE id = ?")
        .get(id);
      const params = db
        .prepare(
          "SELECT * FROM api_map_params WHERE endpoint_id = ? ORDER BY location, name",
        )
        .all(id);
      const responses = db
        .prepare(
          "SELECT * FROM api_map_responses WHERE endpoint_id = ? ORDER BY status_code",
        )
        .all(id);
      const chainsFrom = db
        .prepare(
          `SELECT c.*, e.method as to_method, e.path as to_path FROM api_map_chains c
         JOIN api_map_endpoints e ON c.to_endpoint_id = e.id WHERE c.from_endpoint_id = ?`,
        )
        .all(id);
      const chainsTo = db
        .prepare(
          `SELECT c.*, e.method as from_method, e.path as from_path FROM api_map_chains c
         JOIN api_map_endpoints e ON c.from_endpoint_id = e.id WHERE c.to_endpoint_id = ?`,
        )
        .all(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ endpoint, params, responses, chainsFrom, chainsTo }),
      );
      return;
    }

    // ── Ticket Context API ──

    if (
      url.pathname === "/api/ticket-context/tickets" &&
      req.method === "GET"
    ) {
      const db = getDb();
      const tickets = db
        .prepare(
          `SELECT ticket_id,
                COUNT(*) as entry_count,
                SUM(size_bytes) as total_bytes,
                MIN(fetched_at) as oldest,
                MAX(fetched_at) as newest,
                SUM(CASE WHEN datetime(fetched_at, '+' || ttl_minutes || ' minutes') > datetime('now') THEN 1 ELSE 0 END) as fresh_count,
                SUM(CASE WHEN datetime(fetched_at, '+' || ttl_minutes || ' minutes') <= datetime('now') THEN 1 ELSE 0 END) as stale_count
         FROM ticket_context_index
         GROUP BY ticket_id
         ORDER BY MAX(fetched_at) DESC`,
        )
        .all();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tickets));
      return;
    }

    if (url.pathname === "/api/ticket-context" && req.method === "GET") {
      const ticketId = url.searchParams.get("ticket");
      if (!ticketId) {
        res.writeHead(400);
        res.end('{"error":"ticket required"}');
        return;
      }
      const db = getDb();
      const entries = db
        .prepare(
          `SELECT *,
                CASE WHEN datetime(fetched_at, '+' || ttl_minutes || ' minutes') > datetime('now') THEN 'fresh' ELSE 'stale' END as cache_status
         FROM ticket_context_index
         WHERE ticket_id = ?
         ORDER BY context_type`,
        )
        .all(ticketId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(entries));
      return;
    }

    if (
      url.pathname === "/api/ticket-context/invalidate" &&
      req.method === "DELETE"
    ) {
      const ticketId = url.searchParams.get("ticket");
      const type = url.searchParams.get("type") ?? undefined;
      if (!ticketId) {
        res.writeHead(400);
        res.end('{"error":"ticket required"}');
        return;
      }
      // Inline invalidation to avoid importing the repo here
      const db = getDb();
      // unlinkSync imported at top of file
      let deleted = 0;
      if (!type) {
        const rows = db
          .prepare(
            "SELECT file_path FROM ticket_context_index WHERE ticket_id = ?",
          )
          .all(ticketId) as Array<{ file_path: string }>;
        for (const r of rows) {
          try {
            unlinkSync(r.file_path);
          } catch {}
        }
        deleted = db
          .prepare("DELETE FROM ticket_context_index WHERE ticket_id = ?")
          .run(ticketId).changes;
      } else {
        // Exact match
        const exact = db
          .prepare(
            "SELECT id, file_path FROM ticket_context_index WHERE ticket_id = ? AND context_type = ?",
          )
          .get(ticketId, type) as { id: string; file_path: string } | undefined;
        if (exact) {
          try {
            unlinkSync(exact.file_path);
          } catch {}
          db.prepare("DELETE FROM ticket_context_index WHERE id = ?").run(
            exact.id,
          );
          deleted = 1;
        } else {
          // Prefix match
          const rows = db
            .prepare(
              "SELECT id, file_path FROM ticket_context_index WHERE ticket_id = ? AND context_type LIKE ?",
            )
            .all(ticketId, type + ":%") as Array<{
            id: string;
            file_path: string;
          }>;
          for (const r of rows) {
            try {
              unlinkSync(r.file_path);
            } catch {}
          }
          if (rows.length > 0) {
            db.prepare(
              "DELETE FROM ticket_context_index WHERE ticket_id = ? AND context_type LIKE ?",
            ).run(ticketId, type + ":%");
          }
          deleted = rows.length;
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted }));
      return;
    }

    if (url.pathname === "/api/ticket-context/purge" && req.method === "POST") {
      const db = getDb();
      // unlinkSync imported at top of file
      const stale = db
        .prepare(
          `SELECT id, file_path FROM ticket_context_index
         WHERE datetime(fetched_at, '+' || ttl_minutes || ' minutes') < datetime('now')`,
        )
        .all() as Array<{ id: string; file_path: string }>;
      for (const r of stale) {
        try {
          unlinkSync(r.file_path);
        } catch {}
      }
      if (stale.length > 0) {
        db.prepare(
          `DELETE FROM ticket_context_index
           WHERE datetime(fetched_at, '+' || ttl_minutes || ' minutes') < datetime('now')`,
        ).run();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ purged: stale.length }));
      return;
    }

    // ── Blockers API ──

    if (url.pathname === "/api/blockers" && req.method === "GET") {
      const db = getDb();
      const planId = url.searchParams.get("plan");
      const ticketId = url.searchParams.get("ticket");
      const runId = url.searchParams.get("run");
      const openOnly = url.searchParams.get("open") === "true";

      if (planId) {
        const blockers = db
          .prepare(
            "SELECT * FROM blockers WHERE plan_id = ? ORDER BY created_at",
          )
          .all(planId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(blockers));
      } else if (ticketId) {
        const blockers = db
          .prepare(
            "SELECT * FROM blockers WHERE ticket_id = ? ORDER BY created_at",
          )
          .all(ticketId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(blockers));
      } else if (runId) {
        const blockers = db
          .prepare(
            "SELECT * FROM blockers WHERE run_id = ? ORDER BY created_at",
          )
          .all(runId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(blockers));
      } else {
        // All blockers with plan ticket info
        let sql = `SELECT b.*, p.ticket_id as plan_ticket
                   FROM blockers b
                   JOIN test_plans p ON b.plan_id = p.id`;
        if (openOnly) sql += " WHERE b.status = 'open'";
        sql += " ORDER BY b.created_at DESC LIMIT 200";
        const blockers = db.prepare(sql).all();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(blockers));
      }
      return;
    }

    if (url.pathname === "/api/blockers/resolve" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const { id, resolution } = JSON.parse(body);
          if (!id) {
            res.writeHead(400);
            res.end('{"error":"id required"}');
            return;
          }
          getDb()
            .prepare(
              "UPDATE blockers SET status = 'resolved', resolved_at = datetime('now'), resolution = ? WHERE id = ?",
            )
            .run(resolution ?? null, id);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // ── Run Artifacts API ──

    if (url.pathname === "/api/run-artifacts" && req.method === "GET") {
      const db = getDb();
      const runId = url.searchParams.get("run");
      const entryId = url.searchParams.get("entry");
      const type = url.searchParams.get("type");

      let artifacts;
      const packId = url.searchParams.get("pack");
      const unattachedOnly = url.searchParams.get("unattached") === "true";
      if (entryId) {
        artifacts = db
          .prepare(
            "SELECT * FROM run_artifacts WHERE entry_id = ? ORDER BY action_index, created_at",
          )
          .all(entryId);
      } else if (packId) {
        if (unattachedOnly) {
          artifacts = db
            .prepare(
              "SELECT * FROM run_artifacts WHERE run_pack_id = ? AND entry_id IS NULL ORDER BY action_index, created_at",
            )
            .all(packId);
        } else {
          artifacts = db
            .prepare(
              "SELECT * FROM run_artifacts WHERE run_pack_id = ? ORDER BY action_index, created_at",
            )
            .all(packId);
        }
      } else if (runId) {
        if (type) {
          artifacts = db
            .prepare(
              "SELECT * FROM run_artifacts WHERE run_id = ? AND artifact_type = ? ORDER BY action_index, created_at",
            )
            .all(runId, type);
        } else {
          artifacts = db
            .prepare(
              "SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY action_index, created_at",
            )
            .all(runId);
        }
      } else {
        res.writeHead(400);
        res.end('{"error":"run, entry, or pack required"}');
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(artifacts));
      return;
    }

    // ── Artifact file serving ──
    // Serves local files referenced by artifacts. Only serves image/video/text types.
    if (url.pathname === "/api/artifact" && req.method === "GET") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "path parameter required" }));
        return;
      }

      const resolved = resolvePath(filePath);
      if (!existsSync(resolved) || !statSync(resolved).isFile()) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "File not found" }));
        return;
      }

      const ext = extname(resolved).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".har": "application/json",
        ".json": "application/json",
        ".txt": "text/plain",
        ".log": "text/plain",
        ".html": "text/html",
      };

      const contentType = mimeTypes[ext] ?? "application/octet-stream";

      try {
        const data = readFileSync(resolved);
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": data.length.toString(),
          "Cache-Control": "max-age=3600",
        });
        res.end(data);
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read file" }));
      }
      return;
    }

    // ── Coverage Map ──

    if (url.pathname === "/api/coverage/repos" && req.method === "GET") {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT r.name, r.local_path,
                COALESCE(fts.file_count, 0) as totalFiles,
                COALESCE(cm.covered_count, 0) as coveredFiles,
                COALESCE(fts.file_count, 0) - COALESCE(cm.covered_count, 0) as uncoveredFiles,
                COALESCE(cm.link_count, 0) as totalLinks,
                CASE WHEN COALESCE(fts.file_count, 0) > 0
                  THEN ROUND(COALESCE(cm.covered_count, 0) * 100.0 / fts.file_count)
                  ELSE 0 END as coveragePercent
         FROM repos r
         LEFT JOIN (SELECT repo_name, COUNT(DISTINCT file_path) as file_count FROM code_fts GROUP BY repo_name) fts ON fts.repo_name = r.name
         LEFT JOIN (SELECT repo_name, COUNT(DISTINCT file_path) as covered_count, COUNT(*) as link_count FROM coverage_map GROUP BY repo_name) cm ON cm.repo_name = r.name
         ORDER BY r.name`,
        )
        .all() as Array<Record<string, unknown>>;
      const result = rows.map((r) => ({
        ...r,
        path_exists: r.local_path ? existsSync(r.local_path as string) : false,
        local_path: undefined, // don't leak full path to frontend
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    if (url.pathname === "/api/coverage/uncovered" && req.method === "GET") {
      const repo = url.searchParams.get("repo");
      if (!repo) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "repo required" }));
        return;
      }
      const limit = parseInt(url.searchParams.get("limit") ?? "50") || 50;
      const offset = parseInt(url.searchParams.get("offset") ?? "0") || 0;
      const search = url.searchParams.get("search") ?? "";
      const db = getDb();
      const searchFilter = search ? " AND cf.file_path LIKE ?" : "";

      // Use LEFT JOIN instead of correlated subquery for importer_count
      const fileParams: unknown[] = [repo, repo];
      if (search) fileParams.push(`%${search}%`);
      fileParams.push(repo, limit, offset);
      const files = db
        .prepare(
          `SELECT cf.file_path, cf.language, COALESCE(ig_count.cnt, 0) as importer_count
         FROM (SELECT DISTINCT file_path, language FROM code_fts WHERE repo_name = ?) cf
         LEFT JOIN coverage_map cm ON cm.repo_name = ? AND cm.file_path = cf.file_path
         LEFT JOIN (
           SELECT COALESCE(imported, resolved) as target_file, COUNT(*) as cnt
           FROM import_graph WHERE repo_name = ?
           GROUP BY COALESCE(imported, resolved)
         ) ig_count ON ig_count.target_file = cf.file_path
         WHERE cm.file_path IS NULL${searchFilter.replace("cf.file_path", "cf.file_path")}
         ORDER BY importer_count DESC
         LIMIT ? OFFSET ?`,
        )
        .all(...fileParams);

      const countParams: unknown[] = [repo, repo];
      if (search) countParams.push(`%${search}%`);
      const totalCount = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM (
           SELECT DISTINCT cf.file_path FROM code_fts cf
           LEFT JOIN coverage_map cm ON cm.repo_name = ? AND cm.file_path = cf.file_path
           WHERE cf.repo_name = ? AND cm.file_path IS NULL${searchFilter.replace("cf.file_path", "cf.file_path")}
         )`,
          )
          .get(...countParams) as { c: number }
      ).c;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ files, total: totalCount, limit, offset }));
      return;
    }

    if (url.pathname === "/api/coverage/by-file" && req.method === "GET") {
      const repo = url.searchParams.get("repo");
      const file = url.searchParams.get("file");
      if (!repo || !file) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "repo and file required" }));
        return;
      }
      const db = getDb();
      const links = db
        .prepare(
          `SELECT cm.test_case_id, tc.title, tc.type, cm.link_type, cm.confidence
         FROM coverage_map cm JOIN test_cases tc ON cm.test_case_id = tc.id
         WHERE cm.repo_name = ? AND cm.file_path = ?
         ORDER BY cm.confidence DESC, tc.priority ASC`,
        )
        .all(repo, file);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(links));
      return;
    }

    // ── RCA ──

    if (url.pathname === "/api/rca/summary" && req.method === "GET") {
      const pack = url.searchParams.get("pack");
      if (!pack) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "pack required" }));
        return;
      }
      const db = getDb();
      const total = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM rca_results WHERE run_pack_id = ?",
          )
          .get(pack) as { c: number }
      ).c;
      const byClass = db
        .prepare(
          "SELECT classification, COUNT(*) as c FROM rca_results WHERE run_pack_id = ? GROUP BY classification",
        )
        .all(pack);
      const byAction = db
        .prepare(
          "SELECT suggested_action, COUNT(*) as c FROM rca_results WHERE run_pack_id = ? AND suggested_action IS NOT NULL GROUP BY suggested_action",
        )
        .all(pack);
      const avgConf = (
        db
          .prepare(
            "SELECT AVG(confidence) as avg FROM rca_results WHERE run_pack_id = ?",
          )
          .get(pack) as { avg: number | null }
      ).avg;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          total,
          byClassification: byClass,
          byAction,
          avgConfidence: avgConf ?? 0,
        }),
      );
      return;
    }

    if (url.pathname === "/api/rca/details" && req.method === "GET") {
      const pack = url.searchParams.get("pack");
      if (!pack) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "pack required" }));
        return;
      }
      const db = getDb();
      const results = db
        .prepare(
          `SELECT r.*, tc.title as tc_title, tc.type as tc_type, tc.test_layer as tc_layer
         FROM rca_results r JOIN test_cases tc ON r.test_case_id = tc.id
         WHERE r.run_pack_id = ? ORDER BY r.confidence DESC`,
        )
        .all(pack);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(results));
      return;
    }

    if (url.pathname === "/api/rca/entry" && req.method === "GET") {
      const entryId = url.searchParams.get("entry");
      if (!entryId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "entry required" }));
        return;
      }
      const db = getDb();
      const results = db
        .prepare(
          `SELECT * FROM rca_results WHERE entry_id = ? ORDER BY confidence DESC`,
        )
        .all(entryId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(results));
      return;
    }

    // ── Accessibility ──

    if (url.pathname === "/api/a11y/summary" && req.method === "GET") {
      const db = getDb();
      const run = url.searchParams.get("run");
      const pack = url.searchParams.get("pack");
      const ticket = url.searchParams.get("ticket");
      const filter = run
        ? "run_id = ?"
        : pack
          ? "run_pack_id = ?"
          : ticket
            ? "ticket_id = ?"
            : "1=1";
      const params = run ? [run] : pack ? [pack] : ticket ? [ticket] : [];
      const total = (
        db
          .prepare(`SELECT COUNT(*) as c FROM a11y_issues WHERE ${filter}`)
          .get(...params) as { c: number }
      ).c;
      const byImpact = db
        .prepare(
          `SELECT impact, COUNT(*) as c FROM a11y_issues WHERE ${filter} GROUP BY impact ORDER BY CASE impact WHEN 'critical' THEN 1 WHEN 'serious' THEN 2 WHEN 'moderate' THEN 3 WHEN 'minor' THEN 4 END`,
        )
        .all(...params);
      const byRule = db
        .prepare(
          `SELECT rule_id, COUNT(*) as count, impact FROM a11y_issues WHERE ${filter} GROUP BY rule_id ORDER BY count DESC LIMIT 20`,
        )
        .all(...params);
      const pageCount = (
        db
          .prepare(
            `SELECT COUNT(DISTINCT page_url) as c FROM a11y_issues WHERE ${filter}`,
          )
          .get(...params) as { c: number }
      ).c;
      // Tickets list (for top-level view)
      const tickets = db
        .prepare(
          `SELECT COALESCE(ticket_id, 'unlinked') as ticket_id, COUNT(*) as issue_count,
        SUM(CASE WHEN impact = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN impact = 'serious' THEN 1 ELSE 0 END) as serious,
        COUNT(DISTINCT page_url) as pages
        FROM a11y_issues GROUP BY COALESCE(ticket_id, 'unlinked') ORDER BY critical DESC, issue_count DESC`,
        )
        .all();
      // Run packs for a ticket (level 2)
      const packs = ticket
        ? db
            .prepare(
              `SELECT run_pack_id, COUNT(*) as issue_count,
        SUM(CASE WHEN impact = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN impact = 'serious' THEN 1 ELSE 0 END) as serious,
        COUNT(DISTINCT page_url) as pages,
        MIN(created_at) as first_seen, MAX(created_at) as last_seen
        FROM a11y_issues WHERE ticket_id = ?
        GROUP BY run_pack_id ORDER BY MAX(created_at) DESC`,
            )
            .all(ticket)
        : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ total, byImpact, byRule, pageCount, tickets, packs }),
      );
      return;
    }

    if (url.pathname === "/api/a11y/issues" && req.method === "GET") {
      const db = getDb();
      const run = url.searchParams.get("run");
      const pack = url.searchParams.get("pack");
      const page = url.searchParams.get("page");
      const ticket = url.searchParams.get("ticket");
      // Build filter with multiple conditions (pack + page can combine)
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (run) {
        conditions.push("run_id = ?");
        params.push(run);
      }
      if (pack) {
        conditions.push("run_pack_id = ?");
        params.push(pack);
      }
      if (page) {
        conditions.push("page_url = ?");
        params.push(page);
      }
      if (ticket) {
        conditions.push("ticket_id = ?");
        params.push(ticket);
      }
      const filter = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
      const issues = db
        .prepare(
          `SELECT * FROM a11y_issues WHERE ${filter} ORDER BY CASE impact WHEN 'critical' THEN 1 WHEN 'serious' THEN 2 WHEN 'moderate' THEN 3 WHEN 'minor' THEN 4 END, rule_id LIMIT 200`,
        )
        .all(...params);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(issues));
      return;
    }

    // ── False Positives ──

    if (url.pathname === "/api/false-positives/stats" && req.method === "GET") {
      const pack = url.searchParams.get("pack");
      if (!pack) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "pack required" }));
        return;
      }
      const db = getDb();
      const totalFailed = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND (status = 'failed' OR original_status = 'failed') AND test_case_id != '__header__'",
          )
          .get(pack) as { c: number }
      ).c;
      const retried = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND retry_count > 0 AND test_case_id != '__header__'",
          )
          .get(pack) as { c: number }
      ).c;
      const falsePositives = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND is_false_positive = 1 AND test_case_id != '__header__'",
          )
          .get(pack) as { c: number }
      ).c;
      const byConfidence = db
        .prepare(
          "SELECT failure_confidence, COUNT(*) as c FROM run_pack_entries WHERE run_pack_id = ? AND failure_confidence IS NOT NULL AND test_case_id != '__header__' GROUP BY failure_confidence",
        )
        .all(pack);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          totalFailed,
          retried,
          falsePositives,
          confirmedFailures: totalFailed - falsePositives,
          byConfidence,
        }),
      );
      return;
    }

    // ── Test Audit ──

    if (url.pathname === "/api/test-audit" && req.method === "GET") {
      const ticket = url.searchParams.get("ticket") ?? undefined;
      const db = getDb();

      // Duplicates (Jaccard similarity)
      const filter = ticket ? " WHERE ticket_ref = ?" : "";
      const params = ticket ? [ticket] : [];
      const testCases = db
        .prepare(
          `SELECT id, title, description, type, bdd_scenario, trad_steps FROM test_cases${filter}`,
        )
        .all(...params) as Array<{
        id: string;
        title: string;
        description: string | null;
        type: string;
        bdd_scenario: string | null;
        trad_steps: string | null;
      }>;

      const tokenized = testCases.map((tc) => {
        const text = [
          tc.title,
          tc.description ?? "",
          tc.bdd_scenario ?? "",
          tc.trad_steps ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2);
        return { tc, tokens: new Set(text) };
      });

      const duplicates: Array<{
        a: { id: string; title: string; type: string };
        b: { id: string; title: string; type: string };
        similarity: number;
      }> = [];
      for (let i = 0; i < tokenized.length && i < 100; i++) {
        for (let j = i + 1; j < tokenized.length && j < 100; j++) {
          const a = tokenized[i],
            b = tokenized[j];
          if (a.tokens.size === 0 || b.tokens.size === 0) continue;
          let inter = 0;
          for (const t of a.tokens) if (b.tokens.has(t)) inter++;
          const union = a.tokens.size + b.tokens.size - inter;
          const sim = union > 0 ? inter / union : 0;
          if (sim >= 0.65)
            duplicates.push({
              a: { id: a.tc.id, title: a.tc.title, type: a.tc.type },
              b: { id: b.tc.id, title: b.tc.title, type: b.tc.type },
              similarity: Math.round(sim * 100) / 100,
            });
        }
      }
      duplicates.sort((a, b) => b.similarity - a.similarity);

      // Execution stats from run_pack_entries (the actual execution data)
      const execFilter = ticket ? " AND rpe.ticket_id = ?" : "";
      const execParams: unknown[] = ticket ? [ticket] : [];

      // Never-failed: test cases that have been executed at least once but never failed
      const neverFailed = db
        .prepare(
          `
        SELECT tc.id, tc.title, tc.type, COALESCE(ex.exec_count, 0) as execution_count
        FROM test_cases tc
        JOIN (
          SELECT test_case_id, COUNT(*) as exec_count
          FROM run_pack_entries WHERE status IN ('passed', 'failed', 'blocked', 'skipped') AND test_case_id != '__header__'
          GROUP BY test_case_id
        ) ex ON ex.test_case_id = tc.id
        WHERE tc.id NOT IN (
          SELECT DISTINCT test_case_id FROM run_pack_entries WHERE status = 'failed' AND test_case_id != '__header__'
        )${ticket ? " AND tc.ticket_ref = ?" : ""}
        ORDER BY ex.exec_count DESC LIMIT 50
      `,
        )
        .all(...(ticket ? [ticket] : []));

      // Orphaned: test cases whose ticket has no run pack activity in 90 days
      const orphaned = ticket
        ? []
        : db
            .prepare(
              `
        SELECT tc.id, tc.title, tc.ticket_ref,
          (SELECT MAX(rpe.completed_at) FROM run_pack_entries rpe WHERE rpe.test_case_id = tc.id) as last_executed
        FROM test_cases tc
        WHERE tc.ticket_ref NOT IN (
          SELECT DISTINCT ticket_id FROM run_pack_entries
          WHERE created_at > datetime('now', '-90 days') AND test_case_id != '__header__'
        )
        ORDER BY last_executed ASC NULLS FIRST LIMIT 50
      `,
            )
            .all();

      // Stale: test cases not executed in >30 days (based on run_pack_entries)
      const stale = db
        .prepare(
          `
        SELECT tc.id, tc.title,
          (SELECT MAX(rpe.completed_at) FROM run_pack_entries rpe WHERE rpe.test_case_id = tc.id AND rpe.status IN ('passed', 'failed', 'blocked')) as last_executed,
          CAST(julianday('now') - julianday(
            (SELECT MAX(rpe.completed_at) FROM run_pack_entries rpe WHERE rpe.test_case_id = tc.id AND rpe.status IN ('passed', 'failed', 'blocked'))
          ) AS INTEGER) as days_since
        FROM test_cases tc
        WHERE (SELECT MAX(rpe.completed_at) FROM run_pack_entries rpe WHERE rpe.test_case_id = tc.id) IS NOT NULL
          AND julianday('now') - julianday(
            (SELECT MAX(rpe.completed_at) FROM run_pack_entries rpe WHERE rpe.test_case_id = tc.id)
          ) > 30
        ${ticket ? " AND tc.ticket_ref = ?" : ""}
        ORDER BY last_executed ASC LIMIT 50
      `,
        )
        .all(...(ticket ? [ticket] : []));

      // Never-executed: test cases that have never been in a run pack
      const neverExecuted = db
        .prepare(
          `
        SELECT tc.id, tc.title, tc.type, tc.ticket_ref, tc.created_at
        FROM test_cases tc
        WHERE tc.ready = 1 AND tc.id NOT IN (
          SELECT DISTINCT test_case_id FROM run_pack_entries WHERE test_case_id != '__header__'
        )${ticket ? " AND tc.ticket_ref = ?" : ""}
        ORDER BY tc.created_at DESC LIMIT 50
      `,
        )
        .all(...(ticket ? [ticket] : []));

      const total = (
        db
          .prepare(`SELECT COUNT(*) as c FROM test_cases${filter}`)
          .get(...params) as { c: number }
      ).c;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          stats: {
            total,
            duplicateCount: duplicates.length,
            neverFailedCount: (neverFailed as unknown[]).length,
            orphanedCount: (orphaned as unknown[]).length,
            staleCount: (stale as unknown[]).length,
            neverExecutedCount: (neverExecuted as unknown[]).length,
          },
          duplicates,
          neverFailed,
          orphaned,
          stale,
          neverExecuted,
        }),
      );
      return;
    }

    // ── Visual Regression ──

    if (
      url.pathname === "/api/visual-regression/stats" &&
      req.method === "GET"
    ) {
      const db = getDb();
      const run = url.searchParams.get("run");
      const filter = run ? " WHERE run_id = ?" : "";
      const params = run ? [run] : [];
      const totalDiffs = (
        db
          .prepare(`SELECT COUNT(*) as c FROM visual_diffs${filter}`)
          .get(...params) as { c: number }
      ).c;
      const regressions = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM visual_diffs WHERE is_regression = 1${run ? " AND run_id = ?" : ""}`,
          )
          .get(...params) as { c: number }
      ).c;
      const reviewed = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM visual_diffs WHERE reviewed = 1${run ? " AND run_id = ?" : ""}`,
          )
          .get(...params) as { c: number }
      ).c;
      const totalBaselines = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM visual_baselines WHERE status = 'active'",
          )
          .get() as { c: number }
      ).c;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          totalDiffs,
          regressions,
          reviewed,
          unreviewed: totalDiffs - reviewed,
          totalBaselines,
        }),
      );
      return;
    }

    if (
      url.pathname === "/api/visual-regression/baselines" &&
      req.method === "GET"
    ) {
      const db = getDb();
      const baselines = db
        .prepare(
          `SELECT vb.*, ump.page_title, ump.url_pattern as page_url
         FROM visual_baselines vb
         LEFT JOIN ui_map_pages ump ON vb.ui_map_page_id = ump.id
         WHERE vb.status = 'active'
         ORDER BY vb.updated_at DESC LIMIT 100`,
        )
        .all();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(baselines));
      return;
    }

    if (
      url.pathname === "/api/visual-regression/diffs" &&
      req.method === "GET"
    ) {
      const db = getDb();
      const run = url.searchParams.get("run");
      const unreviewed = url.searchParams.has("unreviewed");
      let sql = `SELECT vd.*, vb.url_pattern, vb.viewport, vb.baseline_path
                 FROM visual_diffs vd JOIN visual_baselines vb ON vd.baseline_id = vb.id`;
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (run) {
        conditions.push("vd.run_id = ?");
        params.push(run);
      }
      if (unreviewed) {
        conditions.push("vd.reviewed = 0");
      }
      if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
      sql += " ORDER BY vd.is_regression DESC, vd.created_at DESC LIMIT 100";
      const diffs = db.prepare(sql).all(...params);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(diffs));
      return;
    }

    if (
      url.pathname === "/api/visual-regression/review" &&
      req.method === "POST"
    ) {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const { id, isRegression } = JSON.parse(body);
          if (!id) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "id required" }));
            return;
          }
          getDb()
            .prepare(
              "UPDATE visual_diffs SET reviewed = 1, is_regression = ? WHERE id = ?",
            )
            .run(isRegression ? 1 : 0, id);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end('{"error":"invalid json"}');
        }
      });
      return;
    }

    if (
      url.pathname === "/api/visual-regression/accept" &&
      req.method === "POST"
    ) {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const { id } = JSON.parse(body);
          if (!id) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "id required" }));
            return;
          }
          const db = getDb();
          const diff = db
            .prepare("SELECT * FROM visual_diffs WHERE id = ?")
            .get(id) as any;
          if (!diff) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: "diff not found" }));
            return;
          }
          const baseline = db
            .prepare("SELECT * FROM visual_baselines WHERE id = ?")
            .get(diff.baseline_id) as any;
          if (!baseline) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: "baseline not found" }));
            return;
          }
          db.prepare(
            "UPDATE visual_diffs SET reviewed = 1, is_regression = 0 WHERE id = ?",
          ).run(id);
          db.prepare(
            "UPDATE visual_baselines SET status = 'superseded', updated_at = datetime('now') WHERE id = ?",
          ).run(baseline.id);
          const newId = uuidv4();
          let hash: string | null = null;
          try {
            hash = createHash("sha256")
              .update(readFileSync(diff.current_path))
              .digest("hex");
          } catch {}
          db.prepare(
            "INSERT INTO visual_baselines (id, ui_map_page_id, url_pattern, viewport, baseline_path, baseline_hash, source_run_id, source_entry_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')",
          ).run(
            newId,
            baseline.ui_map_page_id,
            baseline.url_pattern,
            baseline.viewport,
            diff.current_path,
            hash,
            diff.run_id,
            diff.entry_id,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, newBaselineId: newId }));
        } catch {
          res.writeHead(400);
          res.end('{"error":"invalid json"}');
        }
      });
      return;
    }

    // ── Delete Session ──

    if (url.pathname === "/api/runpacks/delete" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const { ticket, pack } = JSON.parse(body);
          const db = getDb();
          db.pragma("foreign_keys = OFF");
          if (pack) {
            db.prepare(
              "DELETE FROM run_pack_entries WHERE run_pack_id = ?",
            ).run(pack);
          } else if (ticket) {
            db.prepare("DELETE FROM run_pack_entries WHERE ticket_id = ?").run(
              ticket,
            );
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "ticket or pack required" }));
            return;
          }
          db.pragma("foreign_keys = ON");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ deleted: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/session/delete" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const { id } = JSON.parse(body);
          if (!id) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "id required" }));
            return;
          }
          const db = getDb();
          db.pragma("foreign_keys = OFF");
          // Clear run FK first
          db.prepare(
            "UPDATE sessions SET current_run_id = NULL WHERE id = ?",
          ).run(id);
          // Get linked runs
          const runs = db
            .prepare("SELECT id FROM runs WHERE session_id = ?")
            .all(id) as Array<{ id: string }>;
          const runIds = runs.map((r) => r.id);
          if (runIds.length > 0) {
            const ph = runIds.map(() => "?").join(",");
            // Delete in safe order — children before parents, try/catch each
            const deletes = [
              "DELETE FROM rca_results WHERE run_pack_id IN (SELECT DISTINCT run_pack_id FROM run_pack_entries WHERE run_id IN (" +
                ph +
                "))",
              "DELETE FROM a11y_issues WHERE run_id IN (" + ph + ")",
              "DELETE FROM run_pack_entries WHERE run_id IN (" + ph + ")",
              "DELETE FROM run_artifacts WHERE run_id IN (" + ph + ")",
              "DELETE FROM raw_outputs WHERE run_id IN (" + ph + ")",
              "DELETE FROM issues WHERE run_id IN (" + ph + ")",
              "DELETE FROM phase_transitions WHERE run_id IN (" + ph + ")",
              "DELETE FROM impact_areas WHERE run_id IN (" + ph + ")",
              "DELETE FROM coverage_gaps WHERE run_id IN (" + ph + ")",
              "DELETE FROM test_steps WHERE run_id IN (" + ph + ")",
              "DELETE FROM test_plans WHERE run_id IN (" + ph + ")",
              "DELETE FROM analyses WHERE run_id IN (" + ph + ")",
              "DELETE FROM action_log WHERE run_id IN (" + ph + ")",
              "UPDATE failure_patterns SET first_seen_run = NULL WHERE first_seen_run IN (" +
                ph +
                ")",
              "UPDATE failure_patterns SET last_seen_run = NULL WHERE last_seen_run IN (" +
                ph +
                ")",
              "DELETE FROM runs WHERE id IN (" + ph + ")",
            ];
            for (const sql of deletes) {
              try {
                db.prepare(sql).run(...runIds);
              } catch {}
            }
          }
          // Also delete phase transitions by session
          try {
            db.prepare(
              "DELETE FROM phase_transitions WHERE session_id = ?",
            ).run(id);
          } catch {}
          db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
          db.pragma("foreign_keys = ON");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ deleted: true, runs: runIds.length }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    // ── Settings API ──

    if (url.pathname === "/api/settings" && req.method === "GET") {
      const sdb = getDb();
      const rows = sdb
        .prepare("SELECT key, value FROM settings")
        .all() as Array<{ key: string; value: string }>;
      const settings: Record<string, string> = {};
      for (const row of rows) settings[row.key] = row.value;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(settings));
      return;
    }

    if (url.pathname === "/api/settings" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { key, value } = JSON.parse(body);
          if (!key || !value) {
            res.writeHead(400);
            res.end('{"error":"key and value required"}');
            return;
          }
          const sdb = getDb();
          sdb
            .prepare(
              "INSERT INTO settings (id, key, value) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')",
            )
            .run(uuidv4(), key, value, value);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // ── Setup API ──

    if (url.pathname === "/api/setup/check" && req.method === "GET") {
      const claudeDir = join(homedir(), ".claude");
      const skillsDir = join(claudeDir, "skills");
      const pluginsCache = join(claudeDir, "plugins", "cache");
      const hooksDir = join(claudeDir, "hooks");

      // Package dir = where noob-tester is installed (the skills/ folder is relative to it)
      const packageDir = join(
        new URL(".", import.meta.url).pathname,
        "..",
        "..",
      );

      const home = homedir();
      function tilde(p: string): string {
        return p.replace(home, "~");
      }
      function extraNvmBins(): string[] {
        const candidates = [
          join(home, ".nvm", "versions", "node"),
          join(home, ".local", "share", "nvm"),
        ];
        const bins: string[] = [];
        for (const base of candidates) {
          if (!existsSync(base)) continue;
          try {
            for (const entry of readdirSync(base)) {
              const bin = join(base, entry, "bin");
              if (existsSync(bin)) bins.push(bin);
              const nested = join(base, entry);
              if (existsSync(join(nested, "bin")))
                bins.push(join(nested, "bin"));
            }
          } catch {
            /* ignore */
          }
        }
        return bins;
      }
      function cmdExists(cmd: string): boolean {
        try {
          execSync(`which ${cmd}`, { stdio: "ignore" });
          return true;
        } catch {
          /* fall through */
        }
        // Fallback: search nvm-managed bin dirs (handles cross-version installs)
        const extra = extraNvmBins();
        return extra.some((dir) => existsSync(join(dir, cmd)));
      }
      function findPluginVersion(basePath: string): string | null {
        if (!existsSync(basePath)) return null;
        try {
          const entries = readdirSync(basePath)
            .filter((e: string) => !e.startsWith("."))
            .sort();
          return entries.length > 0 ? entries[entries.length - 1] : null;
        } catch {
          return null;
        }
      }

      // Dependencies
      const deps = [
        {
          id: "git",
          label: "Git",
          installed: cmdExists("git"),
          install: "brew install git",
          required: true,
        },
        {
          id: "curl",
          label: "curl",
          installed: cmdExists("curl"),
          install: "brew install curl",
          required: true,
        },
        {
          id: "jq",
          label: "jq",
          installed: cmdExists("jq"),
          install: "brew install jq",
          required: true,
        },
        {
          id: "gh",
          label: "GitHub CLI (gh)",
          installed: cmdExists("gh"),
          install: "brew install gh",
          required: false,
        },
        {
          id: "glab",
          label: "GitLab CLI (glab)",
          installed: cmdExists("glab"),
          install: "brew install glab",
          required: false,
        },
        {
          id: "bb",
          label: "Bitbucket CLI (bb)",
          installed: cmdExists("bb"),
          install: "npm install -g @ganeshgaxy/bb-cli",
          required: false,
          source: "github.com/ganeshgaxy/bb-cli",
        },
        {
          id: "agent-browser",
          label: "Agent Browser",
          installed: cmdExists("agent-browser"),
          install: "npm install -g agent-browser",
          required: false,
        },
        {
          id: "op",
          label: "1Password CLI (op)",
          installed: cmdExists("op"),
          install: "brew install 1password-cli",
          required: false,
        },
      ];

      // ── Noob-tester skills (from ganeshgaxy/noob-tester-skills plugin) ──
      const marketplaceCmd =
        "claude plugin marketplace add ganeshgaxy/noob-tester-skills";
      const noobTesterPluginBase = join(pluginsCache, "noob-tester-skills");

      // Skills that have a matching plugin name in noob-tester-skills
      const pluginSkills = [
        {
          id: "noob-tester",
          pluginName: "noob-tester",
          skillPath: "skills/noob-tester",
        },
        {
          id: "noob-explore",
          pluginName: "noob-explore",
          skillPath: "skills/noob-explore",
        },
        {
          id: "noob-api-explore",
          pluginName: "noob-api-explore",
          skillPath: "skills/noob-api-explore",
        },
        {
          id: "noob-analyze",
          pluginName: "noob-analyze",
          skillPath: "skills/noob-analyze",
        },
        {
          id: "noob-plan",
          pluginName: "noob-plan",
          skillPath: "skills/noob-plan",
        },
        {
          id: "noob-testcase",
          pluginName: "noob-testcase",
          skillPath: "skills/noob-testcase",
        },
        {
          id: "noob-report",
          pluginName: "noob-report",
          skillPath: "skills/noob-report",
        },
        {
          id: "noob-rca",
          pluginName: "noob-rca",
          skillPath: "skills/noob-rca",
        },
        {
          id: "noob-mr-pr",
          pluginName: "noob-mr-pr",
          skillPath: "skills/noob-mr-pr",
        },
        {
          id: "noob-repos-setup",
          pluginName: "noob-repos-setup",
          skillPath: "skills/noob-repos-setup",
        },
        {
          id: "noob-ticket-cache",
          pluginName: "noob-ticket-cache",
          skillPath: "skills/noob-ticket-cache",
        },
        {
          id: "noob-claim",
          pluginName: "noob-claim",
          skillPath: "skills/noob-claim",
        },
        {
          id: "noob-pool",
          pluginName: "noob-pool",
          skillPath: "skills/noob-pool",
        },
      ];

      const skillItems = pluginSkills.map((s) => {
        const pkgDir = join(noobTesterPluginBase, s.pluginName);
        const ver = findPluginVersion(pkgDir);
        const src = ver ? join(pkgDir, ver, s.skillPath) : null;
        const dest = join(skillsDir, s.id);
        const destExists = existsSync(dest);
        const srcExists = src ? existsSync(src) : false;
        let upToDate = false;
        if (destExists && srcExists && src) {
          try {
            const target = readlinkSync(dest);
            upToDate = target === src;
          } catch {
            try {
              const srcContent = readFileSync(join(src!, "SKILL.md"), "utf8");
              const destContent = readFileSync(join(dest, "SKILL.md"), "utf8");
              upToDate = srcContent === destContent;
            } catch {
              upToDate = false;
            }
          }
        }
        const installCmd =
          "claude plugin install " + s.pluginName + "@noob-tester-skills";
        const symlinkCmd = src
          ? "ln -sf " + tilde(src) + " " + tilde(dest)
          : "";
        return {
          id: s.id,
          label: s.id,
          src,
          dest,
          installed: destExists,
          upToDate,
          srcExists,
          pluginInstalled: !!ver,
          installCmd,
          symlinkCmd,
          marketplaceCmd,
        };
      });

      // ── External skills ──
      const externalSkills = [];

      // bb skill (from noob-tester-skills)
      const bbPkgDir = join(noobTesterPluginBase, "bb");
      const bbVer = findPluginVersion(bbPkgDir);
      const bbSkillSrc = bbVer ? join(bbPkgDir, bbVer, "skills", "bb") : null;
      externalSkills.push({
        id: "bb-skill",
        label: "bb (Bitbucket skill)",
        dest: join(skillsDir, "bb"),
        installed: existsSync(join(skillsDir, "bb")),
        pluginInstalled: !!bbVer,
        src: bbSkillSrc,
        installCmd: "claude plugin install bb@noob-tester-skills",
        symlinkCmd: bbSkillSrc
          ? "ln -sf " + tilde(bbSkillSrc) + " " + tilde(join(skillsDir, "bb"))
          : "",
        marketplaceCmd: marketplaceCmd,
      });

      // glab skill (from cc-handbook)
      const glabPkgDir = join(pluginsCache, "cc-handbook", "handbook-glab");
      const glabVer = findPluginVersion(glabPkgDir);
      const glabSkillSrc = glabVer
        ? join(glabPkgDir, glabVer, "skills", "glab-skill")
        : null;
      externalSkills.push({
        id: "glab-skill",
        label: "glab (GitLab skill)",
        dest: join(skillsDir, "glab"),
        installed: existsSync(join(skillsDir, "glab")),
        pluginInstalled: !!glabVer,
        src: glabSkillSrc,
        installCmd: "claude plugin install handbook-glab@cc-handbook",
        symlinkCmd: glabSkillSrc
          ? "ln -sf " +
            tilde(glabSkillSrc) +
            " " +
            tilde(join(skillsDir, "glab"))
          : "",
        marketplaceCmd:
          "claude plugin marketplace add nikiforovall/claude-code-rules",
      });

      // agent-browser + dogfood skills (from vercel-labs/agent-browser via npx)
      externalSkills.push({
        id: "agent-browser-skill",
        label: "Agent Browser skill",
        dest: join(skillsDir, "agent-browser"),
        installed: existsSync(join(skillsDir, "agent-browser")),
        pluginInstalled: true,
        src: null,
        installCmd: "npx skills add vercel-labs/agent-browser",
        symlinkCmd: "",
        marketplaceCmd: "",
      });
      externalSkills.push({
        id: "dogfood-skill",
        label: "Dogfood skill",
        dest: join(skillsDir, "dogfood"),
        installed: existsSync(join(skillsDir, "dogfood")),
        pluginInstalled: true,
        src: null,
        installCmd: "npx skills add vercel-labs/agent-browser",
        symlinkCmd: "",
        marketplaceCmd: "",
      });

      // ── Hooks ──
      const metricsHookDest = join(hooksDir, "subagent-metrics.sh");
      const metricsPkgDir = join(noobTesterPluginBase, "subagent-metrics");
      const metricsVer = findPluginVersion(metricsPkgDir);
      const metricsHookSrc = metricsVer
        ? join(metricsPkgDir, metricsVer, "hooks", "subagent-metrics.sh")
        : null;
      const hooks = [
        {
          id: "subagent-metrics",
          label: "Subagent Metrics Hook",
          installed: existsSync(metricsHookDest),
          src: metricsHookSrc,
          dest: metricsHookDest,
          pluginInstalled: !!metricsVer,
          installCmd:
            "claude plugin install subagent-metrics@noob-tester-skills",
          symlinkCmd: metricsHookSrc
            ? "ln -sf " + tilde(metricsHookSrc) + " " + tilde(metricsHookDest)
            : "",
          marketplaceCmd: marketplaceCmd,
        },
      ];

      // DB status
      let dbOk = false;
      let dbTables = 0;
      try {
        const sdb = getDb();
        const tables = sdb
          .prepare(
            "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name != '_migrations' AND name NOT LIKE 'sqlite_%'",
          )
          .get() as { c: number };
        dbOk = true;
        dbTables = tables.c;
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          deps,
          skills: skillItems,
          externalSkills,
          hooks,
          db: { ok: dbOk, tables: dbTables },
        }),
      );
      return;
    }

    if (url.pathname === "/api/setup/install-skill" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { src, dest } = JSON.parse(body);
          if (!src || !dest) {
            res.writeHead(400);
            res.end('{"error":"src and dest required"}');
            return;
          }

          // Remove existing dest if present
          if (existsSync(dest)) {
            try {
              rmSync(dest, { recursive: true, force: true });
            } catch {}
          }
          // Create parent dir
          const parentDir = join(dest, "..");
          if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
          // Symlink
          symlinkSync(src, dest);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // ── Swarm API ──

    if (url.pathname === "/api/swarm" && req.method === "GET") {
      const db = getDb();
      // Mark stale sessions first (same threshold as listSessions)
      db.prepare(
        `UPDATE sessions SET status = 'stale'
         WHERE status = 'active'
           AND last_heartbeat < datetime('now', '-5 minutes')`,
      ).run();
      // Get active explore sessions (sessions with the 'explore' label)
      const rows = db
        .prepare(
          `SELECT id, task_summary, status, labels, ticket_refs, stream_port,
                  created_at, last_heartbeat, current_phase, current_run_id
           FROM sessions
           WHERE status = 'active' AND stream_port IS NOT NULL
           ORDER BY created_at ASC`,
        )
        .all() as Array<Record<string, unknown>>;

      // Group by ticket_id
      const byTicket: Record<string, unknown[]> = {};
      const noTicket: unknown[] = [];
      for (const row of rows) {
        const tickets: string[] = row.ticket_refs
          ? (() => {
              try {
                return JSON.parse(row.ticket_refs as string) as string[];
              } catch {
                return [];
              }
            })()
          : [];
        if (tickets.length === 0) {
          noTicket.push(row);
        } else {
          for (const t of tickets) {
            if (!byTicket[t]) byTicket[t] = [];
            byTicket[t].push(row);
          }
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ byTicket, noTicket, total: rows.length }));
      return;
    }

    // ── Swarm Session Info API ──

    if (url.pathname === "/api/swarm/session-info" && req.method === "GET") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"error":"sessionId required"}');
        return;
      }

      const db = getDb();
      const session = db
        .prepare(
          "SELECT id, current_run_id, ticket_refs, stream_port, task_summary FROM sessions WHERE id = ?",
        )
        .get(sessionId) as
        | {
            id: string;
            current_run_id: string | null;
            ticket_refs: string | null;
            stream_port: number | null;
            task_summary: string | null;
          }
        | undefined;

      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end('{"error":"session not found"}');
        return;
      }

      let ticket: string | null = null;
      if (session.ticket_refs) {
        try {
          const refs = JSON.parse(session.ticket_refs) as string[];
          ticket = refs[0] || null;
        } catch {}
      }

      let run: { id: string } | null = null;
      let testCase: Record<string, unknown> | null = null;

      if (session.current_run_id) {
        run = { id: session.current_run_id };

        // Get the most recent test case for this run (prefer claimed/running, fallback to latest)
        const claimed = db
          .prepare(
            `SELECT rpe.test_case_id, rpe.status as entry_status,
                  tc.title, tc.format, tc.description,
                  tc.bdd_given, tc.bdd_when, tc.bdd_then,
                  tc.bdd_feature, tc.bdd_scenario,
                  tc.trad_steps, tc.trad_expected,
                  tc.preconditions
           FROM run_pack_entries rpe
           JOIN test_cases tc ON rpe.test_case_id = tc.id
           WHERE rpe.run_id = ?
           ORDER BY CASE rpe.status WHEN 'claimed' THEN 0 WHEN 'running' THEN 1 ELSE 2 END, rpe.started_at DESC
           LIMIT 1`,
          )
          .get(session.current_run_id) as Record<string, unknown> | undefined;

        if (claimed) {
          const safeParseArr = (v: unknown): string[] => {
            if (!v) return [];
            try {
              const a = JSON.parse(v as string);
              return Array.isArray(a) ? a : [];
            } catch {
              return [];
            }
          };

          testCase = {
            title: claimed.title,
            format: claimed.format,
            status: claimed.entry_status,
            description: claimed.description,
            given: safeParseArr(claimed.bdd_given),
            when: safeParseArr(claimed.bdd_when),
            then: safeParseArr(claimed.bdd_then),
            feature: claimed.bdd_feature,
            scenario: claimed.bdd_scenario,
            steps: safeParseArr(claimed.trad_steps),
            expected: safeParseArr(claimed.trad_expected),
            preconditions: safeParseArr(claimed.preconditions),
          };
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          session: { id: session.id, task: session.task_summary },
          run,
          ticket,
          testCase,
        }),
      );
      return;
    }

    // ── Swarm Chat API (agent-browser -q chat) ──

    if (url.pathname === "/api/swarm/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const { sessionId, message } = JSON.parse(body) as {
            sessionId?: string;
            message?: string;
          };
          if (!sessionId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end('{"error":"sessionId required"}');
            return;
          }

          const db = getDb();
          const session = db
            .prepare(
              "SELECT id, current_run_id, ticket_refs, stream_port FROM sessions WHERE id = ?",
            )
            .get(sessionId) as
            | {
                id: string;
                current_run_id: string | null;
                ticket_refs: string | null;
                stream_port: number | null;
              }
            | undefined;

          if (!session || !session.stream_port) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end('{"error":"session not found or no stream port"}');
            return;
          }

          // Build context from the current claimed test case
          let testContext = "";
          if (session.current_run_id) {
            const claimed = db
              .prepare(
                `SELECT rpe.*, tc.title as tc_title, tc.format as tc_format,
                      tc.bdd_feature, tc.bdd_scenario, tc.bdd_given, tc.bdd_when, tc.bdd_then,
                      tc.trad_steps, tc.trad_expected, tc.description as tc_description
               FROM run_pack_entries rpe
               JOIN test_cases tc ON rpe.test_case_id = tc.id
               WHERE rpe.run_id = ? AND rpe.status = 'claimed'
               LIMIT 1`,
              )
              .get(session.current_run_id) as
              | Record<string, unknown>
              | undefined;

            if (claimed) {
              testContext = `\nCurrent test case: "${claimed.tc_title || "unknown"}"`;
              if (claimed.tc_format === "bdd") {
                if (claimed.bdd_feature)
                  testContext += `\nFeature: ${claimed.bdd_feature}`;
                if (claimed.bdd_scenario)
                  testContext += `\nScenario: ${claimed.bdd_scenario}`;
                if (claimed.bdd_given)
                  testContext += `\nGiven: ${claimed.bdd_given}`;
                if (claimed.bdd_when)
                  testContext += `\nWhen: ${claimed.bdd_when}`;
                if (claimed.bdd_then)
                  testContext += `\nThen: ${claimed.bdd_then}`;
              } else {
                if (claimed.trad_steps)
                  testContext += `\nSteps: ${claimed.trad_steps}`;
                if (claimed.trad_expected)
                  testContext += `\nExpected: ${claimed.trad_expected}`;
              }
            }
          }

          const chatMsg =
            message ||
            `Describe what you see on the screen right now. What page is this? What is the current state?${testContext ? " Also relate it to the following test case context:" + testContext : ""}`;

          // Run agent-browser -q chat
          const { execFile } = await import("child_process");
          const { promisify } = await import("util");
          const execFileAsync = promisify(execFile);

          try {
            const { stdout } = await execFileAsync(
              "agent-browser",
              ["-q", "chat", chatMsg],
              {
                timeout: 30000,
                env: { ...process.env },
              },
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                summary: stdout.trim(),
                testContext: testContext.trim(),
              }),
            );
          } catch (execErr: unknown) {
            const msg =
              execErr instanceof Error ? execErr.message : String(execErr);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "agent-browser chat failed",
                detail: msg,
              }),
            );
          }
        } catch (parseErr: unknown) {
          const msg =
            parseErr instanceof Error ? parseErr.message : String(parseErr);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON body", detail: msg }));
        }
      });
      return;
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  // Don't poll SSE clients - we send updates on initial connection and keep alive with heartbeats
  // Polling every 2 seconds was causing database lock contention, blocking other API requests

  // Mark stale sessions in the background every 60s — kept out of the request path so it never
  // blocks the event loop when the CLI tool holds a SQLite write lock simultaneously.
  setInterval(() => {
    try {
      const db = getDb();
      db.prepare(
        `UPDATE sessions SET status = 'stale'
         WHERE status = 'active' AND last_heartbeat < datetime('now', '-5 minutes')`,
      ).run();
    } catch {
      // DB busy — will retry next cycle
    }
  }, 60_000).unref(); // unref so the interval doesn't prevent process exit

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.log(chalk.red(`\n  Port ${opts.port} is already in use.`));
      console.log(
        chalk.dim(`  Fix: noob-tester cleanup watch --port ${opts.port}`),
      );
      console.log(
        chalk.dim(
          `  Or use a different port: noob-tester watch --port ${opts.port + 1}\n`,
        ),
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(opts.port, () => {
    console.log(chalk.bold.cyan("\n  noob-watch"));
    console.log(chalk.green(`  Dashboard: http://localhost:${opts.port}`));
    if (opts.sessionId) {
      console.log(chalk.dim(`  Watching session: ${opts.sessionId}`));
    }
    console.log(chalk.dim("  Press Ctrl+C to stop\n"));
  });
}

// ── Data gathering ──

function gatherState(filterSessionId?: string) {
  const db = getDb();

  // Stale-session marking moved to a background setInterval in startWatchServer —
  // keeping it here was blocking the event loop when the CLI held a SQLite write lock.

  let sessionsSql = "SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50";
  const sessionsParams: unknown[] = [];
  if (filterSessionId) {
    sessionsSql = "SELECT * FROM sessions WHERE id = ?";
    sessionsParams.push(filterSessionId);
  }

  const sessions = db.prepare(sessionsSql).all(...sessionsParams);
  const runs = db
    .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT 50")
    .all();
  const recentIssues = db
    .prepare("SELECT * FROM issues ORDER BY created_at DESC LIMIT 30")
    .all();
  const activeCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'")
      .get() as { c: number }
  ).c;
  const totalIssues = (
    db.prepare("SELECT COUNT(*) as c FROM issues").get() as { c: number }
  ).c;
  const totalRuns = (
    db.prepare("SELECT COUNT(*) as c FROM runs").get() as { c: number }
  ).c;

  return {
    sessions,
    runs,
    recentIssues,
    stats: { activeSessions: activeCount, totalIssues, totalRuns },
    timestamp: new Date().toISOString(),
  };
}

function gatherSessionDetail(sessionId: string) {
  const db = getDb();
  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId);
  const runs = db
    .prepare("SELECT * FROM runs WHERE session_id = ? ORDER BY created_at DESC")
    .all(sessionId);
  const runIds = (runs as Array<{ id: string }>).map((r) => r.id);

  let issues: unknown[] = [];
  let actions: unknown[] = [];
  let analyses: unknown[] = [];
  let phaseTransitions: unknown[] = [];

  if (runIds.length > 0) {
    const placeholders = runIds.map(() => "?").join(",");
    issues = db
      .prepare(
        `SELECT * FROM issues WHERE run_id IN (${placeholders}) ORDER BY created_at DESC`,
      )
      .all(...runIds);
    actions = db
      .prepare(
        `SELECT * FROM action_log WHERE run_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 100`,
      )
      .all(...runIds);
    analyses = db
      .prepare(`SELECT * FROM analyses WHERE run_id IN (${placeholders})`)
      .all(...runIds);
    phaseTransitions = db
      .prepare(
        `SELECT * FROM phase_transitions WHERE run_id IN (${placeholders}) ORDER BY transitioned_at`,
      )
      .all(...runIds);
  }

  // Also get phase transitions by session_id directly
  const sessionTransitions = db
    .prepare(
      "SELECT * FROM phase_transitions WHERE session_id = ? ORDER BY transitioned_at",
    )
    .all(sessionId);
  // Merge, dedup by id
  const allTransitions = [...phaseTransitions, ...sessionTransitions];
  const seen = new Set<string>();
  const dedupedTransitions = allTransitions.filter((t: any) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  return {
    session,
    runs,
    issues,
    actions,
    analyses,
    phaseTransitions: dedupedTransitions,
  };
}

function getIssuesForRun(runId: string) {
  return getDb()
    .prepare(
      "SELECT * FROM issues WHERE run_id = ? ORDER BY severity, category",
    )
    .all(runId);
}

function getActionsForRun(runId: string) {
  return getDb()
    .prepare(
      "SELECT * FROM action_log WHERE run_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(runId);
}
