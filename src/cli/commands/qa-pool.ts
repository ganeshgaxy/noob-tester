import type { Command } from "commander";
import { existsSync } from "fs";
import {
  addAgent,
  listAgents,
  removeAgent,
  updateAgent,
  buildInvocation,
} from "../../db/repositories/qa-pool.js";

export function registerQaPoolCommands(program: Command): void {
  const pool = program
    .command("qa-pool")
    .description(
      "Ticketed multi-agent orchestration — assign agents to tickets and dispatch them",
    );

  // ── add ──────────────────────────────────────────────────────────────────
  pool
    .command("add")
    .description("Associate an agent with a ticket")
    .requiredOption("--ticket <id>", "Ticket ID (e.g. JIRA-456)")
    .requiredOption(
      "--agent <path>",
      "Path to the agent .md file (e.g. .claude/agents/field-agent.md)",
    )
    .option("--target <name>", "Target name from the targets table")
    .option("--role <role>", "Secret role within the target", "default")
    .option("--file <path>", "Optional file to pass to the agent")
    .option(
      "--launch-dir <dir>",
      "Directory to launch claude from for this entry",
    )
    .action((opts) => {
      const agentPath: string = opts.agent;

      // Validate the agent file exists
      if (!existsSync(agentPath)) {
        console.error(`Agent file not found: ${agentPath}`);
        process.exit(1);
      }

      // Default launch_dir to cwd if not provided
      const launchDir: string = opts.launchDir ?? process.cwd();

      const id = addAgent(
        opts.ticket,
        agentPath,
        opts.target ?? null,
        opts.role,
        opts.file ?? null,
        launchDir,
      );

      console.log(
        JSON.stringify({
          id,
          ticket_id: opts.ticket,
          agent_path: agentPath,
          target: opts.target ?? null,
          role: opts.role,
          file: opts.file ?? null,
          launch_dir: launchDir,
        }),
      );
    });

  // ── list ─────────────────────────────────────────────────────────────────
  pool
    .command("list")
    .description("List all agents associated with a ticket")
    .requiredOption("--ticket <id>", "Ticket ID")
    .option("--json", "Output raw JSON array")
    .action((opts) => {
      const agents = listAgents(opts.ticket);

      if (opts.json) {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }

      if (agents.length === 0) {
        console.log(`No agents registered for ticket ${opts.ticket}`);
        return;
      }

      console.log(`\nAgents for ${opts.ticket}:\n`);
      for (const a of agents) {
        console.log(`  [${a.id.slice(0, 8)}] @${a.agent_path}`);
        if (a.target)
          console.log(`           target: ${a.target}  role: ${a.role}`);
        if (a.file) console.log(`           file:   ${a.file}`);
        if (a.launch_dir) console.log(`           dir:    ${a.launch_dir}`);
      }
      console.log();
    });

  // ── remove ────────────────────────────────────────────────────────────────
  pool
    .command("remove <id>")
    .description("Remove a specific agent entry by its ID")
    .action((id) => {
      const removed = removeAgent(id);
      if (!removed) {
        console.error(`Agent entry ${id} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify({ removed: id }));
    });

  // ── update ────────────────────────────────────────────────────────────────
  pool
    .command("update <id>")
    .description("Update fields of an existing agent entry by its ID")
    .option("--agent <path>", "New agent .md file path")
    .option("--target <name>", "New target name")
    .option("--role <role>", "New secret role")
    .option("--file <path>", "New file path (pass empty string to clear)")
    .option(
      "--launch-dir <dir>",
      "New launch directory (pass empty string to clear)",
    )
    .action((id, opts) => {
      // Validate agent file exists if provided
      if (opts.agent && !existsSync(opts.agent)) {
        console.error(`Agent file not found: ${opts.agent}`);
        process.exit(1);
      }

      const fields: Record<string, string | null> = {};
      if (opts.agent !== undefined) fields.agent_path = opts.agent;
      if (opts.target !== undefined) fields.target = opts.target || null;
      if (opts.role !== undefined) fields.role = opts.role;
      if (opts.file !== undefined) fields.file = opts.file || null;
      if (opts.launchDir !== undefined)
        fields.launch_dir = opts.launchDir || null;

      if (Object.keys(fields).length === 0) {
        console.error(
          "Provide at least one field to update (--agent, --target, --role, --file, --launch-dir)",
        );
        process.exit(1);
      }

      const updated = updateAgent(id, fields);
      if (!updated) {
        console.error(`Agent entry ${id} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify({ updated: id, fields }));
    });

  // ── run ───────────────────────────────────────────────────────────────────
  pool
    .command("run")
    .description(
      "Print the noob-explore invocation strings for all agents on a ticket",
    )
    .requiredOption("--ticket <id>", "Ticket ID")
    .option("--json", "Output as JSON array instead of plain strings")
    .action((opts) => {
      const agents = listAgents(opts.ticket);

      if (agents.length === 0) {
        console.error(`No agents registered for ticket ${opts.ticket}`);
        process.exit(1);
      }

      if (opts.json) {
        const invocations = agents.map((a) => ({
          id: a.id,
          agent_path: a.agent_path,
          invocation: buildInvocation(a),
        }));
        console.log(JSON.stringify(invocations, null, 2));
        return;
      }

      for (const a of agents) {
        console.log(buildInvocation(a));
      }
    });
}
