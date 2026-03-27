-- Session-level metrics
ALTER TABLE sessions ADD COLUMN total_actions INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN total_issues INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN total_duration_ms INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN estimated_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN tool_calls INTEGER DEFAULT 0;
