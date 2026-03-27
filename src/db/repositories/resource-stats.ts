import { getDb, dataDir } from "../client.js";
import { join } from "path";
import { existsSync, statSync, readdirSync } from "fs";
import { homedir } from "os";

/**
 * Get a cached stat value.
 */
export function getStat(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM resource_stats WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * Set a cached stat value.
 */
export function setStat(key: string, value: string | number | object): void {
  const val = typeof value === "object" ? JSON.stringify(value) : String(value);
  getDb()
    .prepare(
      `INSERT INTO resource_stats (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, val);
}

/**
 * Get all cached stats as a map.
 */
export function getAllStats(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM resource_stats")
    .all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Update repo index stats (called after repos index / repos sync --reindex).
 */
export function updateRepoIndexStats(repoName: string): void {
  const db = getDb();
  const ftsCount = (db.prepare("SELECT COUNT(DISTINCT file_path) as c FROM code_fts WHERE repo_name = ?").get(repoName) as { c: number }).c;
  const importCount = (db.prepare("SELECT COUNT(*) as c FROM import_graph WHERE repo_name = ?").get(repoName) as { c: number }).c;
  setStat(`repo:${repoName}:indexed_files`, ftsCount);
  setStat(`repo:${repoName}:indexed_imports`, importCount);
}

/**
 * Update repo disk size (called after repos sync / repos clone).
 */
export function updateRepoDiskStats(repoName: string, localPath: string): void {
  if (!existsSync(localPath)) {
    setStat(`repo:${repoName}:disk_bytes`, -1); // -1 = path missing
    setStat(`repo:${repoName}:disk_files`, 0);
    return;
  }
  const info = dirSize(localPath);
  setStat(`repo:${repoName}:disk_bytes`, info.bytes);
  setStat(`repo:${repoName}:disk_files`, info.fileCount);
}

/**
 * Update evidence directory stats (called after evidence capture).
 */
export function updateEvidenceStats(): void {
  const evidencePath = join(homedir(), ".noob-tester", "evidence");
  const info = dirSizeFull(evidencePath);
  setStat("evidence:bytes", info.bytes);
  setStat("evidence:file_count", info.fileCount);
}

/**
 * Update ticket context directory stats (called after ticket-context save).
 */
export function updateTicketContextStats(): void {
  const contextPath = join(homedir(), ".noob-tester", "ticket-context");
  const info = dirSizeFull(contextPath);
  setStat("ticket_context:bytes", info.bytes);
  setStat("ticket_context:file_count", info.fileCount);

  // Also count entries from DB
  const db = getDb();
  try {
    const entryCount = (db.prepare("SELECT COUNT(*) as c FROM ticket_context_index").get() as { c: number }).c;
    const ticketCount = (db.prepare("SELECT COUNT(DISTINCT ticket_id) as c FROM ticket_context_index").get() as { c: number }).c;
    setStat("ticket_context:entries", entryCount);
    setStat("ticket_context:tickets", ticketCount);
  } catch {}
}

/**
 * Update database file size stat.
 */
export function updateDbStats(): void {
  const dbPath = join(dataDir(), "noob-tester.db");
  let dbSize = 0;
  try { dbSize = statSync(dbPath).size; } catch {}
  try { dbSize += statSync(dbPath + "-wal").size; } catch {}
  setStat("db:bytes", dbSize);
}

/**
 * Update table row counts (called periodically or on-demand).
 */
export function updateTableCounts(): void {
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'code_fts%' AND name NOT LIKE 'code_embeddings%' AND name NOT LIKE 'code_chunk_embeddings%' ORDER BY name")
    .all() as Array<{ name: string }>;
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      counts[t.name] = (db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number }).c;
    } catch {
      counts[t.name] = 0;
    }
  }
  setStat("db:table_counts", counts);
}

/**
 * Update coverage stats for a repo (called after coverage build).
 */
export function updateCoverageStats(repoName: string): void {
  const db = getDb();
  const totalFiles = (db.prepare("SELECT COUNT(DISTINCT file_path) as c FROM code_fts WHERE repo_name = ?").get(repoName) as { c: number }).c;
  const coveredFiles = (db.prepare("SELECT COUNT(DISTINCT file_path) as c FROM coverage_map WHERE repo_name = ?").get(repoName) as { c: number }).c;
  const totalLinks = (db.prepare("SELECT COUNT(*) as c FROM coverage_map WHERE repo_name = ?").get(repoName) as { c: number }).c;
  setStat(`coverage:${repoName}`, { totalFiles, coveredFiles, uncoveredFiles: totalFiles - coveredFiles, totalLinks, coveragePercent: totalFiles > 0 ? Math.round((coveredFiles / totalFiles) * 100) : 0 });
}

/**
 * Full refresh — recompute all stats. Called on first load or manual refresh.
 * This is the expensive operation, but only runs once.
 */
export function refreshAllStats(): void {
  updateDbStats();
  updateTableCounts();
  updateEvidenceStats();
  updateTicketContextStats();

  // Per-repo stats
  const db = getDb();
  const repos = db.prepare("SELECT name, local_path FROM repos").all() as Array<{ name: string; local_path: string | null }>;
  for (const r of repos) {
    updateRepoIndexStats(r.name);
    if (r.local_path) {
      updateRepoDiskStats(r.name, r.local_path); // handles missing path internally (sets -1)
    } else {
      setStat(`repo:${r.name}:disk_bytes`, -1);
      setStat(`repo:${r.name}:disk_files`, 0);
    }
  }
}

/**
 * Get all resource stats for the dashboard (fast — reads from cache table).
 */
export function getResourceStatsFromCache(): {
  database: { bytes: number; tables: Record<string, number> };
  evidence: { bytes: number; fileCount: number };
  ticketContext: { bytes: number; fileCount: number; entries: number; tickets: number };
  repos: { repos: Array<{ name: string; bytes: number; fileCount: number; indexed_files: number; indexed_imports: number }> };
  index: { files: number; chunks: number; imports: number };
  lastUpdated: string | null;
} {
  const stats = getAllStats();

  const dbBytes = parseInt(stats["db:bytes"] ?? "0") || 0;
  let tableCounts: Record<string, number> = {};
  try { tableCounts = JSON.parse(stats["db:table_counts"] ?? "{}"); } catch {}

  const evidenceBytes = parseInt(stats["evidence:bytes"] ?? "0") || 0;
  const evidenceFiles = parseInt(stats["evidence:file_count"] ?? "0") || 0;

  const tcBytes = parseInt(stats["ticket_context:bytes"] ?? "0") || 0;
  const tcFiles = parseInt(stats["ticket_context:file_count"] ?? "0") || 0;
  const tcEntries = parseInt(stats["ticket_context:entries"] ?? "0") || 0;
  const tcTickets = parseInt(stats["ticket_context:tickets"] ?? "0") || 0;

  // Aggregate repo stats from individual keys
  const db = getDb();
  const repoNames = db.prepare("SELECT name FROM repos ORDER BY name").all() as Array<{ name: string }>;
  const reposInfo = repoNames.map((r) => ({
    name: r.name,
    bytes: parseInt(stats[`repo:${r.name}:disk_bytes`] ?? "0") || 0,
    fileCount: parseInt(stats[`repo:${r.name}:disk_files`] ?? "0") || 0,
    indexed_files: parseInt(stats[`repo:${r.name}:indexed_files`] ?? "0") || 0,
    indexed_imports: parseInt(stats[`repo:${r.name}:indexed_imports`] ?? "0") || 0,
  }));

  const totalIndexedFiles = reposInfo.reduce((s, r) => s + r.indexed_files, 0);
  const totalIndexedImports = reposInfo.reduce((s, r) => s + r.indexed_imports, 0);

  // Get last update time
  const lastRow = db.prepare("SELECT MAX(updated_at) as t FROM resource_stats").get() as { t: string | null };

  return {
    database: { bytes: dbBytes, tables: tableCounts },
    evidence: { bytes: evidenceBytes, fileCount: evidenceFiles },
    ticketContext: { bytes: tcBytes, fileCount: tcFiles, entries: tcEntries, tickets: tcTickets },
    repos: { repos: reposInfo },
    index: { files: totalIndexedFiles, chunks: 0, imports: totalIndexedImports },
    lastUpdated: lastRow?.t ?? null,
  };
}

// ── Internal helpers ──

const SKIP_SIZE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".cache", ".venv", "vendor"]);

function dirSize(dir: string, skipDirs?: Set<string>): { bytes: number; fileCount: number } {
  let bytes = 0, fileCount = 0;
  if (!existsSync(dir)) return { bytes, fileCount };
  const skip = skipDirs ?? SKIP_SIZE_DIRS;
  try {
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) walk(join(d, entry.name));
        } else {
          try { bytes += statSync(join(d, entry.name)).size; fileCount++; } catch {}
        }
      }
    };
    walk(dir);
  } catch {}
  return { bytes, fileCount };
}

/** Dir size without skipping anything (for evidence/context dirs that have no junk). */
function dirSizeFull(dir: string): { bytes: number; fileCount: number } {
  return dirSize(dir, new Set());
}
