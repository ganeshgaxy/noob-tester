import type { Command } from "commander";
import chalk from "chalk";
import {
  createSession,
  heartbeatSession,
  endSession,
  getSession,
  listSessions,
  activeSessionCount,
  linkRunToSession,
} from "../../db/repositories/sessions.js";

export function registerSessionCommands(program: Command): void {
  const session = program
    .command("session")
    .description("Manage active testing sessions");

  session
    .command("start")
    .description("Register a new active session")
    .option("--task <text>", "Summary of what this session is testing")
    .option(
      "--labels <labels>",
      "Comma-separated labels (e.g. analyze,testcase)",
    )
    .option(
      "--tickets <refs>",
      "Comma-separated ticket refs (e.g. PROJ-123,PROJ-456)",
    )
    .option("--metadata <json>", "Extra metadata as JSON")
    .action((opts) => {
      const id = createSession({
        taskSummary: opts.task,
        labels: opts.labels
          ? (opts.labels as string).split(",").map((s: string) => s.trim())
          : undefined,
        ticketRefs: opts.tickets
          ? (opts.tickets as string).split(",").map((s: string) => s.trim())
          : undefined,
        metadata: opts.metadata ? JSON.parse(opts.metadata) : undefined,
      });
      console.log(JSON.stringify({ sessionId: id }));
    });

  session
    .command("heartbeat <sessionId>")
    .description("Update session heartbeat (call periodically to keep alive)")
    .option("--run-id <id>", "Current run ID")
    .option("--phase <n>", "Current phase", parseInt)
    .option("--task <text>", "Update task summary")
    .option(
      "--labels <labels>",
      "Comma-separated labels (e.g. analyze,explore)",
    )
    .option(
      "--tickets <refs>",
      "Comma-separated ticket refs to add (e.g. PROJ-789)",
    )
    .action((sessionId, opts) => {
      heartbeatSession(sessionId, {
        runId: opts.runId,
        phase: opts.phase,
        taskSummary: opts.task,
        labels: opts.labels
          ? (opts.labels as string).split(",").map((s: string) => s.trim())
          : undefined,
        ticketRefs: opts.tickets
          ? (opts.tickets as string).split(",").map((s: string) => s.trim())
          : undefined,
      });
      console.log(JSON.stringify({ status: "ok" }));
    });

  session
    .command("end <sessionId>")
    .description("Mark a session as completed")
    .option("--status <status>", "Session status", "completed")
    .action((sessionId, opts) => {
      endSession(sessionId, opts.status);
      console.log(JSON.stringify({ status: opts.status }));
    });

  session
    .command("get <sessionId>")
    .description("Get session details")
    .action((sessionId) => {
      const s = getSession(sessionId);
      if (!s) {
        console.error(`Session ${sessionId} not found`);
        process.exit(1);
      }
      console.log(JSON.stringify(s));
    });

  session
    .command("link <runId> <sessionId>")
    .description("Link a run to a session")
    .action((runId, sessionId) => {
      linkRunToSession(runId, sessionId);
      console.log(JSON.stringify({ linked: true }));
    });

  session
    .command("list")
    .description("List sessions (active sessions highlighted)")
    .option("--active", "Show only active sessions")
    .option("--json", "Output as JSON")
    .option("--limit <n>", "Max results", "20")
    .action((opts) => {
      const sessions = listSessions({
        activeOnly: opts.active,
        limit: parseInt(opts.limit),
      });

      if (opts.json) {
        console.log(JSON.stringify(sessions));
        return;
      }

      const active = activeSessionCount();
      console.log(chalk.bold(`\n  Sessions (${active} active)\n`));

      if (sessions.length === 0) {
        console.log(chalk.dim("  No sessions found.\n"));
        return;
      }

      for (const s of sessions) {
        const statusColor =
          s.status === "active"
            ? chalk.green.bold
            : s.status === "stale"
              ? chalk.yellow
              : s.status === "crashed"
                ? chalk.red
                : chalk.dim;

        const phaseStr = s.current_phase ? `P${s.current_phase}` : "--";
        const task = s.task_summary?.slice(0, 50) ?? "no task";
        const heartbeat = s.last_heartbeat;

        console.log(
          `  ${statusColor(`[${s.status.toUpperCase().padEnd(9)}]`)} ` +
            `${chalk.cyan(s.id.slice(0, 8))} ` +
            `${phaseStr} ` +
            `${task} ` +
            `${chalk.dim(`heartbeat: ${heartbeat}`)}`,
        );

        if (s.current_run_id) {
          console.log(chalk.dim(`    run: ${s.current_run_id.slice(0, 8)}`));
        }
      }
      console.log();
    });
}
