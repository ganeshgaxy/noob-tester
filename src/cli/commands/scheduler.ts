import type { Command } from "commander";
import { startScheduler, stopScheduler, pauseAgent, resumeAgent } from "../../scheduler/scheduler.js";
import { getScheduledAgent, updateScheduledAgent } from "../../db/repositories/scheduled-agents.js";

export function registerSchedulerCommands(program: Command): void {
  const scheduler = program.command("scheduler").description("Manage the task scheduler daemon");

  scheduler
    .command("start")
    .description("Start the scheduler daemon (runs in foreground)")
    .action(() => {
      console.log("Starting scheduler daemon...");
      startScheduler();
      console.log("Scheduler running. Press Ctrl+C to stop.");
      // Keep the process alive
      process.on("SIGINT", () => {
        console.log("\nShutting down...");
        stopScheduler();
        process.exit(0);
      });
    });

  scheduler
    .command("status")
    .description("Check scheduler status")
    .action(() => {
      console.log("Scheduler status: run 'scheduler start' to launch the daemon");
      console.log("Scheduled agents are managed with: noob-tester schedule-agent");
    });
}
