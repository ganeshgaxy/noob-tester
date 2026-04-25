import Database from "better-sqlite3";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  copyFileSync,
  renameSync,
  cpSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

let _db: Database.Database | null = null;
let _vssAvailable = false;

// ── Workspace helpers ──

const NOOB_ROOT = () => join(homedir(), ".noob-tester");
const CONFIG_PATH = () => join(NOOB_ROOT(), "config.json");

/**
 * In-memory workspace override set by setActiveWorkspace().
 * Takes priority over both process.env.NOOB_WORKSPACE and config.json so that
 * UI workspace switches (which call setActiveWorkspace) are reflected immediately
 * within the running server process without needing a restart.
 */
let _activeWorkspaceOverride: string | null = null;

/** Return the active workspace name.
 *  Priority: in-memory override → NOOB_WORKSPACE env var → config.json → "default"
 */
export function getActiveWorkspace(): string {
  if (_activeWorkspaceOverride) return _activeWorkspaceOverride;
  if (process.env.NOOB_WORKSPACE) return process.env.NOOB_WORKSPACE;
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH(), "utf-8"));
    return cfg.workspace || "default";
  } catch {
    return "default";
  }
}

/** Root directory that contains all workspace sub-directories. */
export function workspacesDir(): string {
  const dir = join(NOOB_ROOT(), "workspaces");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Persist the active workspace name to config.json and reset the DB singleton.
 *  Also updates the in-memory override so the running server process immediately
 *  serves data from the new workspace without needing a restart.
 */
export function setActiveWorkspace(name: string): void {
  // Set in-memory override first — this is what getActiveWorkspace() checks
  // before the env var and config.json, so all subsequent DB/path calls in
  // this process will use the new workspace immediately.
  _activeWorkspaceOverride = name;

  const root = NOOB_ROOT();
  mkdirSync(root, { recursive: true });
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(readFileSync(CONFIG_PATH(), "utf-8"));
  } catch {
    /* first run */
  }
  writeFileSync(
    CONFIG_PATH(),
    JSON.stringify({ ...cfg, workspace: name }, null, 2),
  );
  resetDb();
}

/** Close the DB singleton so the next getDb() opens the correct workspace DB. */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
  _vssAvailable = false;
}

/** List all workspaces that have a directory under workspacesDir(). */
export function listWorkspaces(): Array<{ name: string; current: boolean }> {
  const root = workspacesDir();
  const current = getActiveWorkspace();
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, current: d.name === current }));
  } catch {
    return [];
  }
}

/**
 * Rename an existing workspace directory.
 * If the renamed workspace is the current active one, updates config.json to
 * point at the new name and resets the DB singleton.
 */
export function renameWorkspace(from: string, to: string): void {
  if (from === "default")
    throw new Error('Cannot rename the "default" workspace');
  if (!/^[a-zA-Z0-9_-]+$/.test(to))
    throw new Error("Workspace name must be alphanumeric (a-z, 0-9, -, _)");

  const root = workspacesDir();
  const fromDir = join(root, from);
  const toDir = join(root, to);

  if (!existsSync(fromDir)) throw new Error(`Workspace "${from}" not found`);
  if (existsSync(toDir)) throw new Error(`Workspace "${to}" already exists`);

  renameSync(fromDir, toDir);

  // If it was the active workspace, point the config at the new name
  if (getActiveWorkspace() === from) {
    setActiveWorkspace(to);
  }
}

/**
 * Copy the DB and evidence directory from one workspace into another.
 * The target workspace is created (with its evidence/ sub-dir) if it doesn't
 * exist yet. Existing files in the target are overwritten.
 * The active workspace is NOT changed — the caller decides whether to switch.
 */
export function copyWorkspace(from: string, to: string): void {
  if (from === to) throw new Error("Source and target workspace are the same");
  if (!/^[a-zA-Z0-9_-]+$/.test(to))
    throw new Error("Workspace name must be alphanumeric (a-z, 0-9, -, _)");

  const root = workspacesDir();
  const fromDir = join(root, from);
  const toDir = join(root, to);

  // "default" workspace dir may not exist yet (created lazily by getDb)
  if (from !== "default" && !existsSync(fromDir))
    throw new Error(`Workspace "${from}" not found`);

  // Ensure target directory structure exists
  mkdirSync(join(toDir, "evidence"), { recursive: true });

  // Copy the database file (if it exists in the source workspace)
  const fromDb = join(fromDir, "noob-tester.db");
  const toDb = join(toDir, "noob-tester.db");
  if (existsSync(fromDb)) {
    // If the target is the currently-open DB, close it first
    if (getActiveWorkspace() === to) resetDb();
    copyFileSync(fromDb, toDb);
  }

  // Copy the evidence directory recursively (merge into target)
  const fromEvidence = join(fromDir, "evidence");
  const toEvidence = join(toDir, "evidence");
  if (existsSync(fromEvidence)) {
    cpSync(fromEvidence, toEvidence, { recursive: true });
  }
}

/** Directory where noob-tester stores its data (workspace-scoped). */
export function dataDir(): string {
  const dir = join(workspacesDir(), getActiveWorkspace());
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Dedicated evidence directory for all artifacts (workspace-scoped). */
export function evidenceDir(): string {
  const dir = join(dataDir(), "evidence");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Get or create the singleton database connection. */
export function getDb(): Database.Database {
  if (_db) return _db;

  // Auto-migrate legacy root DB to the "default" workspace on first run.
  // Only for "default" — new workspaces should start with a fresh empty DB.
  const legacyDb = join(NOOB_ROOT(), "noob-tester.db");
  const dbPath = join(dataDir(), "noob-tester.db");
  if (
    !existsSync(dbPath) &&
    existsSync(legacyDb) &&
    getActiveWorkspace() === "default"
  ) {
    copyFileSync(legacyDb, dbPath);
  }

  _db = new Database(dbPath);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("busy_timeout = 30000"); // 30 seconds - increased from 5s to handle concurrent requests better

  runMigrations(_db);
  tryLoadVss(_db);

  return _db;
}

/** Whether sqlite-vss extension is available. */
export function isVssAvailable(): boolean {
  return _vssAvailable;
}

// ── Inlined migrations (so the bundled single-file CLI works) ──

const MIGRATIONS: Record<string, string> = {
  "001-initial.sql": `
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
CREATE INDEX IF NOT EXISTS idx_action_log_run ON action_log(run_id);
CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id);
CREATE INDEX IF NOT EXISTS idx_test_steps_run ON test_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_run ON issues(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_hash ON failure_patterns(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_raw_outputs_run ON raw_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_pool_spawns_ticket ON pool_spawns(ticket_id);
CREATE INDEX IF NOT EXISTS idx_pool_spawns_pid ON pool_spawns(pid);
`,

  "002-vector.sql": `
CREATE TABLE IF NOT EXISTS code_chunks (
  id            TEXT PRIMARY KEY,
  repo_url      TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  language      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_code_chunks_repo ON code_chunks(repo_url);
CREATE INDEX IF NOT EXISTS idx_code_chunks_file ON code_chunks(file_path);
`,

  "004-reuse.sql": "", // handled below as ALTER TABLE

  "007-repos-index.sql": `
CREATE VIRTUAL TABLE IF NOT EXISTS code_fts USING fts5(
  repo_name, file_path, content, language,
  tokenize='porter unicode61'
);
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, url TEXT NOT NULL,
  description TEXT, local_path TEXT, last_synced TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS repo_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS repo_group_members (
  group_id TEXT NOT NULL REFERENCES repo_groups(id),
  repo_id TEXT NOT NULL REFERENCES repos(id),
  PRIMARY KEY (group_id, repo_id)
);
CREATE TABLE IF NOT EXISTS import_graph (
  id TEXT PRIMARY KEY, repo_name TEXT NOT NULL,
  source_file TEXT NOT NULL, imported TEXT NOT NULL, resolved TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_repos_name ON repos(name);
CREATE INDEX IF NOT EXISTS idx_import_graph_source ON import_graph(repo_name, source_file);
CREATE INDEX IF NOT EXISTS idx_import_graph_imported ON import_graph(repo_name, imported);
CREATE INDEX IF NOT EXISTS idx_import_graph_resolved ON import_graph(repo_name, resolved);
`,

  "006-secrets.sql": `
CREATE TABLE IF NOT EXISTS targets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  url         TEXT,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS secrets (
  id          TEXT PRIMARY KEY,
  target_id   TEXT NOT NULL REFERENCES targets(id),
  role        TEXT NOT NULL DEFAULT 'default',
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  source_type TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_id, role, key)
);
CREATE INDEX IF NOT EXISTS idx_secrets_target ON secrets(target_id);
CREATE INDEX IF NOT EXISTS idx_secrets_role ON secrets(role);
CREATE INDEX IF NOT EXISTS idx_targets_url ON targets(url);
`,

  "005-testcases.sql": `
CREATE TABLE IF NOT EXISTS test_cases (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ticket_ref      TEXT NOT NULL,
  repo_urls       TEXT,
  type            TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 1,
  format          TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  preconditions   TEXT,
  labels          TEXT,
  bdd_feature     TEXT,
  bdd_scenario    TEXT,
  bdd_given       TEXT,
  bdd_when        TEXT,
  bdd_then        TEXT,
  trad_steps      TEXT,
  trad_expected   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  claimed_by      TEXT REFERENCES sessions(id),
  claimed_at      TEXT,
  executed_at     TEXT,
  execution_run   TEXT REFERENCES runs(id),
  execution_result TEXT,
  last_status     TEXT,
  last_executed   TEXT,
  execution_count INTEGER DEFAULT 0,
  impacted_files  TEXT,
  related_mr      TEXT,
  code_context    TEXT
);
CREATE INDEX IF NOT EXISTS idx_testcases_run ON test_cases(run_id);
CREATE INDEX IF NOT EXISTS idx_testcases_ticket ON test_cases(ticket_ref);
CREATE INDEX IF NOT EXISTS idx_testcases_type ON test_cases(type);
CREATE INDEX IF NOT EXISTS idx_testcases_status ON test_cases(status);
CREATE INDEX IF NOT EXISTS idx_testcases_priority ON test_cases(priority, status);
CREATE INDEX IF NOT EXISTS idx_testcases_claimed ON test_cases(claimed_by);
`,

  "003-sessions.sql": `
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_heartbeat  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  pid             INTEGER,
  hostname        TEXT,
  task_summary    TEXT,
  current_run_id  TEXT REFERENCES runs(id),
  current_phase   INTEGER DEFAULT 0,
  metadata_json   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
`,
};

// session_id column on runs — handled separately since ALTER TABLE can't be IF NOT EXISTS
const ADD_SESSION_COL =
  "ALTER TABLE runs ADD COLUMN session_id TEXT REFERENCES sessions(id)";

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((r) => (r as { name: string }).name),
  );

  for (const [name, sql] of Object.entries(MIGRATIONS)) {
    if (applied.has(name)) continue;
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(name);
  }

  // Tech issues table
  if (!applied.has("011-tech-issues")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS tech_issues (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  title TEXT NOT NULL, description TEXT NOT NULL, error_message TEXT,
  console_output TEXT, network_data TEXT, screenshot_path TEXT,
  url TEXT, page_area TEXT, step_description TEXT, ticket_ref TEXT,
  run_id TEXT REFERENCES runs(id), session_id TEXT REFERENCES sessions(id),
  test_case_id TEXT REFERENCES test_cases(id),
  category TEXT NOT NULL DEFAULT 'unknown', severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'unresolved', workaround TEXT, resolution TEXT,
  resolved_by TEXT, resolved_at TEXT,
  recovery_attempts TEXT, final_outcome TEXT,
  occurrence_count INTEGER DEFAULT 1, first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')), pattern_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_tech_issues_ticket ON tech_issues(ticket_ref);
CREATE INDEX IF NOT EXISTS idx_tech_issues_url ON tech_issues(url);
CREATE INDEX IF NOT EXISTS idx_tech_issues_status ON tech_issues(status);
CREATE INDEX IF NOT EXISTS idx_tech_issues_category ON tech_issues(category);
CREATE INDEX IF NOT EXISTS idx_tech_issues_pattern ON tech_issues(pattern_hash);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "011-tech-issues",
    );
  }

  // Run packs table
  if (!applied.has("012-run-packs")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS run_pack_entries (
  id              TEXT PRIMARY KEY,
  run_pack_id     TEXT NOT NULL,
  ticket_id         TEXT NOT NULL,
  run_id          TEXT NOT NULL,
  session_id      TEXT,
  test_case_id    TEXT NOT NULL,
  fresh_or_existing TEXT NOT NULL DEFAULT 'fresh',
  status          TEXT NOT NULL DEFAULT 'pending',
  results         TEXT,
  logs            TEXT,
  observations    TEXT,
  issues          TEXT,
  artifacts       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_rpe_run_pack ON run_pack_entries(run_pack_id);
CREATE INDEX IF NOT EXISTS idx_rpe_ticket ON run_pack_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_rpe_run ON run_pack_entries(run_id);
CREATE INDEX IF NOT EXISTS idx_rpe_testcase ON run_pack_entries(test_case_id);
CREATE INDEX IF NOT EXISTS idx_rpe_status ON run_pack_entries(status);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "012-run-packs",
    );
  }

  // Add ready field to test cases
  if (!applied.has("010-testcase-ready")) {
    try {
      db.exec(
        "ALTER TABLE test_cases ADD COLUMN ready INTEGER NOT NULL DEFAULT 0",
      );
    } catch {
      /* exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "010-testcase-ready",
    );
  }

  // Add session labels
  if (!applied.has("009-session-labels")) {
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN labels TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN ticket_refs TEXT");
    } catch {
      /* exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "009-session-labels",
    );
  }

  // Add session metrics columns
  if (!applied.has("008-metrics-cols")) {
    const cols = [
      "ALTER TABLE sessions ADD COLUMN total_actions INTEGER DEFAULT 0",
      "ALTER TABLE sessions ADD COLUMN total_issues INTEGER DEFAULT 0",
      "ALTER TABLE sessions ADD COLUMN total_duration_ms INTEGER DEFAULT 0",
      "ALTER TABLE sessions ADD COLUMN estimated_tokens INTEGER DEFAULT 0",
      "ALTER TABLE sessions ADD COLUMN tool_calls INTEGER DEFAULT 0",
    ];
    for (const sql of cols) {
      try {
        db.exec(sql);
      } catch {
        /* exists */
      }
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "008-metrics-cols",
    );
  }

  // Add capture_config, secret_target, secret_role to runs
  if (!applied.has("013-run-capture-config")) {
    const cols = [
      "ALTER TABLE runs ADD COLUMN capture_config TEXT",
      "ALTER TABLE runs ADD COLUMN secret_target TEXT",
      "ALTER TABLE runs ADD COLUMN secret_role TEXT",
    ];
    for (const sql of cols) {
      try {
        db.exec(sql);
      } catch {
        /* exists */
      }
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "013-run-capture-config",
    );
  }

  // Add target_url, secret_target, secret_role, capture_config to run_pack_entries
  if (!applied.has("014-runpack-target-capture")) {
    const cols = [
      "ALTER TABLE run_pack_entries ADD COLUMN target_url TEXT",
      "ALTER TABLE run_pack_entries ADD COLUMN secret_target TEXT",
      "ALTER TABLE run_pack_entries ADD COLUMN secret_role TEXT",
      "ALTER TABLE run_pack_entries ADD COLUMN capture_config TEXT",
    ];
    for (const sql of cols) {
      try {
        db.exec(sql);
      } catch {
        /* exists */
      }
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "014-runpack-target-capture",
    );
  }

  // Run artifacts — per-action captures (snapshot, console, har, screenshot)
  if (!applied.has("016-run-artifacts")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS run_artifacts (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  run_pack_id     TEXT,
  entry_id        TEXT,
  session_id      TEXT,
  ticket_id         TEXT,
  action_index    INTEGER DEFAULT 0,
  action_desc     TEXT,
  page_url        TEXT,
  artifact_type   TEXT NOT NULL,
  file_path       TEXT,
  content         TEXT,
  metadata        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ra_run ON run_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_ra_pack ON run_artifacts(run_pack_id);
CREATE INDEX IF NOT EXISTS idx_ra_entry ON run_artifacts(entry_id);
CREATE INDEX IF NOT EXISTS idx_ra_type ON run_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_ra_ticket ON run_artifacts(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ra_url ON run_artifacts(page_url);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "016-run-artifacts",
    );
  }

  // Enrich test_plans and test_steps
  if (!applied.has("017-plan-enrich")) {
    const cols = [
      "ALTER TABLE test_plans ADD COLUMN ticket_id TEXT",
      "ALTER TABLE test_plans ADD COLUMN target_url TEXT",
      "ALTER TABLE test_plans ADD COLUMN strategy TEXT",
      "ALTER TABLE test_plans ADD COLUMN blockers TEXT DEFAULT '[]'",
      "ALTER TABLE test_plans ADD COLUMN coverage_gaps TEXT DEFAULT '[]'",
      "ALTER TABLE test_plans ADD COLUMN mr_refs TEXT DEFAULT '[]'",
      "ALTER TABLE test_plans ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))",
      "ALTER TABLE test_steps ADD COLUMN testcase_id TEXT",
      "ALTER TABLE test_steps ADD COLUMN mr_ref TEXT",
      "ALTER TABLE test_steps ADD COLUMN uimap_page_id TEXT",
      "ALTER TABLE test_steps ADD COLUMN page_url TEXT",
      "ALTER TABLE test_steps ADD COLUMN priority INTEGER DEFAULT 0",
      "ALTER TABLE test_steps ADD COLUMN source TEXT",
    ];
    for (const sql of cols) {
      try {
        db.exec(sql);
      } catch {
        /* exists */
      }
    }
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_test_plans_ticket ON test_plans(ticket_id)",
      );
    } catch {}
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_test_steps_testcase ON test_steps(testcase_id)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "017-plan-enrich",
    );
  }

  // Reports table — stores Claude-generated analysis for tickets
  if (!applied.has("022-reports")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  ticket_id         TEXT NOT NULL,
  run_id          TEXT,
  session_id      TEXT,
  verdict         TEXT NOT NULL,
  summary         TEXT NOT NULL,
  analysis        TEXT NOT NULL,
  improvements    TEXT,
  raw_data_json   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_ticket ON reports(ticket_id);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "022-reports",
    );
  }

  // Rename jira_id → ticket_id, jira_ids → ticket_ids across all tables (for existing DBs)
  if (!applied.has("024-rename-jira-to-ticket")) {
    const renames: Array<{ table: string; old: string; new_: string }> = [
      { table: "test_plans", old: "jira_id", new_: "ticket_id" },
      { table: "run_pack_entries", old: "jira_id", new_: "ticket_id" },
      { table: "run_artifacts", old: "jira_id", new_: "ticket_id" },
      // tech_issues: rename ticket_id back to ticket_ref if it was accidentally renamed
      { table: "tech_issues", old: "ticket_id", new_: "ticket_ref" },
      { table: "reports", old: "jira_id", new_: "ticket_id" },
      { table: "ui_maps", old: "jira_ids", new_: "ticket_ids" },
      { table: "ui_map_pages", old: "jira_ids", new_: "ticket_ids" },
      { table: "ui_map_elements", old: "jira_ids", new_: "ticket_ids" },
      { table: "ui_map_navigations", old: "jira_ids", new_: "ticket_ids" },
      { table: "ui_map_forms", old: "jira_ids", new_: "ticket_ids" },
    ];
    for (const r of renames) {
      try {
        db.exec(`ALTER TABLE ${r.table} RENAME COLUMN ${r.old} TO ${r.new_}`);
      } catch {
        /* already renamed or doesn't exist */
      }
    }
    // Rename indexes
    try {
      db.exec("DROP INDEX IF EXISTS idx_test_plans_jira");
    } catch {}
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_test_plans_ticket ON test_plans(ticket_id)",
      );
    } catch {}
    try {
      db.exec("DROP INDEX IF EXISTS idx_ra_jira");
    } catch {}
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_ra_ticket ON run_artifacts(ticket_id)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "024-rename-jira-to-ticket",
    );
  }

  // Fix tech_issues: rename ticket_id back to ticket_ref if migration 024 renamed it
  if (!applied.has("025-fix-tech-issues-column")) {
    try {
      db.exec("ALTER TABLE tech_issues RENAME COLUMN ticket_id TO ticket_ref");
    } catch {
      /* already ticket_ref */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "025-fix-tech-issues-column",
    );
  }

  // Rename created_by_jira / updated_by_jira audit columns to created_by_ticket / updated_by_ticket
  if (!applied.has("026-rename-jira-audit-columns")) {
    const auditCols = [
      {
        table: "ui_map_pages",
        old: "created_by_jira",
        new_: "created_by_ticket",
      },
      {
        table: "ui_map_pages",
        old: "updated_by_jira",
        new_: "updated_by_ticket",
      },
      {
        table: "ui_map_elements",
        old: "created_by_jira",
        new_: "created_by_ticket",
      },
      {
        table: "ui_map_elements",
        old: "updated_by_jira",
        new_: "updated_by_ticket",
      },
      {
        table: "ui_map_navigations",
        old: "created_by_jira",
        new_: "created_by_ticket",
      },
      {
        table: "ui_map_navigations",
        old: "updated_by_jira",
        new_: "updated_by_ticket",
      },
      {
        table: "ui_map_forms",
        old: "created_by_jira",
        new_: "created_by_ticket",
      },
      {
        table: "ui_map_forms",
        old: "updated_by_jira",
        new_: "updated_by_ticket",
      },
    ];
    for (const col of auditCols) {
      try {
        db.exec(
          `ALTER TABLE ${col.table} RENAME COLUMN ${col.old} TO ${col.new_}`,
        );
      } catch {}
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "026-rename-jira-audit-columns",
    );
  }

  // Add model and cost tracking to sessions
  if (!applied.has("027-session-model-cost")) {
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN model TEXT");
    } catch {}
    try {
      db.exec(
        "ALTER TABLE sessions ADD COLUMN estimated_cost_usd REAL DEFAULT 0",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "027-session-model-cost",
    );
  }

  // Add token breakdown to sessions
  if (!applied.has("028-session-token-breakdown")) {
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0");
    } catch {}
    try {
      db.exec(
        "ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0",
      );
    } catch {}
    try {
      db.exec(
        "ALTER TABLE sessions ADD COLUMN cache_read_tokens INTEGER DEFAULT 0",
      );
    } catch {}
    try {
      db.exec(
        "ALTER TABLE sessions ADD COLUMN cache_create_tokens INTEGER DEFAULT 0",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "028-session-token-breakdown",
    );
  }

  // Add analysis_run_id FK to test_plans
  if (!applied.has("029-plan-analysis-link")) {
    try {
      db.exec("ALTER TABLE test_plans ADD COLUMN analysis_run_id TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_test_plans_analysis ON test_plans(analysis_run_id)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "029-plan-analysis-link",
    );
  }

  // Normalize impact areas from analysis JSON
  if (!applied.has("030-impact-areas")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS impact_areas (
  id              TEXT PRIMARY KEY,
  analysis_id     TEXT NOT NULL REFERENCES analyses(id),
  run_id          TEXT NOT NULL REFERENCES runs(id),
  area_type       TEXT NOT NULL,
  description     TEXT NOT NULL,
  severity        TEXT,
  affected        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_impact_areas_analysis ON impact_areas(analysis_id);
CREATE INDEX IF NOT EXISTS idx_impact_areas_run ON impact_areas(run_id);
CREATE INDEX IF NOT EXISTS idx_impact_areas_type ON impact_areas(area_type);
CREATE INDEX IF NOT EXISTS idx_impact_areas_severity ON impact_areas(severity);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "030-impact-areas",
    );
  }

  // Normalize coverage gaps from plan JSON
  if (!applied.has("031-coverage-gaps")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS coverage_gaps (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT NOT NULL REFERENCES test_plans(id),
  run_id          TEXT NOT NULL REFERENCES runs(id),
  gap_description TEXT NOT NULL,
  severity        TEXT,
  category        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coverage_gaps_plan ON coverage_gaps(plan_id);
CREATE INDEX IF NOT EXISTS idx_coverage_gaps_run ON coverage_gaps(run_id);
CREATE INDEX IF NOT EXISTS idx_coverage_gaps_category ON coverage_gaps(category);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "031-coverage-gaps",
    );
  }

  // Phase transition history
  if (!applied.has("032-phase-transitions")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS phase_transitions (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  session_id      TEXT,
  from_phase      INTEGER NOT NULL,
  to_phase        INTEGER NOT NULL,
  transitioned_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_phase_trans_run ON phase_transitions(run_id);
CREATE INDEX IF NOT EXISTS idx_phase_trans_session ON phase_transitions(session_id);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "032-phase-transitions",
    );
  }

  // Index action log + outcome_summary
  if (!applied.has("033-action-log-index")) {
    try {
      db.exec("ALTER TABLE action_log ADD COLUMN outcome_summary TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_action_log_status ON action_log(status)",
      );
    } catch {}
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_action_log_agent ON action_log(agent_name)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "033-action-log-index",
    );
  }

  // Reverse step lookup index on plan_id
  if (!applied.has("034-test-steps-plan-index")) {
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_test_steps_plan ON test_steps(plan_id)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "034-test-steps-plan-index",
    );
  }

  // Normalize blockers from plan JSON
  if (!applied.has("035-blockers")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS blockers (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT NOT NULL REFERENCES test_plans(id),
  run_id          TEXT NOT NULL REFERENCES runs(id),
  ticket_id       TEXT,
  description     TEXT NOT NULL,
  severity        TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  resolved_at     TEXT,
  resolution      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blockers_plan ON blockers(plan_id);
CREATE INDEX IF NOT EXISTS idx_blockers_run ON blockers(run_id);
CREATE INDEX IF NOT EXISTS idx_blockers_ticket ON blockers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_blockers_status ON blockers(status);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "035-blockers",
    );
  }

  // Ticket context cache index (content stored on filesystem)
  if (!applied.has("036-ticket-context")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS ticket_context_index (
  id              TEXT PRIMARY KEY,
  ticket_id       TEXT NOT NULL,
  context_type    TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  fetched_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ttl_minutes     INTEGER NOT NULL DEFAULT 30,
  source          TEXT,
  size_bytes      INTEGER DEFAULT 0,
  UNIQUE(ticket_id, context_type)
);
CREATE INDEX IF NOT EXISTS idx_tci_ticket ON ticket_context_index(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tci_type ON ticket_context_index(context_type);
CREATE INDEX IF NOT EXISTS idx_tci_fetched ON ticket_context_index(fetched_at);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "036-ticket-context",
    );
  }

  // API Maps — endpoint registry with chains, params, responses, auth
  if (!applied.has("037-api-maps")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS api_maps (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  base_url        TEXT,
  repo_urls       TEXT NOT NULL DEFAULT '[]',
  ticket_ids      TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_maps_name ON api_maps(name);

CREATE TABLE IF NOT EXISTS api_map_endpoints (
  id              TEXT PRIMARY KEY,
  api_map_id      TEXT NOT NULL REFERENCES api_maps(id),
  method          TEXT NOT NULL,
  path            TEXT NOT NULL,
  summary         TEXT,
  auth_type       TEXT DEFAULT 'none',
  auth_roles      TEXT DEFAULT '[]',
  request_content_type TEXT DEFAULT 'application/json',
  status          TEXT NOT NULL DEFAULT 'active',
  times_called    INTEGER DEFAULT 0,
  times_succeeded INTEGER DEFAULT 0,
  times_failed    INTEGER DEFAULT 0,
  avg_response_ms REAL DEFAULT 0,
  last_status_code INTEGER,
  last_called_at  TEXT,
  last_called_run TEXT,
  created_by_run  TEXT,
  created_by_ticket TEXT,
  updated_by_run  TEXT,
  ticket_ids      TEXT DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(api_map_id, method, path)
);
CREATE INDEX IF NOT EXISTS idx_ame_map ON api_map_endpoints(api_map_id);
CREATE INDEX IF NOT EXISTS idx_ame_method ON api_map_endpoints(method);
CREATE INDEX IF NOT EXISTS idx_ame_path ON api_map_endpoints(path);
CREATE INDEX IF NOT EXISTS idx_ame_status ON api_map_endpoints(status);

CREATE TABLE IF NOT EXISTS api_map_params (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES api_map_endpoints(id),
  api_map_id      TEXT NOT NULL REFERENCES api_maps(id),
  name            TEXT NOT NULL,
  location        TEXT NOT NULL,
  param_type      TEXT DEFAULT 'string',
  required        INTEGER DEFAULT 0,
  description     TEXT,
  example_value   TEXT,
  validation      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_amp_endpoint ON api_map_params(endpoint_id);

CREATE TABLE IF NOT EXISTS api_map_responses (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES api_map_endpoints(id),
  api_map_id      TEXT NOT NULL REFERENCES api_maps(id),
  status_code     INTEGER NOT NULL,
  description     TEXT,
  schema_json     TEXT,
  example_json    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(endpoint_id, status_code)
);
CREATE INDEX IF NOT EXISTS idx_amr_endpoint ON api_map_responses(endpoint_id);

CREATE TABLE IF NOT EXISTS api_map_chains (
  id              TEXT PRIMARY KEY,
  api_map_id      TEXT NOT NULL REFERENCES api_maps(id),
  from_endpoint_id TEXT NOT NULL REFERENCES api_map_endpoints(id),
  to_endpoint_id  TEXT NOT NULL REFERENCES api_map_endpoints(id),
  chain_type      TEXT NOT NULL DEFAULT 'depends',
  description     TEXT,
  ticket_ids      TEXT DEFAULT '[]',
  created_by_run  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_amc_map ON api_map_chains(api_map_id);
CREATE INDEX IF NOT EXISTS idx_amc_from ON api_map_chains(from_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_amc_to ON api_map_chains(to_endpoint_id);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "037-api-maps",
    );
  }

  // Add branch and commit tracking to repos
  if (!applied.has("023-repos-branch")) {
    try {
      db.exec("ALTER TABLE repos ADD COLUMN current_branch TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec("ALTER TABLE repos ADD COLUMN last_commit TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec("ALTER TABLE repos ADD COLUMN last_indexed TEXT");
    } catch {
      /* exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "023-repos-branch",
    );
  }

  // Add runner column to run_pack_entries
  if (!applied.has("021-runpack-runner")) {
    try {
      db.exec(
        "ALTER TABLE run_pack_entries ADD COLUMN runner TEXT DEFAULT 'ui'",
      );
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "UPDATE run_pack_entries SET runner = 'ui' WHERE runner IS NULL AND test_case_id != '__header__'",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "021-runpack-runner",
    );
  }

  // Coverage map — link test cases to source files for code-level coverage
  if (!applied.has("038-coverage-map")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS coverage_map (
  id              TEXT PRIMARY KEY,
  test_case_id    TEXT NOT NULL,
  repo_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  function_name   TEXT,
  link_type       TEXT NOT NULL DEFAULT 'impacted',
  confidence      REAL DEFAULT 1.0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(test_case_id, repo_name, file_path, function_name)
);
CREATE INDEX IF NOT EXISTS idx_cm_testcase ON coverage_map(test_case_id);
CREATE INDEX IF NOT EXISTS idx_cm_repo_file ON coverage_map(repo_name, file_path);
CREATE INDEX IF NOT EXISTS idx_cm_function ON coverage_map(function_name);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "038-coverage-map",
    );
  }

  // RCA results — root cause analysis for failed run pack entries
  if (!applied.has("039-rca")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS rca_results (
  id                TEXT PRIMARY KEY,
  run_pack_id       TEXT NOT NULL,
  entry_id          TEXT NOT NULL,
  test_case_id      TEXT NOT NULL,
  classification    TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.5,
  root_cause        TEXT NOT NULL,
  evidence_summary  TEXT,
  failure_pattern_id TEXT,
  suggested_action  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rca_pack ON rca_results(run_pack_id);
CREATE INDEX IF NOT EXISTS idx_rca_entry ON rca_results(entry_id);
CREATE INDEX IF NOT EXISTS idx_rca_class ON rca_results(classification);
    `);
    // Add classification columns to failure_patterns
    try {
      db.exec("ALTER TABLE failure_patterns ADD COLUMN classification TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "ALTER TABLE failure_patterns ADD COLUMN classification_confidence REAL",
      );
    } catch {
      /* exists */
    }
    try {
      db.exec("ALTER TABLE failure_patterns ADD COLUMN last_rca_at TEXT");
    } catch {
      /* exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "039-rca",
    );
  }

  // Accessibility issues — WCAG/axe-core audit results
  if (!applied.has("040-a11y")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS a11y_issues (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  run_pack_id     TEXT,
  entry_id        TEXT,
  page_url        TEXT NOT NULL,
  ui_map_page_id  TEXT,
  rule_id         TEXT NOT NULL,
  impact          TEXT NOT NULL,
  wcag_criteria   TEXT,
  wcag_level      TEXT,
  description     TEXT NOT NULL,
  html_snippet    TEXT,
  selector        TEXT,
  help_url        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_a11y_run ON a11y_issues(run_id);
CREATE INDEX IF NOT EXISTS idx_a11y_pack ON a11y_issues(run_pack_id);
CREATE INDEX IF NOT EXISTS idx_a11y_page ON a11y_issues(page_url);
CREATE INDEX IF NOT EXISTS idx_a11y_impact ON a11y_issues(impact);
CREATE INDEX IF NOT EXISTS idx_a11y_rule ON a11y_issues(rule_id);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "040-a11y",
    );
  }

  // Resource stats cache — pre-computed stats updated during operations
  if (!applied.has("044-resource-stats")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS resource_stats (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "044-resource-stats",
    );
  }

  // Visual regression baselines and diffs
  if (!applied.has("043-visual-baselines")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS visual_baselines (
  id              TEXT PRIMARY KEY,
  ui_map_page_id  TEXT NOT NULL,
  url_pattern     TEXT NOT NULL,
  viewport        TEXT NOT NULL DEFAULT '1280x720',
  baseline_path   TEXT NOT NULL,
  baseline_hash   TEXT,
  source_run_id   TEXT,
  source_entry_id TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ui_map_page_id, viewport, status)
);
CREATE INDEX IF NOT EXISTS idx_vb_page ON visual_baselines(ui_map_page_id);
CREATE INDEX IF NOT EXISTS idx_vb_url ON visual_baselines(url_pattern);
CREATE INDEX IF NOT EXISTS idx_vb_status ON visual_baselines(status);

CREATE TABLE IF NOT EXISTS visual_diffs (
  id              TEXT PRIMARY KEY,
  baseline_id     TEXT NOT NULL REFERENCES visual_baselines(id),
  run_id          TEXT NOT NULL,
  entry_id        TEXT,
  current_path    TEXT NOT NULL,
  diff_score      REAL,
  description     TEXT,
  is_regression   INTEGER DEFAULT 0,
  reviewed        INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vd_baseline ON visual_diffs(baseline_id);
CREATE INDEX IF NOT EXISTS idx_vd_run ON visual_diffs(run_id);
CREATE INDEX IF NOT EXISTS idx_vd_regression ON visual_diffs(is_regression);
CREATE INDEX IF NOT EXISTS idx_vd_reviewed ON visual_diffs(reviewed);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "043-visual-baselines",
    );
  }

  // Risk scoring columns on test_cases
  if (!applied.has("041-risk-scores")) {
    try {
      db.exec("ALTER TABLE test_cases ADD COLUMN risk_score REAL DEFAULT 0");
    } catch {
      /* exists */
    }
    try {
      db.exec("ALTER TABLE test_cases ADD COLUMN risk_factors TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_testcases_risk ON test_cases(risk_score DESC)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "041-risk-scores",
    );
  }

  // False positive columns on run_pack_entries
  if (!applied.has("042-false-positives")) {
    try {
      db.exec(
        "ALTER TABLE run_pack_entries ADD COLUMN retry_count INTEGER DEFAULT 0",
      );
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "ALTER TABLE run_pack_entries ADD COLUMN is_false_positive INTEGER DEFAULT 0",
      );
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "ALTER TABLE run_pack_entries ADD COLUMN failure_confidence TEXT",
      );
    } catch {
      /* exists */
    }
    try {
      db.exec("ALTER TABLE run_pack_entries ADD COLUMN original_status TEXT");
    } catch {
      /* exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "042-false-positives",
    );
  }

  // Add test_layer column to test_cases
  if (!applied.has("020-testcase-layer")) {
    try {
      db.exec("ALTER TABLE test_cases ADD COLUMN test_layer TEXT DEFAULT 'ui'");
    } catch {
      /* exists */
    }
    // Backfill existing rows that have NULL
    try {
      db.exec(
        "UPDATE test_cases SET test_layer = 'ui' WHERE test_layer IS NULL",
      );
    } catch {}
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_testcases_layer ON test_cases(test_layer)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "020-testcase-layer",
    );
  }

  // Backfill NULL test_layer on any rows missed (idempotent, runs every startup)
  try {
    db.exec("UPDATE test_cases SET test_layer = 'ui' WHERE test_layer IS NULL");
  } catch {}

  // Add test_notes column to test_plans
  if (!applied.has("019-plan-test-notes")) {
    try {
      db.exec("ALTER TABLE test_plans ADD COLUMN test_notes TEXT");
    } catch {
      /* exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "019-plan-test-notes",
    );
  }

  // Link test cases to plan steps
  if (!applied.has("018-testcase-plan-link")) {
    try {
      db.exec("ALTER TABLE test_cases ADD COLUMN plan_step_id TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_testcases_plan_step ON test_cases(plan_step_id)",
      );
    } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "018-testcase-plan-link",
    );
  }

  // UI Maps
  if (!applied.has("015-ui-maps")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS ui_maps (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  repo_urls       TEXT NOT NULL DEFAULT '[]',
  target_urls     TEXT NOT NULL DEFAULT '[]',
  ticket_ids        TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ui_maps_name ON ui_maps(name);

CREATE TABLE IF NOT EXISTS ui_map_pages (
  id              TEXT PRIMARY KEY,
  ui_map_id       TEXT NOT NULL REFERENCES ui_maps(id),
  url_pattern     TEXT NOT NULL,
  page_title      TEXT,
  description     TEXT,
  snapshot_path   TEXT,
  screenshot_path TEXT,
  auth_required   INTEGER DEFAULT 0,
  auth_roles      TEXT DEFAULT '[]',
  related_code    TEXT DEFAULT '[]',
  related_repos   TEXT DEFAULT '[]',
  ticket_ids        TEXT DEFAULT '[]',
  target_parity   TEXT DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  last_verified_at TEXT,
  last_verified_run TEXT,
  created_by_run  TEXT,
  created_by_session TEXT,
  created_by_ticket TEXT,
  updated_by_run  TEXT,
  updated_by_ticket TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uimp_map ON ui_map_pages(ui_map_id);
CREATE INDEX IF NOT EXISTS idx_uimp_url ON ui_map_pages(url_pattern);
CREATE INDEX IF NOT EXISTS idx_uimp_status ON ui_map_pages(status);

CREATE TABLE IF NOT EXISTS ui_map_elements (
  id              TEXT PRIMARY KEY,
  page_id         TEXT NOT NULL REFERENCES ui_map_pages(id),
  ui_map_id       TEXT NOT NULL REFERENCES ui_maps(id),
  selector        TEXT NOT NULL,
  alt_selectors   TEXT DEFAULT '[]',
  element_type    TEXT NOT NULL,
  element_role    TEXT,
  element_text    TEXT,
  element_name    TEXT,
  position_hint   TEXT,
  action_type     TEXT,
  action_result   TEXT,
  related_code    TEXT,
  related_repos   TEXT DEFAULT '[]',
  ticket_ids        TEXT DEFAULT '[]',
  auth_roles      TEXT DEFAULT '[]',
  target_parity   TEXT DEFAULT '{}',
  times_used      INTEGER DEFAULT 0,
  times_succeeded INTEGER DEFAULT 0,
  times_failed    INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'working',
  last_used_at    TEXT,
  last_used_run   TEXT,
  created_by_run  TEXT,
  created_by_session TEXT,
  created_by_ticket TEXT,
  created_by_testcase TEXT,
  updated_by_run  TEXT,
  updated_by_ticket TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uime_page ON ui_map_elements(page_id);
CREATE INDEX IF NOT EXISTS idx_uime_map ON ui_map_elements(ui_map_id);
CREATE INDEX IF NOT EXISTS idx_uime_selector ON ui_map_elements(selector);
CREATE INDEX IF NOT EXISTS idx_uime_type ON ui_map_elements(element_type);
CREATE INDEX IF NOT EXISTS idx_uime_status ON ui_map_elements(status);

CREATE TABLE IF NOT EXISTS ui_map_navigations (
  id              TEXT PRIMARY KEY,
  ui_map_id       TEXT NOT NULL REFERENCES ui_maps(id),
  from_page_id    TEXT NOT NULL REFERENCES ui_map_pages(id),
  to_page_id      TEXT NOT NULL REFERENCES ui_map_pages(id),
  via_element_id  TEXT REFERENCES ui_map_elements(id),
  nav_type        TEXT NOT NULL DEFAULT 'click',
  conditions      TEXT DEFAULT '[]',
  ticket_ids        TEXT DEFAULT '[]',
  auth_roles      TEXT DEFAULT '[]',
  target_parity   TEXT DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  times_used      INTEGER DEFAULT 0,
  created_by_run  TEXT,
  created_by_ticket TEXT,
  updated_by_run  TEXT,
  updated_by_ticket TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uimn_map ON ui_map_navigations(ui_map_id);
CREATE INDEX IF NOT EXISTS idx_uimn_from ON ui_map_navigations(from_page_id);
CREATE INDEX IF NOT EXISTS idx_uimn_to ON ui_map_navigations(to_page_id);

CREATE TABLE IF NOT EXISTS ui_map_forms (
  id              TEXT PRIMARY KEY,
  page_id         TEXT NOT NULL REFERENCES ui_map_pages(id),
  ui_map_id       TEXT NOT NULL REFERENCES ui_maps(id),
  form_selector   TEXT,
  form_name       TEXT,
  fields          TEXT DEFAULT '[]',
  submit_element_id TEXT REFERENCES ui_map_elements(id),
  success_indicator TEXT,
  error_indicator TEXT,
  sample_values   TEXT DEFAULT '{}',
  ticket_ids        TEXT DEFAULT '[]',
  auth_roles      TEXT DEFAULT '[]',
  target_parity   TEXT DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  created_by_run  TEXT,
  created_by_ticket TEXT,
  updated_by_run  TEXT,
  updated_by_ticket TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uimf_page ON ui_map_forms(page_id);
CREATE INDEX IF NOT EXISTS idx_uimf_map ON ui_map_forms(ui_map_id);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "015-ui-maps",
    );
  }

  // Add reuse_run_id to runs if not present
  if (!applied.has("004-reuse-col")) {
    try {
      db.exec("ALTER TABLE runs ADD COLUMN reuse_run_id TEXT");
    } catch {
      /* exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "004-reuse-col",
    );
  }

  // Add session_id to runs if not present
  if (!applied.has("003-sessions-col")) {
    try {
      db.exec(ADD_SESSION_COL);
    } catch {
      // Column already exists — ignore
    }
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id)",
      );
    } catch {
      // ignore
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "003-sessions-col",
    );
  }

  // Add ticket_id to a11y_issues for direct ticket-level querying
  if (!applied.has("045-a11y-ticket")) {
    try {
      db.exec("ALTER TABLE a11y_issues ADD COLUMN ticket_id TEXT");
    } catch {
      /* exists */
    }
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_a11y_ticket ON a11y_issues(ticket_id)",
      );
    } catch {
      /* exists */
    }
    // Backfill from run_pack_entries
    try {
      db.exec(`UPDATE a11y_issues SET ticket_id = (
        SELECT rpe.ticket_id FROM run_pack_entries rpe
        WHERE rpe.run_pack_id = a11y_issues.run_pack_id AND rpe.test_case_id = '__header__'
      ) WHERE ticket_id IS NULL AND run_pack_id IS NOT NULL`);
    } catch {
      /* ok */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "045-a11y-ticket",
    );
  }

  if (!applied.has("046-settings")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id         TEXT PRIMARY KEY,
        key        TEXT NOT NULL UNIQUE,
        value      TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "046-settings",
    );
  }

  // Auth sessions — stores active login state for AntTest cloud sync
  if (!applied.has("047-auth-sessions")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS auth_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  user_email      TEXT NOT NULL,
  user_name       TEXT,
  org_id          TEXT NOT NULL,
  org_name        TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  token_type      TEXT NOT NULL DEFAULT 'bearer',
  expires_at      TEXT,
  anttest_url     TEXT NOT NULL DEFAULT 'https://anttest.app',
  auth_method     TEXT NOT NULL DEFAULT 'token',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at    TEXT NOT NULL DEFAULT (datetime('now')),
  is_active       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_org ON auth_sessions(org_id);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "047-auth-sessions",
    );
  }

  // Add test_case_id column to run_pack_entries if missing (fixes old DBs)
  if (!applied.has("048-runpack-testcaseid")) {
    try {
      // Check if the column exists by trying to select it
      db.prepare("SELECT test_case_id FROM run_pack_entries LIMIT 1").get();
    } catch {
      // Column doesn't exist, need to recreate the table
      // SQLite doesn't support adding NOT NULL columns to existing tables
      // so we need to create a new table and migrate data
      try {
        db.exec(`
          ALTER TABLE run_pack_entries RENAME TO run_pack_entries_old;

          CREATE TABLE run_pack_entries (
            id              TEXT PRIMARY KEY,
            run_pack_id     TEXT NOT NULL,
            ticket_id       TEXT NOT NULL,
            run_id          TEXT NOT NULL,
            session_id      TEXT,
            test_case_id    TEXT NOT NULL DEFAULT '__header__',
            fresh_or_existing TEXT NOT NULL DEFAULT 'fresh',
            status          TEXT NOT NULL DEFAULT 'pending',
            results         TEXT,
            logs            TEXT,
            observations    TEXT,
            issues          TEXT,
            artifacts       TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            started_at      TEXT,
            completed_at    TEXT,
            target_url      TEXT,
            secret_target   TEXT,
            secret_role     TEXT,
            capture_config  TEXT,
            runner          TEXT DEFAULT 'ui',
            retry_count     INTEGER DEFAULT 0,
            is_false_positive INTEGER DEFAULT 0,
            failure_confidence TEXT,
            original_status TEXT
          );

          INSERT INTO run_pack_entries (
            id, run_pack_id, ticket_id, run_id, session_id, test_case_id,
            fresh_or_existing, status, results, logs, observations, issues,
            artifacts, created_at, started_at, completed_at, target_url,
            secret_target, secret_role, capture_config, runner,
            retry_count, is_false_positive, failure_confidence, original_status
          )
          SELECT
            id, run_pack_id, ticket_id, run_id, session_id, '__header__',
            COALESCE(fresh_or_existing, 'fresh'), COALESCE(status, 'pending'),
            results, logs, observations, issues, artifacts, created_at,
            started_at, completed_at, target_url, secret_target, secret_role,
            capture_config, runner, retry_count, is_false_positive,
            failure_confidence, original_status
          FROM run_pack_entries_old;

          DROP TABLE run_pack_entries_old;

          CREATE INDEX IF NOT EXISTS idx_rpe_run_pack ON run_pack_entries(run_pack_id);
          CREATE INDEX IF NOT EXISTS idx_rpe_ticket ON run_pack_entries(ticket_id);
          CREATE INDEX IF NOT EXISTS idx_rpe_run ON run_pack_entries(run_id);
          CREATE INDEX IF NOT EXISTS idx_rpe_testcase ON run_pack_entries(test_case_id);
          CREATE INDEX IF NOT EXISTS idx_rpe_status ON run_pack_entries(status);
        `);
      } catch {
        /* migration failed, table might already be correct */
      }
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "048-runpack-testcaseid",
    );
  }

  // Add stream_port to sessions for browser streaming multiplexing
  if (!applied.has("050-session-stream-port")) {
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN stream_port INTEGER");
    } catch {
      /* column already exists */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "050-session-stream-port",
    );
  }

  // Default files — local files available for agent-browser upload
  if (!applied.has("051-default-files")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS default_files (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_type       TEXT NOT NULL DEFAULT 'document',
  mime_type       TEXT,
  file_size       INTEGER DEFAULT 0,
  description     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_df_type ON default_files(file_type);
CREATE INDEX IF NOT EXISTS idx_df_label ON default_files(label);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "051-default-files",
    );
  }

  // Denormalize test case title into run_pack_entries for faster queries
  if (!applied.has("049-runpack-tc-title")) {
    try {
      db.exec("ALTER TABLE run_pack_entries ADD COLUMN tc_title TEXT");
    } catch {
      /* column already exists */
    }
    // Back-fill titles for existing entries
    try {
      db.exec(
        `UPDATE run_pack_entries SET tc_title = (
           SELECT title FROM test_cases WHERE test_cases.id = run_pack_entries.test_case_id
         ) WHERE tc_title IS NULL AND test_case_id != '__header__'`,
      );
    } catch {
      /* best-effort */
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "049-runpack-tc-title",
    );
  }

  // qa-pool — ticketed multi-agent orchestration table
  if (!applied.has("052-qa-pool")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS qa_pool_agents (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL,
  agent_path  TEXT NOT NULL,
  target      TEXT,
  role        TEXT NOT NULL DEFAULT 'default',
  file        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qpa_ticket ON qa_pool_agents(ticket_id);
CREATE INDEX IF NOT EXISTS idx_qpa_agent ON qa_pool_agents(agent_path);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "052-qa-pool",
    );
  }

  // Visual testing — dedicated test cases, runs, screenshots, and comparisons
  if (!applied.has("053-visual-testing")) {
    db.exec(`
CREATE TABLE IF NOT EXISTS visual_test_cases (
  id                TEXT PRIMARY KEY,
  ticket_id         TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL DEFAULT 'direct_functional',
  format            TEXT NOT NULL DEFAULT 'bdd',
  viewport          TEXT NOT NULL DEFAULT '1280x720',
  default_threshold REAL NOT NULL DEFAULT 0.1,

  -- BDD format
  bdd_feature       TEXT,
  bdd_scenario      TEXT,
  bdd_given         TEXT,
  bdd_when          TEXT,
  bdd_then          TEXT,

  -- Traditional format
  trad_steps        TEXT,
  trad_expected     TEXT,

  -- Visual-specific: steps with screenshot/diff config
  visual_steps_json TEXT NOT NULL DEFAULT '[]',

  -- Metadata
  preconditions     TEXT,
  impacted_files    TEXT,
  labels            TEXT DEFAULT '[]',
  test_layer        TEXT NOT NULL DEFAULT 'ui',
  ready             INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vtc_ticket ON visual_test_cases(ticket_id);
CREATE INDEX IF NOT EXISTS idx_vtc_status ON visual_test_cases(status);
CREATE INDEX IF NOT EXISTS idx_vtc_type ON visual_test_cases(type);
CREATE INDEX IF NOT EXISTS idx_vtc_ready ON visual_test_cases(ready);

CREATE TABLE IF NOT EXISTS visual_runs (
  id            TEXT PRIMARY KEY,
  ticket_id     TEXT NOT NULL,
  mode          TEXT NOT NULL,
  target_url    TEXT NOT NULL,
  secret_target TEXT,
  secret_role   TEXT,
  session_id    TEXT,
  status        TEXT NOT NULL DEFAULT 'running',
  summary_json  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_vr_ticket ON visual_runs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_vr_mode ON visual_runs(mode);
CREATE INDEX IF NOT EXISTS idx_vr_status ON visual_runs(status);

CREATE TABLE IF NOT EXISTS visual_run_entries (
  id                TEXT PRIMARY KEY,
  visual_run_id     TEXT NOT NULL REFERENCES visual_runs(id),
  visual_tc_id      TEXT NOT NULL,
  ticket_id         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  result_json       TEXT,
  device            TEXT DEFAULT 'web',
  dimension         TEXT DEFAULT 'standard',
  trace_path        TEXT,
  profile_path      TEXT,
  telemetry_config  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_vre_run ON visual_run_entries(visual_run_id);
CREATE INDEX IF NOT EXISTS idx_vre_tc ON visual_run_entries(visual_tc_id);
CREATE INDEX IF NOT EXISTS idx_vre_ticket ON visual_run_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_vre_status ON visual_run_entries(status);

CREATE TABLE IF NOT EXISTS visual_screenshots (
  id             TEXT PRIMARY KEY,
  visual_run_id  TEXT NOT NULL,
  visual_tc_id   TEXT NOT NULL,
  ticket_id      TEXT NOT NULL,
  step_index     INTEGER NOT NULL,
  step_label     TEXT NOT NULL,
  viewport       TEXT NOT NULL DEFAULT '1280x720',
  file_path      TEXT NOT NULL,
  target_url     TEXT,
  mode           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vs_run ON visual_screenshots(visual_run_id);
CREATE INDEX IF NOT EXISTS idx_vs_tc ON visual_screenshots(visual_tc_id);
CREATE INDEX IF NOT EXISTS idx_vs_ticket ON visual_screenshots(ticket_id);
CREATE INDEX IF NOT EXISTS idx_vs_mode ON visual_screenshots(mode);

CREATE TABLE IF NOT EXISTS visual_comparisons (
  id             TEXT PRIMARY KEY,
  visual_run_id  TEXT NOT NULL,
  visual_tc_id   TEXT NOT NULL,
  ticket_id      TEXT NOT NULL,
  step_index     INTEGER NOT NULL,
  step_label     TEXT NOT NULL,
  viewport       TEXT NOT NULL DEFAULT '1280x720',
  baseline_id    TEXT NOT NULL REFERENCES visual_screenshots(id),
  current_id     TEXT NOT NULL REFERENCES visual_screenshots(id),
  diff_path      TEXT,
  diff_score     REAL,
  threshold      REAL NOT NULL DEFAULT 0.1,
  passed         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vc_run ON visual_comparisons(visual_run_id);
CREATE INDEX IF NOT EXISTS idx_vc_tc ON visual_comparisons(visual_tc_id);
CREATE INDEX IF NOT EXISTS idx_vc_ticket ON visual_comparisons(ticket_id);
CREATE INDEX IF NOT EXISTS idx_vc_passed ON visual_comparisons(passed);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "053-visual-testing",
    );
  }

  // Telemetry columns — device, dimension, trace/profile paths, per-step console & errors
  if (!applied.has("054-telemetry")) {
    db.exec(`
ALTER TABLE run_pack_entries ADD COLUMN device TEXT NOT NULL DEFAULT 'web';
ALTER TABLE run_pack_entries ADD COLUMN dimension TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE run_pack_entries ADD COLUMN trace_path TEXT;
ALTER TABLE run_pack_entries ADD COLUMN profile_path TEXT;
ALTER TABLE run_pack_entries ADD COLUMN telemetry_config TEXT;

ALTER TABLE visual_run_entries ADD COLUMN device TEXT NOT NULL DEFAULT 'web';
ALTER TABLE visual_run_entries ADD COLUMN dimension TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE visual_run_entries ADD COLUMN trace_path TEXT;
ALTER TABLE visual_run_entries ADD COLUMN profile_path TEXT;
ALTER TABLE visual_run_entries ADD COLUMN telemetry_config TEXT;
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "054-telemetry",
    );
  }

  // Add launch_dir column to qa_pool_agents
  if (!applied.has("055-qa-pool-launch-dir")) {
    db.exec(`
ALTER TABLE qa_pool_agents ADD COLUMN launch_dir TEXT;
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "055-qa-pool-launch-dir",
    );
  }

  // Update visual_test_cases to support BDD/traditional format + visual steps
  if (!applied.has("056-visual-testcase-format")) {
    db.exec(`
ALTER TABLE visual_test_cases ADD COLUMN type TEXT NOT NULL DEFAULT 'direct_functional';
ALTER TABLE visual_test_cases ADD COLUMN format TEXT NOT NULL DEFAULT 'bdd';
ALTER TABLE visual_test_cases ADD COLUMN bdd_feature TEXT;
ALTER TABLE visual_test_cases ADD COLUMN bdd_scenario TEXT;
ALTER TABLE visual_test_cases ADD COLUMN bdd_given TEXT;
ALTER TABLE visual_test_cases ADD COLUMN bdd_when TEXT;
ALTER TABLE visual_test_cases ADD COLUMN bdd_then TEXT;
ALTER TABLE visual_test_cases ADD COLUMN trad_steps TEXT;
ALTER TABLE visual_test_cases ADD COLUMN trad_expected TEXT;
ALTER TABLE visual_test_cases ADD COLUMN visual_steps_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE visual_test_cases ADD COLUMN preconditions TEXT;
ALTER TABLE visual_test_cases ADD COLUMN impacted_files TEXT;
ALTER TABLE visual_test_cases ADD COLUMN test_layer TEXT NOT NULL DEFAULT 'ui';
ALTER TABLE visual_test_cases ADD COLUMN ready INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_vtc_type ON visual_test_cases(type);
CREATE INDEX IF NOT EXISTS idx_vtc_ready ON visual_test_cases(ready);
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "056-visual-testcase-format",
    );
  }

  // Scheduled agent runs with flexible parameters
  if (!applied.has("058-scheduled-agents-fix")) {
    // Fix: drop old bad schema and recreate
    try {
      db.exec("DROP TABLE IF EXISTS agent_execution_history");
      db.exec("DROP TABLE IF EXISTS scheduled_agents");
    } catch {}
    db.exec(`
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
    `);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(
      "058-scheduled-agents-fix",
    );
  }
}

function tryLoadVss(db: Database.Database): void {
  try {
    let sqliteVss: { load: (db: Database.Database) => void } | null = null;
    try {
      sqliteVss = require("sqlite-vss") as {
        load: (db: Database.Database) => void;
      };
    } catch {
      sqliteVss = null;
    }
    if (sqliteVss) {
      sqliteVss.load(db);
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS code_embeddings USING vss0(
          embedding(1536)
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS code_chunk_embeddings (
          chunk_id TEXT NOT NULL REFERENCES code_chunks(id),
          embedding_rowid INTEGER NOT NULL,
          PRIMARY KEY (chunk_id)
        )
      `);
      _vssAvailable = true;
    }
  } catch {
    _vssAvailable = false;
  }
}

/** Close the database connection. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
