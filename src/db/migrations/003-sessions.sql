-- Active session tracking

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_heartbeat  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',   -- active | completed | stale | crashed
  pid             INTEGER,
  hostname        TEXT,
  task_summary    TEXT,                              -- what this session is working on
  current_run_id  TEXT REFERENCES runs(id),
  current_phase   INTEGER DEFAULT 0,
  metadata_json   TEXT                               -- extra info (model, target_url, etc.)
);

-- Link runs to sessions
ALTER TABLE runs ADD COLUMN session_id TEXT REFERENCES sessions(id);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
