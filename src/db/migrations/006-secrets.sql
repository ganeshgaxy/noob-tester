-- Targets (environments, apps, tenants)
CREATE TABLE IF NOT EXISTS targets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  url         TEXT,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Secrets scoped to target + role
CREATE TABLE IF NOT EXISTS secrets (
  id          TEXT PRIMARY KEY,
  target_id   TEXT NOT NULL REFERENCES targets(id),
  role        TEXT NOT NULL DEFAULT 'default',
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  source_type TEXT NOT NULL,  -- literal | env | 1password
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_id, role, key)
);

CREATE INDEX IF NOT EXISTS idx_secrets_target ON secrets(target_id);
CREATE INDEX IF NOT EXISTS idx_secrets_role ON secrets(role);
CREATE INDEX IF NOT EXISTS idx_targets_url ON targets(url);
