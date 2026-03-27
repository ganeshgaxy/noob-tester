import { v4 as uuid } from "uuid";
import { getDb } from "../client.js";
import type { PhaseTransitionRow } from "../types.js";

export function logPhaseTransition(
  runId: string,
  sessionId: string | null,
  fromPhase: number,
  toPhase: number
): string | null {
  if (fromPhase === toPhase) return null;

  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO phase_transitions (id, run_id, session_id, from_phase, to_phase)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, runId, sessionId ?? null, fromPhase, toPhase);
  return id;
}

export function getTransitionsByRun(runId: string): PhaseTransitionRow[] {
  return getDb()
    .prepare("SELECT * FROM phase_transitions WHERE run_id = ? ORDER BY transitioned_at")
    .all(runId) as PhaseTransitionRow[];
}

export function getTransitionsBySession(sessionId: string): PhaseTransitionRow[] {
  return getDb()
    .prepare("SELECT * FROM phase_transitions WHERE session_id = ? ORDER BY transitioned_at")
    .all(sessionId) as PhaseTransitionRow[];
}
