-- Track spawned pool agents for management and cleanup

CREATE TABLE IF NOT EXISTS pool_spawns (
  id            TEXT PRIMARY KEY,
  ticket_id     TEXT NOT NULL,
  agent_path    TEXT NOT NULL,
  pid           INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running',
  spawn_type    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,
  exit_code     INTEGER,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_pool_spawns_ticket ON pool_spawns(ticket_id);
CREATE INDEX IF NOT EXISTS idx_pool_spawns_status ON pool_spawns(status);
CREATE INDEX IF NOT EXISTS idx_pool_spawns_pid ON pool_spawns(pid);
