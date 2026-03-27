import { getDb } from "../client.js";

export interface DuplicatePair {
  testCaseA: { id: string; title: string; type: string };
  testCaseB: { id: string; title: string; type: string };
  similarity: number;
}

export interface AuditReport {
  duplicates: DuplicatePair[];
  neverFailed: Array<{ id: string; title: string; type: string; execution_count: number }>;
  orphaned: Array<{ id: string; title: string; ticket_ref: string; last_executed: string | null }>;
  stale: Array<{ id: string; title: string; last_executed: string; days_since: number }>;
  stats: { total: number; duplicateCount: number; neverFailedCount: number; orphanedCount: number; staleCount: number };
}

/**
 * Find near-duplicate test cases using Jaccard similarity on tokenized title + description.
 */
export function findDuplicates(
  ticketRef?: string,
  threshold: number = 0.65
): DuplicatePair[] {
  const db = getDb();

  const filter = ticketRef ? " WHERE ticket_ref = ?" : "";
  const params = ticketRef ? [ticketRef] : [];

  const testCases = db
    .prepare(
      `SELECT id, title, description, type, bdd_scenario, trad_steps${filter} FROM test_cases` +
        (filter ? "" : " ORDER BY ticket_ref, created_at")
    )
    .all(...params) as Array<{
    id: string;
    title: string;
    description: string | null;
    type: string;
    bdd_scenario: string | null;
    trad_steps: string | null;
  }>;

  // Tokenize each test case
  const tokenized = testCases.map((tc) => {
    const text = [
      tc.title,
      tc.description ?? "",
      tc.bdd_scenario ?? "",
      tc.trad_steps ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return { tc, tokens: new Set(text) };
  });

  const duplicates: DuplicatePair[] = [];

  // Pairwise Jaccard similarity — O(n^2) but test cases per ticket are typically < 100
  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const a = tokenized[i];
      const b = tokenized[j];

      if (a.tokens.size === 0 || b.tokens.size === 0) continue;

      let intersection = 0;
      for (const t of a.tokens) {
        if (b.tokens.has(t)) intersection++;
      }
      const union = a.tokens.size + b.tokens.size - intersection;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity >= threshold) {
        duplicates.push({
          testCaseA: { id: a.tc.id, title: a.tc.title, type: a.tc.type },
          testCaseB: { id: b.tc.id, title: b.tc.title, type: b.tc.type },
          similarity: Math.round(similarity * 100) / 100,
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Find test cases that have been executed but never failed.
 */
export function findNeverFailed(
  ticketRef?: string
): Array<{ id: string; title: string; type: string; execution_count: number }> {
  const db = getDb();

  const filter = ticketRef ? " AND tc.ticket_ref = ?" : "";
  const params: unknown[] = [];
  if (ticketRef) params.push(ticketRef);

  return db
    .prepare(
      `SELECT tc.id, tc.title, tc.type, tc.execution_count
       FROM test_cases tc
       WHERE tc.execution_count > 0${filter}
         AND tc.id NOT IN (
           SELECT DISTINCT test_case_id FROM run_pack_entries
           WHERE status = 'failed' AND test_case_id != '__header__'
         )
       ORDER BY tc.execution_count DESC`
    )
    .all(...params) as Array<{
    id: string;
    title: string;
    type: string;
    execution_count: number;
  }>;
}

/**
 * Find orphaned test cases — ticket_ref not seen in any run_pack_entries in the last 90 days.
 */
export function findOrphaned(): Array<{
  id: string;
  title: string;
  ticket_ref: string;
  last_executed: string | null;
}> {
  return getDb()
    .prepare(
      `SELECT tc.id, tc.title, tc.ticket_ref, tc.last_executed
       FROM test_cases tc
       WHERE tc.ticket_ref NOT IN (
         SELECT DISTINCT ticket_id FROM run_pack_entries
         WHERE created_at > datetime('now', '-90 days')
           AND test_case_id != '__header__'
       )
       ORDER BY tc.last_executed ASC NULLS FIRST`
    )
    .all() as Array<{
    id: string;
    title: string;
    ticket_ref: string;
    last_executed: string | null;
  }>;
}

/**
 * Find stale test cases — not executed in N days.
 */
export function findStale(
  daysSince: number = 30,
  ticketRef?: string
): Array<{ id: string; title: string; last_executed: string; days_since: number }> {
  const filter = ticketRef ? " AND ticket_ref = ?" : "";
  const params: unknown[] = [daysSince];
  if (ticketRef) params.push(ticketRef);

  return getDb()
    .prepare(
      `SELECT id, title, last_executed,
              CAST(julianday('now') - julianday(last_executed) AS INTEGER) as days_since
       FROM test_cases
       WHERE last_executed IS NOT NULL
         AND julianday('now') - julianday(last_executed) > ?${filter}
       ORDER BY last_executed ASC`
    )
    .all(...params) as Array<{
    id: string;
    title: string;
    last_executed: string;
    days_since: number;
  }>;
}

/**
 * Full audit report combining all checks.
 */
export function auditReport(ticketRef?: string): AuditReport {
  const duplicates = findDuplicates(ticketRef);
  const neverFailed = findNeverFailed(ticketRef);
  const orphaned = ticketRef ? [] : findOrphaned(); // Orphaned only makes sense across all tickets
  const stale = findStale(30, ticketRef);

  const db = getDb();
  const filter = ticketRef ? " WHERE ticket_ref = ?" : "";
  const params = ticketRef ? [ticketRef] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM test_cases${filter}`).get(...params) as { c: number }
  ).c;

  return {
    duplicates,
    neverFailed,
    orphaned,
    stale,
    stats: {
      total,
      duplicateCount: duplicates.length,
      neverFailedCount: neverFailed.length,
      orphanedCount: orphaned.length,
      staleCount: stale.length,
    },
  };
}
