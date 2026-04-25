import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type {
  UiMapRow,
  UiMapPageRow,
  UiMapElementRow,
  UiMapNavigationRow,
  UiMapFormRow,
} from "../types.js";

// ── Helpers ──

/** Merge a value into a JSON array column, deduplicating. */
function mergeJsonArray(existing: string, values: string[]): string {
  let arr: string[] = [];
  try {
    arr = JSON.parse(existing);
  } catch {
    arr = [];
  }
  const set = new Set(arr);
  for (const v of values) if (v) set.add(v);
  return JSON.stringify([...set]);
}

/**
 * Normalize a URL for UI map deduplication.
 * Keeps the origin (scheme + host) but replaces ID-like path segments with `:id`.
 * Detects: UUIDs, hex strings (12+ chars), numeric IDs, and common base64-ish IDs.
 * Examples:
 *   https://app.example.com/admin/libraries/4643adcc1621814e91c489b34bb428ed/files/all
 *   → https://app.example.com/admin/libraries/:id/files/all
 */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const segments = url.pathname.split("/");
    const normalized = segments.map((seg) => {
      if (!seg) return seg;
      // UUID: 8-4-4-4-12 hex
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          seg,
        )
      )
        return ":id";
      // Hex string (12+ chars, e.g. MongoDB ObjectId, Showpad IDs)
      if (/^[0-9a-f]{12,}$/i.test(seg)) return ":id";
      // Pure numeric ID (2+ digits)
      if (/^\d{2,}$/.test(seg)) return ":id";
      // Base64-ish ID (16+ chars, alphanumeric + dash/underscore, with mixed case or digits)
      if (
        seg.length >= 16 &&
        /^[A-Za-z0-9_-]+$/.test(seg) &&
        /\d/.test(seg) &&
        /[a-zA-Z]/.test(seg)
      )
        return ":id";
      return seg;
    });
    url.pathname = normalized.join("/");
    // Strip query string and fragment — they vary per instance
    return url.origin + url.pathname;
  } catch {
    // Not a valid URL (e.g. relative path) — normalize path segments only
    return raw
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            seg,
          )
        )
          return ":id";
        if (/^[0-9a-f]{12,}$/i.test(seg)) return ":id";
        if (/^\d{2,}$/.test(seg)) return ":id";
        if (
          seg.length >= 16 &&
          /^[A-Za-z0-9_-]+$/.test(seg) &&
          /\d/.test(seg) &&
          /[a-zA-Z]/.test(seg)
        )
          return ":id";
        return seg;
      })
      .join("/");
  }
}

/** Merge keys into a JSON object column. */
function mergeJsonObject(
  existing: string,
  updates: Record<string, unknown>,
): string {
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(existing);
  } catch {
    obj = {};
  }
  return JSON.stringify({ ...obj, ...updates });
}

// ── UI Maps (top-level) ──

export interface CreateUiMapInput {
  name: string;
  description?: string;
  repoUrls?: string[];
  targetUrls?: string[];
  ticketIds?: string[];
}

export function createUiMap(input: CreateUiMapInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO ui_maps (id, name, description, repo_urls, target_urls, ticket_ids)
     VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.description ?? null,
      JSON.stringify(input.repoUrls ?? []),
      JSON.stringify(input.targetUrls ?? []),
      JSON.stringify(input.ticketIds ?? []),
    );
  return id;
}

export function getUiMap(id: string): UiMapRow | undefined {
  return getDb().prepare("SELECT * FROM ui_maps WHERE id = ?").get(id) as
    | UiMapRow
    | undefined;
}

export function listUiMaps(): UiMapRow[] {
  return getDb()
    .prepare("SELECT * FROM ui_maps ORDER BY updated_at DESC")
    .all() as UiMapRow[];
}

/** Find UI maps that contain a given repo URL. */
export function findUiMapsByRepo(repoUrl: string): UiMapRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM ui_maps WHERE repo_urls LIKE ? ORDER BY updated_at DESC",
    )
    .all(`%${repoUrl}%`) as UiMapRow[];
}

/** Normalize a target URL to its origin (scheme + host) for reliable matching. */
function normalizeTargetOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    return url.origin; // e.g. "https://staging.app.com"
  } catch {
    return raw.replace(/\/+$/, ""); // strip trailing slashes as fallback
  }
}

/** Find UI maps that contain a given target URL. Matches by origin so trailing paths/slashes don't break it. */
export function findUiMapsByTarget(targetUrl: string): UiMapRow[] {
  const db = getDb();
  const origin = normalizeTargetOrigin(targetUrl);

  // First try exact LIKE match (fast path)
  const exact = db
    .prepare(
      "SELECT * FROM ui_maps WHERE target_urls LIKE ? ORDER BY updated_at DESC",
    )
    .all(`%${targetUrl}%`) as UiMapRow[];
  if (exact.length > 0) return exact;

  // Fallback: load all maps and compare origins
  const all = db
    .prepare(
      "SELECT * FROM ui_maps WHERE target_urls != '[]' ORDER BY updated_at DESC",
    )
    .all() as UiMapRow[];
  return all.filter((m) => {
    try {
      const targets: string[] = JSON.parse(m.target_urls);
      return targets.some((t) => normalizeTargetOrigin(t) === origin);
    } catch {
      return false;
    }
  });
}

/** Find UI maps that reference a given ticket ID (in the map itself or any of its pages/elements). */
export function findUiMapsByTicket(ticketId: string): UiMapRow[] {
  const db = getDb();
  // Check map-level ticket_ids
  const direct = db
    .prepare(
      "SELECT * FROM ui_maps WHERE ticket_ids LIKE ? ORDER BY updated_at DESC",
    )
    .all(`%${ticketId}%`) as UiMapRow[];
  if (direct.length > 0) return direct;

  // Check pages
  const fromPages = db
    .prepare(
      `SELECT DISTINCT m.* FROM ui_maps m
     JOIN ui_map_pages p ON p.ui_map_id = m.id
     WHERE p.ticket_ids LIKE ?
     ORDER BY m.updated_at DESC`,
    )
    .all(`%${ticketId}%`) as UiMapRow[];
  if (fromPages.length > 0) return fromPages;

  // Check elements
  const fromElements = db
    .prepare(
      `SELECT DISTINCT m.* FROM ui_maps m
     JOIN ui_map_elements e ON e.ui_map_id = m.id
     WHERE e.ticket_ids LIKE ?
     ORDER BY m.updated_at DESC`,
    )
    .all(`%${ticketId}%`) as UiMapRow[];
  return fromElements;
}

/** Auto-resolve: find map by ticket, repo, or target — returns first match.
 *  When found via repo or target (not ticket), auto-adds the ticket to the map
 *  so future resolves by ticket find it immediately. */
export function resolveUiMap(opts: {
  ticketId?: string;
  repoUrl?: string;
  targetUrl?: string;
}): UiMapRow | undefined {
  // 1. Try ticket first
  if (opts.ticketId) {
    const maps = findUiMapsByTicket(opts.ticketId);
    if (maps.length > 0) return maps[0];
  }
  // 2. Try repo
  if (opts.repoUrl) {
    const maps = findUiMapsByRepo(opts.repoUrl);
    if (maps.length > 0) {
      // Auto-register this ticket so next resolve finds it by ticket
      if (opts.ticketId)
        updateUiMap(maps[0].id, { addTicketIds: [opts.ticketId] });
      return maps[0];
    }
  }
  // 3. Try target URL (origin-normalized)
  if (opts.targetUrl) {
    const maps = findUiMapsByTarget(opts.targetUrl);
    if (maps.length > 0) {
      // Auto-register this ticket so next resolve finds it by ticket
      if (opts.ticketId)
        updateUiMap(maps[0].id, { addTicketIds: [opts.ticketId] });
      return maps[0];
    }
  }
  return undefined;
}

export function updateUiMap(
  id: string,
  updates: {
    name?: string;
    description?: string;
    addRepos?: string[];
    addTargets?: string[];
    addTicketIds?: string[];
  },
): void {
  const db = getDb();
  const map = db.prepare("SELECT * FROM ui_maps WHERE id = ?").get(id) as
    | UiMapRow
    | undefined;
  if (!map) return;

  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];

  if (updates.name) {
    sets.push("name = ?");
    params.push(updates.name);
  }
  if (updates.description) {
    sets.push("description = ?");
    params.push(updates.description);
  }
  if (updates.addRepos?.length) {
    sets.push("repo_urls = ?");
    params.push(mergeJsonArray(map.repo_urls, updates.addRepos));
  }
  if (updates.addTargets?.length) {
    sets.push("target_urls = ?");
    params.push(mergeJsonArray(map.target_urls, updates.addTargets));
  }
  if (updates.addTicketIds?.length) {
    sets.push("ticket_ids = ?");
    params.push(mergeJsonArray(map.ticket_ids, updates.addTicketIds));
  }

  params.push(id);
  db.prepare(`UPDATE ui_maps SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params,
  );
}

export function deleteUiMap(id: string): number {
  const db = getDb();
  db.prepare("DELETE FROM ui_map_forms WHERE ui_map_id = ?").run(id);
  db.prepare("DELETE FROM ui_map_navigations WHERE ui_map_id = ?").run(id);
  db.prepare("DELETE FROM ui_map_elements WHERE ui_map_id = ?").run(id);
  db.prepare("DELETE FROM ui_map_pages WHERE ui_map_id = ?").run(id);
  return db.prepare("DELETE FROM ui_maps WHERE id = ?").run(id).changes;
}

// ── Pages ──

export interface CreatePageInput {
  uiMapId: string;
  urlPattern: string;
  pageTitle?: string;
  description?: string;
  snapshotPath?: string;
  screenshotPath?: string;
  authRequired?: boolean;
  authRoles?: string[];
  relatedCode?: string[];
  relatedRepos?: string[];
  ticketIds?: string[];
  targetParity?: Record<string, unknown>;
  createdByRun?: string;
  createdBySession?: string;
  createdByTicket?: string;
}

export function upsertPage(input: CreatePageInput): string {
  const db = getDb();
  input.urlPattern = normalizeUrl(input.urlPattern);

  // Check if page already exists for this map + url_pattern
  const existing = db
    .prepare(
      "SELECT * FROM ui_map_pages WHERE ui_map_id = ? AND url_pattern = ?",
    )
    .get(input.uiMapId, input.urlPattern) as UiMapPageRow | undefined;

  if (existing) {
    // Update existing page — merge arrays, update snapshots
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (input.pageTitle) {
      sets.push("page_title = ?");
      params.push(input.pageTitle);
    }
    if (input.description) {
      sets.push("description = ?");
      params.push(input.description);
    }
    if (input.snapshotPath) {
      sets.push("snapshot_path = ?");
      params.push(input.snapshotPath);
    }
    if (input.screenshotPath) {
      sets.push("screenshot_path = ?");
      params.push(input.screenshotPath);
    }
    if (input.authRequired !== undefined) {
      sets.push("auth_required = ?");
      params.push(input.authRequired ? 1 : 0);
    }
    if (input.authRoles?.length) {
      sets.push("auth_roles = ?");
      params.push(mergeJsonArray(existing.auth_roles, input.authRoles));
    }
    if (input.relatedCode?.length) {
      sets.push("related_code = ?");
      params.push(mergeJsonArray(existing.related_code, input.relatedCode));
    }
    if (input.relatedRepos?.length) {
      sets.push("related_repos = ?");
      params.push(mergeJsonArray(existing.related_repos, input.relatedRepos));
    }
    if (input.ticketIds?.length) {
      sets.push("ticket_ids = ?");
      params.push(mergeJsonArray(existing.ticket_ids, input.ticketIds));
    }
    if (input.targetParity) {
      sets.push("target_parity = ?");
      params.push(mergeJsonObject(existing.target_parity, input.targetParity));
    }
    if (input.createdByRun) {
      sets.push("updated_by_run = ?");
      params.push(input.createdByRun);
    }
    if (input.createdByTicket) {
      sets.push("updated_by_ticket = ?");
      params.push(input.createdByTicket);
    }

    sets.push("last_verified_at = datetime('now')");
    if (input.createdByRun) {
      sets.push("last_verified_run = ?");
      params.push(input.createdByRun);
    }
    sets.push("status = 'active'");

    params.push(existing.id);
    db.prepare(`UPDATE ui_map_pages SET ${sets.join(", ")} WHERE id = ?`).run(
      ...params,
    );
    return existing.id;
  }

  // Insert new page
  const id = uuid();
  db.prepare(
    `INSERT INTO ui_map_pages
     (id, ui_map_id, url_pattern, page_title, description, snapshot_path, screenshot_path,
      auth_required, auth_roles, related_code, related_repos, ticket_ids, target_parity,
      created_by_run, created_by_session, created_by_ticket, last_verified_at, last_verified_run)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
  ).run(
    id,
    input.uiMapId,
    input.urlPattern,
    input.pageTitle ?? null,
    input.description ?? null,
    input.snapshotPath ?? null,
    input.screenshotPath ?? null,
    input.authRequired ? 1 : 0,
    JSON.stringify(input.authRoles ?? []),
    JSON.stringify(input.relatedCode ?? []),
    JSON.stringify(input.relatedRepos ?? []),
    JSON.stringify(input.ticketIds ?? []),
    JSON.stringify(input.targetParity ?? {}),
    input.createdByRun ?? null,
    input.createdBySession ?? null,
    input.createdByTicket ?? null,
    input.createdByRun ?? null,
  );
  return id;
}

export function getPage(id: string): UiMapPageRow | undefined {
  return getDb().prepare("SELECT * FROM ui_map_pages WHERE id = ?").get(id) as
    | UiMapPageRow
    | undefined;
}

export function getPageByUrl(
  uiMapId: string,
  urlPattern: string,
): UiMapPageRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM ui_map_pages WHERE ui_map_id = ? AND url_pattern = ?",
    )
    .get(uiMapId, normalizeUrl(urlPattern)) as UiMapPageRow | undefined;
}

export function listPages(uiMapId: string): UiMapPageRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM ui_map_pages WHERE ui_map_id = ? ORDER BY url_pattern",
    )
    .all(uiMapId) as UiMapPageRow[];
}

export function updatePageStatus(
  pageId: string,
  status: string,
  opts?: { runId?: string; ticketId?: string },
): void {
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const params: unknown[] = [status];
  if (opts?.runId) {
    sets.push("updated_by_run = ?");
    params.push(opts.runId);
  }
  if (opts?.ticketId) {
    sets.push("updated_by_ticket = ?");
    params.push(opts.ticketId);
  }
  params.push(pageId);
  getDb()
    .prepare(`UPDATE ui_map_pages SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
}

// ── Elements ──

export interface CreateElementInput {
  pageId: string;
  uiMapId: string;
  selector: string;
  elementType: string;
  elementRole?: string;
  elementText?: string;
  elementName?: string;
  positionHint?: string;
  actionType?: string;
  actionResult?: string;
  relatedCode?: string;
  relatedRepos?: string[];
  ticketIds?: string[];
  authRoles?: string[];
  targetParity?: Record<string, unknown>;
  createdByRun?: string;
  createdBySession?: string;
  createdByTicket?: string;
  createdByTestcase?: string;
}

export function upsertElement(input: CreateElementInput): string {
  const db = getDb();

  // Match by page + selector
  const existing = db
    .prepare("SELECT * FROM ui_map_elements WHERE page_id = ? AND selector = ?")
    .get(input.pageId, input.selector) as UiMapElementRow | undefined;

  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (input.elementText) {
      sets.push("element_text = ?");
      params.push(input.elementText);
    }
    if (input.elementRole) {
      sets.push("element_role = ?");
      params.push(input.elementRole);
    }
    if (input.elementName) {
      sets.push("element_name = ?");
      params.push(input.elementName);
    }
    if (input.positionHint) {
      sets.push("position_hint = ?");
      params.push(input.positionHint);
    }
    if (input.actionType) {
      sets.push("action_type = ?");
      params.push(input.actionType);
    }
    if (input.actionResult) {
      sets.push("action_result = ?");
      params.push(input.actionResult);
    }
    if (input.relatedCode) {
      sets.push("related_code = ?");
      params.push(input.relatedCode);
    }
    if (input.relatedRepos?.length) {
      sets.push("related_repos = ?");
      params.push(mergeJsonArray(existing.related_repos, input.relatedRepos));
    }
    if (input.ticketIds?.length) {
      sets.push("ticket_ids = ?");
      params.push(mergeJsonArray(existing.ticket_ids, input.ticketIds));
    }
    if (input.authRoles?.length) {
      sets.push("auth_roles = ?");
      params.push(mergeJsonArray(existing.auth_roles, input.authRoles));
    }
    if (input.targetParity) {
      sets.push("target_parity = ?");
      params.push(mergeJsonObject(existing.target_parity, input.targetParity));
    }
    if (input.createdByRun) {
      sets.push("updated_by_run = ?");
      params.push(input.createdByRun);
    }
    if (input.createdByTicket) {
      sets.push("updated_by_ticket = ?");
      params.push(input.createdByTicket);
    }

    params.push(existing.id);
    db.prepare(
      `UPDATE ui_map_elements SET ${sets.join(", ")} WHERE id = ?`,
    ).run(...params);
    return existing.id;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO ui_map_elements
     (id, page_id, ui_map_id, selector, element_type, element_role, element_text, element_name,
      position_hint, action_type, action_result, related_code, related_repos, ticket_ids, auth_roles,
      target_parity, created_by_run, created_by_session, created_by_ticket, created_by_testcase)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.pageId,
    input.uiMapId,
    input.selector,
    input.elementType,
    input.elementRole ?? null,
    input.elementText ?? null,
    input.elementName ?? null,
    input.positionHint ?? null,
    input.actionType ?? null,
    input.actionResult ?? null,
    input.relatedCode ?? null,
    JSON.stringify(input.relatedRepos ?? []),
    JSON.stringify(input.ticketIds ?? []),
    JSON.stringify(input.authRoles ?? []),
    JSON.stringify(input.targetParity ?? {}),
    input.createdByRun ?? null,
    input.createdBySession ?? null,
    input.createdByTicket ?? null,
    input.createdByTestcase ?? null,
  );
  return id;
}

export function listElements(pageId: string): UiMapElementRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM ui_map_elements WHERE page_id = ? ORDER BY element_type, element_text",
    )
    .all(pageId) as UiMapElementRow[];
}

export function listElementsByMap(uiMapId: string): UiMapElementRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM ui_map_elements WHERE ui_map_id = ? ORDER BY page_id, element_type",
    )
    .all(uiMapId) as UiMapElementRow[];
}

/** Record a selector hit (success). */
export function hitElement(elementId: string, runId?: string): void {
  getDb()
    .prepare(
      `UPDATE ui_map_elements SET
       times_used = times_used + 1,
       times_succeeded = times_succeeded + 1,
       last_used_at = datetime('now'),
       last_used_run = COALESCE(?, last_used_run),
       status = CASE WHEN times_failed > 0 AND (times_succeeded + 1) * 100 / (times_used + 1) < 80 THEN 'flaky' ELSE 'working' END,
       updated_at = datetime('now')
     WHERE id = ?`,
    )
    .run(runId ?? null, elementId);
}

/** Record a selector miss (failure). */
export function missElement(elementId: string, runId?: string): void {
  getDb()
    .prepare(
      `UPDATE ui_map_elements SET
       times_used = times_used + 1,
       times_failed = times_failed + 1,
       last_used_at = datetime('now'),
       last_used_run = COALESCE(?, last_used_run),
       status = CASE
         WHEN (times_succeeded * 100 / (times_used + 1)) < 50 THEN 'broken'
         WHEN (times_succeeded * 100 / (times_used + 1)) < 80 THEN 'flaky'
         ELSE 'working'
       END,
       updated_at = datetime('now')
     WHERE id = ?`,
    )
    .run(runId ?? null, elementId);
}

/** Add an alternative selector to an element. */
export function addAltSelector(elementId: string, selector: string): void {
  const db = getDb();
  const el = db
    .prepare("SELECT alt_selectors FROM ui_map_elements WHERE id = ?")
    .get(elementId) as { alt_selectors: string } | undefined;
  if (!el) return;
  const updated = mergeJsonArray(el.alt_selectors, [selector]);
  db.prepare(
    "UPDATE ui_map_elements SET alt_selectors = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(updated, elementId);
}

export function updateElementStatus(
  elementId: string,
  status: string,
  opts?: { runId?: string; ticketId?: string },
): void {
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const params: unknown[] = [status];
  if (opts?.runId) {
    sets.push("updated_by_run = ?");
    params.push(opts.runId);
  }
  if (opts?.ticketId) {
    sets.push("updated_by_ticket = ?");
    params.push(opts.ticketId);
  }
  params.push(elementId);
  getDb()
    .prepare(`UPDATE ui_map_elements SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
}

/** Get flaky/broken elements for a map. */
export function getFlakyElements(uiMapId: string): UiMapElementRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM ui_map_elements WHERE ui_map_id = ? AND status IN ('flaky', 'broken') ORDER BY times_failed DESC",
    )
    .all(uiMapId) as UiMapElementRow[];
}

/** Lookup elements for a specific URL pattern in a map. */
export function lookupElements(
  uiMapId: string,
  urlPattern: string,
  elementType?: string,
): UiMapElementRow[] {
  const db = getDb();
  const page = db
    .prepare(
      "SELECT id FROM ui_map_pages WHERE ui_map_id = ? AND url_pattern = ?",
    )
    .get(uiMapId, normalizeUrl(urlPattern)) as { id: string } | undefined;
  if (!page) return [];

  if (elementType) {
    return db
      .prepare(
        "SELECT * FROM ui_map_elements WHERE page_id = ? AND element_type = ? AND status != 'removed' ORDER BY times_succeeded DESC",
      )
      .all(page.id, elementType) as UiMapElementRow[];
  }
  return db
    .prepare(
      "SELECT * FROM ui_map_elements WHERE page_id = ? AND status != 'removed' ORDER BY element_type, times_succeeded DESC",
    )
    .all(page.id) as UiMapElementRow[];
}

// ── Navigations ──

export interface CreateNavInput {
  uiMapId: string;
  fromPageId: string;
  toPageId: string;
  viaElementId?: string;
  navType?: string;
  conditions?: string[];
  ticketIds?: string[];
  authRoles?: string[];
  targetParity?: Record<string, unknown>;
  createdByRun?: string;
  createdByTicket?: string;
}

export function upsertNavigation(input: CreateNavInput): string {
  const db = getDb();

  const existing = db
    .prepare(
      "SELECT * FROM ui_map_navigations WHERE ui_map_id = ? AND from_page_id = ? AND to_page_id = ? AND COALESCE(via_element_id, '') = ?",
    )
    .get(
      input.uiMapId,
      input.fromPageId,
      input.toPageId,
      input.viaElementId ?? "",
    ) as UiMapNavigationRow | undefined;

  if (existing) {
    const sets: string[] = [
      "updated_at = datetime('now')",
      "times_used = times_used + 1",
    ];
    const params: unknown[] = [];
    if (input.ticketIds?.length) {
      sets.push("ticket_ids = ?");
      params.push(mergeJsonArray(existing.ticket_ids, input.ticketIds));
    }
    if (input.conditions?.length) {
      sets.push("conditions = ?");
      params.push(mergeJsonArray(existing.conditions, input.conditions));
    }
    if (input.createdByRun) {
      sets.push("updated_by_run = ?");
      params.push(input.createdByRun);
    }
    if (input.createdByTicket) {
      sets.push("updated_by_ticket = ?");
      params.push(input.createdByTicket);
    }
    params.push(existing.id);
    db.prepare(
      `UPDATE ui_map_navigations SET ${sets.join(", ")} WHERE id = ?`,
    ).run(...params);
    return existing.id;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO ui_map_navigations
     (id, ui_map_id, from_page_id, to_page_id, via_element_id, nav_type, conditions,
      ticket_ids, auth_roles, target_parity, times_used, created_by_run, created_by_ticket)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    input.uiMapId,
    input.fromPageId,
    input.toPageId,
    input.viaElementId ?? null,
    input.navType ?? "click",
    JSON.stringify(input.conditions ?? []),
    JSON.stringify(input.ticketIds ?? []),
    JSON.stringify(input.authRoles ?? []),
    JSON.stringify(input.targetParity ?? {}),
    input.createdByRun ?? null,
    input.createdByTicket ?? null,
  );
  return id;
}

export function listNavigations(uiMapId: string): UiMapNavigationRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM ui_map_navigations WHERE ui_map_id = ? AND status = 'active' ORDER BY from_page_id",
    )
    .all(uiMapId) as UiMapNavigationRow[];
}

/** Find navigation path from one URL to another (breadth-first search). */
export function findPath(
  uiMapId: string,
  fromUrl: string,
  toUrl: string,
): Array<{
  page: UiMapPageRow;
  nav?: UiMapNavigationRow;
  element?: UiMapElementRow;
}> | null {
  const db = getDb();
  const fromPage = db
    .prepare(
      "SELECT * FROM ui_map_pages WHERE ui_map_id = ? AND url_pattern = ?",
    )
    .get(uiMapId, normalizeUrl(fromUrl)) as UiMapPageRow | undefined;
  const toPage = db
    .prepare(
      "SELECT * FROM ui_map_pages WHERE ui_map_id = ? AND url_pattern = ?",
    )
    .get(uiMapId, normalizeUrl(toUrl)) as UiMapPageRow | undefined;
  if (!fromPage || !toPage) return null;

  const navs = db
    .prepare(
      "SELECT * FROM ui_map_navigations WHERE ui_map_id = ? AND status = 'active'",
    )
    .all(uiMapId) as UiMapNavigationRow[];

  // BFS
  const visited = new Set<string>();
  const queue: Array<{
    pageId: string;
    path: Array<{ pageId: string; navId?: string }>;
  }> = [{ pageId: fromPage.id, path: [{ pageId: fromPage.id }] }];
  visited.add(fromPage.id);

  while (queue.length > 0) {
    const { pageId, path } = queue.shift()!;
    if (pageId === toPage.id) {
      // Resolve full objects
      return path.map((step) => {
        const page = db
          .prepare("SELECT * FROM ui_map_pages WHERE id = ?")
          .get(step.pageId) as UiMapPageRow;
        let nav: UiMapNavigationRow | undefined;
        let element: UiMapElementRow | undefined;
        if (step.navId) {
          nav = db
            .prepare("SELECT * FROM ui_map_navigations WHERE id = ?")
            .get(step.navId) as UiMapNavigationRow;
          if (nav?.via_element_id) {
            element = db
              .prepare("SELECT * FROM ui_map_elements WHERE id = ?")
              .get(nav.via_element_id) as UiMapElementRow;
          }
        }
        return { page, nav, element };
      });
    }

    for (const nav of navs) {
      if (nav.from_page_id === pageId && !visited.has(nav.to_page_id)) {
        visited.add(nav.to_page_id);
        queue.push({
          pageId: nav.to_page_id,
          path: [...path, { pageId: nav.to_page_id, navId: nav.id }],
        });
      }
    }
  }

  return null; // No path found
}

// ── Forms ──

export interface CreateFormInput {
  pageId: string;
  uiMapId: string;
  formSelector?: string;
  formName?: string;
  fields?: Array<{ elementId: string; inputType: string; label?: string }>;
  submitElementId?: string;
  successIndicator?: string;
  errorIndicator?: string;
  sampleValues?: Record<string, string>;
  ticketIds?: string[];
  authRoles?: string[];
  createdByRun?: string;
  createdByTicket?: string;
}

export function upsertForm(input: CreateFormInput): string {
  const db = getDb();

  const existing = db
    .prepare(
      "SELECT * FROM ui_map_forms WHERE page_id = ? AND COALESCE(form_selector, form_name, '') = ?",
    )
    .get(input.pageId, input.formSelector ?? input.formName ?? "") as
    | UiMapFormRow
    | undefined;

  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (input.fields) {
      sets.push("fields = ?");
      params.push(JSON.stringify(input.fields));
    }
    if (input.submitElementId) {
      sets.push("submit_element_id = ?");
      params.push(input.submitElementId);
    }
    if (input.successIndicator) {
      sets.push("success_indicator = ?");
      params.push(input.successIndicator);
    }
    if (input.errorIndicator) {
      sets.push("error_indicator = ?");
      params.push(input.errorIndicator);
    }
    if (input.sampleValues) {
      sets.push("sample_values = ?");
      params.push(mergeJsonObject(existing.sample_values, input.sampleValues));
    }
    if (input.ticketIds?.length) {
      sets.push("ticket_ids = ?");
      params.push(mergeJsonArray(existing.ticket_ids, input.ticketIds));
    }
    if (input.createdByRun) {
      sets.push("updated_by_run = ?");
      params.push(input.createdByRun);
    }
    if (input.createdByTicket) {
      sets.push("updated_by_ticket = ?");
      params.push(input.createdByTicket);
    }

    params.push(existing.id);
    db.prepare(`UPDATE ui_map_forms SET ${sets.join(", ")} WHERE id = ?`).run(
      ...params,
    );
    return existing.id;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO ui_map_forms
     (id, page_id, ui_map_id, form_selector, form_name, fields, submit_element_id,
      success_indicator, error_indicator, sample_values, ticket_ids, auth_roles,
      created_by_run, created_by_ticket)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.pageId,
    input.uiMapId,
    input.formSelector ?? null,
    input.formName ?? null,
    JSON.stringify(input.fields ?? []),
    input.submitElementId ?? null,
    input.successIndicator ?? null,
    input.errorIndicator ?? null,
    JSON.stringify(input.sampleValues ?? {}),
    JSON.stringify(input.ticketIds ?? []),
    JSON.stringify(input.authRoles ?? []),
    input.createdByRun ?? null,
    input.createdByTicket ?? null,
  );
  return id;
}

export function listForms(pageId: string): UiMapFormRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM ui_map_forms WHERE page_id = ? ORDER BY form_name, form_selector",
    )
    .all(pageId) as UiMapFormRow[];
}

// ── Stats ──

export function getMapStats(uiMapId: string) {
  const db = getDb();
  const pages = (
    db
      .prepare("SELECT COUNT(*) as c FROM ui_map_pages WHERE ui_map_id = ?")
      .get(uiMapId) as { c: number }
  ).c;
  const elements = (
    db
      .prepare("SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ?")
      .get(uiMapId) as { c: number }
  ).c;
  const navs = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM ui_map_navigations WHERE ui_map_id = ?",
      )
      .get(uiMapId) as { c: number }
  ).c;
  const forms = (
    db
      .prepare("SELECT COUNT(*) as c FROM ui_map_forms WHERE ui_map_id = ?")
      .get(uiMapId) as { c: number }
  ).c;
  const working = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ? AND status = 'working'",
      )
      .get(uiMapId) as { c: number }
  ).c;
  const flaky = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ? AND status = 'flaky'",
      )
      .get(uiMapId) as { c: number }
  ).c;
  const broken = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM ui_map_elements WHERE ui_map_id = ? AND status = 'broken'",
      )
      .get(uiMapId) as { c: number }
  ).c;
  const ticketIds = db
    .prepare(
      "SELECT DISTINCT value FROM ui_map_pages, json_each(ui_map_pages.ticket_ids) WHERE ui_map_id = ?",
    )
    .all(uiMapId) as Array<{ value: string }>;

  return {
    pages,
    elements,
    navigations: navs,
    forms,
    working,
    flaky,
    broken,
    ticketIds: ticketIds.map((j) => j.value),
  };
}

// ── Snapshot scanner ──

interface ParsedElement {
  type: string; // normalized type: button, input, link, select, etc.
  role: string; // original ARIA role from snapshot
  text: string; // visible text/label
  selector: string; // best stable selector (role+text based)
  selectorType: string; // what kind of selector: "role+text" | "role+placeholder" | "role+url" | "ref"
  ref: string; // ephemeral session ref (e.g. "e3")
  url?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** Map accessibility tree role names to our element_type values. */
const ROLE_MAP: Record<string, string> = {
  link: "link",
  button: "button",
  textbox: "input",
  combobox: "select",
  checkbox: "checkbox",
  radio: "radio",
  tab: "tab",
  menuitem: "menu",
  img: "image",
  heading: "text",
  searchbox: "input",
  slider: "input",
  spinbutton: "input",
  switch: "checkbox",
  textarea: "input",
};

/**
 * Parse an accessibility snapshot and extract interactive elements.
 * Builds stable selectors using this priority:
 *   1. role + text/label  (e.g. button:"Sign In")
 *   2. role + placeholder  (e.g. input[placeholder="Search"])
 *   3. role + url          (e.g. link[url="/admin2/home"])
 *   4. ref                 (e.g. @e3 — ephemeral fallback)
 */
export function parseSnapshot(snapshotText: string): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const lines = snapshotText.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.replace(/^[\s-]+/, "").trim();
    if (!trimmed) continue;

    const refMatch = trimmed.match(/\[ref=(e\d+)\]/);
    if (!refMatch) continue;

    const ref = refMatch[1];

    // Extract role
    const roleMatch = trimmed.match(/^(\w+)/);
    if (!roleMatch) continue;
    const role = roleMatch[1].toLowerCase();

    // Skip structural roles
    if (
      [
        "document",
        "banner",
        "navigation",
        "list",
        "listitem",
        "search",
        "separator",
        "complementary",
        "main",
        "contentinfo",
        "region",
      ].includes(role)
    )
      continue;

    const type = ROLE_MAP[role] || role;

    // Extract text (in quotes)
    const textMatch = trimmed.match(/"([^"]+)"/);
    const text = textMatch ? textMatch[1] : "";

    // Look at subsequent indented lines for /url, /placeholder, /title, /alt
    let url: string | undefined;
    let placeholder: string | undefined;
    let title: string | undefined;
    let altText: string | undefined;
    const disabled = trimmed.includes("[disabled]");

    for (let i = lineIdx + 1; i < Math.min(lineIdx + 5, lines.length); i++) {
      const nextLine = lines[i]?.trim();
      if (!nextLine || (nextLine.startsWith("- ") && nextLine.match(/\[ref=/)))
        break;
      const urlM = nextLine.match(/\/url:\s*(.+)/);
      if (urlM) url = urlM[1].trim();
      const phM = nextLine.match(/\/placeholder:\s*(.+)/);
      if (phM) placeholder = phM[1].trim();
      const titleM = nextLine.match(/\/title:\s*(.+)/);
      if (titleM) title = titleM[1].trim();
      const altM = nextLine.match(/\/alt:\s*(.+)/);
      if (altM) altText = altM[1].trim();
    }

    // Build selector with priority: text > placeholder > title > alt > url > ref
    let selector: string;
    let selectorType: string;

    if (text) {
      selector = `${role}[name="${text}"]`;
      selectorType = "role+text";
    } else if (placeholder) {
      selector = `${role}[placeholder="${placeholder}"]`;
      selectorType = "role+placeholder";
    } else if (title) {
      selector = `${role}[title="${title}"]`;
      selectorType = "role+title";
    } else if (altText) {
      selector = `${role}[alt="${altText}"]`;
      selectorType = "role+alt";
    } else if (url) {
      selector = `${role}[url="${url}"]`;
      selectorType = "role+url";
    } else {
      selector = `@${ref}`;
      selectorType = "ref";
    }

    elements.push({
      type,
      role,
      text: text || placeholder || title || altText || "",
      selector,
      selectorType,
      ref,
      url,
      placeholder,
      disabled,
    });
  }

  return elements;
}

/**
 * Scan an accessibility snapshot and bulk-upsert all interactive elements into a UI map page.
 * Returns { added, updated, total }.
 */
export function scanSnapshotIntoPage(
  pageId: string,
  uiMapId: string,
  snapshotText: string,
  opts?: {
    ticketIds?: string[];
    runId?: string;
    sessionId?: string;
    testcaseId?: string;
  },
): { added: number; updated: number; total: number } {
  const parsed = parseSnapshot(snapshotText);
  let added = 0;
  let updated = 0;

  for (const el of parsed) {
    const db = getDb();
    const existing = db
      .prepare(
        "SELECT id FROM ui_map_elements WHERE page_id = ? AND selector = ?",
      )
      .get(pageId, el.selector);

    upsertElement({
      pageId,
      uiMapId,
      selector: el.selector,
      elementType: el.type,
      elementRole: el.role,
      elementText: el.text || el.placeholder || undefined,
      elementName: el.placeholder || undefined,
      positionHint: el.selectorType, // stores selector strategy: "role+text", "role+placeholder", "ref"
      actionType:
        el.type === "button" || el.type === "link"
          ? "click"
          : el.type === "input"
            ? "type"
            : el.type === "select"
              ? "select"
              : el.type === "checkbox" || el.type === "radio"
                ? "toggle"
                : undefined,
      actionResult: el.url ? `navigates to ${el.url}` : undefined,
      ticketIds: opts?.ticketIds,
      createdByRun: opts?.runId,
      createdBySession: opts?.sessionId,
      createdByTestcase: opts?.testcaseId,
    });

    if (existing) updated++;
    else added++;
  }

  // Also detect forms: group textbox/combobox elements that appear consecutively
  // with a nearby button that looks like a submit
  const inputs = parsed.filter((e) =>
    ["input", "select", "checkbox", "radio"].includes(e.type),
  );
  const buttons = parsed.filter((e) => e.type === "button");

  if (inputs.length >= 2 && buttons.length > 0) {
    // Find the likely submit button (last button, or one named "submit"/"create"/"save"/"sign in")
    const submitKeywords = [
      "submit",
      "create",
      "save",
      "sign in",
      "log in",
      "login",
      "send",
      "confirm",
      "ok",
      "apply",
      "add",
      "update",
    ];
    let submitBtn = buttons.find((b) =>
      submitKeywords.some((kw) => b.text.toLowerCase().includes(kw)),
    );
    if (!submitBtn) submitBtn = buttons[buttons.length - 1];

    // Get element IDs for the form fields
    const db = getDb();
    const fields = inputs
      .map((inp) => {
        const elRow = db
          .prepare(
            "SELECT id FROM ui_map_elements WHERE page_id = ? AND selector = ?",
          )
          .get(pageId, inp.selector) as { id: string } | undefined;
        return {
          elementId: elRow?.id ?? "",
          inputType:
            inp.type === "select"
              ? "select"
              : inp.placeholder?.toLowerCase().includes("password")
                ? "password"
                : inp.placeholder?.toLowerCase().includes("email")
                  ? "email"
                  : "text",
          label: inp.text || inp.placeholder || inp.type,
        };
      })
      .filter((f) => f.elementId);

    const submitRow = db
      .prepare(
        "SELECT id FROM ui_map_elements WHERE page_id = ? AND selector = ?",
      )
      .get(pageId, submitBtn.selector) as { id: string } | undefined;

    if (fields.length >= 2) {
      upsertForm({
        pageId,
        uiMapId,
        formName: `Form (${fields.length} fields)`,
        fields,
        submitElementId: submitRow?.id,
        ticketIds: opts?.ticketIds,
        createdByRun: opts?.runId,
      });
    }
  }

  return { added, updated, total: parsed.length };
}
