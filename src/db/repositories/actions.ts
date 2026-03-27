import { v4 as uuid } from "uuid";
import { createHash } from "crypto";
import { getDb } from "../client.js";
import { updateRunCost } from "./runs.js";

export function logAction(params: {
  runId: string;
  phase: number;
  agentName: string;
  promptText: string;
  status?: string;
}): string {
  const id = uuid();
  const promptHash = createHash("sha256")
    .update(params.promptText)
    .digest("hex")
    .slice(0, 16);

  getDb()
    .prepare(
      `INSERT INTO action_log (id, run_id, phase, agent_name, prompt_hash, prompt_text, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      params.runId,
      params.phase,
      params.agentName,
      promptHash,
      params.promptText,
      params.status ?? "pending"
    );

  return id;
}

export function completeAction(params: {
  actionId: string;
  runId: string;
  resultJson?: string;
  resultText?: string;
  costUsd?: number;
  tokensUsed?: number;
  durationMs?: number;
  status: string;
  errorMessage?: string;
  outcomeSummary?: string;
}): void {
  const db = getDb();

  db.prepare(
    `UPDATE action_log SET
       result_json = ?, result_text = ?, cost_usd = ?,
       tokens_used = ?, duration_ms = ?, status = ?, error_message = ?,
       outcome_summary = ?
     WHERE id = ?`
  ).run(
    params.resultJson ?? null,
    params.resultText ?? null,
    params.costUsd ?? null,
    params.tokensUsed ?? null,
    params.durationMs ?? null,
    params.status,
    params.errorMessage ?? null,
    params.outcomeSummary ?? null,
    params.actionId
  );

  // Roll up cost to the run
  if (params.costUsd || params.tokensUsed) {
    updateRunCost(
      params.runId,
      params.costUsd ?? 0,
      params.tokensUsed ?? 0
    );
  }
}
