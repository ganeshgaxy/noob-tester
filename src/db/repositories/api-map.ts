import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type {
  ApiMapRow,
  ApiMapEndpointRow,
  ApiMapParamRow,
  ApiMapResponseRow,
  ApiMapChainRow,
} from "../types.js";

// ── API Maps ──

export function createApiMap(params: {
  name: string;
  description?: string;
  baseUrl?: string;
  repoUrls?: string[];
  ticketIds?: string[];
}): string {
  const id = uuid();
  getDb().prepare(
    `INSERT INTO api_maps (id, name, description, base_url, repo_urls, ticket_ids)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id, params.name, params.description ?? null, params.baseUrl ?? null,
    JSON.stringify(params.repoUrls ?? []),
    JSON.stringify(params.ticketIds ?? [])
  );
  return id;
}

export function resolveApiMap(params: {
  name: string;
  baseUrl?: string;
  ticketIds?: string[];
  repoUrls?: string[];
}): { id: string; created: boolean } {
  const db = getDb();
  const existing = db.prepare("SELECT id, ticket_ids, repo_urls FROM api_maps WHERE name = ?").get(params.name) as { id: string; ticket_ids: string; repo_urls: string } | undefined;
  if (existing) {
    // Merge ticket_ids and repo_urls
    const existingTickets: string[] = JSON.parse(existing.ticket_ids || "[]");
    const existingRepos: string[] = JSON.parse(existing.repo_urls || "[]");
    const mergedTickets = [...new Set([...existingTickets, ...(params.ticketIds ?? [])])];
    const mergedRepos = [...new Set([...existingRepos, ...(params.repoUrls ?? [])])];
    db.prepare(
      `UPDATE api_maps SET ticket_ids = ?, repo_urls = ?, base_url = COALESCE(?, base_url), updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(mergedTickets), JSON.stringify(mergedRepos), params.baseUrl ?? null, existing.id);
    return { id: existing.id, created: false };
  }
  const id = createApiMap(params);
  return { id, created: true };
}

export function getApiMap(id: string): ApiMapRow | undefined {
  return getDb().prepare("SELECT * FROM api_maps WHERE id = ?").get(id) as ApiMapRow | undefined;
}

export function getApiMapByName(name: string): ApiMapRow | undefined {
  return getDb().prepare("SELECT * FROM api_maps WHERE name = ?").get(name) as ApiMapRow | undefined;
}

export function listApiMaps(): ApiMapRow[] {
  return getDb().prepare("SELECT * FROM api_maps ORDER BY updated_at DESC").all() as ApiMapRow[];
}

// ── Endpoints ──

export function upsertEndpoint(params: {
  apiMapId: string;
  method: string;
  path: string;
  summary?: string;
  authType?: string;
  authRoles?: string[];
  requestContentType?: string;
  createdByRun?: string;
  createdByTicket?: string;
  ticketIds?: string[];
}): string {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id FROM api_map_endpoints WHERE api_map_id = ? AND method = ? AND path = ?"
  ).get(params.apiMapId, params.method.toUpperCase(), params.path) as { id: string } | undefined;

  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const vals: unknown[] = [];
    if (params.summary) { sets.push("summary = ?"); vals.push(params.summary); }
    if (params.authType) { sets.push("auth_type = ?"); vals.push(params.authType); }
    if (params.authRoles) { sets.push("auth_roles = ?"); vals.push(JSON.stringify(params.authRoles)); }
    if (params.requestContentType) { sets.push("request_content_type = ?"); vals.push(params.requestContentType); }
    if (params.createdByRun) { sets.push("updated_by_run = ?"); vals.push(params.createdByRun); }
    vals.push(existing.id);
    db.prepare(`UPDATE api_map_endpoints SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return existing.id;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO api_map_endpoints (id, api_map_id, method, path, summary, auth_type, auth_roles, request_content_type, created_by_run, created_by_ticket, ticket_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, params.apiMapId, params.method.toUpperCase(), params.path,
    params.summary ?? null, params.authType ?? "none",
    JSON.stringify(params.authRoles ?? []),
    params.requestContentType ?? "application/json",
    params.createdByRun ?? null, params.createdByTicket ?? null,
    JSON.stringify(params.ticketIds ?? [])
  );
  return id;
}

export function recordEndpointCall(endpointId: string, statusCode: number, responseMs: number, runId?: string): void {
  const db = getDb();
  const succeeded = statusCode >= 200 && statusCode < 400 ? 1 : 0;
  const failed = succeeded ? 0 : 1;
  db.prepare(
    `UPDATE api_map_endpoints SET
       times_called = times_called + 1,
       times_succeeded = times_succeeded + ?,
       times_failed = times_failed + ?,
       avg_response_ms = CASE WHEN times_called = 0 THEN ? ELSE (avg_response_ms * times_called + ?) / (times_called + 1) END,
       last_status_code = ?,
       last_called_at = datetime('now'),
       last_called_run = ?,
       status = CASE
         WHEN ? = 0 AND times_failed > 2 THEN 'failing'
         WHEN ? = 0 AND times_succeeded > 0 THEN 'flaky'
         ELSE status END,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(succeeded, failed, responseMs, responseMs, statusCode, runId ?? null, succeeded, succeeded, endpointId);
}

export function getEndpointsByMap(apiMapId: string): ApiMapEndpointRow[] {
  return getDb().prepare(
    "SELECT * FROM api_map_endpoints WHERE api_map_id = ? ORDER BY path, method"
  ).all(apiMapId) as ApiMapEndpointRow[];
}

export function getEndpoint(id: string): ApiMapEndpointRow | undefined {
  return getDb().prepare("SELECT * FROM api_map_endpoints WHERE id = ?").get(id) as ApiMapEndpointRow | undefined;
}

export function getEndpointByMethodPath(apiMapId: string, method: string, path: string): ApiMapEndpointRow | undefined {
  return getDb().prepare(
    "SELECT * FROM api_map_endpoints WHERE api_map_id = ? AND method = ? AND path = ?"
  ).get(apiMapId, method.toUpperCase(), path) as ApiMapEndpointRow | undefined;
}

// ── Params ──

export function addParam(params: {
  endpointId: string;
  apiMapId: string;
  name: string;
  location: string;
  paramType?: string;
  required?: boolean;
  description?: string;
  exampleValue?: string;
  validation?: string;
}): string {
  const id = uuid();
  getDb().prepare(
    `INSERT INTO api_map_params (id, endpoint_id, api_map_id, name, location, param_type, required, description, example_value, validation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, params.endpointId, params.apiMapId, params.name, params.location,
    params.paramType ?? "string", params.required ? 1 : 0,
    params.description ?? null, params.exampleValue ?? null, params.validation ?? null
  );
  return id;
}

export function getParamsByEndpoint(endpointId: string): ApiMapParamRow[] {
  return getDb().prepare(
    "SELECT * FROM api_map_params WHERE endpoint_id = ? ORDER BY location, name"
  ).all(endpointId) as ApiMapParamRow[];
}

// ── Responses ──

export function upsertResponse(params: {
  endpointId: string;
  apiMapId: string;
  statusCode: number;
  description?: string;
  schemaJson?: string;
  exampleJson?: string;
}): string {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id FROM api_map_responses WHERE endpoint_id = ? AND status_code = ?"
  ).get(params.endpointId, params.statusCode) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE api_map_responses SET description = COALESCE(?, description), schema_json = COALESCE(?, schema_json), example_json = COALESCE(?, example_json) WHERE id = ?"
    ).run(params.description ?? null, params.schemaJson ?? null, params.exampleJson ?? null, existing.id);
    return existing.id;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO api_map_responses (id, endpoint_id, api_map_id, status_code, description, schema_json, example_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.endpointId, params.apiMapId, params.statusCode, params.description ?? null, params.schemaJson ?? null, params.exampleJson ?? null);
  return id;
}

export function getResponsesByEndpoint(endpointId: string): ApiMapResponseRow[] {
  return getDb().prepare(
    "SELECT * FROM api_map_responses WHERE endpoint_id = ? ORDER BY status_code"
  ).all(endpointId) as ApiMapResponseRow[];
}

// ── Chains ──

export function addChain(params: {
  apiMapId: string;
  fromEndpointId: string;
  toEndpointId: string;
  chainType?: string;
  description?: string;
  ticketIds?: string[];
  createdByRun?: string;
}): string {
  const id = uuid();
  getDb().prepare(
    `INSERT INTO api_map_chains (id, api_map_id, from_endpoint_id, to_endpoint_id, chain_type, description, ticket_ids, created_by_run)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, params.apiMapId, params.fromEndpointId, params.toEndpointId,
    params.chainType ?? "depends", params.description ?? null,
    JSON.stringify(params.ticketIds ?? []), params.createdByRun ?? null
  );
  return id;
}

export function getChainsByMap(apiMapId: string): ApiMapChainRow[] {
  return getDb().prepare(
    "SELECT * FROM api_map_chains WHERE api_map_id = ? ORDER BY created_at"
  ).all(apiMapId) as ApiMapChainRow[];
}

// ── Full map data (for canvas renderer) ──

export function getFullApiMap(apiMapId: string) {
  const db = getDb();
  const map = db.prepare("SELECT * FROM api_maps WHERE id = ?").get(apiMapId) as ApiMapRow | undefined;
  if (!map) return null;
  const endpoints = db.prepare("SELECT * FROM api_map_endpoints WHERE api_map_id = ? ORDER BY path, method").all(apiMapId) as ApiMapEndpointRow[];
  const params = db.prepare("SELECT * FROM api_map_params WHERE api_map_id = ?").all(apiMapId) as ApiMapParamRow[];
  const responses = db.prepare("SELECT * FROM api_map_responses WHERE api_map_id = ?").all(apiMapId) as ApiMapResponseRow[];
  const chains = db.prepare("SELECT * FROM api_map_chains WHERE api_map_id = ?").all(apiMapId) as ApiMapChainRow[];
  return { map, endpoints, params, responses, chains };
}

// ── Stats ──

export function getApiMapStats(apiMapId: string) {
  const db = getDb();
  const endpoints = db.prepare(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'flaky' THEN 1 ELSE 0 END) as flaky,
            SUM(CASE WHEN status = 'failing' THEN 1 ELSE 0 END) as failing,
            SUM(times_called) as total_calls,
            SUM(times_succeeded) as total_succeeded,
            SUM(times_failed) as total_failed,
            AVG(avg_response_ms) as avg_ms
     FROM api_map_endpoints WHERE api_map_id = ?`
  ).get(apiMapId);
  const chains = (db.prepare("SELECT COUNT(*) as c FROM api_map_chains WHERE api_map_id = ?").get(apiMapId) as { c: number }).c;
  const methods = db.prepare(
    "SELECT method, COUNT(*) as count FROM api_map_endpoints WHERE api_map_id = ? GROUP BY method ORDER BY count DESC"
  ).all(apiMapId);
  return { ...(endpoints as Record<string, unknown>), chains, methods };
}
