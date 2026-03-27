import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";

export interface CoverageLink {
  id: string;
  test_case_id: string;
  repo_name: string;
  file_path: string;
  function_name: string | null;
  link_type: string;
  confidence: number;
  created_at: string;
}

/**
 * Link a test case to a source file (optionally a function).
 */
export function linkTestCaseToFile(
  testCaseId: string,
  repoName: string,
  filePath: string,
  opts?: { functionName?: string; linkType?: string; confidence?: number }
): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO coverage_map
       (id, test_case_id, repo_name, file_path, function_name, link_type, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      testCaseId,
      repoName,
      filePath,
      opts?.functionName ?? null,
      opts?.linkType ?? "impacted",
      opts?.confidence ?? 1.0
    );
  return id;
}

/**
 * Populate coverage_map from test_cases.impacted_files JSON,
 * then expand 1 level via import_graph with lower confidence.
 */
export function populateCoverageFromTestCases(repoName: string): {
  directLinks: number;
  expandedLinks: number;
} {
  const db = getDb();

  // Clear existing for this repo
  db.prepare("DELETE FROM coverage_map WHERE repo_name = ?").run(repoName);

  // Get all test cases that have impacted_files
  const testCases = db
    .prepare(
      "SELECT id, impacted_files FROM test_cases WHERE impacted_files IS NOT NULL"
    )
    .all() as Array<{ id: string; impacted_files: string }>;

  let directLinks = 0;
  let expandedLinks = 0;

  const insertDirect = db.prepare(
    `INSERT OR IGNORE INTO coverage_map
     (id, test_case_id, repo_name, file_path, function_name, link_type, confidence)
     VALUES (?, ?, ?, ?, NULL, 'impacted', 1.0)`
  );

  const insertExpanded = db.prepare(
    `INSERT OR IGNORE INTO coverage_map
     (id, test_case_id, repo_name, file_path, function_name, link_type, confidence)
     VALUES (?, ?, ?, ?, NULL, 'imported_by', 0.5)`
  );

  // Get import graph for expansion
  const getImporters = db.prepare(
    `SELECT DISTINCT source_file FROM import_graph
     WHERE repo_name = ? AND (imported = ? OR resolved = ?)`
  );

  const insertAll = db.transaction(() => {
    for (const tc of testCases) {
      let files: string[];
      try {
        files = JSON.parse(tc.impacted_files);
      } catch {
        continue;
      }
      if (!Array.isArray(files)) continue;

      for (const filePath of files) {
        insertDirect.run(uuid(), tc.id, repoName, filePath);
        directLinks++;

        // Expand: find files that import this file
        const importers = getImporters.all(repoName, filePath, filePath) as Array<{
          source_file: string;
        }>;
        for (const imp of importers) {
          insertExpanded.run(uuid(), tc.id, repoName, imp.source_file);
          expandedLinks++;
        }
      }
    }
  });

  insertAll();

  return { directLinks, expandedLinks };
}

/**
 * Get files with zero test case coverage.
 */
export function getUncoveredFiles(repoName: string): Array<{
  file_path: string;
  language: string | null;
  importer_count: number;
}> {
  return getDb()
    .prepare(
      `SELECT DISTINCT cf.file_path, cf.language,
              (SELECT COUNT(*) FROM import_graph ig
               WHERE ig.repo_name = ? AND (ig.imported = cf.file_path OR ig.resolved = cf.file_path)) as importer_count
       FROM code_fts cf
       WHERE cf.repo_name = ?
         AND cf.file_path NOT IN (SELECT file_path FROM coverage_map WHERE repo_name = ?)
       ORDER BY importer_count DESC`
    )
    .all(repoName, repoName, repoName) as Array<{
    file_path: string;
    language: string | null;
    importer_count: number;
  }>;
}

/**
 * Get test cases covering a specific file.
 */
export function getCoverageByFile(
  repoName: string,
  filePath: string
): Array<{
  test_case_id: string;
  title: string;
  type: string;
  link_type: string;
  confidence: number;
}> {
  return getDb()
    .prepare(
      `SELECT cm.test_case_id, tc.title, tc.type, cm.link_type, cm.confidence
       FROM coverage_map cm
       JOIN test_cases tc ON cm.test_case_id = tc.id
       WHERE cm.repo_name = ? AND cm.file_path = ?
       ORDER BY cm.confidence DESC, tc.priority ASC`
    )
    .all(repoName, filePath) as Array<{
    test_case_id: string;
    title: string;
    type: string;
    link_type: string;
    confidence: number;
  }>;
}

/**
 * Get coverage statistics for a repo.
 */
export function getCoverageStats(repoName: string): {
  totalFiles: number;
  coveredFiles: number;
  uncoveredFiles: number;
  coveragePercent: number;
  totalLinks: number;
  directLinks: number;
  expandedLinks: number;
} {
  const db = getDb();

  const totalFiles = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT file_path) as c FROM code_fts WHERE repo_name = ?"
      )
      .get(repoName) as { c: number }
  ).c;

  const coveredFiles = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT file_path) as c FROM coverage_map WHERE repo_name = ?"
      )
      .get(repoName) as { c: number }
  ).c;

  const totalLinks = (
    db
      .prepare("SELECT COUNT(*) as c FROM coverage_map WHERE repo_name = ?")
      .get(repoName) as { c: number }
  ).c;

  const directLinks = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM coverage_map WHERE repo_name = ? AND link_type = 'impacted'"
      )
      .get(repoName) as { c: number }
  ).c;

  const uncoveredFiles = totalFiles - coveredFiles;
  const coveragePercent =
    totalFiles > 0 ? Math.round((coveredFiles / totalFiles) * 100) : 0;

  return {
    totalFiles,
    coveredFiles,
    uncoveredFiles,
    coveragePercent,
    totalLinks,
    directLinks,
    expandedLinks: totalLinks - directLinks,
  };
}

/**
 * Get all files linked to a test case.
 */
export function getTestCaseCoverage(
  testCaseId: string
): Array<{ file_path: string; repo_name: string; link_type: string; confidence: number }> {
  return getDb()
    .prepare(
      `SELECT file_path, repo_name, link_type, confidence
       FROM coverage_map WHERE test_case_id = ?
       ORDER BY confidence DESC, file_path ASC`
    )
    .all(testCaseId) as Array<{
    file_path: string;
    repo_name: string;
    link_type: string;
    confidence: number;
  }>;
}

/**
 * Clear and rebuild coverage map for a repo.
 */
export function clearCoverageMap(repoName: string): number {
  const result = getDb()
    .prepare("DELETE FROM coverage_map WHERE repo_name = ?")
    .run(repoName);
  return result.changes;
}
