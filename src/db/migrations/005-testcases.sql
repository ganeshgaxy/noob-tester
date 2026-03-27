-- Test cases — BDD and Traditional, with execution tracking

CREATE TABLE IF NOT EXISTS test_cases (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  -- Source
  ticket_ref      TEXT NOT NULL,               -- PROJ-123, epic key, etc.
  repo_urls       TEXT,                        -- JSON array of repos analyzed

  -- Classification
  type            TEXT NOT NULL,               -- direct_functional | impact_regression | general_regression
  priority        INTEGER NOT NULL DEFAULT 1,  -- 1=direct_functional, 2=impact_regression, 3=general_regression
  format          TEXT NOT NULL,               -- bdd | traditional

  -- Content
  title           TEXT NOT NULL,
  description     TEXT,
  preconditions   TEXT,                        -- JSON array of preconditions
  labels          TEXT,                        -- JSON array of labels/tags

  -- BDD fields (null for traditional)
  bdd_feature     TEXT,
  bdd_scenario    TEXT,
  bdd_given       TEXT,                        -- JSON array of Given steps
  bdd_when        TEXT,                        -- JSON array of When steps
  bdd_then        TEXT,                        -- JSON array of Then steps

  -- Traditional fields (null for BDD)
  trad_steps      TEXT,                        -- JSON array of {step, expected_result}
  trad_expected   TEXT,                        -- Overall expected result

  -- Execution tracking
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | running | passed | failed | skipped | blocked
  claimed_by      TEXT REFERENCES sessions(id),     -- which session claimed it
  claimed_at      TEXT,
  executed_at     TEXT,
  execution_run   TEXT REFERENCES runs(id),         -- which run executed it
  execution_result TEXT,                            -- JSON result details
  last_status     TEXT,                             -- status from previous execution
  last_executed   TEXT,                             -- when it was last executed
  execution_count INTEGER DEFAULT 0,

  -- Codebase context
  impacted_files  TEXT,                        -- JSON array of file paths
  related_mr      TEXT,                        -- MR/PR reference
  code_context    TEXT                         -- relevant code snippets / notes
);

CREATE INDEX IF NOT EXISTS idx_testcases_run ON test_cases(run_id);
CREATE INDEX IF NOT EXISTS idx_testcases_ticket ON test_cases(ticket_ref);
CREATE INDEX IF NOT EXISTS idx_testcases_type ON test_cases(type);
CREATE INDEX IF NOT EXISTS idx_testcases_status ON test_cases(status);
CREATE INDEX IF NOT EXISTS idx_testcases_priority ON test_cases(priority, status);
CREATE INDEX IF NOT EXISTS idx_testcases_claimed ON test_cases(claimed_by);
