import { v4 as uuid } from "uuid";
import { join } from "path";
import { getDb, dataDir } from "../client.js";

// ── Repos ──

export function addRepo(name: string, url: string, description?: string): string {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO repos (id, name, url, description) VALUES (?, ?, ?, ?)")
    .run(id, name, url, description ?? null);
  return id;
}

export function getRepo(name: string) {
  return getDb().prepare("SELECT * FROM repos WHERE name = ?").get(name) as {
    id: string; name: string; url: string; description: string | null;
    local_path: string | null; last_synced: string | null;
    current_branch: string | null; last_commit: string | null; last_indexed: string | null;
  } | undefined;
}

export function listRepos() {
  return getDb().prepare("SELECT * FROM repos ORDER BY name").all();
}

export function updateRepoPath(name: string, localPath: string): void {
  // Only accept paths inside the dedicated repos directory
  const dedicatedDir = join(dataDir(), "repos");
  if (!localPath.startsWith(dedicatedDir)) {
    throw new Error(`Repo path must be inside ${dedicatedDir}. Got: ${localPath}`);
  }
  getDb()
    .prepare("UPDATE repos SET local_path = ?, last_synced = datetime('now') WHERE name = ?")
    .run(localPath, name);
}

export function updateRepoBranch(name: string, branch: string, commit: string): void {
  getDb()
    .prepare("UPDATE repos SET current_branch = ?, last_commit = ? WHERE name = ?")
    .run(branch, commit, name);
}

export function updateRepoIndexed(name: string): void {
  getDb()
    .prepare("UPDATE repos SET last_indexed = datetime('now') WHERE name = ?")
    .run(name);
}

export function deleteRepo(name: string): boolean {
  const repo = getRepo(name);
  if (!repo) return false;
  const db = getDb();
  db.prepare("DELETE FROM repo_group_members WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM repos WHERE id = ?").run(repo.id);
  // Clean up index data
  db.prepare("DELETE FROM code_fts WHERE repo_name = ?").run(name);
  db.prepare("DELETE FROM import_graph WHERE repo_name = ?").run(name);
  return true;
}

// ── Groups ──

export function addGroup(name: string, description?: string): string {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO repo_groups (id, name, description) VALUES (?, ?, ?)")
    .run(id, name, description ?? null);
  return id;
}

export function addRepoToGroup(groupName: string, repoName: string): void {
  const db = getDb();
  const group = db.prepare("SELECT id FROM repo_groups WHERE name = ?").get(groupName) as { id: string } | undefined;
  const repo = getRepo(repoName);
  if (!group) throw new Error(`Group "${groupName}" not found`);
  if (!repo) throw new Error(`Repo "${repoName}" not found`);
  db.prepare("INSERT OR IGNORE INTO repo_group_members (group_id, repo_id) VALUES (?, ?)").run(group.id, repo.id);
}

export function getGroupRepos(groupName: string) {
  return getDb()
    .prepare(`
      SELECT r.* FROM repos r
      JOIN repo_group_members m ON r.id = m.repo_id
      JOIN repo_groups g ON g.id = m.group_id
      WHERE g.name = ?
      ORDER BY r.name
    `)
    .all(groupName);
}

export function listGroups() {
  const db = getDb();
  const groups = db.prepare("SELECT * FROM repo_groups ORDER BY name").all() as Array<{
    id: string; name: string; description: string | null;
  }>;
  return groups.map((g) => {
    const repos = db
      .prepare(`
        SELECT r.name FROM repos r
        JOIN repo_group_members m ON r.id = m.repo_id
        WHERE m.group_id = ?
      `)
      .all(g.id) as Array<{ name: string }>;
    return { ...g, repos: repos.map((r) => r.name) };
  });
}

export function deleteGroup(name: string): boolean {
  const db = getDb();
  const group = db.prepare("SELECT id FROM repo_groups WHERE name = ?").get(name) as { id: string } | undefined;
  if (!group) return false;
  db.prepare("DELETE FROM repo_group_members WHERE group_id = ?").run(group.id);
  db.prepare("DELETE FROM repo_groups WHERE id = ?").run(group.id);
  return true;
}

// ── Resolve repos for a run ──

export function resolveRepoNames(names: string[]): Array<{ name: string; url: string; local_path: string | null }> {
  const results: Array<{ name: string; url: string; local_path: string | null }> = [];
  const seen = new Set<string>();

  for (const name of names) {
    // Check if it's a group
    const groupRepos = getGroupRepos(name) as Array<{ name: string; url: string; local_path: string | null }>;
    if (groupRepos.length > 0) {
      for (const r of groupRepos) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          results.push(r);
        }
      }
      continue;
    }

    // Check if it's a single repo
    const repo = getRepo(name);
    if (repo && !seen.has(repo.url)) {
      seen.add(repo.url);
      results.push({ name: repo.name, url: repo.url, local_path: repo.local_path });
    }
  }

  return results;
}
