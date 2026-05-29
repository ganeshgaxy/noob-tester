import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { v4 as uuidv4, v4 as uuid } from "uuid";
import { createHash } from "crypto";
import { execSync, spawn, spawnSync } from "child_process";
import {
  readFileSync,
  existsSync,
  statSync,
  lstatSync,
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
import { fileURLToPath } from "url";
import { homedir, tmpdir } from "os";
import {
  getDb,
  dataDir,
  getActiveWorkspace,
  listWorkspaces,
  setActiveWorkspace,
  workspacesDir,
  renameWorkspace,
  copyWorkspace,
} from "../db/client.js";
import { getDashboardHtml } from "./dashboard.js";
import { getDocsHtml } from "./docs.js";
import {
  getAllSecretsMasked,
  addTarget,
  getTargetByName,
  setSecret,
  deleteSecret,
  deleteRole,
  deleteTarget,
  resolveProfile,
  resolveValue,
  getSecretRaw,
  importFromOnePassword,
  maskValue,
  getSourceType,
} from "../secrets/store.js";
import chalk from "chalk";
import { gatherTicketReport } from "../cli/commands/report.js";
import {
  shellPath,
  rmFileCmd,
  rmDirCmd,
  mkSymlinkCmd,
  copyFileCmd,
  checkPathCmd,
  pkgInstallCmd,
} from "../platform-cmds.js";
import {
  getResourceStatsFromCache,
  refreshAllStats,
  getStat,
} from "../db/repositories/resource-stats.js";
import {
  removeAgent as removeQaPoolAgent,
  buildInvocation,
} from "../db/repositories/qa-pool.js";
import { getRunPackLogsForTicket } from "../db/repositories/visual-testing.js";
import {
  upsertTicketWorkflow,
  getTicketWorkflowSummary,
  listTicketWorkflows,
  listTicketWorkflowSummaries,
  transitionStatus,
  deleteTicketWorkflow,
  touchTicketAddedAt,
  wasPolledToday,
  setTicketReady,
  listPollingHistoryForTicket,
  deleteWorkflowPollingRun,
  type TicketWorkflowStatus,
} from "../db/repositories/ticket-workflow.js";
import {
  getPageAgentConfig,
  setPageAgentConfig,
  deletePageAgentConfig,
} from "../db/repositories/page-agent-config.js";
import {
  createAgentRun,
  getAgentRun,
  listAgentRuns,
  listAgentRunsByTicket,
  finishAgentRun,
  killAgentRun,
  deleteAgentRun,
  hasAgentRunForTicket,
} from "../db/repositories/agent-runs.js";

interface WatchOptions {
  port: number;
  sessionId?: string;
}

const DD_POLL_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DD_GLOBAL_KEY = "_dd_global_";

interface ActiveRun {
  proc: ReturnType<typeof spawn>;
  buf: Array<{ type: string; text?: string; code?: number }>;
  watchers: Set<(obj: object) => void>;
}
const activeRuns = new Map<string, ActiveRun>();

async function pollDatadog(
  force = false,
  tags = "",
): Promise<{ ok: boolean; data?: unknown; cached?: boolean; error?: string }> {
  const DATADOG_TARGET = "_datadog_";
  const rawApiKey = getSecretRaw(DATADOG_TARGET, "connection", "DD_API_KEY");
  if (!rawApiKey)
    return {
      ok: false,
      error:
        "Datadog not configured. Add API key in Secrets → External Connections.",
    };
  const apiKey = resolveValue(rawApiKey);
  const rawAppKey = getSecretRaw(DATADOG_TARGET, "connection", "DD_APP_KEY");
  if (!rawAppKey)
    return {
      ok: false,
      error:
        "App Key required for monitors. Add DD_APP_KEY in Secrets → External Connections.",
    };
  const appKey = resolveValue(rawAppKey);
  const rawSite = getSecretRaw(DATADOG_TARGET, "connection", "DD_SITE");
  const rawSiteVal = rawSite ? resolveValue(rawSite) : "datadoghq.com";
  const site =
    rawSiteVal
      .replace(/^https?:\/\//, "")
      .replace(/^app\./, "")
      .replace(/\/.*$/, "")
      .trim() || "datadoghq.com";

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM datadog_monitors WHERE target_name = ?")
    .get(DD_GLOBAL_KEY) as
    | {
        dd_service: string | null;
        last_polled_at: string | null;
        last_data_json: string | null;
      }
    | undefined;

  // Return cached data if polled within TTL and not forced
  if (!force && row?.last_polled_at && row?.last_data_json) {
    const lastPolled = new Date(
      row.last_polled_at.replace(" ", "T") + "Z",
    ).getTime();
    if (Date.now() - lastPolled < DD_POLL_TTL_MS) {
      return { ok: true, data: JSON.parse(row.last_data_json), cached: true };
    }
  }

  const tagParam = tags.trim()
    ? `&monitor_tags=${encodeURIComponent(tags.trim())}`
    : "";
  const monitorsUrl = `https://api.${site}/api/v1/monitor?group_states=all&page_size=100&page=0${tagParam}`;
  const tmpFile = join(tmpdir(), `dd_monitors_${Date.now()}.json`);
  const curlResult = spawnSync(
    "curl",
    [
      "-s",
      "-4",
      "-o",
      tmpFile,
      "-w",
      "%{http_code}",
      "-H",
      `DD-API-KEY: ${apiKey}`,
      "-H",
      `DD-APPLICATION-KEY: ${appKey}`,
      "--max-time",
      "30",
      monitorsUrl,
    ],
    { encoding: "utf-8", timeout: 35000 },
  );

  if (curlResult.error || curlResult.status !== 0) {
    const errMsg =
      curlResult.stderr ||
      curlResult.error?.message ||
      `curl exit ${curlResult.status}`;
    return { ok: false, error: `curl failed: ${errMsg}` };
  }
  const statusCode = parseInt(curlResult.stdout.trim(), 10);
  let responseBody = "";
  try {
    responseBody = readFileSync(tmpFile, "utf-8");
  } catch {
    /**/
  }
  try {
    rmSync(tmpFile);
  } catch {
    /**/
  }

  if (statusCode === 403)
    return {
      ok: false,
      error:
        "403 Forbidden — your App Key is missing the monitors_read scope. In Datadog go to Organization Settings → Application Keys and add monitors_read permission.",
    };
  if (statusCode === 401)
    return {
      ok: false,
      error:
        "401 Unauthorized — API key or App Key is invalid. Check your keys in Secrets → External Connections.",
    };
  if (statusCode !== 200)
    return { ok: false, error: `HTTP ${statusCode}: ${responseBody}` };

  const monitors = JSON.parse(responseBody) as Array<{
    id: number;
    name: string;
    overall_state: string;
    type: string;
    tags: string[];
    query: string;
    message: string;
    created: string;
    modified: string;
    state_changed_at?: string;
    last_triggered_at?: string | null;
    creator?: { name?: string; email?: string };
    priority?: number | null;
  }>;
  const stateOrder: Record<string, number> = {
    Alert: 0,
    Warn: 1,
    "No Data": 2,
    OK: 3,
    Ignored: 4,
  };
  const sorted = [...monitors].sort(
    (a, b) =>
      (stateOrder[a.overall_state] ?? 5) - (stateOrder[b.overall_state] ?? 5),
  );

  // Build knownTags map: { service: ["api","web"], team: ["backend"], env: ["prod","staging"], ... }
  const tagMap: Record<string, Set<string>> = {};
  for (const m of monitors) {
    for (const tag of m.tags ?? []) {
      const colon = tag.indexOf(":");
      if (colon > 0) {
        const key = tag.slice(0, colon);
        const val = tag.slice(colon + 1);
        if (!tagMap[key]) tagMap[key] = new Set();
        tagMap[key].add(val);
      }
    }
  }
  const knownTags: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(tagMap)) knownTags[k] = [...v].sort();

  const summary = {
    total: monitors.length,
    ok: monitors.filter((m) => m.overall_state === "OK").length,
    alert: monitors.filter((m) => m.overall_state === "Alert").length,
    warn: monitors.filter((m) => m.overall_state === "Warn").length,
    noData: monitors.filter((m) => m.overall_state === "No Data").length,
    ignored: monitors.filter((m) => m.overall_state === "Ignored").length,
    truncated: monitors.length === 100,
    knownTags,
    monitors: sorted.map((m) => ({
      id: m.id,
      name: m.name,
      state: m.overall_state,
      type: m.type,
      tags: m.tags,
      query: m.query,
      message: m.message,
      created: m.created,
      modified: m.modified,
      state_changed_at: m.state_changed_at,
      last_triggered_at: m.last_triggered_at,
      creator: m.creator,
      priority: m.priority,
    })),
  };

  const existing = db
    .prepare("SELECT id FROM datadog_monitors WHERE target_name = ?")
    .get(DD_GLOBAL_KEY) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE datadog_monitors SET last_polled_at=datetime('now'), last_data_json=?, updated_at=datetime('now') WHERE target_name=?",
    ).run(JSON.stringify(summary), DD_GLOBAL_KEY);
  } else {
    db.prepare(
      "INSERT INTO datadog_monitors (id, target_name, enabled, last_polled_at, last_data_json) VALUES (?,?,1,datetime('now'),?)",
    ).run(uuid(), DD_GLOBAL_KEY, JSON.stringify(summary));
  }

  return { ok: true, data: summary };
}

export function startWatchServer(opts: WatchOptions): void {
  const sseClients: Set<ServerResponse> = new Set();

  const server = createServer(async (req, res) => {
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

    // ── Connections API (external service integrations) ──

    if (url.pathname === "/api/connections/datadog" && req.method === "GET") {
      const DATADOG_TARGET = "_datadog_";
      const t = getTargetByName(DATADOG_TARGET);
      if (!t) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ configured: false, secrets: {} }));
        return;
      }
      const db = getDb();
      const rows = db
        .prepare(
          "SELECT key, value, source_type FROM secrets WHERE target_id = ? AND role = 'connection' ORDER BY key",
        )
        .all(t.id) as Array<{
        key: string;
        value: string;
        source_type: string;
      }>;
      const secrets: Record<string, { masked: string; source: string }> = {};
      for (const r of rows)
        secrets[r.key] = { masked: maskValue(r.value), source: r.source_type };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ configured: rows.length > 0, secrets }));
      return;
    }

    if (url.pathname === "/api/connections/datadog" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { apiKey, appKey, site } = JSON.parse(body) as {
            apiKey?: string;
            appKey?: string;
            site?: string;
          };
          const DATADOG_TARGET = "_datadog_";
          const alreadyExists = !!getTargetByName(DATADOG_TARGET);
          if (!alreadyExists && !apiKey) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "apiKey required" }));
            return;
          }
          if (!alreadyExists) {
            addTarget(
              DATADOG_TARGET,
              undefined,
              "Datadog integration (managed)",
            );
          }
          if (apiKey)
            setSecret(DATADOG_TARGET, "connection", "DD_API_KEY", apiKey);
          if (appKey)
            setSecret(DATADOG_TARGET, "connection", "DD_APP_KEY", appKey);
          if (site) setSecret(DATADOG_TARGET, "connection", "DD_SITE", site);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (
      url.pathname === "/api/connections/datadog" &&
      req.method === "DELETE"
    ) {
      deleteTarget("_datadog_");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (
      url.pathname === "/api/connections/datadog/test" &&
      req.method === "GET"
    ) {
      try {
        const DATADOG_TARGET = "_datadog_";
        const rawApiKey = getSecretRaw(
          DATADOG_TARGET,
          "connection",
          "DD_API_KEY",
        );
        if (!rawApiKey) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ ok: false, error: "No API key configured" }),
          );
          return;
        }
        const apiKey = resolveValue(rawApiKey);
        const rawSite = getSecretRaw(DATADOG_TARGET, "connection", "DD_SITE");
        const rawSiteVal = rawSite ? resolveValue(rawSite) : "datadoghq.com";
        const site =
          rawSiteVal
            .replace(/^https?:\/\//, "")
            .replace(/^app\./, "")
            .replace(/\/.*$/, "")
            .trim() || "datadoghq.com";

        const validateUrl = `https://api.${site}/api/v1/validate`;
        let statusCode: number;
        let responseBody: string;
        try {
          const ddTmpFile = join(tmpdir(), `dd_validate_${Date.now()}.txt`);
          const ddCurl = spawnSync(
            "curl",
            ["-s", "-o", ddTmpFile, "-w", "%{http_code}", "-H", `DD-API-KEY: ${apiKey}`, "--max-time", "10", validateUrl],
            { encoding: "utf-8", timeout: 15000 },
          );
          if (ddCurl.error) throw new Error(ddCurl.error.message);
          const out = ddCurl.stdout.trim();
          statusCode = parseInt(out, 10);
          try {
            responseBody = readFileSync(ddTmpFile, "utf-8");
          } catch {
            responseBody = "";
          }
          try { rmSync(ddTmpFile); } catch { /**/ }
        } catch (curlErr) {
          throw new Error(
            `curl failed: ${curlErr instanceof Error ? curlErr.message : String(curlErr)}`,
          );
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        if (statusCode >= 200 && statusCode < 300) {
          res.end(JSON.stringify({ ok: true, site }));
        } else if (statusCode === 403) {
          res.end(
            JSON.stringify({
              ok: false,
              error: "Invalid API key (403 Forbidden)",
            }),
          );
        } else {
          res.end(
            JSON.stringify({
              ok: false,
              error: `HTTP ${statusCode}: ${responseBody}`,
            }),
          );
        }
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      return;
    }

    // ── Datadog Monitors API ──

    if (url.pathname === "/api/datadog/monitors" && req.method === "GET") {
      const db = getDb();
      const row = db
        .prepare("SELECT * FROM datadog_monitors WHERE target_name = ?")
        .get(DD_GLOBAL_KEY) as
        | {
            dd_service: string | null;
            last_polled_at: string | null;
            last_data_json: string | null;
          }
        | undefined;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          tagFilter: row?.dd_service ?? null,
          lastPolledAt: row?.last_polled_at ?? null,
          data: row?.last_data_json ? JSON.parse(row.last_data_json) : null,
        }),
      );
      return;
    }

    if (url.pathname === "/api/datadog/monitors" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { dd_tags } = JSON.parse(body) as { dd_tags?: string };
          const db = getDb();
          const existing = db
            .prepare("SELECT id FROM datadog_monitors WHERE target_name = ?")
            .get(DD_GLOBAL_KEY) as { id: string } | undefined;
          if (existing) {
            db.prepare(
              "UPDATE datadog_monitors SET dd_service=?, updated_at=datetime('now') WHERE target_name=?",
            ).run(dd_tags ?? null, DD_GLOBAL_KEY);
          } else {
            db.prepare(
              "INSERT INTO datadog_monitors (id, target_name, enabled, dd_service) VALUES (?,?,1,?)",
            ).run(uuid(), DD_GLOBAL_KEY, dd_tags ?? null);
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

    if (
      url.pathname === "/api/datadog/monitors/poll" &&
      req.method === "POST"
    ) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { force, tags } = JSON.parse(body) as {
            force?: boolean;
            tags?: string;
          };
          const result = await pollDatadog(force === true, tags ?? "");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
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

      // Fetch spawned agents
      const spawns = db
        .prepare(
          "SELECT * FROM pool_spawns ORDER BY ticket_id, created_at DESC",
        )
        .all() as any[];
      const spawnsByTicket: Record<string, any[]> = {};
      for (const s of spawns) {
        // Only show running spawns if process is actually alive
        if (s.status === "running" && s.pid) {
          try {
            process.kill(s.pid, 0);
          } catch {
            // Process is dead, skip it
            continue;
          }
          if (!spawnsByTicket[s.ticket_id]) spawnsByTicket[s.ticket_id] = [];
          spawnsByTicket[s.ticket_id].push(s);
        }
        // Don't show error/completed spawns
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          agents: enriched,
          byTicket,
          spawns: spawnsByTicket,
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

    if (url.pathname === "/api/qa-pool/kills" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { ticket_id, force } = JSON.parse(body);
          if (!ticket_id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "ticket_id required" }));
            return;
          }

          // Import pool-spawns repository functions dynamically
          import("../db/repositories/pool-spawns.js").then((module) => {
            const { killAllSpawnsForTicket } = module;
            const killed = killAllSpawnsForTicket(ticket_id);

            // Optionally kill processes with --force
            if (force) {
              const { getActiveSpawnPids } = module;
              const pids = getActiveSpawnPids(ticket_id);
              const { execSync } = require("child_process");
              const os = require("os");
              const platform = os.platform();
              const killCmd =
                platform === "win32" ? "taskkill /F /PID" : "kill -9";

              for (const pid of pids) {
                try {
                  execSync(`${killCmd} ${pid}`, { stdio: "ignore" });
                } catch {}
              }
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: true,
                killed,
                ticket_id,
              }),
            );
          });
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

    // ── Visual Test Cases API ──

    if (
      url.pathname === "/api/visual-testcases/delete" &&
      req.method === "DELETE"
    ) {
      const id = url.searchParams.get("id");
      const ticket = url.searchParams.get("ticket");
      if (!id && !ticket) {
        res.writeHead(400);
        res.end('{"error":"id or ticket required"}');
        return;
      }
      const db = getDb();
      let deleted = 0;
      if (id) {
        const result = db
          .prepare("DELETE FROM visual_test_cases WHERE id = ?")
          .run(id);
        deleted = result.changes;
      } else if (ticket) {
        const result = db
          .prepare("DELETE FROM visual_test_cases WHERE ticket_id = ?")
          .run(ticket);
        deleted = result.changes;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted }));
      return;
    }

    if (url.pathname === "/api/visual-testcases" && req.method === "GET") {
      const ticket = url.searchParams.get("ticket");
      const db = getDb();
      const cases = ticket
        ? db
            .prepare(
              "SELECT * FROM visual_test_cases WHERE ticket_id = ? AND status = 'active' ORDER BY created_at ASC",
            )
            .all(ticket)
        : db
            .prepare(
              "SELECT * FROM visual_test_cases WHERE status = 'active' ORDER BY created_at ASC LIMIT 200",
            )
            .all();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cases));
      return;
    }

    if (
      url.pathname === "/api/visual-testcases/stats" &&
      req.method === "GET"
    ) {
      const db = getDb();
      const byTicket = db
        .prepare(
          "SELECT ticket_id, COUNT(*) as c FROM visual_test_cases WHERE status = 'active' GROUP BY ticket_id",
        )
        .all() as Array<{ ticket_id: string; c: number }>;
      const total = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM visual_test_cases WHERE status = 'active'",
          )
          .get() as { c: number }
      ).c;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          total,
          byTicket: Object.fromEntries(byTicket.map((r) => [r.ticket_id, r.c])),
        }),
      );
      return;
    }

    // ── Visual Runs API ──

    if (url.pathname === "/api/visual-runs" && req.method === "GET") {
      const ticket = url.searchParams.get("ticket");
      const db = getDb();
      if (ticket) {
        const runs = db
          .prepare(
            "SELECT * FROM visual_runs WHERE ticket_id = ? ORDER BY created_at DESC",
          )
          .all(ticket);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(runs));
      } else {
        // Group by ticket: return tickets with their runs
        const runs = db
          .prepare(
            "SELECT * FROM visual_runs ORDER BY created_at DESC LIMIT 500",
          )
          .all() as Array<Record<string, unknown>>;
        const byTicket: Record<string, unknown[]> = {};
        for (const r of runs) {
          const tid = r.ticket_id as string;
          if (!byTicket[tid]) byTicket[tid] = [];
          byTicket[tid].push(r);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(byTicket));
      }
      return;
    }

    if (url.pathname === "/api/visual-runs/detail" && req.method === "GET") {
      const runId = url.searchParams.get("id");
      if (!runId) {
        res.writeHead(400);
        res.end('{"error":"id required"}');
        return;
      }
      const db = getDb();
      const run = db
        .prepare("SELECT * FROM visual_runs WHERE id = ?")
        .get(runId);
      if (!run) {
        res.writeHead(404);
        res.end('{"error":"run not found"}');
        return;
      }
      const entries = db
        .prepare(
          `SELECT vre.*, vtc.title as tc_title, vtc.viewport as tc_viewport,
                  vtc.steps_json as tc_steps_json
           FROM visual_run_entries vre
           LEFT JOIN visual_test_cases vtc ON vtc.id = vre.visual_tc_id
           WHERE vre.visual_run_id = ?
           ORDER BY vre.created_at ASC`,
        )
        .all(runId);
      const screenshots = db
        .prepare(
          "SELECT * FROM visual_screenshots WHERE visual_run_id = ? ORDER BY step_index ASC",
        )
        .all(runId);
      const comparisons = db
        .prepare(
          `SELECT vc.*,
                  bs.file_path AS baseline_path, bs.step_label AS baseline_step_label,
                  cs.file_path AS current_path, cs.step_label AS current_step_label
           FROM visual_comparisons vc
           INNER JOIN visual_screenshots bs ON bs.id = vc.baseline_id
           INNER JOIN visual_screenshots cs ON cs.id = vc.current_id
           WHERE vc.visual_run_id = ?
           ORDER BY vc.step_index ASC`,
        )
        .all(runId);
      const runPackLogs = getRunPackLogsForTicket(
        (run as Record<string, unknown>).ticket_id as string,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          run,
          entries,
          screenshots,
          comparisons,
          runPackLogs,
        }),
      );
      return;
    }

    if (url.pathname === "/api/visual-runs/delete" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const { run, ticket } = JSON.parse(body);
          const db = getDb();
          db.pragma("foreign_keys = OFF");
          if (run) {
            // Delete a single visual run and all its children
            db.prepare(
              "DELETE FROM visual_comparisons WHERE visual_run_id = ?",
            ).run(run);
            db.prepare(
              "DELETE FROM visual_screenshots WHERE visual_run_id = ?",
            ).run(run);
            db.prepare(
              "DELETE FROM visual_run_entries WHERE visual_run_id = ?",
            ).run(run);
            db.prepare("DELETE FROM visual_runs WHERE id = ?").run(run);
          } else if (ticket) {
            // Delete all visual runs for a ticket
            const runIds = (
              db
                .prepare("SELECT id FROM visual_runs WHERE ticket_id = ?")
                .all(ticket) as Array<{ id: string }>
            ).map((r) => r.id);
            if (runIds.length > 0) {
              const ph = runIds.map(() => "?").join(",");
              db.prepare(
                `DELETE FROM visual_comparisons WHERE visual_run_id IN (${ph})`,
              ).run(...runIds);
              db.prepare(
                `DELETE FROM visual_screenshots WHERE visual_run_id IN (${ph})`,
              ).run(...runIds);
              db.prepare(
                `DELETE FROM visual_run_entries WHERE visual_run_id IN (${ph})`,
              ).run(...runIds);
              db.prepare(`DELETE FROM visual_runs WHERE id IN (${ph})`).run(
                ...runIds,
              );
            }
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "run or ticket required" }));
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

    // ── Workspaces API ──

    if (url.pathname === "/api/workspaces" && req.method === "GET") {
      const workspaces = listWorkspaces();
      // Always include "default" even if the directory hasn't been created yet
      const names = workspaces.map((w) => w.name);
      const current = getActiveWorkspace();
      if (!names.includes("default")) {
        workspaces.unshift({ name: "default", current: current === "default" });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ workspaces, active: current }));
      return;
    }

    if (url.pathname === "/api/workspaces/current" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ workspace: getActiveWorkspace() }));
      return;
    }

    if (url.pathname === "/api/workspaces/switch" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { name } = JSON.parse(body);
          if (!name || typeof name !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "name is required" }));
            return;
          }
          // Auto-create workspace dir if it doesn't exist
          mkdirSync(join(workspacesDir(), name), { recursive: true });
          mkdirSync(join(workspacesDir(), name, "evidence"), {
            recursive: true,
          });
          // resetDb() is called inside setActiveWorkspace
          setActiveWorkspace(name);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ switched: true, workspace: name }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/workspaces/create" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { name } = JSON.parse(body);
          if (!name || typeof name !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "name is required" }));
            return;
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Workspace name must be alphanumeric (a-z, 0-9, -, _)",
              }),
            );
            return;
          }
          const wsDir = join(workspacesDir(), name);
          if (existsSync(wsDir)) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: `Workspace "${name}" already exists` }),
            );
            return;
          }
          mkdirSync(wsDir, { recursive: true });
          mkdirSync(join(wsDir, "evidence"), { recursive: true });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ created: true, workspace: name }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/workspaces/rename" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { from, to } = JSON.parse(body);
          if (
            !from ||
            !to ||
            typeof from !== "string" ||
            typeof to !== "string"
          ) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "from and to are required" }));
            return;
          }
          renameWorkspace(from, to);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ renamed: true, from, to }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/workspaces/copy" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { from, to, switchAfter } = JSON.parse(body) as {
            from: string;
            to: string;
            switchAfter?: boolean;
          };
          if (
            !from ||
            !to ||
            typeof from !== "string" ||
            typeof to !== "string"
          ) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "from and to are required" }));
            return;
          }
          copyWorkspace(from, to);
          if (switchAfter) {
            setActiveWorkspace(to);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              copied: true,
              from,
              to,
              switched: switchAfter ?? false,
            }),
          );
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/workspaces/delete" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { name } = JSON.parse(body);
          if (!name || typeof name !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "name is required" }));
            return;
          }
          if (name === "default") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: 'Cannot delete the "default" workspace',
              }),
            );
            return;
          }
          const wsDir = join(workspacesDir(), name);
          if (!existsSync(wsDir)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: `Workspace "${name}" does not exist` }),
            );
            return;
          }
          // If deleting the active workspace, switch to default first
          if (getActiveWorkspace() === name) {
            setActiveWorkspace("default");
          }
          rmSync(wsDir, { recursive: true, force: true });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ deleted: true, workspace: name }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    // ── Workspace Cleanup API ──

    if (url.pathname === "/api/workspaces/cleanup" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { type } = JSON.parse(body) as { type: string };
          if (!type) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "type is required" }));
            return;
          }
          const db = getDb();
          const ws = getActiveWorkspace();
          let deleted = 0;

          if (type === "sessions") {
            // Delete all sessions and their run data
            const runs = db.prepare("SELECT id FROM runs").all() as Array<{
              id: string;
            }>;
            const runIds = runs.map((r) => r.id);
            if (runIds.length > 0) {
              const ph = runIds.map(() => "?").join(",");
              db.prepare(
                `DELETE FROM run_pack_entries WHERE run_id IN (${ph})`,
              ).run(...runIds);
              db.prepare(`DELETE FROM raw_outputs WHERE run_id IN (${ph})`).run(
                ...runIds,
              );
              db.prepare(`DELETE FROM issues WHERE run_id IN (${ph})`).run(
                ...runIds,
              );
              db.prepare(`DELETE FROM test_steps WHERE run_id IN (${ph})`).run(
                ...runIds,
              );
              db.prepare(`DELETE FROM test_plans WHERE run_id IN (${ph})`).run(
                ...runIds,
              );
              db.prepare(`DELETE FROM analyses WHERE run_id IN (${ph})`).run(
                ...runIds,
              );
              db.prepare(`DELETE FROM action_log WHERE run_id IN (${ph})`).run(
                ...runIds,
              );
              try {
                db.prepare(
                  `UPDATE failure_patterns SET first_seen_run = NULL WHERE first_seen_run IN (${ph})`,
                ).run(...runIds);
              } catch {}
              try {
                db.prepare(
                  `UPDATE failure_patterns SET last_seen_run = NULL WHERE last_seen_run IN (${ph})`,
                ).run(...runIds);
              } catch {}
            }
            db.prepare("UPDATE sessions SET current_run_id = NULL").run();
            const rr = db.prepare("DELETE FROM runs").run();
            const sr = db.prepare("DELETE FROM sessions").run();
            deleted = sr.changes + rr.changes;
          } else if (type === "testcases") {
            const r = db.prepare("DELETE FROM test_cases").run();
            deleted = r.changes;
          } else if (type === "issues") {
            const r = db.prepare("DELETE FROM issues").run();
            deleted = r.changes;
          } else if (type === "analyses") {
            const r = db.prepare("DELETE FROM analyses").run();
            deleted = r.changes;
          } else if (type === "runpacks") {
            const r = db.prepare("DELETE FROM run_pack_entries").run();
            deleted = r.changes;
          } else if (type === "tech-issues") {
            const r = db.prepare("DELETE FROM tech_issues").run();
            deleted = r.changes;
          } else if (type === "secrets") {
            try {
              db.prepare("DELETE FROM secrets").run();
            } catch {}
            try {
              db.prepare("DELETE FROM targets").run();
            } catch {}
            deleted = 1;
          } else if (type === "repos") {
            db.pragma("foreign_keys = OFF");
            for (const t of ["code_fts", "code_chunks", "code_chunk_embeddings", "import_graph", "coverage_map", "repo_group_members", "repo_groups", "repos"]) {
              try { db.prepare(`DELETE FROM "${t}"`).run(); } catch {}
            }
            try {
              db.prepare("DELETE FROM resource_stats WHERE key LIKE 'repo:%' OR key LIKE 'coverage:%'").run();
            } catch {}
            db.pragma("foreign_keys = ON");
            const reposDir = join(dataDir(), "repos");
            if (existsSync(reposDir))
              rmSync(reposDir, { recursive: true, force: true });
            deleted = 1;
          } else if (type === "stale") {
            db.prepare(`UPDATE sessions SET status = 'stale' WHERE status = 'active' AND last_heartbeat < datetime('now', '-5 minutes')`).run();
            const staleSessions = db.prepare("SELECT id FROM sessions WHERE status IN ('stale', 'crashed')").all() as Array<{ id: string }>;
            let totalRuns = 0;
            db.transaction(() => {
              for (const s of staleSessions) {
                const runs2 = db.prepare("SELECT id FROM runs WHERE session_id = ?").all(s.id) as Array<{ id: string }>;
                const runIds2 = runs2.map((r) => r.id);
                if (runIds2.length > 0) {
                  const ph2 = runIds2.map(() => "?").join(",");
                  for (const tbl of ["run_pack_entries", "raw_outputs", "issues", "test_steps", "test_plans", "analyses", "action_log"]) {
                    try { db.prepare(`DELETE FROM ${tbl} WHERE run_id IN (${ph2})`).run(...runIds2); } catch {}
                  }
                  try { db.prepare(`UPDATE failure_patterns SET first_seen_run = NULL WHERE first_seen_run IN (${ph2})`).run(...runIds2); } catch {}
                  try { db.prepare(`UPDATE failure_patterns SET last_seen_run = NULL WHERE last_seen_run IN (${ph2})`).run(...runIds2); } catch {}
                  db.prepare(`DELETE FROM runs WHERE id IN (${ph2})`).run(...runIds2);
                  totalRuns += runIds2.length;
                }
                db.prepare("DELETE FROM sessions WHERE id = ?").run(s.id);
              }
            })();
            deleted = staleSessions.length;
          } else if (type === "visual") {
            db.pragma("foreign_keys = OFF");
            for (const t of ["visual_comparisons", "visual_screenshots", "visual_run_entries", "visual_runs", "visual_test_cases", "visual_diffs", "visual_baselines"]) {
              try { db.prepare(`DELETE FROM "${t}"`).run(); } catch {}
            }
            db.pragma("foreign_keys = ON");
            deleted = 1;
          } else if (type === "agent-runs") {
            db.pragma("foreign_keys = OFF");
            for (const t of ["agent_runs", "agent_execution_history", "pool_spawns", "qa_pool_agents"]) {
              try { db.prepare(`DELETE FROM "${t}"`).run(); } catch {}
            }
            db.pragma("foreign_keys = ON");
            deleted = 1;
          } else if (type === "ticket-workflow") {
            db.pragma("foreign_keys = OFF");
            for (const t of ["ticket_workflow", "workflow_polling_history"]) {
              try { db.prepare(`DELETE FROM "${t}"`).run(); } catch {}
            }
            db.pragma("foreign_keys = ON");
            deleted = 1;
          } else if (type === "evidence") {
            const evidenceDir = join(dataDir(), "evidence");
            if (existsSync(evidenceDir)) rmSync(evidenceDir, { recursive: true, force: true });
            deleted = 1;
          } else if (type === "all") {
            db.pragma("foreign_keys = OFF");
            const tables = [
              "run_artifacts",
              "ui_map_forms", "ui_map_navigations", "ui_map_elements", "ui_map_pages", "ui_maps",
              "run_pack_entries", "raw_outputs",
              "issues", "test_steps", "test_plans", "test_cases", "tech_issues",
              "analyses", "action_log", "runs", "sessions",
              "failure_patterns", "rca_results", "a11y_issues",
              "coverage_map", "visual_diffs", "visual_baselines",
              "visual_comparisons", "visual_screenshots", "visual_run_entries", "visual_runs", "visual_test_cases",
              "impact_areas", "coverage_gaps", "phase_transitions",
              "blockers", "reports", "ticket_context_index", "resource_stats",
              "api_map_chains", "api_map_responses", "api_map_params", "api_map_endpoints", "api_maps",
              "default_files",
              "agent_runs", "agent_execution_history", "pool_spawns", "qa_pool_agents",
              "ticket_workflow", "workflow_polling_history",
              "datadog_monitors",
            ];
            for (const t of tables) {
              try { db.prepare(`DELETE FROM "${t}"`).run(); } catch {}
            }
            db.pragma("foreign_keys = ON");
            for (const dir of ["ticket-context", "evidence", "files"]) {
              const p = join(dataDir(), dir);
              if (existsSync(p)) rmSync(p, { recursive: true, force: true });
            }
            deleted = 1;
          } else if (type === "nuke") {
            db.pragma("foreign_keys = OFF");
            const tables = db
              .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%' AND name NOT LIKE 'sqlite_%'",
              )
              .all() as Array<{ name: string }>;
            for (const t of tables) {
              try {
                db.prepare(`DELETE FROM "${t.name}"`).run();
              } catch {}
            }
            db.pragma("foreign_keys = ON");
            for (const dir of [
              "repos",
              "evidence",
              "ticket-context",
              "files",
            ]) {
              const p = join(dataDir(), dir);
              if (existsSync(p)) rmSync(p, { recursive: true, force: true });
            }
            deleted = 1;
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unknown cleanup type: " + type }));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, type, workspace: ws, deleted }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    // ── Agents API ──

    // ── Ticket Workflow API ──

    if (url.pathname === "/api/tickets" && req.method === "GET") {
      const status = url.searchParams.get(
        "status",
      ) as TicketWorkflowStatus | null;
      const rows = listTicketWorkflowSummaries(status ? { status } : {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rows));
      return;
    }

    if (url.pathname === "/api/tickets" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { ticket_id, notes, ready } = JSON.parse(body) as {
            ticket_id: string;
            notes?: string;
            ready?: number | boolean;
          };
          if (!ticket_id?.trim()) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "ticket_id required" }));
            return;
          }
          const row = upsertTicketWorkflow(ticket_id.trim().toUpperCase(), {
            status: "new",
            notes: notes ?? null,
            ready: ready ? 1 : 0,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ticket: row }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // Run-history MUST be checked before the generic single-ticket GET below
    if (
      url.pathname.startsWith("/api/tickets/") &&
      url.pathname.endsWith("/run-history") &&
      req.method === "GET"
    ) {
      const ticketId = decodeURIComponent(
        url.pathname.slice("/api/tickets/".length, -"/run-history".length),
      );
      const agentRuns = listAgentRunsByTicket(ticketId);
      const pollingHistory = listPollingHistoryForTicket(ticketId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agentRuns, pollingHistory }));
      return;
    }

    if (url.pathname.startsWith("/api/tickets/") && req.method === "GET") {
      const ticketId = decodeURIComponent(
        url.pathname.slice("/api/tickets/".length),
      );
      const summary = getTicketWorkflowSummary(ticketId);
      if (!summary) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(summary));
      return;
    }

    if (url.pathname.startsWith("/api/tickets/") && req.method === "PATCH") {
      const ticketId = decodeURIComponent(
        url.pathname.slice("/api/tickets/".length),
      );
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { status, current_phase, notes, git_repo, mr_pr_link } =
            JSON.parse(body) as {
              status?: TicketWorkflowStatus;
              current_phase?: string;
              notes?: string;
              git_repo?: string | null;
              mr_pr_link?: string | null;
            };
          if (status)
            transitionStatus(ticketId, status, current_phase as never);
          else {
            const updates: Record<string, unknown> = {};
            if (notes !== undefined) updates.notes = notes;
            if (git_repo !== undefined) updates.git_repo = git_repo;
            if (mr_pr_link !== undefined) updates.mr_pr_link = mr_pr_link;
            if (Object.keys(updates).length > 0)
              upsertTicketWorkflow(ticketId, updates as never);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname.startsWith("/api/tickets/") && req.method === "DELETE") {
      const ticketId = decodeURIComponent(
        url.pathname.slice("/api/tickets/".length),
      );
      deleteTicketWorkflow(ticketId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Touch added_at → make ticket "today's"
    if (
      url.pathname.startsWith("/api/tickets/") &&
      url.pathname.endsWith("/touch") &&
      req.method === "POST"
    ) {
      const ticketId = decodeURIComponent(
        url.pathname.slice("/api/tickets/".length, -"/touch".length),
      );
      touchTicketAddedAt(ticketId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Toggle ready flag on a ticket
    if (
      url.pathname.startsWith("/api/tickets/") &&
      url.pathname.endsWith("/ready") &&
      req.method === "POST"
    ) {
      const ticketId = decodeURIComponent(
        url.pathname.slice("/api/tickets/".length, -"/ready".length),
      );
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { ready } = JSON.parse(body || "{}");
          setTicketReady(ticketId, !!ready);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ready: !!ready }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // Delete a single agent run
    if (
      url.pathname.startsWith("/api/agent-runs/") &&
      url.pathname.endsWith("/delete") &&
      req.method === "POST"
    ) {
      const runId = decodeURIComponent(
        url.pathname.slice("/api/agent-runs/".length, -"/delete".length),
      );
      deleteAgentRun(runId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Delete a single workflow polling history row
    if (
      url.pathname.startsWith("/api/polling-history/") &&
      url.pathname.endsWith("/delete") &&
      req.method === "POST"
    ) {
      const rowId = decodeURIComponent(
        url.pathname.slice("/api/polling-history/".length, -"/delete".length),
      );
      deleteWorkflowPollingRun(rowId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ── Page agent config ─────────────────────────────────────────────────────
    if (url.pathname.startsWith("/api/page-config/") && req.method === "GET") {
      const page = decodeURIComponent(
        url.pathname.slice("/api/page-config/".length),
      );
      const cfg = getPageAgentConfig(page);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cfg ?? {}));
      return;
    }

    if (url.pathname.startsWith("/api/page-config/") && req.method === "PUT") {
      const page = decodeURIComponent(
        url.pathname.slice("/api/page-config/".length),
      );
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { agent_name, auto_run, config_json } = JSON.parse(
            body || "{}",
          );
          const cfg = setPageAgentConfig(page, {
            agent_name: agent_name ?? null,
            auto_run: auto_run ? 1 : 0,
            config_json: config_json ?? null,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(cfg));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (
      url.pathname.startsWith("/api/page-config/") &&
      req.method === "DELETE"
    ) {
      const page = decodeURIComponent(
        url.pathname.slice("/api/page-config/".length),
      );
      deletePageAgentConfig(page);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/agents" && req.method === "GET") {
      const globalDir = join(homedir(), ".claude", "agents");
      const projectDir = join(process.cwd(), ".claude", "agents");
      const agents: object[] = [];
      for (const [scope, dir] of [
        ["global", globalDir],
        ["project", projectDir],
      ] as [string, string][]) {
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
          if (!f.endsWith(".md")) continue;
          try {
            const content = readFileSync(join(dir, f), "utf8");
            const fm = content.match(/^---\n([\s\S]*?)\n---/);
            const meta: Record<string, unknown> = {};
            if (fm) {
              let lastListKey = "";
              for (const line of fm[1].split("\n")) {
                const m = line.match(/^(\w+):\s*(.+)/);
                if (m) {
                  meta[m[1]] = m[2].trim();
                  lastListKey = "";
                  continue;
                }
                const listKeyM = line.match(/^(\w+):\s*$/);
                if (listKeyM) {
                  meta[listKeyM[1]] = [];
                  lastListKey = listKeyM[1];
                  continue;
                }
                const listM = line.match(/^  - (.+)/);
                if (listM && lastListKey) {
                  (meta[lastListKey] as string[]).push(listM[1].trim());
                }
              }
            }
            const body = fm
              ? content.slice(fm[0].length).trim()
              : content.trim();
            agents.push({
              scope,
              file: f,
              path: join(dir, f),
              content,
              body,
              ...meta,
            });
          } catch {
            /* skip unreadable */
          }
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(agents));
      return;
    }

    // ── Global Claude settings file ───────────────────────────────────────────
    if (url.pathname === "/api/claude-settings" && req.method === "GET") {
      const settingsPath = join(homedir(), ".claude", "settings.json");
      let content = "{}";
      try {
        content = readFileSync(settingsPath, "utf-8");
      } catch {
        /* file doesn't exist yet */
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          content,
          path: settingsPath,
          exists: content !== "{}",
        }),
      );
      return;
    }

    if (url.pathname === "/api/claude-settings" && req.method === "PUT") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        try {
          const { content } = JSON.parse(body);
          if (typeof content !== "string") {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "content required" }));
            return;
          }
          JSON.parse(content); // validate JSON
          const settingsPath = join(homedir(), ".claude", "settings.json");
          mkdirSync(join(homedir(), ".claude"), { recursive: true });
          writeFileSync(settingsPath, content, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, path: settingsPath }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/agent-run/stream" && req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        let parsed: {
          agentPath?: string;
          agentName?: string;
          prompt?: string;
          ticketId?: string;
          page?: string;
        };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        const { agentPath, agentName, prompt, ticketId, page } = parsed;
        if (!prompt?.trim() && !ticketId?.trim()) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "prompt required" }));
          return;
        }
        const promptPart = prompt?.trim() || "";
        const fullPrompt = agentPath
          ? ticketId
            ? `use agent @${agentPath} on ticket ${ticketId}${promptPart ? ` and ${promptPart}` : ""}`
            : `use agent @${agentPath} and ${promptPart}`
          : ticketId
            ? `on ticket ${ticketId}${promptPart ? ` and ${promptPart}` : ""}`
            : promptPart;
        const displayPath = agentPath ? agentPath.replace(homedir(), "~") : "";
        const displayPrompt = agentPath
          ? ticketId
            ? `use agent @${displayPath} on ticket ${ticketId}${promptPart ? ` and ${promptPart}` : ""}`
            : `use agent @${displayPath} and ${promptPart}`
          : fullPrompt;
        const displayCmd = `claude -p "${displayPrompt.slice(0, 160)}${displayPrompt.length > 160 ? "..." : ""}"`;

        // Create DB record and in-memory entry
        const run = createAgentRun({
          page: page || "unknown",
          agent_name: agentName || null,
          ticket_id: ticketId || null,
          command: displayCmd,
        });
        const active: ActiveRun = {
          proc: null as any,
          buf: [],
          watchers: new Set(),
        };
        activeRuns.set(run.id, active);

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Run-Id": run.id,
        });

        const broadcast = (obj: object) => {
          // push to ring buffer (keep last 2000 events)
          active.buf.push(obj as any);
          if (active.buf.length > 2000) active.buf.shift();
          // send to original caller
          try {
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
          } catch {
            /* ignore */
          }
          // send to all watchers
          active.watchers.forEach((fn) => fn(obj));
        };

        broadcast({ type: "cmd", text: displayCmd });
        broadcast({ type: "run_id", id: run.id });

        const spawnEnv = { ...process.env, FORCE_COLOR: "0" };
        delete spawnEnv.ANTHROPIC_API_KEY;
        const proc = spawn("claude", ["-p", fullPrompt], {
          cwd: process.cwd(),
          env: spawnEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
        active.proc = proc;

        let finished = false;
        const finish = (code: number) => {
          if (finished) return;
          finished = true;
          const status = code === 0 ? "done" : "failed";
          finishAgentRun(run.id, status, code);
          broadcast({ type: "done", code });
          activeRuns.delete(run.id);
          res.end();
        };
        proc.stdout.on("data", (d: Buffer) =>
          broadcast({ type: "stdout", text: d.toString() }),
        );
        proc.stderr.on("data", (d: Buffer) =>
          broadcast({ type: "stderr", text: d.toString() }),
        );
        proc.on("close", (code: number | null) => finish(code ?? -1));
        proc.on("error", (err: Error) => {
          broadcast({ type: "stderr", text: err.message + "\n" });
          finish(1);
        });
        res.on("close", () => {
          // caller disconnected — keep process running, remove from watchers implicitly
        });
      });
      return;
    }

    // List agent runs for a page
    if (url.pathname === "/api/agent-runs" && req.method === "GET") {
      const page = url.searchParams.get("page") || undefined;
      const runs = listAgentRuns(page);
      // annotate with live status
      const annotated = runs.map((r) => ({
        ...r,
        active: activeRuns.has(r.id),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(annotated));
      return;
    }

    // Stream output of a specific run (replay buffer + live tail)
    if (
      url.pathname.startsWith("/api/agent-runs/") &&
      url.pathname.endsWith("/stream") &&
      req.method === "GET"
    ) {
      const runId = url.pathname.slice(
        "/api/agent-runs/".length,
        -"/stream".length,
      );
      const run = getAgentRun(runId);
      if (!run) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const send = (obj: object) => {
        try {
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
        } catch {
          /* ignore */
        }
      };
      const active = activeRuns.get(runId);
      if (active) {
        // replay buffer then subscribe live
        active.buf.forEach((e) => send(e));
        active.watchers.add(send);
        res.on("close", () => active.watchers.delete(send));
      } else {
        // run finished or server restarted
        send({
          type: "info",
          text: "Run finished. Output no longer available.\n",
        });
        send({ type: "done", code: run.exit_code ?? 0 });
        res.end();
      }
      return;
    }

    // Kill a run
    if (
      url.pathname.startsWith("/api/agent-runs/") &&
      req.method === "DELETE"
    ) {
      const runId = url.pathname.slice("/api/agent-runs/".length);
      const active = activeRuns.get(runId);
      if (active) {
        active.proc.kill();
        killAgentRun(runId);
        activeRuns.delete(runId);
        // notify watchers
        active.watchers.forEach((fn) => fn({ type: "killed" }));
      } else {
        deleteAgentRun(runId);
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/agents" && req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        try {
          const {
            name,
            model,
            description,
            skills,
            tools,
            instructions,
            scope,
          } = JSON.parse(body);
          if (!name) {
            res.writeHead(400);
            res.end('{"error":"name required"}');
            return;
          }
          const dir =
            scope === "project"
              ? join(process.cwd(), ".claude", "agents")
              : join(homedir(), ".claude", "agents");
          mkdirSync(dir, { recursive: true });
          const skillLines = (skills || [])
            .map((s: string) => `  - ${s}`)
            .join("\n");
          const toolLines = (tools || [])
            .map((t: string) => `  - ${t}`)
            .join("\n");
          const frontmatter = [
            "---",
            `name: ${name}`,
            model ? `model: ${model}` : null,
            description ? `description: ${description}` : null,
            skillLines ? `skills:\n${skillLines}` : null,
            toolLines ? `tools:\n${toolLines}` : null,
            "---",
          ]
            .filter(Boolean)
            .join("\n");
          const content =
            `${frontmatter}\n\n${instructions || ""}`.trimEnd() + "\n";
          writeFileSync(join(dir, `${name}.md`), content, "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, path: join(dir, `${name}.md`) }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/agents/generate" && req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        let parsed: {
          name?: string;
          description?: string;
          skills?: string[];
          tools?: string[];
        };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        const {
          name = "agent",
          description = "",
          skills = [],
          tools = [],
        } = parsed;
        const promptLines = [
          "Generate clear, detailed system prompt instructions for a Claude subagent with the following configuration.",
          "Output ONLY the instructions markdown — no preamble, no explanation, no code fences.",
          "",
          `Agent name: ${name}`,
          description ? `Description: ${description}` : "",
          skills.length ? `Skills available: ${skills.join(", ")}` : "",
          tools.length ? `Tools available: ${tools.join(", ")}` : "",
          "",
          "Write concise agent instructions with the following structure:",
          "1. A header block listing: agent name, description, available skills (as .claude/skills/<name>/SKILL.md file references), and available tools.",
          "2. Role and purpose (1-2 sentences).",
          "3. Operating procedure — for each skill, write ONE line telling the agent to read and follow the skill file exactly (e.g. 'Follow .claude/skills/<name>/SKILL.md exactly.'). Do NOT reproduce skill content.",
          "4. Tool usage — one line per tool explaining when/why to use it.",
          "5. Critical rules and constraints.",
          "Keep it short and reference-based.",
        ]
          .filter(Boolean)
          .join("\n");

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const send = (obj: object) => {
          try {
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
          } catch {
            /* ignore */
          }
        };
        const spawnEnv = { ...process.env, FORCE_COLOR: "0" };
        delete spawnEnv.ANTHROPIC_API_KEY;
        const proc = spawn("claude", ["-p", promptLines], {
          cwd: process.cwd(),
          env: spawnEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let finished = false;
        const finish = (code: number) => {
          if (finished) return;
          finished = true;
          send({ type: "done", code });
          res.end();
        };
        proc.stdout.on("data", (d: Buffer) =>
          send({ type: "stdout", text: d.toString() }),
        );
        proc.stderr.on("data", (d: Buffer) =>
          send({ type: "stderr", text: d.toString() }),
        );
        proc.on("close", (code: number | null) => finish(code ?? -1));
        proc.on("error", (err: Error) => {
          send({ type: "stderr", text: err.message + "\n" });
          finish(1);
        });
        res.on("close", () => {
          if (!finished) proc.kill();
        });
      });
      return;
    }

    if (url.pathname === "/api/agents/reveal" && req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        try {
          const { path: filePath } = JSON.parse(body);
          if (!filePath || typeof filePath !== "string") {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "path required" }));
            return;
          }
          const platform = process.platform;
          const dir = join(filePath, "..");
          const cmd =
            platform === "darwin"
              ? `open -R ${JSON.stringify(filePath)}`
              : platform === "win32"
                ? `explorer /select,${JSON.stringify(filePath)}`
                : `xdg-open ${JSON.stringify(dir)}`;
          try {
            execSync(cmd);
          } catch {
            /* best-effort */
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/agents/validate" && req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        let parsed: { content?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        const { content = "" } = parsed;
        const prompt = [
          "You are reviewing a Claude subagent definition file. Validate and improve ONLY the instructions body (everything after the --- frontmatter block).",
          "Rules:",
          "- Skill references must use the exact form: 'Follow .claude/skills/<name>/SKILL.md exactly.' — do not reproduce skill content inline.",
          "- Instructions must be concise, actionable, and reference-based.",
          "- Fix any unclear steps, missing critical rules, or broken references.",
          "- Output ONLY the corrected instructions body — no frontmatter, no code fences, no explanation.",
          "- If the instructions are already correct, return them unchanged.",
          "",
          "Agent file content:",
          content,
        ].join("\n");

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const send = (obj: object) => {
          try {
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
          } catch {
            /* ignore */
          }
        };
        const spawnEnv = { ...process.env, FORCE_COLOR: "0" };
        delete spawnEnv.ANTHROPIC_API_KEY;
        const proc = spawn("claude", ["-p", prompt], {
          cwd: process.cwd(),
          env: spawnEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let finished = false;
        const finish = (code: number) => {
          if (finished) return;
          finished = true;
          send({ type: "done", code });
          res.end();
        };
        proc.stdout.on("data", (d: Buffer) =>
          send({ type: "stdout", text: d.toString() }),
        );
        proc.stderr.on("data", (d: Buffer) =>
          send({ type: "stderr", text: d.toString() }),
        );
        proc.on("close", (code: number | null) => finish(code ?? -1));
        proc.on("error", (err: Error) => {
          send({ type: "stderr", text: err.message + "\n" });
          finish(1);
        });
        res.on("close", () => {
          if (!finished) proc.kill();
        });
      });
      return;
    }

    if (url.pathname.startsWith("/api/agents/") && req.method === "DELETE") {
      const name = decodeURIComponent(
        url.pathname.slice("/api/agents/".length),
      );
      const scope = url.searchParams.get("scope") || "global";
      const dir =
        scope === "project"
          ? join(process.cwd(), ".claude", "agents")
          : join(homedir(), ".claude", "agents");
      const filePath = join(dir, `${name}.md`);
      try {
        if (existsSync(filePath)) unlinkSync(filePath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(err) }));
      }
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
      // fileURLToPath handles the Windows leading-slash bug in URL.pathname (e.g. /C:/Users/...)
      const packageDir = join(
        fileURLToPath(new URL(".", import.meta.url)),
        "..",
        "..",
      );

      function extraNvmBins(): string[] {
        const home = homedir();
        const bins: string[] = [];
        if (process.platform === "win32") {
          // nvm-windows: executables directly in %APPDATA%\nvm\<version>\ (no bin/ subdir)
          const nvmWin = join(process.env.APPDATA ?? "", "nvm");
          if (existsSync(nvmWin)) {
            try {
              for (const entry of readdirSync(nvmWin)) {
                const dir = join(nvmWin, entry);
                if (existsSync(join(dir, "node.exe"))) bins.push(dir);
              }
            } catch { /* ignore */ }
          }
          // Standard Windows Node.js installer: node.exe directly in %ProgramFiles%\nodejs
          const nodeDir = join(process.env.ProgramFiles ?? "", "nodejs");
          if (existsSync(join(nodeDir, "node.exe"))) bins.push(nodeDir);
        } else {
          // Unix nvm: executables are in <base>/<version>/bin/
          for (const base of [
            join(home, ".nvm", "versions", "node"),
            join(home, ".local", "share", "nvm"),
          ]) {
            if (!existsSync(base)) continue;
            try {
              for (const entry of readdirSync(base)) {
                const bin = join(base, entry, "bin");
                if (existsSync(bin)) bins.push(bin);
              }
            } catch { /* ignore */ }
          }
        }
        return bins;
      }
      function cmdExists(cmd: string): boolean {
        const finder = process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
        try {
          execSync(finder, { stdio: "ignore" });
          return true;
        } catch {
          /* fall through */
        }
        // Fallback: search nvm/node bin dirs
        const extra = extraNvmBins();
        if (process.platform === "win32") {
          return extra.some((dir) =>
            existsSync(join(dir, cmd + ".exe")) ||
            existsSync(join(dir, cmd + ".cmd")) ||
            existsSync(join(dir, cmd))
          );
        }
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
          install: pkgInstallCmd("git", "Git.Git"),
          required: true,
        },
        {
          id: "curl",
          label: "curl",
          installed: cmdExists("curl"),
          install: pkgInstallCmd("curl", "cURL.cURL"),
          required: true,
        },
        {
          id: "jq",
          label: "jq",
          installed: cmdExists("jq"),
          install: pkgInstallCmd("jq", "jqlang.jq"),
          required: true,
        },
        {
          id: "gh",
          label: "GitHub CLI (gh)",
          installed: cmdExists("gh"),
          install: pkgInstallCmd("gh", "GitHub.cli"),
          required: false,
        },
        {
          id: "glab",
          label: "GitLab CLI (glab)",
          installed: cmdExists("glab"),
          install: pkgInstallCmd("glab", "Glab.Glab"),
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
          install: pkgInstallCmd("1password-cli", "AgileBits.1Password.CLI"),
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
          id: "noob-workflow",
          pluginName: "noob-workflow",
          skillPath: "skills/noob-workflow",
        },
        {
          id: "noob-claim",
          pluginName: "noob-claim",
          skillPath: "skills/noob-claim",
        },
        {
          id: "noob-visual",
          pluginName: "noob-visual",
          skillPath: "skills/noob-visual",
        },
        {
          id: "noob-visual-claim",
          pluginName: "noob-visual-claim",
          skillPath: "skills/noob-visual-claim",
        },
        {
          id: "noob-visual-testcase",
          pluginName: "noob-visual-testcase",
          skillPath: "skills/noob-visual-testcase",
        },
        {
          id: "noob-visual-rca",
          pluginName: "noob-visual-rca",
          skillPath: "skills/noob-visual-rca",
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
          if (process.platform !== "win32") {
            // Unix: check symlink target matches src
            try {
              upToDate = readlinkSync(dest) === src;
            } catch { /* not a symlink — fall through to content check */ }
          }
          if (!upToDate) {
            // Windows (copied) or symlink check failed — compare SKILL.md content
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
        const symlinkCmd = src ? mkSymlinkCmd(src, dest) : "";
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
          unlinkCmd: rmDirCmd(dest),
          uninstallCmd: rmDirCmd(dest) + " && " + rmDirCmd(pkgDir),
          checkCmd: checkPathCmd(dest),
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
        category: "plugin",
        dest: join(skillsDir, "bb"),
        installed: existsSync(join(skillsDir, "bb")),
        pluginInstalled: !!bbVer,
        src: bbSkillSrc,
        installCmd: "claude plugin install bb@noob-tester-skills",
        fullInstallCmd:
          "claude plugin marketplace add ganeshgaxy/noob-tester-skills && claude plugin marketplace update noob-tester-skills && claude plugin install bb@noob-tester-skills",
        symlinkCmd: bbSkillSrc
          ? mkSymlinkCmd(bbSkillSrc, join(skillsDir, "bb"))
          : "",
        marketplaceCmd: marketplaceCmd,
        unlinkCmd: rmDirCmd(join(skillsDir, "bb")),
        uninstallCmd: rmDirCmd(join(skillsDir, "bb")) + " && " + rmDirCmd(bbPkgDir),
        checkCmd: checkPathCmd(join(skillsDir, "bb")),
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
        category: "plugin",
        dest: join(skillsDir, "glab"),
        installed: existsSync(join(skillsDir, "glab")),
        pluginInstalled: !!glabVer,
        src: glabSkillSrc,
        installCmd: "claude plugin install handbook-glab@cc-handbook",
        fullInstallCmd:
          "claude plugin marketplace add nikiforovall/claude-code-rules && claude plugin install handbook-glab@cc-handbook",
        symlinkCmd: glabSkillSrc
          ? mkSymlinkCmd(glabSkillSrc, join(skillsDir, "glab"))
          : "",
        marketplaceCmd:
          "claude plugin marketplace add nikiforovall/claude-code-rules",
        unlinkCmd: rmDirCmd(join(skillsDir, "glab")),
        uninstallCmd: rmDirCmd(join(skillsDir, "glab")) + " && " + rmDirCmd(glabPkgDir),
        checkCmd: checkPathCmd(join(skillsDir, "glab")),
      });

      // agent-browser + dogfood skills (from vercel-labs/agent-browser via npx)
      externalSkills.push({
        id: "agent-browser-skill",
        label: "Agent Browser skill",
        category: "npx",
        dest: join(skillsDir, "agent-browser"),
        installed: existsSync(join(skillsDir, "agent-browser")),
        pluginInstalled: true,
        src: null,
        installCmd: "npx skills add vercel-labs/agent-browser",
        symlinkCmd: "",
        marketplaceCmd: "",
        unlinkCmd: rmDirCmd(join(skillsDir, "agent-browser")),
        uninstallCmd: "",
        checkCmd: checkPathCmd(join(skillsDir, "agent-browser")),
      });
      externalSkills.push({
        id: "dogfood-skill",
        label: "Dogfood skill",
        category: "npx",
        dest: join(skillsDir, "dogfood"),
        installed: existsSync(join(skillsDir, "dogfood")),
        pluginInstalled: true,
        src: null,
        installCmd: "npx skills add vercel-labs/agent-browser",
        symlinkCmd: "",
        marketplaceCmd: "",
        unlinkCmd: rmDirCmd(join(skillsDir, "dogfood")),
        uninstallCmd: "",
        checkCmd: checkPathCmd(join(skillsDir, "dogfood")),
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
            ? mkSymlinkCmd(metricsHookSrc, metricsHookDest)
            : "",
          marketplaceCmd: marketplaceCmd,
          unlinkCmd: rmFileCmd(metricsHookDest),
          uninstallCmd: rmFileCmd(metricsHookDest) + " && " + rmDirCmd(metricsPkgDir),
          checkCmd: checkPathCmd(metricsHookDest),
        },
      ];

      // ── Agents ──
      // Each agent is a separate package in noob-tester-skills, same as skills.
      const agentsDir = join(claudeDir, "agents");
      const pluginAgents = [
        "analyzer",
        "forger",
        "general-pre-claim",
        "kicker",
        "planner",
        "poller",
        "pool-api-executor",
        "pool-ui-executor",
        "pool-visual-executor",
        "solo-ui-executor",
        "solo-visual-executor",
        "visual-forger",
        "visual-pre-claim",
      ];

      const agentItems = pluginAgents.map((name) => {
        const pkgDir = join(noobTesterPluginBase, name);
        const ver = findPluginVersion(pkgDir);
        const src = ver ? join(pkgDir, ver, "agents", name + ".md") : null;
        const dest = join(agentsDir, name + ".md");
        // lstatSync detects broken symlinks that existsSync would miss
        let destExists = false;
        try { lstatSync(dest); destExists = true; } catch {}
        const srcExists = src ? existsSync(src) : false;
        let upToDate = false;
        if (destExists && srcExists && src) {
          try {
            const srcContent = readFileSync(src, "utf8");
            const destContent = readFileSync(dest, "utf8");
            upToDate = srcContent === destContent;
          } catch {
            upToDate = false;
          }
        }
        const installCmd = "claude plugin install " + name + "@noob-tester-skills";
        const agentCopyCmd = src ? copyFileCmd(src, dest) : "";
        return {
          id: name,
          label: name,
          src,
          dest,
          installed: destExists,
          upToDate,
          srcExists,
          pluginInstalled: !!ver,
          installCmd,
          copyCmd: agentCopyCmd,
          marketplaceCmd,
          unlinkCmd: rmFileCmd(dest),
          uninstallCmd: rmFileCmd(dest) + " && " + rmDirCmd(pkgDir),
          checkCmd: checkPathCmd(dest),
        };
      });

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
          agents: agentItems,
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

          // Remove existing dest if present (use lstatSync to catch broken symlinks)
          try { lstatSync(dest); rmSync(dest, { recursive: true, force: true }); } catch {}
          // Create parent dir
          const parentDir = join(dest, "..");
          if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
          // Windows requires Developer Mode for symlinks — copy the directory instead
          if (process.platform === "win32") {
            const copyDir = (s: string, d: string) => {
              mkdirSync(d, { recursive: true });
              for (const entry of readdirSync(s)) {
                const sp = join(s, entry), dp = join(d, entry);
                statSync(sp).isDirectory() ? copyDir(sp, dp) : copyFileSync(sp, dp);
              }
            };
            statSync(src).isDirectory() ? copyDir(src, dest) : copyFileSync(src, dest);
          } else {
            symlinkSync(src, dest);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/setup/install-agent" && req.method === "POST") {
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
          if (!existsSync(src)) {
            res.writeHead(404);
            res.end('{"error":"source file not found"}');
            return;
          }
          // Remove existing dest — use lstatSync so broken symlinks are caught too
          try { lstatSync(dest); unlinkSync(dest); } catch {}
          // Create parent dir
          const parentDir = join(dest, "..");
          if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
          // Copy (not symlink)
          copyFileSync(src, dest);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/setup/unlink-skill" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { dest } = JSON.parse(body);
          if (!dest || typeof dest !== "string") {
            res.writeHead(400);
            res.end('{"error":"dest required"}');
            return;
          }
          // Use lstatSync so broken symlinks are also caught
          try { lstatSync(dest); } catch {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, note: "already absent" }));
            return;
          }
          rmSync(dest, { recursive: true, force: true });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (url.pathname === "/api/cli/run" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk));
      req.on("end", () => {
        try {
          const { command } = JSON.parse(body);
          if (!command) {
            res.writeHead(400);
            res.end('{"error":"command required"}');
            return;
          }

          // Only allow safe commands
          if (
            !command.startsWith("claude plugin install") &&
            !command.startsWith("claude plugin marketplace")
          ) {
            res.writeHead(403);
            res.end('{"error":"command not allowed"}');
            return;
          }

          execSync(command, { stdio: "inherit" });
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
                env: (() => {
                  const e = { ...process.env };
                  delete e.ANTHROPIC_API_KEY;
                  return e;
                })(),
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

    // ── Scheduled Agents API ──

    if (url.pathname === "/api/scheduled-agents" && req.method === "GET") {
      import("../db/repositories/scheduled-agents.js")
        .then((module) => {
          const ticket = url.searchParams.get("ticket");
          const status = url.searchParams.get("status");
          const agents = module.listScheduledAgents({
            ticket: ticket || undefined,
            status: status || undefined,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(agents));
        })
        .catch((err) => {
          res.writeHead(500);
          res.end((err as Error).message);
        });
      return;
    }

    if (
      url.pathname === "/api/scheduled-agents/create" &&
      req.method === "POST"
    ) {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        import("../db/repositories/scheduled-agents.js").then((module) => {
          try {
            const input = JSON.parse(body);
            const id = module.createScheduledAgent({
              agent_path: input.agent_path,
              ticket_id: input.ticket_id,
              cron_expression: input.cron_expression,
              parameters: input.parameters,
              description: input.description,
              status: input.status || "active",
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id }));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: (e as Error).message }));
          }
        });
      });
      return;
    }

    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+$/) &&
      req.method === "GET"
    ) {
      import("../db/repositories/scheduled-agents.js").then((module) => {
        const id = url.pathname.split("/").pop();
        if (!id) {
          res.writeHead(400);
          res.end("Missing ID");
          return;
        }
        const agent = module.getScheduledAgent(id);
        if (!agent) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(agent));
      });
      return;
    }

    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+$/) &&
      req.method === "PUT"
    ) {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        import("../db/repositories/scheduled-agents.js").then((module) => {
          try {
            const id = url.pathname.split("/").pop();
            if (!id) {
              res.writeHead(400);
              res.end("Missing ID");
              return;
            }
            const agent = module.getScheduledAgent(id);
            if (!agent) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }
            const input = JSON.parse(body);
            module.updateScheduledAgent(id, {
              agent_path: input.agent_path,
              ticket_id: input.ticket_id,
              cron_expression: input.cron_expression,
              parameters: input.parameters,
              description: input.description,
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ updated: true, id }));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: (e as Error).message }));
          }
        });
      });
      return;
    }

    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+\/pause$/) &&
      req.method === "POST"
    ) {
      import("../db/repositories/scheduled-agents.js").then((module) => {
        const parts = url.pathname.split("/");
        const id = parts[parts.length - 2];
        const agent = module.getScheduledAgent(id);
        if (!agent) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        module.updateScheduledAgent(id, { status: "paused" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ paused: true, id }));
      });
      return;
    }

    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+\/resume$/) &&
      req.method === "POST"
    ) {
      import("../db/repositories/scheduled-agents.js").then((module) => {
        const parts = url.pathname.split("/");
        const id = parts[parts.length - 2];
        const agent = module.getScheduledAgent(id);
        if (!agent) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        module.updateScheduledAgent(id, { status: "active" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ resumed: true, id }));
      });
      return;
    }

    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+\/delete$/) &&
      req.method === "DELETE"
    ) {
      import("../db/repositories/scheduled-agents.js").then((module) => {
        const parts = url.pathname.split("/");
        const id = parts[parts.length - 2];
        module.deleteScheduledAgent(id);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ deleted: true, id }));
      });
      return;
    }

    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+\/history$/) &&
      req.method === "GET"
    ) {
      import("../db/repositories/scheduled-agents.js").then((module) => {
        const parts = url.pathname.split("/");
        const id = parts[parts.length - 2];
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const history = module.getExecutionHistory(id, limit);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(history));
      });
      return;
    }

    // Preview — which tickets would fire if this scheduled agent ran right now
    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+\/preview$/) &&
      req.method === "GET"
    ) {
      import("../db/repositories/scheduled-agents.js").then((saModule) => {
        const parts = url.pathname.split("/");
        const id = parts[parts.length - 2];
        const agent = saModule.getScheduledAgent(id);
        if (!agent) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Agent not found" }));
          return;
        }
        const params = (agent.parameters || {}) as Record<string, any>;
        const agentPath = agent.agent_path || "";
        const scheduleType = params.type || "polling";

        if (scheduleType !== "workflow") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ type: "polling" }));
          return;
        }

        // Apply the same filter chain as executeWorkflowAgent
        const days = params.days || "today";
        const requireRepo = !!params.requireRepo;
        const requireMrPr = !!params.requireMrPr;
        const requirePriorRun = !!params.requirePriorRun;
        const priorRunSameDay = !!params.priorRunSameDay;
        const requirePriorRunAgents: string[] = Array.isArray(
          params.requirePriorRunAgents,
        )
          ? params.requirePriorRunAgents
          : [];
        const maxTickets = Math.min(
          5,
          Math.max(1, Number(params.maxTickets) || 5),
        );

        const allTickets = listTicketWorkflows();
        const todayStr = new Date().toISOString().slice(0, 10);

        // Collect filteredOut (didn't pass days/link/prior-run filters)
        const filteredOut: typeof allTickets = [];

        // Step 0: ready filter — on-hold tickets go into their own bucket
        const onHold = allTickets.filter((t) => t.ready === 0);
        const readyTickets = allTickets.filter((t) => t.ready !== 0);

        // Step 1: days filter
        let passed =
          days === "today"
            ? readyTickets.filter(
                (t) => t.added_at && t.added_at.startsWith(todayStr),
              )
            : [...readyTickets];

        const afterDays = new Set(passed.map((t) => t.ticket_id));
        for (const t of readyTickets) {
          if (!afterDays.has(t.ticket_id)) filteredOut.push(t);
        }

        // Step 2: link filter
        if (requireRepo || requireMrPr) {
          const before = passed;
          passed = passed.filter((t) => {
            const hasRepo = !!t.git_repo;
            const hasMrPr = !!t.mr_pr_link;
            if (requireRepo && requireMrPr) return hasRepo && hasMrPr;
            if (requireRepo) return hasRepo;
            return hasMrPr;
          });
          for (const t of before) {
            if (!passed.find((p) => p.ticket_id === t.ticket_id))
              filteredOut.push(t);
          }
        }

        // Step 3: prior run filter
        if (requirePriorRun) {
          const agentFilter =
            requirePriorRunAgents.length > 0
              ? requirePriorRunAgents
              : undefined;
          const before = passed;
          passed = passed.filter((t) =>
            hasAgentRunForTicket(t.ticket_id, priorRunSameDay, agentFilter),
          );
          for (const t of before) {
            if (!passed.find((p) => p.ticket_id === t.ticket_id))
              filteredOut.push(t);
          }
        }

        // Step 4: dedup — already ran today
        const skippedDedup = passed.filter((t) =>
          wasPolledToday(t.ticket_id, agentPath),
        );
        const notDeduped = passed.filter(
          (t) => !wasPolledToday(t.ticket_id, agentPath),
        );

        // Step 5: maxTickets cap
        const willRun = notDeduped.slice(0, maxTickets);
        const overLimit = notDeduped.slice(maxTickets);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            type: "workflow",
            maxTickets,
            willRun,
            overLimit,
            skippedDedup,
            filteredOut,
            onHold,
          }),
        );
      });
      return;
    }

    if (
      url.pathname.match(/^\/api\/scheduled-agents\/[a-f0-9-]+\/trigger$/) &&
      req.method === "POST"
    ) {
      import("../db/repositories/scheduled-agents.js").then((module) => {
        const parts = url.pathname.split("/");
        const id = parts[parts.length - 2];
        const agent = module.getScheduledAgent(id);
        if (!agent) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Agent not found" }));
          return;
        }

        const params = (agent.parameters || {}) as Record<string, any>;
        const agentPath = agent.agent_path || "";
        const agentName = agentPath.split("/").pop() || agentPath;
        const scheduleType = params.type || "polling";

        // Helper: spawn a single claude process and track it as an active run
        const spawnOne = (fullPrompt: string, ticketId: string | null) => {
          const displayCmd = `claude -p "${fullPrompt.slice(0, 200)}${fullPrompt.length > 200 ? "..." : ""}"`;
          const run = createAgentRun({
            page: "scheduler",
            agent_name: agentName,
            ticket_id: ticketId,
            command: displayCmd,
          });
          const execId = module.recordExecution({
            schedule_id: id,
            run_id: run.id,
            status: "running",
          });
          const active: ActiveRun = {
            proc: null as any,
            buf: [],
            watchers: new Set(),
          };
          activeRuns.set(run.id, active);
          const spawnEnv = { ...process.env, FORCE_COLOR: "0" };
          delete spawnEnv.ANTHROPIC_API_KEY;
          const agentProcess = spawn("claude", ["-p", fullPrompt], {
            cwd: process.cwd(),
            env: spawnEnv,
            stdio: ["ignore", "pipe", "pipe"],
          });
          active.proc = agentProcess;
          const broadcast = (obj: object) => {
            active.buf.push(obj as any);
            if (active.buf.length > 2000) active.buf.shift();
            active.watchers.forEach((fn) => fn(obj));
          };
          broadcast({ type: "cmd", text: displayCmd });
          let logBuf = "";
          let finished = false;
          const finish = (code: number) => {
            if (finished) return;
            finished = true;
            const status = code === 0 ? "success" : "failed";
            finishAgentRun(run.id, code === 0 ? "done" : "failed", code);
            module.completeExecution(execId, {
              status,
              exit_code: code,
              logs: logBuf.slice(-4000),
            });
            module.updateLastRun(id);
            broadcast({ type: "done", code });
            activeRuns.delete(run.id);
          };
          agentProcess.stdout?.on("data", (d: Buffer) => {
            logBuf += d.toString();
            broadcast({ type: "stdout", text: d.toString() });
          });
          agentProcess.stderr?.on("data", (d: Buffer) => {
            logBuf += d.toString();
            broadcast({ type: "stderr", text: d.toString() });
          });
          agentProcess.on("close", (code: number | null) => finish(code ?? -1));
          agentProcess.on("error", (err: Error) => {
            broadcast({ type: "stderr", text: err.message + "\n" });
            finish(1);
          });
          return run.id;
        };

        if (scheduleType === "workflow") {
          import("../db/repositories/ticket-workflow.js").then((twModule) => {
            const days = params.days || "today";
            const requireRepo = !!params.requireRepo;
            const requireMrPr = !!params.requireMrPr;
            const requirePriorRun = !!params.requirePriorRun;
            const priorRunSameDay = !!params.priorRunSameDay;
            const requirePriorRunAgents: string[] = Array.isArray(
              params.requirePriorRunAgents,
            )
              ? params.requirePriorRunAgents
              : [];
            const maxTickets = Math.min(
              5,
              Math.max(1, Number(params.maxTickets) || 5),
            );
            let tickets = twModule.listTicketWorkflows();
            if (days === "today") {
              const todayStr = new Date().toISOString().slice(0, 10);
              tickets = tickets.filter(
                (t: any) => t.added_at && t.added_at.startsWith(todayStr),
              );
            }
            if (requireRepo || requireMrPr) {
              tickets = tickets.filter((t: any) => {
                const hasRepo = !!t.git_repo;
                const hasMrPr = !!t.mr_pr_link;
                if (requireRepo && requireMrPr) return hasRepo && hasMrPr;
                if (requireRepo) return hasRepo;
                return hasMrPr;
              });
            }
            if (requirePriorRun) {
              const agentFilter =
                requirePriorRunAgents.length > 0
                  ? requirePriorRunAgents
                  : undefined;
              tickets = tickets.filter((t: any) =>
                hasAgentRunForTicket(t.ticket_id, priorRunSameDay, agentFilter),
              );
            }
            // Deduplicate: skip tickets already processed by this agent today
            const skipped: string[] = [];
            const pending = tickets.filter((t: any) => {
              if (twModule.wasPolledToday(t.ticket_id, agentPath)) {
                skipped.push(t.ticket_id);
                return false;
              }
              return true;
            });
            const batch = pending.slice(0, maxTickets);
            const runIds: string[] = [];
            for (const ticket of batch) {
              const repoPart = ticket.git_repo
                ? ` and repo is ${ticket.git_repo}`
                : "";
              const mrPart = ticket.mr_pr_link
                ? ` and mr/pr is ${ticket.mr_pr_link}`
                : "";
              const fullPrompt = `use agent @${agentPath} on ticket ${ticket.ticket_id}${repoPart}${mrPart}`;
              twModule.recordWorkflowPollingRun(ticket.ticket_id, agentPath);
              runIds.push(spawnOne(fullPrompt, ticket.ticket_id));
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                triggered: true,
                id,
                workflow: true,
                tickets: batch.length,
                skipped: skipped.length,
                runIds,
              }),
            );
          });
        } else {
          const prompt = typeof params.prompt === "string" ? params.prompt : "";
          const fullPrompt = `use agent @${agentPath} to run ticket polling on ${prompt}`;
          const runId = spawnOne(fullPrompt, null);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ triggered: true, id, runId }));
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

    if (url.pathname === "/api/execute" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let parsed: { script?: string; cwd?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        const { script, cwd } = parsed;
        if (!script || typeof script !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "script required" }));
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const spawnEnv = { ...process.env, FORCE_COLOR: "0" };
        delete spawnEnv.ANTHROPIC_API_KEY;
        const [shell, shellFlag] =
          process.platform === "win32"
            ? ["cmd", "/c"]
            : ["sh", "-c"];
        const proc = spawn(shell, [shellFlag, script], {
          cwd: cwd || process.cwd(),
          env: spawnEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let finished = false;
        const send = (obj: object) => {
          try {
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
          } catch {
            /* ignore write-after-end */
          }
        };
        const finish = (code: number, signal?: string | null) => {
          if (finished) return;
          finished = true;
          send({ type: "done", code, signal: signal ?? null });
          res.end();
        };
        proc.stdout.on("data", (d: Buffer) =>
          send({ type: "stdout", text: d.toString() }),
        );
        proc.stderr.on("data", (d: Buffer) =>
          send({ type: "stderr", text: d.toString() }),
        );
        proc.on("close", (code: number | null, signal: string | null) => {
          finish(code ?? (signal ? 128 : -1), signal);
        });
        proc.on("error", (err: Error) => {
          send({ type: "stderr", text: err.message + "\n" });
          finish(1);
        });
        res.on("close", () => {
          if (!finished) proc.kill();
        });
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  // Don't poll SSE clients - we send updates on initial connection and keep alive with heartbeats
  // Polling every 2 seconds was causing database lock contention, blocking other API requests

  // On startup: mark any rows left "running" from a previous server session as failed.
  // The processes are dead after a restart — their finish callbacks will never fire.
  try {
    const db = getDb();
    const orphanedRuns = db
      .prepare(
        `UPDATE agent_runs
         SET status = 'failed', exit_code = -1, ended_at = datetime('now')
         WHERE status = 'running'`,
      )
      .run();
    const orphanedExec = db
      .prepare(
        `UPDATE agent_execution_history
         SET status = 'failed', completed_at = datetime('now'),
             logs = COALESCE(logs || char(10), '') || '[server restarted — run interrupted]'
         WHERE status = 'running' AND completed_at IS NULL`,
      )
      .run();
    const total = orphanedRuns.changes + orphanedExec.changes;
    if (total > 0) {
      console.log(
        `  Cleaned up ${total} orphaned "running" agent run(s) from previous session.`,
      );
    }
  } catch {
    // DB not yet ready — non-fatal
  }

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
  }, 60_000).unref();

  // Background Datadog poll — refresh every 5 minutes if credentials are configured
  setInterval(async () => {
    try {
      await pollDatadog(false);
    } catch {
      /**/
    }
  }, DD_POLL_TTL_MS).unref();

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
