import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type { AnalysisRow, ImpactAreaRow } from "../types.js";

/** Attempt to repair truncated JSON (e.g. missing closing braces/brackets from LLM output). */
export function repairJson(raw: string): string {
  const trimmed = raw.trim();
  try { JSON.parse(trimmed); return trimmed; } catch { /* needs repair */ }

  // Count unmatched openers
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }

  // Close any unclosed strings, arrays, and objects
  let repaired = trimmed;
  if (inString) repaired += '"';
  while (brackets > 0) { repaired += "]"; brackets--; }
  while (braces > 0) { repaired += "}"; braces--; }

  try { JSON.parse(repaired); return repaired; } catch { return trimmed; }
}

export function saveAnalysis(params: {
  runId: string;
  analysisType: "gap" | "requirements" | "feasibility" | "impact";
  contentJson: string;
  confidence?: number;
  summary?: string;
}): string {
  const id = uuid();
  const repairedJson = repairJson(params.contentJson);
  getDb()
    .prepare(
      `INSERT INTO analyses (id, run_id, analysis_type, content_json, confidence, summary)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      params.runId,
      params.analysisType,
      repairedJson,
      params.confidence ?? null,
      params.summary ?? null
    );
  return id;
}

export function getAnalysesByRun(runId: string): AnalysisRow[] {
  return getDb()
    .prepare("SELECT * FROM analyses WHERE run_id = ?")
    .all(runId) as AnalysisRow[];
}

export function getAnalysisByType(
  runId: string,
  type: string
): AnalysisRow | undefined {
  return getDb()
    .prepare("SELECT * FROM analyses WHERE run_id = ? AND analysis_type = ?")
    .get(runId, type) as AnalysisRow | undefined;
}

// ── Impact Areas ──

export function saveImpactAreas(
  analysisId: string,
  runId: string,
  areas: Array<{ areaType: string; description: string; severity?: string; affected?: string }>
): string[] {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO impact_areas (id, analysis_id, run_id, area_type, description, severity, affected)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const ids: string[] = [];
  for (const a of areas) {
    const id = uuid();
    stmt.run(id, analysisId, runId, a.areaType, a.description, a.severity ?? null, a.affected ?? null);
    ids.push(id);
  }
  return ids;
}

export function getImpactAreasByAnalysis(analysisId: string): ImpactAreaRow[] {
  return getDb()
    .prepare("SELECT * FROM impact_areas WHERE analysis_id = ? ORDER BY severity, area_type")
    .all(analysisId) as ImpactAreaRow[];
}

export function getImpactAreasByRun(runId: string): ImpactAreaRow[] {
  return getDb()
    .prepare("SELECT * FROM impact_areas WHERE run_id = ? ORDER BY severity, area_type")
    .all(runId) as ImpactAreaRow[];
}

export function getImpactAreaStats() {
  return getDb()
    .prepare(
      `SELECT area_type, severity, COUNT(*) as count
       FROM impact_areas
       GROUP BY area_type, severity
       ORDER BY count DESC`
    )
    .all();
}
