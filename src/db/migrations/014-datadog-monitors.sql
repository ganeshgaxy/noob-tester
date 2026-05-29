-- Datadog monitoring config per target
CREATE TABLE IF NOT EXISTS datadog_monitors (
  id           TEXT PRIMARY KEY,
  target_name  TEXT NOT NULL UNIQUE REFERENCES targets(name) ON DELETE CASCADE,
  enabled      INTEGER NOT NULL DEFAULT 1,
  dd_service   TEXT,   -- Datadog service tag filter (e.g. "my-app")
  dd_env       TEXT,   -- Datadog env tag filter (e.g. "production")
  last_polled_at TEXT,
  last_data_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_datadog_monitors_target ON datadog_monitors(target_name);
