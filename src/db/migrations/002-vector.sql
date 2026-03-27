-- Code indexing tables (sqlite-vss is optional)

CREATE TABLE IF NOT EXISTS code_chunks (
  id            TEXT PRIMARY KEY,
  repo_url      TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  language      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_code_chunks_repo ON code_chunks(repo_url);
CREATE INDEX IF NOT EXISTS idx_code_chunks_file ON code_chunks(file_path);

-- The vss virtual table is created at runtime only if sqlite-vss is available.
-- See db/client.ts for the conditional setup.
