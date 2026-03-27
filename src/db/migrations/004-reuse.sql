-- Track which prior run this run reuses context from
ALTER TABLE runs ADD COLUMN reuse_run_id TEXT REFERENCES runs(id);
