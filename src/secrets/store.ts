/**
 * Secrets store — backed by SQLite, scoped to targets + roles.
 *
 * Value sources:
 *   - literal: plain text
 *   - env:VAR_NAME: resolved from process.env
 *   - op:vault/item/field: resolved via 1Password CLI
 */

import { execSync } from "child_process";
import { v4 as uuid } from "uuid";
import { getDb } from "../db/client.js";

// ── Targets ──

export function addTarget(name: string, url?: string, description?: string): string {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO targets (id, name, url, description) VALUES (?, ?, ?, ?)")
    .run(id, name, url ?? null, description ?? null);
  return id;
}

export function getTargetByName(name: string) {
  return getDb()
    .prepare("SELECT * FROM targets WHERE name = ?")
    .get(name) as { id: string; name: string; url: string | null; description: string | null } | undefined;
}

export function getTargetByUrl(url: string) {
  // Partial match — the stored URL can be a substring of the provided URL or vice versa
  return getDb()
    .prepare("SELECT * FROM targets WHERE ? LIKE '%' || url || '%' OR url LIKE '%' || ? || '%'")
    .get(url, url) as { id: string; name: string; url: string | null } | undefined;
}

export function listTargets() {
  return getDb()
    .prepare("SELECT * FROM targets ORDER BY name")
    .all();
}

export function deleteTarget(name: string): boolean {
  const target = getTargetByName(name);
  if (!target) return false;
  getDb().prepare("DELETE FROM secrets WHERE target_id = ?").run(target.id);
  getDb().prepare("DELETE FROM targets WHERE id = ?").run(target.id);
  return true;
}

function resolveTargetId(target: string): string {
  const t = getTargetByName(target);
  if (!t) throw new Error(`Target "${target}" not found. Add it with: noob-tester secrets target add ${target} --url <url>`);
  return t.id;
}

// ── Secrets CRUD ──

export function setSecret(target: string, role: string, key: string, value: string): void {
  const targetId = resolveTargetId(target);
  const sourceType = getSourceType(value);
  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM secrets WHERE target_id = ? AND role = ? AND key = ?")
    .get(targetId, role, key) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE secrets SET value = ?, source_type = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(value, sourceType, existing.id);
  } else {
    db.prepare(
      "INSERT INTO secrets (id, target_id, role, key, value, source_type) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(uuid(), targetId, role, key, value, sourceType);
  }
}

export function getSecretRaw(target: string, role: string, key: string): string | null {
  const targetId = resolveTargetId(target);
  const row = getDb()
    .prepare("SELECT value FROM secrets WHERE target_id = ? AND role = ? AND key = ?")
    .get(targetId, role, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function deleteSecret(target: string, role: string, key: string): boolean {
  const t = getTargetByName(target);
  if (!t) return false;
  const result = getDb()
    .prepare("DELETE FROM secrets WHERE target_id = ? AND role = ? AND key = ?")
    .run(t.id, role, key);
  return result.changes > 0;
}

export function deleteRole(target: string, role: string): boolean {
  const t = getTargetByName(target);
  if (!t) return false;
  const result = getDb()
    .prepare("DELETE FROM secrets WHERE target_id = ? AND role = ?")
    .run(t.id, role);
  return result.changes > 0;
}

// ── Queries ──

export function listSecrets(opts?: {
  target?: string;
  url?: string;
  role?: string;
}) {
  const db = getDb();
  let sql = `
    SELECT s.*, t.name as target_name, t.url as target_url
    FROM secrets s JOIN targets t ON s.target_id = t.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (opts?.target) {
    sql += " AND t.name = ?";
    params.push(opts.target);
  }
  if (opts?.url) {
    sql += " AND (? LIKE '%' || t.url || '%' OR t.url LIKE '%' || ? || '%')";
    params.push(opts.url, opts.url);
  }
  if (opts?.role) {
    sql += " AND s.role = ?";
    params.push(opts.role);
  }

  sql += " ORDER BY t.name, s.role, s.key";
  return db.prepare(sql).all(...params);
}

export function findSecretsByValue(search: string) {
  return getDb()
    .prepare(`
      SELECT s.*, t.name as target_name, t.url as target_url
      FROM secrets s JOIN targets t ON s.target_id = t.id
      WHERE s.value LIKE ? OR s.key LIKE ?
      ORDER BY t.name, s.role, s.key
    `)
    .all(`%${search}%`, `%${search}%`);
}

export function getRolesForTarget(target: string): string[] {
  const t = getTargetByName(target);
  if (!t) return [];
  const rows = getDb()
    .prepare("SELECT DISTINCT role FROM secrets WHERE target_id = ? ORDER BY role")
    .all(t.id) as Array<{ role: string }>;
  return rows.map((r) => r.role);
}

// ── Resolution ──

export function resolveValue(raw: string): string {
  if (raw.startsWith("env:")) {
    const envVar = raw.slice(4);
    const val = process.env[envVar];
    if (val === undefined) throw new Error(`Environment variable ${envVar} is not set`);
    return val;
  }

  if (raw.startsWith("op:") || raw.startsWith("op://")) {
    const ref = raw.replace(/^op:(\/\/)?/, "");
    // Parse: vault/item/field — vault can contain slashes, field is last, item is second-to-last
    const parts = ref.split("/");
    if (parts.length >= 3) {
      const field = parts[parts.length - 1];
      const item = parts[parts.length - 2];
      const vault = parts.slice(0, parts.length - 2).join("/");
      try {
        // Use --vault flag to handle vault names with slashes
        const raw = execSync(
          `op item get "${item}" --vault "${vault}" --fields label="${field}" --format json`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 }
        ).trim();
        // --format json returns a field object — extract .value
        try { const parsed = JSON.parse(raw); return parsed.value ?? raw; } catch { return raw.replace(/^"(.*)"$/, "$1"); }
      } catch {
        // Fallback to op read with URI (works for simple vault names)
        try {
          return execSync(`op read "op://${ref}"`, {
            encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000,
          }).trim();
        } catch (err) {
          throw new Error(`Failed to read from 1Password: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    // Simple ref — try op read directly
    try {
      const opUri = ref.startsWith("op://") ? ref : `op://${ref}`;
      return execSync(`op read "${opUri}"`, {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000,
      }).trim();
    } catch (err) {
      throw new Error(`Failed to read from 1Password: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return raw;
}

export function resolveProfile(target: string, role: string): Record<string, string> {
  const secrets = listSecrets({ target, role });
  const resolved: Record<string, string> = {};
  for (const s of secrets as Array<{ key: string; value: string }>) {
    try {
      resolved[s.key] = resolveValue(s.value);
    } catch (err) {
      resolved[s.key] = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return resolved;
}

export function resolveProfileByUrl(url: string, role: string): Record<string, string> | null {
  const target = getTargetByUrl(url);
  if (!target) return null;
  return resolveProfile(target.name, role);
}

// ── Helpers ──

export function getSourceType(raw: string): string {
  if (raw.startsWith("env:")) return "env";
  if (raw.startsWith("op:")) return "1password";
  return "literal";
}

export function maskValue(raw: string): string {
  if (raw.startsWith("env:")) return `env:${raw.slice(4)}`;
  if (raw.startsWith("op:")) return `op:${raw.slice(3)}`;
  return "••••••••";
}

/** Get all secrets grouped by target → role (values masked). For watch API. */
export function getAllSecretsMasked() {
  const db = getDb();
  const targets = db.prepare("SELECT * FROM targets ORDER BY name").all() as Array<{
    id: string; name: string; url: string | null; description: string | null;
  }>;

  const result: Record<string, {
    url: string | null;
    description: string | null;
    roles: Record<string, Array<{ key: string; source: string; masked: string }>>;
  }> = {};

  for (const t of targets) {
    const secrets = db
      .prepare("SELECT * FROM secrets WHERE target_id = ? ORDER BY role, key")
      .all(t.id) as Array<{ role: string; key: string; value: string; source_type: string }>;

    const roles: Record<string, Array<{ key: string; source: string; masked: string }>> = {};
    for (const s of secrets) {
      if (!roles[s.role]) roles[s.role] = [];
      roles[s.role].push({ key: s.key, source: s.source_type, masked: maskValue(s.value) });
    }

    result[t.name] = { url: t.url, description: t.description, roles };
  }

  return result;
}

/** Delete ALL secrets and targets. */
export function deleteAllSecrets(): void {
  const db = getDb();
  db.prepare("DELETE FROM secrets").run();
  db.prepare("DELETE FROM targets").run();
}

// ── 1Password Import ──

interface OpField {
  id: string;
  label: string;
  value?: string;
  type?: string;
  purpose?: string;
  totp?: string;
  reference?: string;
}

interface OpItem {
  id: string;
  title: string;
  vault: { id: string; name: string };
  fields?: OpField[];
}

/** Default label → key name mapping */
const DEFAULT_LABEL_MAP: Record<string, string> = {
  username: "LOGIN_EMAIL",
  email: "LOGIN_EMAIL",
  password: "LOGIN_PASSWORD",
  "one-time password": "OTP_SECRET",
  otp: "OTP_SECRET",
};

function normalizeKeyName(label: string): string {
  return label.toUpperCase().replace(/[\s\-\.]+/g, "_").replace(/[^A-Z0-9_]/g, "");
}

/**
 * Import all fields from a 1Password item into secrets.
 *
 * @param opRef - "vault/item" reference (e.g. "Private/MyApp")
 * @param target - target name
 * @param role - role name
 * @param opts.live - if true, store as op: references (always fresh); if false, store resolved values
 * @param opts.fieldMap - custom label → key mapping (e.g. {"username": "LOGIN_EMAIL"})
 * @param opts.prefix - prefix all key names (e.g. "APP_")
 */
export function importFromOnePassword(
  opRef: string,
  target: string,
  role: string,
  opts?: {
    live?: boolean;
    fieldMap?: Record<string, string>;
    prefix?: string;
  }
): Array<{ key: string; source: string; label: string }> {
  // Parse vault/item — last segment is item, everything before is vault
  // e.g. "ENG/Development/MyApp" → vault="ENG/Development", item="MyApp"
  const cleaned = opRef.replace(/^op:\/\//, "");
  const lastSlash = cleaned.lastIndexOf("/");
  let vault: string;
  let item: string;
  if (lastSlash > 0) {
    vault = cleaned.slice(0, lastSlash);
    item = cleaned.slice(lastSlash + 1);
  } else {
    vault = "Private";
    item = cleaned;
  }

  // Fetch the item from 1Password
  let itemJson: string;
  try {
    itemJson = execSync(
      `op item get "${item}" --vault "${vault}" --format json`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 15000 }
    );
  } catch (err) {
    throw new Error(
      `Failed to get 1Password item "${vault}/${item}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const opItem: OpItem = JSON.parse(itemJson);
  const fields = opItem.fields ?? [];
  const fieldMap = { ...DEFAULT_LABEL_MAP, ...(opts?.fieldMap ?? {}) };
  const prefix = opts?.prefix ?? "";
  const imported: Array<{ key: string; source: string; label: string }> = [];

  for (const field of fields) {
    // Skip concealed fields with no value and internal fields
    if (!field.value && !field.totp && field.type !== "OTP") continue;
    if (field.purpose === "NOTES" && !field.value) continue;

    const label = field.label?.toLowerCase() ?? field.id;

    // Determine key name
    let keyName = fieldMap[label] ?? normalizeKeyName(field.label ?? field.id);
    keyName = prefix + keyName;

    // Determine value
    let value: string;
    if (field.type === "OTP" || label === "one-time password" || label === "otp") {
      // OTP always stored as live reference — needs to generate fresh codes
      value = `op://${vault}/${item}/${field.label ?? "one-time password"}`;
    } else if (opts?.live) {
      // Live mode — store as op:// reference (resolved at read time via `op read`)
      value = `op://${vault}/${item}/${field.label ?? field.id}`;
    } else {
      // Snapshot mode — store the resolved value
      value = field.value ?? "";
    }

    if (!value) continue;

    setSecret(target, role, keyName, value);
    imported.push({
      key: keyName,
      source: getSourceType(value),
      label: field.label ?? field.id,
    });
  }

  return imported;
}
