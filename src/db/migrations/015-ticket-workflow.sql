-- Ticket workflow tracking
CREATE TABLE IF NOT EXISTS ticket_workflow (
  id                TEXT PRIMARY KEY,
  ticket_id         TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'new',
  current_phase     TEXT,
  progress          INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 0,
  added_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  started_at        TEXT,
  completed_at      TEXT,
  last_run_id       TEXT,
  last_session_id   TEXT,
  error_message     TEXT,
  notes             TEXT,
  metadata_json     TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_workflow_ticket_id ON ticket_workflow(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_workflow_status ON ticket_workflow(status);
CREATE INDEX IF NOT EXISTS idx_ticket_workflow_active ON ticket_workflow(active);
