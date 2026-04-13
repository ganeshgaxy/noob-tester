import type { Command } from "commander";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  getActiveWorkspace,
  listWorkspaces,
  setActiveWorkspace,
  workspacesDir,
  copyWorkspace,
} from "../../db/client.js";

export function registerWorkspaceCommands(program: Command): void {
  const ws = program
    .command("workspace")
    .description(
      "Manage noob-tester workspaces (isolate DB, evidence, secrets, repos)",
    );

  ws.command("current")
    .description("Show the active workspace name")
    .action(() => {
      console.log(JSON.stringify({ workspace: getActiveWorkspace() }));
    });

  ws.command("list")
    .description("List all workspaces")
    .action(() => {
      const workspaces = listWorkspaces();
      if (workspaces.length === 0) {
        console.log(
          JSON.stringify({ workspaces: [{ name: "default", current: true }] }),
        );
      } else {
        console.log(JSON.stringify({ workspaces }));
      }
    });

  ws.command("create <name>")
    .description("Create a new workspace directory")
    .action((name: string) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        console.error(
          JSON.stringify({
            error: "Workspace name must be alphanumeric (a-z, 0-9, -, _)",
          }),
        );
        process.exit(1);
      }
      const dir = join(workspacesDir(), name);
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, "evidence"), { recursive: true });
      console.log(
        JSON.stringify({ created: true, workspace: name, path: dir }),
      );
    });

  ws.command("switch <name>")
    .description(
      "Switch the active workspace (writes to ~/.noob-tester/config.json)",
    )
    .action((name: string) => {
      // Auto-create the workspace directory if it doesn't exist
      const dir = join(workspacesDir(), name);
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, "evidence"), { recursive: true });
      setActiveWorkspace(name);
      console.log(JSON.stringify({ switched: true, workspace: name }));
    });

  ws.command("delete <name>")
    .description("Delete a workspace and ALL its data (irreversible)")
    .option("--confirm", "Required flag to confirm deletion")
    .action((name: string, opts: { confirm?: boolean }) => {
      if (name === "default") {
        console.error(
          JSON.stringify({ error: "Cannot delete the default workspace" }),
        );
        process.exit(1);
      }
      if (!opts.confirm) {
        console.error(
          JSON.stringify({
            error: "Pass --confirm to confirm deletion of all workspace data",
          }),
        );
        process.exit(1);
      }
      if (name === getActiveWorkspace()) {
        // Switch to default before deleting
        setActiveWorkspace("default");
      }
      const dir = join(workspacesDir(), name);
      if (!existsSync(dir)) {
        console.error(
          JSON.stringify({ error: `Workspace "${name}" not found` }),
        );
        process.exit(1);
      }
      rmSync(dir, { recursive: true, force: true });
      console.log(JSON.stringify({ deleted: true, workspace: name }));
    });

  ws.command("copy <from> <to>")
    .description(
      "Copy DB and evidence from one workspace into another (creates target if needed)",
    )
    .option("--switch", "Switch to the target workspace after copying")
    .action((from: string, to: string, opts: { switch?: boolean }) => {
      try {
        copyWorkspace(from, to);
        if (opts.switch) {
          setActiveWorkspace(to);
          console.log(
            JSON.stringify({ copied: true, from, to, switched: true }),
          );
        } else {
          console.log(
            JSON.stringify({ copied: true, from, to, switched: false }),
          );
        }
      } catch (e) {
        console.error(JSON.stringify({ error: String(e) }));
        process.exit(1);
      }
    });
}
