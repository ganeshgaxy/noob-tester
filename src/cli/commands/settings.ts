import type { Command } from "commander";
import chalk from "chalk";
import {
  setSetting,
  getSetting,
  listSettings,
  deleteSetting,
} from "../../db/repositories/settings.js";

const VALID_REPO_PROVIDERS = ["bitbucket", "gitlab", "github"];

export function registerSettingsCommands(program: Command): void {
  const settings = program
    .command("settings")
    .description("Manage application settings (repo provider, etc.)");

  settings
    .command("set <key> <value>")
    .description("Set a setting value")
    .action((key, value) => {
      if (key === "repo_provider" && !VALID_REPO_PROVIDERS.includes(value.toLowerCase())) {
        console.error(
          chalk.red(`Invalid repo provider: ${value}. Must be one of: ${VALID_REPO_PROVIDERS.join(", ")}`)
        );
        process.exit(1);
      }
      setSetting(key, key === "repo_provider" ? value.toLowerCase() : value);
      console.log(JSON.stringify({ key, value }));
    });

  settings
    .command("get <key>")
    .description("Get a setting value")
    .action((key) => {
      const value = getSetting(key);
      if (value === undefined) {
        console.error(chalk.red(`Setting "${key}" not found`));
        process.exit(1);
      }
      console.log(value);
    });

  settings
    .command("list")
    .description("List all settings")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const all = listSettings();
      if (opts.json) {
        console.log(JSON.stringify(all, null, 2));
        return;
      }
      if (all.length === 0) {
        console.log(chalk.dim("\n  No settings configured.\n"));
        return;
      }
      console.log(chalk.bold("\n  Settings\n"));
      for (const item of all) {
        console.log(`  ${chalk.cyan.bold(item.key)} = ${item.value}`);
      }
      console.log();
    });

  settings
    .command("delete <key>")
    .description("Delete a setting")
    .action((key) => {
      const ok = deleteSetting(key);
      if (!ok) {
        console.error(chalk.red(`Setting "${key}" not found`));
        process.exit(1);
      }
      console.log(JSON.stringify({ deleted: true, key }));
    });
}
