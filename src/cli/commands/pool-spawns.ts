import type { Command } from "commander";
import * as os from "os";
import {
  recordSpawn,
  listSpawnsForTicket,
  getActiveSpawnsForTicket,
  markSpawnCompleted,
  markSpawnKilled,
  killAllSpawnsForTicket,
  getActiveSpawnPids,
} from "../../db/repositories/pool-spawns.js";

export function registerPoolSpawnsCommands(program: Command): void {
  const spawns = program
    .command("pool-spawns")
    .description("Manage spawned pool agents — list, kill, track");

  // ── record ────────────────────────────────────────────────────────────────
  spawns
    .command("record")
    .description("Record a newly spawned pool agent")
    .requiredOption("--ticket <id>", "Ticket ID")
    .requiredOption("--agent <path>", "Agent path")
    .requiredOption("--pid <number>", "Process ID")
    .requiredOption("--type <type>", "Spawn type: pool or visual-pool")
    .action((opts) => {
      const pid = parseInt(opts.pid, 10);
      if (isNaN(pid)) {
        console.error("Invalid PID");
        process.exit(1);
      }

      const id = recordSpawn(opts.ticket, opts.agent, pid, opts.type);
      console.log(
        JSON.stringify({
          id,
          ticket_id: opts.ticket,
          agent_path: opts.agent,
          pid,
          spawn_type: opts.type,
        }),
      );
    });

  // ── list ──────────────────────────────────────────────────────────────────
  spawns
    .command("list")
    .description("List all spawns (active or completed) for a ticket")
    .requiredOption("--ticket <id>", "Ticket ID")
    .option("--active", "Show only active spawns")
    .option("--json", "Output raw JSON")
    .action((opts) => {
      const spawns_list = opts.active
        ? getActiveSpawnsForTicket(opts.ticket)
        : listSpawnsForTicket(opts.ticket);

      if (opts.json) {
        console.log(JSON.stringify(spawns_list, null, 2));
        return;
      }

      if (spawns_list.length === 0) {
        console.log(`No spawns for ticket ${opts.ticket}`);
        return;
      }

      console.log(`\nPool Spawns for ${opts.ticket}:\n`);
      for (const spawn of spawns_list) {
        const statusColor =
          spawn.status === "running"
            ? "\x1b[32m" // green
            : spawn.status === "completed"
              ? "\x1b[36m" // cyan
              : spawn.status === "killed"
                ? "\x1b[33m" // yellow
                : "\x1b[31m"; // red
        const reset = "\x1b[0m";

        console.log(
          `  [${spawn.id.slice(0, 8)}] ${statusColor}${spawn.status.toUpperCase()}${reset}`,
        );
        console.log(`    PID: ${spawn.pid}  Type: ${spawn.spawn_type}`);
        console.log(`    Agent: ${spawn.agent_path}`);
        console.log(`    Created: ${spawn.created_at}`);
        if (spawn.completed_at) console.log(`    Completed: ${spawn.completed_at}`);
        if (spawn.exit_code !== null) console.log(`    Exit Code: ${spawn.exit_code}`);
        if (spawn.notes) console.log(`    Notes: ${spawn.notes}`);
        console.log();
      }
    });

  // ── kill-all ──────────────────────────────────────────────────────────────
  spawns
    .command("kill-all")
    .description("Kill all active spawned agents for a ticket")
    .requiredOption("--ticket <id>", "Ticket ID")
    .option("--force", "Actually kill processes (default: just mark as killed in DB)")
    .action((opts) => {
      const pids = getActiveSpawnPids(opts.ticket);

      if (pids.length === 0) {
        console.log(`No active spawns for ticket ${opts.ticket}`);
        return;
      }

      console.log(`Found ${pids.length} active spawn(s) for ${opts.ticket}`);

      // Mark as killed in database
      const killed = killAllSpawnsForTicket(opts.ticket);
      console.log(`Marked ${killed} spawns as killed in database`);

      // Actually kill processes if --force
      if (opts.force) {
        const platform = os.platform();
        let killCmd: string;

        if (platform === "win32") {
          killCmd = `taskkill /F /PID`;
        } else {
          killCmd = `kill -9`;
        }

        for (const pid of pids) {
          try {
            const { execSync } = require("child_process");
            execSync(`${killCmd} ${pid}`, { stdio: "ignore" });
            console.log(`  Killed PID ${pid}`);
          } catch {
            console.log(`  Failed to kill PID ${pid} (may already be dead)`);
          }
        }
      } else {
        console.log(`Use --force flag to actually kill processes: ${pids.join(", ")}`);
      }

      console.log(
        JSON.stringify({
          ticket_id: opts.ticket,
          total_active: pids.length,
          marked_killed: killed,
          pids,
        }),
      );
    });

  // ── complete ──────────────────────────────────────────────────────────────
  spawns
    .command("complete")
    .description("Mark a spawn as completed (use with exit code)")
    .requiredOption("--spawn <id>", "Spawn ID")
    .option("--exit-code <code>", "Exit code (0 = success)")
    .action((opts) => {
      const exitCode = opts.exitCode ? parseInt(opts.exitCode, 10) : null;
      const updated = markSpawnCompleted(opts.spawn, exitCode);

      if (!updated) {
        console.error(`Spawn ${opts.spawn} not found`);
        process.exit(1);
      }

      console.log(JSON.stringify({ updated: opts.spawn, exit_code: exitCode }));
    });
}
