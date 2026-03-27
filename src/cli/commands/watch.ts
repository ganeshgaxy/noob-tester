import type { Command } from "commander";
import { startWatchServer } from "../../watch/server.js";

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Live dashboard for monitoring noob-tester sessions")
    .option("-p, --port <port>", "Port to serve dashboard on", "4040")
    .option("-s, --session <sessionId>", "Watch a specific session only")
    .action((opts) => {
      startWatchServer({
        port: parseInt(opts.port, 10),
        sessionId: opts.session,
      });
    });
}
