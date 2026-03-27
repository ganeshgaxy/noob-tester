-- Core tables for noob-tester

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  status        TEXT NOT NULL DEFAULT 'pending',
  input_type    TEXT NOT NULL,
  input_ref     TEXT NOT NULL,
  input_full    TEXT NOT NULL,
  target_url    TEXT,
  config_json   TEXT NOT NULL,
  total_cost    REAL DEFAULT 0,
  total_tokens  INTEGER DEFAULT 0,
  summary       TEXT,
  phase         INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS action_log (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  phase         INTEGER NOT NULL,
  agent_name    TEXT NOT NULL,
  prompt_hash   TEXT,
  prompt_text   TEXT NOT NULL,
  result_json   TEXT,
  result_text   TEXT,
  cost_usd      REAL,
  tokens_used   INTEGER,
  duration_ms   INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS analyses (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  analysis_type TEXT NOT NULL,
  content_json  TEXT NOT NULL,
  confidence    REAL,
  summary       TEXT
);

CREATE TABLE IF NOT EXISTS test_plans (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  plan_json     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_steps (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL REFERENCES test_plans(id),
  run_id        TEXT NOT NULL REFERENCES runs(id),
  step_order    INTEGER NOT NULL,
  description   TEXT NOT NULL,
  confidence    TEXT NOT NULL,
  category      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  executed_at   TEXT,
  result_json   TEXT,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  step_id         TEXT REFERENCES test_steps(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  category        TEXT NOT NULL,
  severity        TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  location        TEXT,
  screenshot_path TEXT,
  video_path      TEXT,
  console_log     TEXT,
  network_data    TEXT,
  raw_output      TEXT,
  is_retry        INTEGER DEFAULT 0,
  retry_count     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS failure_patterns (
  id               TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  pattern_hash     TEXT NOT NULL UNIQUE,
  category         TEXT NOT NULL,
  location_pattern TEXT NOT NULL,
  title_pattern    TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  first_seen_run   TEXT REFERENCES runs(id),
  last_seen_run    TEXT REFERENCES runs(id),
  severity_mode    TEXT NOT NULL,
  notes            TEXT,
  is_known_issue   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS raw_outputs (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  action_id     TEXT REFERENCES action_log(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  source        TEXT NOT NULL,
  output_type   TEXT NOT NULL,
  content       TEXT,
  file_path     TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_action_log_run ON action_log(run_id);
CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id);
CREATE INDEX IF NOT EXISTS idx_test_steps_run ON test_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_run ON issues(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_hash ON failure_patterns(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_raw_outputs_run ON raw_outputs(run_id);
