import type { Command } from "commander";
import {
  createScheduledAgent,
  getScheduledAgent,
  listScheduledAgents,
  updateScheduledAgent,
  deleteScheduledAgent,
  getExecutionHistory,
} from "../../db/repositories/scheduled-agents.js";

export function registerScheduledAgentCommands(program: Command): void {
  const schedule = program.command("schedule-agent").description("Manage scheduled agent runs");

  schedule
    .command("add")
    .description("Create a new scheduled agent run")
    .requiredOption("--agent <path>", "Agent path (e.g., noob-pool, noob-visual-pool)")
    .requiredOption("--ticket <id>", "Ticket ID")
    .requiredOption("--cron <expression>", "Cron expression (e.g., '0 9 * * 1' for Mon 9am)")
    .option("--params <json>", "Parameters as JSON (e.g., '{\"mode\":\"baseline\",\"max_spawns\":5}')")
    .option("--description <text>", "Description of this scheduled run")
    .action((opts) => {
      let params = {};
      if (opts.params) {
        try {
          params = JSON.parse(opts.params);
        } catch (e) {
          console.error("ERROR: Invalid JSON in --params");
          process.exit(1);
        }
      }

      const id = createScheduledAgent({
        agent_path: opts.agent,
        ticket_id: opts.ticket,
        cron_expression: opts.cron,
        parameters: params,
        description: opts.description,
        status: "active",
      });

      console.log(JSON.stringify({ id, agent: opts.agent, ticket: opts.ticket, cron: opts.cron }));
    });

  schedule
    .command("list")
    .description("List all scheduled agents")
    .option("--ticket <id>", "Filter by ticket")
    .option("--status <status>", "Filter by status (active|paused|disabled)")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const agents = listScheduledAgents({
        ticket: opts.ticket,
        status: opts.status,
      });

      if (opts.json) {
        console.log(JSON.stringify(agents, null, 2));
      } else {
        for (const agent of agents) {
          console.log(`${agent.id.slice(0, 8)} | ${agent.agent_path} | ${agent.ticket_id} | ${agent.status}`);
          console.log(`  Cron: ${agent.cron_expression}`);
          if (agent.description) console.log(`  Desc: ${agent.description}`);
          if (agent.last_run_at) console.log(`  Last: ${agent.last_run_at}`);
          if (agent.next_run_at) console.log(`  Next: ${agent.next_run_at}`);
          if (agent.parameters) console.log(`  Params: ${JSON.stringify(agent.parameters)}`);
          console.log("");
        }
      }
    });

  schedule
    .command("detail <id>")
    .description("Show details of a scheduled agent")
    .option("--json", "Output as JSON")
    .action((id, opts) => {
      const agent = getScheduledAgent(id);
      if (!agent) {
        console.error(`Scheduled agent not found: ${id}`);
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(agent, null, 2));
      } else {
        console.log(`ID: ${agent.id}`);
        console.log(`Agent: ${agent.agent_path}`);
        console.log(`Ticket: ${agent.ticket_id}`);
        console.log(`Status: ${agent.status}`);
        console.log(`Cron: ${agent.cron_expression}`);
        if (agent.description) console.log(`Description: ${agent.description}`);
        if (agent.parameters) console.log(`Parameters: ${JSON.stringify(agent.parameters, null, 2)}`);
        console.log(`Created: ${agent.created_at}`);
        console.log(`Last Run: ${agent.last_run_at || "Never"}`);
        console.log(`Next Run: ${agent.next_run_at || "Not scheduled"}`);
      }
    });

  schedule
    .command("pause <id>")
    .description("Pause a scheduled agent")
    .action((id) => {
      const agent = getScheduledAgent(id);
      if (!agent) {
        console.error(`Scheduled agent not found: ${id}`);
        process.exit(1);
      }
      updateScheduledAgent(id, { status: "paused" });
      console.log(JSON.stringify({ paused: true, id }));
    });

  schedule
    .command("resume <id>")
    .description("Resume a paused scheduled agent")
    .action((id) => {
      const agent = getScheduledAgent(id);
      if (!agent) {
        console.error(`Scheduled agent not found: ${id}`);
        process.exit(1);
      }
      updateScheduledAgent(id, { status: "active" });
      console.log(JSON.stringify({ resumed: true, id }));
    });

  schedule
    .command("delete <id>")
    .description("Delete a scheduled agent")
    .option("--yes", "Skip confirmation")
    .action((id, opts) => {
      const agent = getScheduledAgent(id);
      if (!agent) {
        console.error(`Scheduled agent not found: ${id}`);
        process.exit(1);
      }

      if (!opts.yes) {
        console.log(`This will delete scheduled agent ${id} and its execution history.`);
        console.log("Run with --yes to confirm.");
        return;
      }

      deleteScheduledAgent(id);
      console.log(JSON.stringify({ deleted: true, id }));
    });

  schedule
    .command("history <id>")
    .description("View execution history for a scheduled agent")
    .option("--limit <n>", "Number of recent runs to show", parseInt, 20)
    .option("--json", "Output as JSON")
    .action((id, opts) => {
      const agent = getScheduledAgent(id);
      if (!agent) {
        console.error(`Scheduled agent not found: ${id}`);
        process.exit(1);
      }

      const history = getExecutionHistory(id, opts.limit);

      if (opts.json) {
        console.log(JSON.stringify(history, null, 2));
      } else {
        console.log(`Execution history for ${agent.agent_path} (${agent.ticket_id}):`);
        console.log("");
        for (const exec of history) {
          const startTime = exec.started_at ? new Date(exec.started_at).toLocaleString() : "N/A";
          const icon = exec.status === "success" ? "✓" : exec.status === "failed" ? "✗" : "◯";
          console.log(`${icon} ${startTime} — ${exec.status}`);
          if (exec.exit_code !== null && exec.exit_code !== undefined) console.log(`  Exit code: ${exec.exit_code}`);
          if (exec.session_id) console.log(`  Session: ${exec.session_id}`);
          if (exec.run_id) console.log(`  Run: ${exec.run_id}`);
          if (exec.error_message) console.log(`  Error: ${exec.error_message}`);
          console.log("");
        }
      }
    });
}
