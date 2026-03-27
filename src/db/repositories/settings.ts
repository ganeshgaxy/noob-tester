import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (id, key, value) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    )
    .run(uuid(), key, value, value);
}

export function getSetting(key: string): string | undefined {
  return (
    getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined
  )?.value;
}

export function listSettings(): Array<{
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}> {
  return getDb()
    .prepare("SELECT key, value, created_at, updated_at FROM settings ORDER BY key")
    .all() as Array<{ key: string; value: string; created_at: string; updated_at: string }>;
}

export function deleteSetting(key: string): boolean {
  return getDb().prepare("DELETE FROM settings WHERE key = ?").run(key).changes > 0;
}
