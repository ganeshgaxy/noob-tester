import { execSync } from "child_process";
import { getDb } from "../client.js";
import { getRepo } from "./repos.js";
import { expandRelated } from "../../indexer/index.js";

/**
 * Get changed files between a base branch and HEAD for a repo.
 */
export function getChangedFiles(
  repoName: string,
  baseBranch: string
): string[] {
  const repo = getRepo(repoName);
  if (!repo?.local_path) return [];

  try {
    const output = execSync(
      `git diff --name-only ${baseBranch}...HEAD`,
      { cwd: repo.local_path, encoding: "utf-8", timeout: 15000 }
    ).trim();
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Expand changed files via import graph (N levels deep).
 */
export function expandAffectedFiles(
  repoName: string,
  changedFiles: string[],
  depth: number = 1
): string[] {
  let affected = new Set(changedFiles);

  for (let i = 0; i < depth; i++) {
    const expanded = expandRelated(repoName, [...affected]);
    for (const f of expanded) affected.add(f);
  }

  return [...affected];
}

/**
 * Select test cases that cover affected files (via coverage_map).
 */
export function selectTestCasesByFiles(
  repoName: string,
  affectedFiles: string[],
  ticketRef?: string
): Array<{
  test_case_id: string;
  title: string;
  type: string;
  priority: number;
  test_layer: string;
  confidence: number;
  link_type: string;
  matched_file: string;
}> {
  if (affectedFiles.length === 0) return [];

  const db = getDb();
  const placeholders = affectedFiles.map(() => "?").join(",");

  const ticketFilter = ticketRef ? " AND tc.ticket_ref = ?" : "";
  const params: unknown[] = [repoName, ...affectedFiles];
  if (ticketRef) params.push(ticketRef);

  return db
    .prepare(
      `SELECT DISTINCT cm.test_case_id, tc.title, tc.type, tc.priority,
              COALESCE(tc.test_layer, 'ui') as test_layer,
              MAX(cm.confidence) as confidence, cm.link_type,
              cm.file_path as matched_file
       FROM coverage_map cm
       JOIN test_cases tc ON cm.test_case_id = tc.id
       WHERE cm.repo_name = ? AND cm.file_path IN (${placeholders})
         AND tc.ready = 1${ticketFilter}
       GROUP BY cm.test_case_id
       ORDER BY tc.priority ASC, cm.confidence DESC, tc.created_at ASC`
    )
    .all(...params) as Array<{
    test_case_id: string;
    title: string;
    type: string;
    priority: number;
    test_layer: string;
    confidence: number;
    link_type: string;
    matched_file: string;
  }>;
}

/**
 * Select test cases by matching UI map pages whose related_code overlaps affected files.
 */
export function selectByPages(
  affectedFiles: string[]
): Array<{ test_case_id: string; title: string; page_url: string }> {
  if (affectedFiles.length === 0) return [];

  const db = getDb();

  // Get UI map pages whose related_code JSON contains any affected file
  const pages = db
    .prepare(
      "SELECT id, url_pattern, related_code FROM ui_map_pages WHERE related_code IS NOT NULL AND related_code != '[]'"
    )
    .all() as Array<{ id: string; url_pattern: string; related_code: string }>;

  const matchedPageUrls: string[] = [];
  const affectedSet = new Set(affectedFiles);

  for (const page of pages) {
    try {
      const codeFiles = JSON.parse(page.related_code) as string[];
      if (codeFiles.some((f) => affectedSet.has(f))) {
        matchedPageUrls.push(page.url_pattern);
      }
    } catch {
      continue;
    }
  }

  if (matchedPageUrls.length === 0) return [];

  // Find test cases whose impacted_files or description references these pages
  // This is a best-effort match — impacted_files may contain the URL patterns
  const results: Array<{ test_case_id: string; title: string; page_url: string }> = [];
  const testCases = db
    .prepare("SELECT id, title, impacted_files FROM test_cases WHERE ready = 1 AND impacted_files IS NOT NULL")
    .all() as Array<{ id: string; title: string; impacted_files: string }>;

  for (const tc of testCases) {
    try {
      const files = JSON.parse(tc.impacted_files) as string[];
      for (const url of matchedPageUrls) {
        if (files.some((f) => affectedSet.has(f))) {
          results.push({ test_case_id: tc.id, title: tc.title, page_url: url });
          break;
        }
      }
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Select test cases by matching API map endpoints whose paths are in affected files.
 */
export function selectByEndpoints(
  repoName: string,
  affectedFiles: string[]
): Array<{ test_case_id: string; title: string; endpoint: string }> {
  if (affectedFiles.length === 0) return [];

  const db = getDb();
  const placeholders = affectedFiles.map(() => "?").join(",");

  // Find API test cases that reference affected files
  return db
    .prepare(
      `SELECT tc.id as test_case_id, tc.title,
              tc.impacted_files
       FROM test_cases tc
       WHERE tc.ready = 1 AND tc.test_layer = 'api' AND tc.impacted_files IS NOT NULL`
    )
    .all()
    .filter((tc: any) => {
      try {
        const files = JSON.parse(tc.impacted_files) as string[];
        return files.some((f) => affectedFiles.includes(f));
      } catch {
        return false;
      }
    })
    .map((tc: any) => ({
      test_case_id: tc.test_case_id,
      title: tc.title,
      endpoint: "matched via impacted_files",
    })) as Array<{ test_case_id: string; title: string; endpoint: string }>;
}

/**
 * Full test selection pipeline: get diff → expand → query coverage_map + pages + endpoints.
 */
export function selectTestCasesForDiff(
  repoName: string,
  baseBranch: string,
  opts?: { ticketRef?: string; depth?: number }
): {
  changedFiles: string[];
  affectedFiles: string[];
  testCases: Array<{
    test_case_id: string;
    title: string;
    type: string;
    priority: number;
    test_layer: string;
    confidence: number;
    link_type: string;
    matched_file: string;
  }>;
  totalChanged: number;
  totalAffected: number;
  totalTestCases: number;
} {
  const changedFiles = getChangedFiles(repoName, baseBranch);
  const affectedFiles = expandAffectedFiles(repoName, changedFiles, opts?.depth ?? 1);
  const testCases = selectTestCasesByFiles(repoName, affectedFiles, opts?.ticketRef);

  return {
    changedFiles,
    affectedFiles,
    testCases,
    totalChanged: changedFiles.length,
    totalAffected: affectedFiles.length,
    totalTestCases: testCases.length,
  };
}
