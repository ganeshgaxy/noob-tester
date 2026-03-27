CREATE TABLE IF NOT EXISTS tech_issues (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  -- What happened
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  error_message   TEXT,
  console_output  TEXT,
  network_data    TEXT,
  screenshot_path TEXT,

  -- Where it happened
  url             TEXT,
  page_area       TEXT,
  step_description TEXT,
  ticket_ref      TEXT,
  run_id          TEXT REFERENCES runs(id),
  session_id      TEXT REFERENCES sessions(id),
  test_case_id    TEXT REFERENCES test_cases(id),

  -- Classification
  category        TEXT NOT NULL DEFAULT 'unknown',  -- timeout | crash | network_failure | js_error | element_not_found | auth_issue | env_issue | unknown
  severity        TEXT NOT NULL DEFAULT 'medium',   -- critical | high | medium | low

  -- Resolution
  status          TEXT NOT NULL DEFAULT 'unresolved',  -- unresolved | investigating | workaround_found | resolved | wont_fix
  workaround      TEXT,
  resolution      TEXT,
  resolved_by     TEXT,
  resolved_at     TEXT,

  -- Recovery attempts
  recovery_attempts TEXT,   -- JSON array of {attempt, result, duration_ms}
  final_outcome   TEXT,     -- recovered | failed | skipped

  -- Recurrence
  occurrence_count INTEGER DEFAULT 1,
  first_seen      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen       TEXT NOT NULL DEFAULT (datetime('now')),
  pattern_hash    TEXT       -- hash for dedup (url + category + title pattern)
);

CREATE INDEX IF NOT EXISTS idx_tech_issues_ticket ON tech_issues(ticket_ref);
CREATE INDEX IF NOT EXISTS idx_tech_issues_url ON tech_issues(url);
CREATE INDEX IF NOT EXISTS idx_tech_issues_status ON tech_issues(status);
CREATE INDEX IF NOT EXISTS idx_tech_issues_category ON tech_issues(category);
CREATE INDEX IF NOT EXISTS idx_tech_issues_pattern ON tech_issues(pattern_hash);
