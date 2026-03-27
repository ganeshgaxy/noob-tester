import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export interface A11yIssueInput {
  runId: string;
  runPackId?: string;
  entryId?: string;
  pageUrl: string;
  uiMapPageId?: string;
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  wcagCriteria?: string;
  wcagLevel?: string;
  description: string;
  htmlSnippet?: string;
  selector?: string;
  helpUrl?: string;
}

export interface A11yIssueRow {
  id: string;
  run_id: string;
  run_pack_id: string | null;
  entry_id: string | null;
  page_url: string;
  ui_map_page_id: string | null;
  rule_id: string;
  impact: string;
  wcag_criteria: string | null;
  wcag_level: string | null;
  description: string;
  html_snippet: string | null;
  selector: string | null;
  help_url: string | null;
  created_at: string;
}

/**
 * Store a single accessibility issue.
 */
export function storeA11yIssue(input: A11yIssueInput): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO a11y_issues
       (id, run_id, run_pack_id, entry_id, page_url, ui_map_page_id,
        rule_id, impact, wcag_criteria, wcag_level, description,
        html_snippet, selector, help_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.runId,
      input.runPackId ?? null,
      input.entryId ?? null,
      input.pageUrl,
      input.uiMapPageId ?? null,
      input.ruleId,
      input.impact,
      input.wcagCriteria ?? null,
      input.wcagLevel ?? null,
      input.description,
      input.htmlSnippet ?? null,
      input.selector ?? null,
      input.helpUrl ?? null
    );
  return id;
}

/**
 * Store multiple axe-core violations for a page (batch insert).
 * Expects the parsed violations array from axe.run().
 */
export function storeAxeViolations(
  runId: string,
  pageUrl: string,
  violations: Array<{
    id: string;
    impact: string;
    description: string;
    helpUrl?: string;
    tags?: string[];
    nodes?: Array<{ html?: string; target?: string[] }>;
  }>,
  opts?: { runPackId?: string; entryId?: string; uiMapPageId?: string; ticketId?: string }
): number {
  const db = getDb();
  let count = 0;

  const insert = db.prepare(
    `INSERT INTO a11y_issues
     (id, run_id, run_pack_id, entry_id, page_url, ui_map_page_id,
      rule_id, impact, wcag_criteria, wcag_level, description,
      html_snippet, selector, help_url, ticket_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAll = db.transaction(() => {
    for (const v of violations) {
      // Extract WCAG criteria from tags
      const wcagTag = v.tags?.find((t) => t.startsWith("wcag"));
      const wcagCriteria = wcagTag?.replace("wcag", "").replace(/(\d)(\d)(\d+)/, "$1.$2.$3") ?? null;
      const wcagLevel = v.tags?.find((t) => /^wcag\d+a+$/i.test(t))
        ? v.tags.find((t) => /^wcag\d+a+$/i.test(t))!.replace(/^wcag\d+/, "").toUpperCase()
        : null;

      // Create one issue per affected node (or one if no nodes)
      const nodes = v.nodes?.length ? v.nodes : [{}];
      for (const node of nodes) {
        insert.run(
          uuid(),
          runId,
          opts?.runPackId ?? null,
          opts?.entryId ?? null,
          pageUrl,
          opts?.uiMapPageId ?? null,
          v.id,
          v.impact ?? "moderate",
          wcagCriteria,
          wcagLevel,
          v.description,
          node.html ?? null,
          node.target ? node.target.join(", ") : null,
          v.helpUrl ?? null,
          opts?.ticketId ?? null
        );
        count++;
      }
    }
  });

  insertAll();
  return count;
}

/**
 * Get all accessibility issues for a run.
 */
export function getA11yByRun(runId: string): A11yIssueRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM a11y_issues WHERE run_id = ? ORDER BY impact, rule_id"
    )
    .all(runId) as A11yIssueRow[];
}

/**
 * Get accessibility issues for a specific page URL.
 */
export function getA11yByPage(pageUrl: string): A11yIssueRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM a11y_issues WHERE page_url = ? ORDER BY impact, rule_id"
    )
    .all(pageUrl) as A11yIssueRow[];
}

/**
 * Get accessibility issues for a run pack.
 */
export function getA11yByPack(runPackId: string): A11yIssueRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM a11y_issues WHERE run_pack_id = ? ORDER BY impact, rule_id"
    )
    .all(runPackId) as A11yIssueRow[];
}

/**
 * Get summary counts by impact level and rule.
 */
export function getA11ySummary(runId: string): {
  total: number;
  byImpact: Record<string, number>;
  byRule: Array<{ rule_id: string; count: number; impact: string }>;
  pageCount: number;
} {
  const db = getDb();

  const total = (
    db
      .prepare("SELECT COUNT(*) as c FROM a11y_issues WHERE run_id = ?")
      .get(runId) as { c: number }
  ).c;

  const byImpact = db
    .prepare(
      "SELECT impact, COUNT(*) as c FROM a11y_issues WHERE run_id = ? GROUP BY impact ORDER BY CASE impact WHEN 'critical' THEN 1 WHEN 'serious' THEN 2 WHEN 'moderate' THEN 3 WHEN 'minor' THEN 4 END"
    )
    .all(runId) as Array<{ impact: string; c: number }>;

  const byRule = db
    .prepare(
      "SELECT rule_id, COUNT(*) as count, impact FROM a11y_issues WHERE run_id = ? GROUP BY rule_id ORDER BY count DESC"
    )
    .all(runId) as Array<{ rule_id: string; count: number; impact: string }>;

  const pageCount = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT page_url) as c FROM a11y_issues WHERE run_id = ?"
      )
      .get(runId) as { c: number }
  ).c;

  return {
    total,
    byImpact: Object.fromEntries(byImpact.map((r) => [r.impact, r.c])),
    byRule,
    pageCount,
  };
}

/**
 * Get aggregate stats for a run pack.
 */
export function getA11yPackStats(runPackId: string): {
  total: number;
  byImpact: Record<string, number>;
  pageCount: number;
} {
  const db = getDb();

  const total = (
    db
      .prepare("SELECT COUNT(*) as c FROM a11y_issues WHERE run_pack_id = ?")
      .get(runPackId) as { c: number }
  ).c;

  const byImpact = db
    .prepare(
      "SELECT impact, COUNT(*) as c FROM a11y_issues WHERE run_pack_id = ? GROUP BY impact"
    )
    .all(runPackId) as Array<{ impact: string; c: number }>;

  const pageCount = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT page_url) as c FROM a11y_issues WHERE run_pack_id = ?"
      )
      .get(runPackId) as { c: number }
  ).c;

  return {
    total,
    byImpact: Object.fromEntries(byImpact.map((r) => [r.impact, r.c])),
    pageCount,
  };
}
