-- Repos registry
CREATE TABLE IF NOT EXISTS repos (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  url         TEXT NOT NULL,
  description TEXT,
  local_path  TEXT,
  last_synced TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Repo groups (named collections)
CREATE TABLE IF NOT EXISTS repo_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repo_group_members (
  group_id    TEXT NOT NULL REFERENCES repo_groups(id),
  repo_id     TEXT NOT NULL REFERENCES repos(id),
  PRIMARY KEY (group_id, repo_id)
);

-- BM25 full-text search index (SQLite FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS code_fts USING fts5(
  repo_name,
  file_path,
  content,
  language,
  tokenize='porter unicode61'
);

-- Import/dependency graph
CREATE TABLE IF NOT EXISTS import_graph (
  id          TEXT PRIMARY KEY,
  repo_name   TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported    TEXT NOT NULL,
  resolved    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_repos_name ON repos(name);
CREATE INDEX IF NOT EXISTS idx_import_graph_source ON import_graph(repo_name, source_file);
CREATE INDEX IF NOT EXISTS idx_import_graph_imported ON import_graph(repo_name, imported);
CREATE INDEX IF NOT EXISTS idx_import_graph_resolved ON import_graph(repo_name, resolved);
