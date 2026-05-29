/**
 * Codebase indexer — clones repos, builds BM25 (FTS5) index + import graph.
 */

import { execSync } from "child_process";
import { join } from "path";
import { readdirSync, readFileSync, statSync, mkdirSync, existsSync, rmSync } from "fs";
import { v4 as uuid } from "uuid";
import { getDb, dataDir } from "../db/client.js";
import { addRepo, getRepo, deleteRepo, updateRepoPath, updateRepoBranch, updateRepoIndexed, resolveRepoNames, listRepos } from "../db/repositories/repos.js";
import { updateRepoIndexStats, updateRepoDiskStats } from "../db/repositories/resource-stats.js";
import chalk from "chalk";

const REPOS_DIR = () => join(dataDir(), "repos");

/** Get current branch name from a git repo. */
function getGitBranch(repoPath: string): string | null {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
  } catch { return null; }
}

/** Get current commit hash from a git repo. */
function getGitCommit(repoPath: string): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
  } catch { return null; }
}

/** Check if a repo's index is stale (commit changed since last index). */
export function isIndexStale(repoName: string): { stale: boolean; reason?: string; currentCommit?: string; indexedCommit?: string; currentBranch?: string } {
  const repo = getRepo(repoName);
  if (!repo || !repo.local_path || !existsSync(repo.local_path)) {
    return { stale: true, reason: "Repo not synced" };
  }
  const currentCommit = getGitCommit(repo.local_path);
  const currentBranch = getGitBranch(repo.local_path);
  if (!repo.last_indexed) {
    return { stale: true, reason: "Never indexed", currentCommit: currentCommit ?? undefined, currentBranch: currentBranch ?? undefined };
  }
  if (repo.last_commit && currentCommit && repo.last_commit !== currentCommit) {
    return { stale: true, reason: "Commit changed", currentCommit, indexedCommit: repo.last_commit, currentBranch: currentBranch ?? undefined };
  }
  return { stale: false, currentCommit: currentCommit ?? undefined, currentBranch: currentBranch ?? undefined };
}

// File extensions to index
const INDEXABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".cs", ".php", ".swift", ".m",
  ".vue", ".svelte", ".astro",
  ".html", ".css", ".scss", ".less",
  ".json", ".yaml", ".yml", ".toml",
  ".sql", ".graphql", ".gql",
  ".sh", ".bash", ".zsh",
  ".md", ".mdx",
  ".env.example", ".dockerfile", "Dockerfile",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  "__pycache__", ".venv", "venv", "vendor", "target", ".gradle",
  "coverage", ".nyc_output", ".cache", ".turbo",
]);

const MAX_FILE_SIZE = 100_000; // 100KB

// ── Discover: find all repos for a ticket from DB sources ──

export function discoverReposForTicket(ticketId: string, extraUrls?: string[]): string[] {
  const db = getDb();
  const urls = new Set<string>();

  // 1. From runs config_json for this ticket (DB)
  const runs = db.prepare(
    "SELECT config_json FROM runs WHERE input_ref = ?"
  ).all(ticketId) as Array<{ config_json: string }>;
  for (const r of runs) {
    try {
      const config = JSON.parse(r.config_json);
      if (Array.isArray(config.repos)) {
        for (const u of config.repos) if (u) urls.add(u);
      }
    } catch {}
  }

  // 3. From test cases repo_urls
  const tcs = db.prepare(
    "SELECT repo_urls FROM test_cases WHERE ticket_ref = ? AND repo_urls IS NOT NULL"
  ).all(ticketId) as Array<{ repo_urls: string }>;
  for (const tc of tcs) {
    try {
      const parsed = JSON.parse(tc.repo_urls);
      if (Array.isArray(parsed)) for (const u of parsed) if (u) urls.add(u);
    } catch {}
  }

  // 4. From UI maps linked to this ticket
  const maps = db.prepare(
    "SELECT repo_urls FROM ui_maps WHERE ticket_ids LIKE ?"
  ).all("%" + ticketId + "%") as Array<{ repo_urls: string }>;
  for (const m of maps) {
    try {
      const parsed = JSON.parse(m.repo_urls);
      if (Array.isArray(parsed)) for (const u of parsed) if (u) urls.add(u);
    } catch {}
  }

  // Extra URLs from user/agent
  if (extraUrls) {
    for (const u of extraUrls) if (u) urls.add(u);
  }

  return [...urls];
}

/**
 * Discover repos for a ticket and ensure them all.
 * Returns array of ensured repos + suggestions if none found.
 */
export function discoverAndEnsure(ticketId: string, extraUrls?: string[]) {
  const urls = discoverReposForTicket(ticketId, extraUrls);

  if (urls.length === 0) {
    // No repos found — return registered repos as suggestions
    const registered = (listRepos() as Array<{ name: string; url: string }>).map(r => ({ name: r.name, url: r.url }));
    return {
      repos: [],
      message: "No repos found for " + ticketId + ". Pass repo URLs with --url or use repos ensure.",
      registered: registered.length > 0 ? registered : undefined,
      hint: registered.length > 0
        ? "Try: noob-tester repos discover --ticket " + ticketId + " --url " + registered[0].url
        : "Register a repo first: noob-tester repos add <name> <url>",
    };
  }
  const results = ensureRepos(urls);
  return { repos: results, discovered: urls };
}

// ── Ensure: register + sync + index in one call ──

export function ensureRepo(url: string): { name: string; path: string; synced: boolean; indexed: boolean } {
  // Derive name from URL
  const urlParts = url.replace(/\.git$/, "").split("/");
  const name = urlParts[urlParts.length - 1] || url;

  // Check if already registered
  const existing = getRepo(name);
  const isNew = !existing;
  if (isNew) {
    addRepo(name, url);
    console.log(chalk.dim(`  Registered repo: ${name}`));
  }

  // Sync (clone or pull)
  const localPath = syncRepo(name);

  // Check if sync actually succeeded (repo dir exists with .git)
  const synced = existsSync(join(localPath, ".git"));
  if (!synced) {
    // Clone/pull failed — clean up the dead registration
    if (isNew) {
      deleteRepo(name);
      console.log(chalk.yellow(`  Removed failed repo: ${name} (clone failed)`));
    }
    return { name, path: localPath, synced: false, indexed: false };
  }

  // Index — use diff-aware if repo was previously indexed, full otherwise
  let indexed = false;
  try {
    const repo = getRepo(name);
    if (repo?.last_indexed && repo?.last_commit) {
      const result = indexRepoDiff(name);
      if (result.mode === "diff" && result.changedFiles === 0) {
        console.log(chalk.dim(`  ${name}: index up to date`));
      } else if (result.mode === "diff") {
        console.log(chalk.dim(`  ${name}: ${result.changedFiles} files changed, ${result.files} re-indexed (diff)`));
      } else {
        console.log(chalk.dim(`  ${name}: ${result.files} files indexed (full)`));
      }
    } else {
      const result = indexRepo(name);
      console.log(chalk.dim(`  ${name}: ${result.files} files indexed (first time)`));
    }
    indexed = true;
  } catch (err) {
    console.log(chalk.yellow(`  Warning: indexing ${name} failed: ${err}`));
  }

  return { name, path: localPath, synced, indexed };
}

/**
 * Ensure multiple repos exist locally. Accepts URLs or names.
 * Returns array of { name, path, synced, indexed }.
 */
export function ensureRepos(urlsOrNames: string[]): Array<{ name: string; path: string; synced: boolean; indexed: boolean }> {
  const results = [];
  for (const input of urlsOrNames) {
    // If it looks like a URL, use ensureRepo
    if (input.includes("://") || input.includes("@") || input.includes(".git")) {
      results.push(ensureRepo(input));
    } else {
      // It's a name — check if registered, sync if so
      const repo = getRepo(input);
      if (repo) {
        const path = syncRepo(input);
        let indexed = false;
        try { indexRepo(input); indexed = true; } catch {}
        results.push({ name: input, path, synced: true, indexed });
      } else {
        console.log(chalk.red(`  Repo "${input}" not found and not a URL. Skip.`));
      }
    }
  }
  return results;
}

// ── Sync ──

/** Check if a URL is a GitLab repo. */
function isGitLab(url: string): boolean {
  return url.includes("gitlab.com") || url.includes("gitlab.");
}

/** Check if a URL is a Bitbucket repo. */
function isBitbucket(url: string): boolean {
  return url.includes("bitbucket.org") || url.includes("bitbucket.");
}

/** Extract project path from URL (e.g. "org/repo" from "https://gitlab.com/org/repo" or "workspace/repo" from "https://bitbucket.org/workspace/repo"). */
function projectPath(url: string): string {
  return url.replace(/\.git$/, "").replace(/^https?:\/\/[^/]+\//, "");
}

/** @deprecated Use projectPath instead. */
function glabProject(url: string): string {
  return projectPath(url);
}

/** Check if glab CLI is available. */
function hasGlab(): boolean {
  try { execSync("glab --version", { stdio: "ignore" }); return true; } catch { return false; }
}

/** Check if bb CLI is available. */
function hasBb(): boolean {
  try { execSync("bb --version", { stdio: "ignore" }); return true; } catch { return false; }
}

/** Detect provider from URL: "gitlab", "bitbucket", or "git". */
export function detectProvider(url: string): "gitlab" | "bitbucket" | "git" {
  if (isGitLab(url)) return "gitlab";
  if (isBitbucket(url)) return "bitbucket";
  return "git";
}

export function syncRepo(name: string): string {
  const repo = getRepo(name);
  if (!repo) throw new Error(`Repo "${name}" not found. Add it first: noob-tester repos add ${name} <url>`);

  const reposDir = REPOS_DIR();
  mkdirSync(reposDir, { recursive: true });
  const localPath = join(reposDir, name);

  const provider = detectProvider(repo.url);

  /** Clone a repo using the best available tool for its provider. */
  function cloneRepo() {
    console.log(chalk.dim(`  Cloning ${repo.url}...`));
    try {
      if (provider === "gitlab" && hasGlab()) {
        try { execSync(`glab repo clone ${projectPath(repo.url)} "${localPath}"`, { stdio: "ignore" }); }
        catch { execSync(`git clone "${repo.url}" "${localPath}"`, { stdio: "ignore" }); }
      } else {
        // Bitbucket and generic git — git clone works for all
        execSync(`git clone "${repo.url}" "${localPath}"`, { stdio: "ignore" });
      }
    } catch (err) {
      console.log(chalk.red(`  Clone failed for ${name}: ${(err as Error).message?.slice(0, 80)}`));
    }
  }

  if (existsSync(join(localPath, ".git"))) {
    // Pull latest — try multiple strategies
    console.log(chalk.dim(`  Pulling ${name}...`));
    let pullOk = false;
    try {
      execSync("git pull --ff-only", { cwd: localPath, stdio: "ignore" });
      pullOk = true;
    } catch {
      try {
        execSync("git fetch origin", { cwd: localPath, stdio: "ignore" });
        let defaultBranch = "main";
        try {
          defaultBranch = execSync("git symbolic-ref refs/remotes/origin/HEAD", { cwd: localPath, encoding: "utf-8" }).trim().replace("refs/remotes/origin/", "");
        } catch { /* fallback to main */ }
        try { execSync(`git checkout ${defaultBranch}`, { cwd: localPath, stdio: "ignore" }); } catch { /* already on branch */ }
        execSync(`git reset --hard origin/${defaultBranch}`, { cwd: localPath, stdio: "ignore" });
        pullOk = true;
      } catch {
        // Corrupt or incomplete clone — nuke and re-clone
        console.log(chalk.yellow(`  Pull failed for ${name}, removing corrupt repo and re-cloning...`));
        try { rmSync(localPath, { recursive: true, force: true }); } catch {}
      }
    }
    if (!pullOk && !existsSync(join(localPath, ".git"))) {
      cloneRepo();
    }
  } else {
    cloneRepo();
  }

  // Only save path if repo actually exists at the dedicated location
  if (existsSync(join(localPath, ".git"))) {
    updateRepoPath(name, localPath);

    // Record branch + commit
    const branch = getGitBranch(localPath);
    const commit = getGitCommit(localPath);
    if (branch && commit) {
      updateRepoBranch(name, branch, commit);
    }

    // Update cached disk stats
    try { updateRepoDiskStats(name, localPath); } catch {}
  }
  return localPath;
}

/**
 * Switch a synced repo to a specific branch, fetch it, and update the DB.
 * Returns true if the branch was switched successfully.
 */
export function switchRepoBranch(name: string, branch: string): boolean {
  const repo = getRepo(name);
  if (!repo || !repo.local_path || !existsSync(repo.local_path)) {
    console.log(chalk.red(`Repo "${name}" not synced.`));
    return false;
  }
  const localPath = repo.local_path;
  try {
    execSync("git fetch origin", { cwd: localPath, stdio: "ignore" });
    // Try to checkout the branch (local or remote tracking)
    try {
      execSync(`git checkout ${branch}`, { cwd: localPath, stdio: "ignore" });
    } catch {
      // Branch may not exist locally — create tracking branch
      execSync(`git checkout -b ${branch} origin/${branch}`, { cwd: localPath, stdio: "ignore" });
    }
    try {
      execSync(`git pull origin ${branch} --ff-only`, { cwd: localPath, stdio: "ignore" });
    } catch {
      execSync(`git reset --hard origin/${branch}`, { cwd: localPath, stdio: "ignore" });
    }

    const commit = getGitCommit(localPath);
    const actualBranch = getGitBranch(localPath);
    if (actualBranch && commit) {
      updateRepoBranch(name, actualBranch, commit);
    }
    console.log(chalk.green(`  ${name}: switched to ${actualBranch} @ ${commit?.slice(0, 8)}`));
    return true;
  } catch (err) {
    console.log(chalk.red(`  Failed to switch ${name} to ${branch}: ${(err as Error).message?.slice(0, 80)}`));
    return false;
  }
}

export function getRepoPath(name: string): string | null {
  const repo = getRepo(name);
  if (!repo) return null;
  // ALWAYS return the dedicated path, never trust DB local_path which could be stale
  const dedicatedPath = join(REPOS_DIR(), name);
  if (existsSync(join(dedicatedPath, ".git"))) return dedicatedPath;
  // Fallback: if dedicated path doesn't exist but DB has a path, still return dedicated
  // This forces the user to sync first
  return repo.local_path && repo.local_path.startsWith(REPOS_DIR()) ? repo.local_path : null;
}

// ── Index ──

export function indexRepo(name: string): { files: number; imports: number } {
  const repo = getRepo(name);
  if (!repo) throw new Error(`Repo "${name}" not found`);
  if (!repo.local_path || !existsSync(repo.local_path)) {
    throw new Error(`Repo "${name}" not synced. Run: noob-tester repos sync ${name}`);
  }

  const db = getDb();

  // Clear old index for this repo
  db.prepare("DELETE FROM code_fts WHERE repo_name = ?").run(name);
  db.prepare("DELETE FROM import_graph WHERE repo_name = ?").run(name);

  let fileCount = 0;
  let importCount = 0;

  const insertFts = db.prepare(
    "INSERT INTO code_fts (repo_name, file_path, content, language) VALUES (?, ?, ?, ?)"
  );
  const insertImport = db.prepare(
    "INSERT INTO import_graph (id, repo_name, source_file, imported, resolved) VALUES (?, ?, ?, ?, ?)"
  );

  const indexTransaction = db.transaction(() => {
    walkDir(repo.local_path!, "", (relativePath, content) => {
      const ext = getExtension(relativePath);
      const lang = extToLanguage(ext);

      // Index file content for BM25
      insertFts.run(name, relativePath, content, lang);
      fileCount++;

      // Extract imports
      const imports = extractImports(content, ext);
      for (const imp of imports) {
        const resolved = resolveImportPath(relativePath, imp);
        insertImport.run(uuid(), name, relativePath, imp, resolved);
        importCount++;
      }
    });
  });

  indexTransaction();

  // Record that this repo was indexed at this commit
  updateRepoIndexed(name);
  const commit = getGitCommit(repo.local_path!);
  const branch = getGitBranch(repo.local_path!);
  if (branch && commit) updateRepoBranch(name, branch, commit);

  // Update cached index stats
  try { updateRepoIndexStats(name); } catch {}

  return { files: fileCount, imports: importCount };
}

/**
 * Diff-aware re-index. Only re-indexes files that changed since the last indexed commit.
 * Falls back to full re-index if no prior commit is stored or diff fails.
 * Returns { files, imports, mode: "diff" | "full", changedFiles }.
 */
export function indexRepoDiff(name: string): { files: number; imports: number; mode: "diff" | "full"; changedFiles?: number } {
  const repo = getRepo(name);
  if (!repo) throw new Error(`Repo "${name}" not found`);
  if (!repo.local_path || !existsSync(repo.local_path)) {
    throw new Error(`Repo "${name}" not synced. Run: noob-tester repos sync ${name}`);
  }

  const lastCommit = repo.last_commit;
  const currentCommit = getGitCommit(repo.local_path);

  // No prior commit or same commit — either full index or skip
  if (!lastCommit || !currentCommit) {
    return { ...indexRepo(name), mode: "full" };
  }
  if (lastCommit === currentCommit) {
    console.log(chalk.dim(`  ${name}: index up to date (${currentCommit.slice(0, 8)})`));
    return { files: 0, imports: 0, mode: "diff", changedFiles: 0 };
  }

  // Get changed files from git diff
  let diffOutput: string;
  try {
    diffOutput = execSync(
      `git diff --name-status ${lastCommit} ${currentCommit}`,
      { cwd: repo.local_path, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    // Diff failed (e.g. force push, rebased branch, commit not found) — full re-index
    console.log(chalk.yellow(`  ${name}: diff failed (commit ${lastCommit.slice(0, 8)} not reachable), full re-index`));
    return { ...indexRepo(name), mode: "full" };
  }

  // Parse diff output: "M\tsrc/foo.ts", "A\tsrc/bar.ts", "D\tsrc/baz.ts"
  const deleted: string[] = [];
  const addedOrModified: string[] = [];

  for (const line of diffOutput.trim().split("\n")) {
    if (!line) continue;
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t"); // handle paths with tabs (unlikely but safe)
    if (!filePath) continue;

    const ext = getExtension(filePath);
    if (!INDEXABLE_EXTENSIONS.has(ext)) continue;

    // Check skip dirs
    const parts = filePath.split("/");
    if (parts.some(p => SKIP_DIRS.has(p))) continue;

    if (status === "D") {
      deleted.push(filePath);
    } else {
      // A, M, R (renamed), C (copied), T (type change)
      addedOrModified.push(filePath);
    }
  }

  const totalChanged = deleted.length + addedOrModified.length;
  if (totalChanged === 0) {
    console.log(chalk.dim(`  ${name}: no indexable files changed`));
    updateRepoIndexed(name);
    updateRepoBranch(name, getGitBranch(repo.local_path!) ?? "", currentCommit);
    return { files: 0, imports: 0, mode: "diff", changedFiles: 0 };
  }

  const db = getDb();
  let fileCount = 0;
  let importCount = 0;

  const deleteFts = db.prepare("DELETE FROM code_fts WHERE repo_name = ? AND file_path = ?");
  const deleteImports = db.prepare("DELETE FROM import_graph WHERE repo_name = ? AND source_file = ?");
  const insertFts = db.prepare(
    "INSERT INTO code_fts (repo_name, file_path, content, language) VALUES (?, ?, ?, ?)"
  );
  const insertImport = db.prepare(
    "INSERT INTO import_graph (id, repo_name, source_file, imported, resolved) VALUES (?, ?, ?, ?, ?)"
  );

  const diffTransaction = db.transaction(() => {
    // Delete removed files from index
    for (const filePath of deleted) {
      deleteFts.run(name, filePath);
      deleteImports.run(name, filePath);
    }

    // Re-index added/modified files
    for (const filePath of addedOrModified) {
      // Remove old entry first (for modified files)
      deleteFts.run(name, filePath);
      deleteImports.run(name, filePath);

      // Read file content
      const fullPath = join(repo.local_path!, filePath);
      if (!existsSync(fullPath)) continue;
      try {
        const stat = statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
        const content = readFileSync(fullPath, "utf-8");
        const ext = getExtension(filePath);
        const lang = extToLanguage(ext);

        insertFts.run(name, filePath, content, lang);
        fileCount++;

        const imports = extractImports(content, ext);
        for (const imp of imports) {
          const resolved = resolveImportPath(filePath, imp);
          insertImport.run(uuid(), name, filePath, imp, resolved);
          importCount++;
        }
      } catch {}
    }
  });

  diffTransaction();

  updateRepoIndexed(name);
  const branch = getGitBranch(repo.local_path!);
  if (branch) updateRepoBranch(name, branch, currentCommit);

  // Update cached index stats
  try { updateRepoIndexStats(name); } catch {}

  return { files: fileCount, imports: importCount, mode: "diff", changedFiles: totalChanged };
}

export function indexGroup(groupName: string): Record<string, { files: number; imports: number }> {
  const repos = resolveRepoNames([groupName]);
  const results: Record<string, { files: number; imports: number }> = {};
  for (const repo of repos) {
    results[repo.name] = indexRepo(repo.name);
  }
  return results;
}

// ── Search (BM25) ──

export function searchCode(
  query: string,
  opts?: { repos?: string[]; limit?: number }
): Array<{ repo_name: string; file_path: string; snippet: string; rank: number }> {
  const db = getDb();
  const limit = opts?.limit ?? 20;

  let sql = `
    SELECT repo_name, file_path, snippet(code_fts, 2, '>>>', '<<<', '...', 40) as snippet,
           rank
    FROM code_fts
    WHERE code_fts MATCH ?
  `;
  // Sanitize for FTS5: quote each token individually to prevent operators
  // (e.g. hyphens being treated as NOT). Unquoted spaces act as implicit AND.
  const sanitized = query
    .replace(/"/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map(tok => `"${tok}"`)
    .join(" ");
  const params: unknown[] = [sanitized];

  if (opts?.repos && opts.repos.length > 0) {
    const placeholders = opts.repos.map(() => "?").join(",");
    sql += ` AND repo_name IN (${placeholders})`;
    params.push(...opts.repos);
  }

  sql += " ORDER BY rank LIMIT ?";
  params.push(limit);

  return db.prepare(sql).all(...params) as Array<{
    repo_name: string; file_path: string; snippet: string; rank: number;
  }>;
}

// ── Import Graph Queries ──

/** Get all files imported by a given file */
export function getImportsOf(repoName: string, filePath: string) {
  return getDb()
    .prepare("SELECT imported, resolved FROM import_graph WHERE repo_name = ? AND source_file = ?")
    .all(repoName, filePath) as Array<{ imported: string; resolved: string | null }>;
}

/** Get all files that import a given file */
export function getImportedBy(repoName: string, filePath: string) {
  return getDb()
    .prepare(
      "SELECT source_file FROM import_graph WHERE repo_name = ? AND (resolved = ? OR imported LIKE ?)"
    )
    .all(repoName, filePath, `%${basename(filePath)}%`) as Array<{ source_file: string }>;
}

/** Expand from a set of files — find all related files via imports (1 level) */
export function expandRelated(
  repoName: string,
  filePaths: string[]
): string[] {
  const related = new Set<string>(filePaths);

  for (const fp of filePaths) {
    // Files this one imports
    const imports = getImportsOf(repoName, fp);
    for (const i of imports) {
      if (i.resolved) related.add(i.resolved);
    }
    // Files that import this one
    const importedBy = getImportedBy(repoName, fp);
    for (const i of importedBy) {
      related.add(i.source_file);
    }
  }

  return [...related];
}

/** Combined search: BM25 + import graph expansion */
export function searchWithContext(
  query: string,
  opts?: { repos?: string[]; limit?: number; expand?: boolean }
): Array<{ repo_name: string; file_path: string; snippet: string; related?: string[] }> {
  const results = searchCode(query, opts);

  if (!opts?.expand) return results;

  // Expand each result with import graph
  return results.map((r) => {
    const related = expandRelated(r.repo_name, [r.file_path]).filter(
      (f) => f !== r.file_path
    );
    return { ...r, related };
  });
}

// ── File Walking ──

function walkDir(
  rootPath: string,
  relativePath: string,
  callback: (relativePath: string, content: string) => void
): void {
  const fullPath = join(rootPath, relativePath);
  let entries;
  try {
    entries = readdirSync(fullPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    if (entry.startsWith(".") && entry !== ".env.example") continue;

    const entryRelative = relativePath ? `${relativePath}/${entry}` : entry;
    const entryFull = join(fullPath, entry);

    let stat;
    try {
      stat = statSync(entryFull);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(rootPath, entryRelative, callback);
    } else if (stat.isFile() && stat.size < MAX_FILE_SIZE) {
      const ext = getExtension(entry);
      if (INDEXABLE_EXTENSIONS.has(ext) || INDEXABLE_EXTENSIONS.has(entry)) {
        try {
          const content = readFileSync(entryFull, "utf-8");
          callback(entryRelative, content);
        } catch {
          // Binary or unreadable — skip
        }
      }
    }
  }
}

// ── Import Extraction ──

function extractImports(content: string, ext: string): string[] {
  const imports: string[] = [];

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"].includes(ext)) {
    // JS/TS: import ... from "...", require("..."), dynamic import("...")
    const patterns = [
      /from\s+["']([^"']+)["']/g,
      /require\s*\(\s*["']([^"']+)["']\s*\)/g,
      /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(content))) imports.push(m[1]);
    }
  } else if (ext === ".py") {
    // Python: import X, from X import Y
    const patterns = [
      /^import\s+([\w.]+)/gm,
      /^from\s+([\w.]+)\s+import/gm,
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(content))) imports.push(m[1]);
    }
  } else if (ext === ".go") {
    // Go: import "..." or import (...)
    const pat = /"([^"]+)"/g;
    let m;
    while ((m = pat.exec(content))) imports.push(m[1]);
  } else if ([".java", ".kt", ".scala"].includes(ext)) {
    const pat = /^import\s+([\w.]+)/gm;
    let m;
    while ((m = pat.exec(content))) imports.push(m[1]);
  } else if (ext === ".rb") {
    const pat = /require\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = pat.exec(content))) imports.push(m[1]);
  } else if (ext === ".php") {
    const patterns = [
      /use\s+([\w\\]+)/g,
      /require(?:_once)?\s*['"]([^'"]+)['"]/g,
      /include(?:_once)?\s*['"]([^'"]+)['"]/g,
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(content))) imports.push(m[1]);
    }
  }

  return imports;
}

function resolveImportPath(sourceFile: string, importPath: string): string | null {
  // Only resolve relative imports
  if (!importPath.startsWith(".")) return null;

  const sourceDir = sourceFile.includes("/")
    ? sourceFile.substring(0, sourceFile.lastIndexOf("/"))
    : "";

  const parts = importPath.split("/");
  const resolved: string[] = sourceDir ? sourceDir.split("/") : [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") { resolved.pop(); continue; }
    resolved.push(part);
  }

  let result = resolved.join("/");

  // Try common extensions
  if (!result.includes(".")) {
    for (const ext of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]) {
      result = resolved.join("/") + ext;
      // We can't check if file exists here, just return best guess
      break;
    }
  }

  return result;
}

// ── Helpers ──

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.substring(dot) : "";
}

function basename(filepath: string): string {
  const slash = filepath.lastIndexOf("/");
  return slash >= 0 ? filepath.substring(slash + 1) : filepath;
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
    ".java": "java", ".kt": "kotlin", ".scala": "scala", ".cs": "csharp",
    ".php": "php", ".swift": "swift", ".vue": "vue", ".svelte": "svelte",
    ".html": "html", ".css": "css", ".scss": "scss",
    ".sql": "sql", ".graphql": "graphql", ".sh": "shell",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".md": "markdown",
  };
  return map[ext] ?? "unknown";
}
