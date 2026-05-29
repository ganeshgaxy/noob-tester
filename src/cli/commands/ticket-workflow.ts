import type { Command } from "commander";
import {
  upsertTicketWorkflow,
  getTicketWorkflow,
  getTicketWorkflowSummary,
  listTicketWorkflows,
  transitionStatus,
  deleteTicketWorkflow,
  type TicketWorkflowStatus,
  type TicketWorkflowPhase,
} from "../../db/repositories/ticket-workflow.js";

export function registerTicketWorkflowCommands(program: Command): void {
  const tw = program
    .command("ticket-workflow")
    .description("Manage ticket workflow lifecycle — add, status, progress");

  // ── add ───────────────────────────────────────────────────────────────────
  tw.command("add")
    .description("Register a ticket in the workflow table (status: new)")
    .argument("<ticket-id>", "Jira ticket ID e.g. PROJ-123")
    .option("--notes <text>", "Optional notes about this ticket")
    .option("--status <status>", "Initial status (default: new)", "new")
    .option("--json", "Output raw JSON")
    .action((ticketId: string, opts) => {
      const id = ticketId.trim().toUpperCase();
      const row = upsertTicketWorkflow(id, {
        status: (opts.status as TicketWorkflowStatus) ?? "new",
        notes: opts.notes ?? null,
      });
      if (opts.json) {
        console.log(JSON.stringify(row, null, 2));
        return;
      }
      console.log(`✓ Ticket ${id} registered (status: ${row.status})`);
    });

  // ── get ───────────────────────────────────────────────────────────────────
  tw.command("get")
    .description("Get full workflow summary for a ticket (with linked counts)")
    .argument("<ticket-id>", "Jira ticket ID")
    .option("--json", "Output raw JSON")
    .action((ticketId: string, opts) => {
      const id = ticketId.trim().toUpperCase();
      const summary = getTicketWorkflowSummary(id);
      if (!summary) {
        console.error(`Ticket ${id} not found in workflow`);
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }
      console.log(`\nTicket: ${summary.ticket_id}`);
      console.log(`  Status:       ${summary.status}${summary.active ? " (active)" : ""}`);
      console.log(`  Phase:        ${summary.current_phase ?? "—"}`);
      console.log(`  Progress:     ${summary.progress}%`);
      console.log(`  Added:        ${summary.added_at}`);
      if (summary.started_at)   console.log(`  Started:      ${summary.started_at}`);
      if (summary.completed_at) console.log(`  Completed:    ${summary.completed_at}`);
      if (summary.notes)        console.log(`  Notes:        ${summary.notes}`);
      console.log(`\n  Linked data:`);
      console.log(`    Runs:             ${summary.run_count}`);
      console.log(`    Analyses:         ${summary.analysis_count}`);
      console.log(`    Plans:            ${summary.plan_count}`);
      console.log(`    Issues:           ${summary.issue_count}`);
      console.log(`    Test Cases:       ${summary.test_case_count}`);
      console.log(`    Visual TC:        ${summary.visual_test_case_count}`);
      console.log(`    Blockers:         ${summary.blocker_count}`);
    });

  // ── list ──────────────────────────────────────────────────────────────────
  tw.command("list")
    .description("List all tickets in the workflow")
    .option("--status <status>", "Filter by status")
    .option("--active", "Show only actively running tickets")
    .option("--json", "Output raw JSON")
    .action((opts) => {
      const rows = listTicketWorkflows({
        status: opts.status as TicketWorkflowStatus | undefined,
        active: opts.active ? true : undefined,
      });
      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (rows.length === 0) {
        console.log("No tickets found");
        return;
      }
      console.log(`\nTicket Workflow (${rows.length}):\n`);
      for (const r of rows) {
        const active = r.active ? " [ACTIVE]" : "";
        const phase  = r.current_phase ? ` · ${r.current_phase}` : "";
        const pct    = r.progress > 0 ? ` ${r.progress}%` : "";
        console.log(`  ${r.ticket_id.padEnd(16)} ${r.status}${phase}${pct}${active}`);
        if (r.notes) console.log(`    ${r.notes}`);
      }
    });

  // ── transition ────────────────────────────────────────────────────────────
  tw.command("transition")
    .description("Move a ticket to a new status/phase")
    .argument("<ticket-id>", "Jira ticket ID")
    .requiredOption("--status <status>", "new | queued | running | paused | completed | failed | cancelled")
    .option("--phase <phase>", "analyze | plan | test | review | done")
    .option("--json", "Output raw JSON")
    .action((ticketId: string, opts) => {
      const id = ticketId.trim().toUpperCase();
      if (!getTicketWorkflow(id)) {
        console.error(`Ticket ${id} not found — add it first with: noob-tester ticket-workflow add ${id}`);
        process.exit(1);
      }
      transitionStatus(id, opts.status as TicketWorkflowStatus, opts.phase as TicketWorkflowPhase | undefined);
      const updated = getTicketWorkflow(id)!;
      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
        return;
      }
      console.log(`✓ ${id} → ${updated.status}${updated.current_phase ? ` (${updated.current_phase})` : ""}`);
    });

  // ── update ────────────────────────────────────────────────────────────────
  tw.command("update")
    .description("Update notes, progress, or metadata for a ticket")
    .argument("<ticket-id>", "Jira ticket ID")
    .option("--notes <text>", "Notes to set")
    .option("--progress <0-100>", "Progress percentage")
    .option("--metadata <json>", "Metadata JSON string")
    .option("--json", "Output raw JSON")
    .action((ticketId: string, opts) => {
      const id = ticketId.trim().toUpperCase();
      const fields: Record<string, unknown> = {};
      if (opts.notes    !== undefined) fields.notes    = opts.notes;
      if (opts.progress !== undefined) fields.progress = parseInt(opts.progress, 10);
      if (opts.metadata !== undefined) fields.metadata_json = opts.metadata;
      const row = upsertTicketWorkflow(id, fields);
      if (opts.json) {
        console.log(JSON.stringify(row, null, 2));
        return;
      }
      console.log(`✓ ${id} updated`);
    });

  // ── remove ────────────────────────────────────────────────────────────────
  tw.command("remove")
    .description("Remove a ticket from workflow tracking")
    .argument("<ticket-id>", "Jira ticket ID")
    .action((ticketId: string) => {
      const id = ticketId.trim().toUpperCase();
      const deleted = deleteTicketWorkflow(id);
      if (!deleted) {
        console.error(`Ticket ${id} not found`);
        process.exit(1);
      }
      console.log(`✓ ${id} removed from workflow`);
    });
}
