import { getDb } from "../client.js";
import { randomUUID } from "crypto";

export interface PageAgentConfig {
  id: string;
  page: string;
  agent_name: string | null;
  auto_run: number;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

export function getPageAgentConfig(page: string): PageAgentConfig | null {
  const db = getDb();
  return (db
    .prepare("SELECT * FROM page_agent_config WHERE page = ?")
    .get(page) as PageAgentConfig) ?? null;
}

export function setPageAgentConfig(
  page: string,
  fields: { agent_name?: string | null; auto_run?: number; config_json?: string | null },
): PageAgentConfig {
  const db = getDb();
  const existing = getPageAgentConfig(page);
  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const vals: unknown[] = [];
    if ("agent_name" in fields) { sets.push("agent_name = ?"); vals.push(fields.agent_name ?? null); }
    if ("auto_run" in fields)   { sets.push("auto_run = ?");   vals.push(fields.auto_run ?? 0); }
    if ("config_json" in fields){ sets.push("config_json = ?");vals.push(fields.config_json ?? null); }
    vals.push(page);
    db.prepare(`UPDATE page_agent_config SET ${sets.join(", ")} WHERE page = ?`).run(...vals);
  } else {
    db.prepare(
      "INSERT INTO page_agent_config (id, page, agent_name, auto_run, config_json) VALUES (?, ?, ?, ?, ?)",
    ).run(
      randomUUID(),
      page,
      fields.agent_name ?? null,
      fields.auto_run ?? 0,
      fields.config_json ?? null,
    );
  }
  return getPageAgentConfig(page)!;
}

export function deletePageAgentConfig(page: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM page_agent_config WHERE page = ?").run(page);
  return result.changes > 0;
}
