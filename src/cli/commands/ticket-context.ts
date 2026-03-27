import type { Command } from "commander";
import {
  saveContext,
  getContext,
  getContextsByPrefix,
  invalidateContext,
  listContexts,
  listCachedTickets,
  purgeStale,
} from "../../db/repositories/ticket-context.js";
import { updateTicketContextStats } from "../../db/repositories/resource-stats.js";

export function registerTicketContextCommands(program: Command): void {
  const tc = program
    .command("ticket-context")
    .description("Cache ticket info, MR diffs, and linked data to reduce redundant fetches across skills");

  tc.command("save <ticketId>")
    .description("Save content to the ticket context cache")
    .requiredOption("--type <type>", "Context type (ticket_info, comments, linked_tickets, mr_metadata, mr_diff:<ref>, confluence:<id>)")
    .requiredOption("--content <json>", "Content to cache (JSON string)")
    .option("--ttl <minutes>", "TTL in minutes (default: 1440 = 1 day)", parseInt)
    .option("--source <source>", "Source of the data (e.g. atlassian_mcp, glab)")
    .action((ticketId, opts) => {
      const id = saveContext({
        ticketId,
        contextType: opts.type,
        content: opts.content,
        ttlMinutes: opts.ttl,
        source: opts.source,
      });
      try { updateTicketContextStats(); } catch {}
      console.log(JSON.stringify({ id, ticketId, type: opts.type, cached: true }));
    });

  tc.command("get <ticketId>")
    .description("Get cached context (returns {cached:true/false, content})")
    .requiredOption("--type <type>", "Context type or prefix (e.g. ticket_info, mr_diff, mr_diff:!423)")
    .option("--ignore-ttl", "Return even if stale")
    .option("--json", "Output as JSON (default)")
    .action((ticketId, opts) => {
      const type: string = opts.type;

      // Check exact match first
      const exact = getContext(ticketId, type, { ignoreTtl: opts.ignoreTtl });
      if (exact.cached) {
        console.log(JSON.stringify({
          cached: true,
          ticket_id: ticketId,
          context_type: type,
          content: safeParseJson(exact.content!),
          fetched_at: exact.row!.fetched_at,
          ttl_minutes: exact.row!.ttl_minutes,
          source: exact.row!.source,
        }));
        return;
      }

      // Try prefix match (e.g. "mr_diff" matches "mr_diff:!423")
      const prefixResults = getContextsByPrefix(ticketId, type, { ignoreTtl: opts.ignoreTtl });
      if (prefixResults.length > 0) {
        const items = prefixResults.map((r) => ({
          context_type: r.row.context_type,
          content: safeParseJson(r.content),
          fetched_at: r.row.fetched_at,
          ttl_minutes: r.row.ttl_minutes,
          source: r.row.source,
        }));
        console.log(JSON.stringify({ cached: true, ticket_id: ticketId, items }));
        return;
      }

      console.log(JSON.stringify({ cached: false, ticket_id: ticketId, context_type: type }));
    });

  tc.command("invalidate <ticketId>")
    .description("Invalidate cached context (specific type, prefix, or all)")
    .option("--type <type>", "Context type or prefix to invalidate (omit for all)")
    .action((ticketId, opts) => {
      const deleted = invalidateContext(ticketId, opts.type);
      console.log(JSON.stringify({ deleted, ticketId, type: opts.type ?? "all" }));
    });

  tc.command("list <ticketId>")
    .description("List all cached context entries for a ticket")
    .action((ticketId) => {
      const entries = listContexts(ticketId);
      console.log(JSON.stringify(entries));
    });

  tc.command("tickets")
    .description("List all tickets with cached context")
    .action(() => {
      const tickets = listCachedTickets();
      console.log(JSON.stringify(tickets));
    });

  tc.command("purge")
    .description("Remove all stale entries past their TTL")
    .action(() => {
      const removed = purgeStale();
      console.log(JSON.stringify({ purged: removed }));
    });
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
