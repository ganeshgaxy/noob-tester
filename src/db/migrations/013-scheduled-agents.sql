-- Scheduled agent runs with flexible parameters
CREATE TABLE IF NOT EXISTS scheduled_agents (
  id TEXT PRIMARY KEY,
  agent_path TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  parameters TEXT,
  status TEXT DEFAULT 'active',
  description TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Execution history for scheduled agents
CREATE TABLE IF NOT EXISTS agent_execution_history (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  session_id TEXT,
  run_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  status TEXT,
  exit_code INTEGER,
  logs TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(schedule_id) REFERENCES scheduled_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_agents_ticket ON scheduled_agents(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_agents_status ON scheduled_agents(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_agents_next_run ON scheduled_agents(next_run_at);
CREATE INDEX IF NOT EXISTS idx_execution_history_schedule ON agent_execution_history(schedule_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_status ON agent_execution_history(status);
