import type { Command } from "commander";
import chalk from "chalk";
import {
  getPageAgentConfig,
  setPageAgentConfig,
  deletePageAgentConfig,
} from "../../db/repositories/page-agent-config.js";
import { getDb } from "../../db/client.js";

const VALID_PAGES = ["explore", "plan", "pool", "analyze", "visual", "testcases"];

export function registerPageConfigCommands(program: Command): void {
  const pc = program
    .command("page-config")
    .description("Manage default agent configuration per page");

  pc
    .command("set <page>")
    .description("Set default agent for a page")
    .option("--agent <name>", "Agent name (from ~/.claude/agents/)")
    .option("--auto-run", "Enable auto-run when page loads", false)
    .option("--json", "Output as JSON")
    .action((page, opts) => {
      if (!VALID_PAGES.includes(page)) {
        console.error(chalk.red(`Unknown page "${page}". Valid pages: ${VALID_PAGES.join(", ")}`));
        process.exit(1);
      }
      const cfg = setPageAgentConfig(page, {
        agent_name: opts.agent ?? null,
        auto_run: opts.autoRun ? 1 : 0,
      });
      if (opts.json) { console.log(JSON.stringify(cfg)); return; }
      console.log(chalk.green(`Set page-config for "${page}": agent=${cfg.agent_name ?? "none"}, auto_run=${!!cfg.auto_run}`));
    });

  pc
    .command("get <page>")
    .description("Get default agent config for a page")
    .option("--json", "Output as JSON")
    .action((page, opts) => {
      const cfg = getPageAgentConfig(page);
      if (!cfg) {
        if (opts.json) { console.log("null"); return; }
        console.log(chalk.dim(`No config set for page "${page}".`));
        return;
      }
      if (opts.json) { console.log(JSON.stringify(cfg)); return; }
      console.log(chalk.bold(`\n  ${page}\n`));
      console.log(`  agent   : ${cfg.agent_name ?? chalk.dim("(none)")}`);
      console.log(`  auto_run: ${cfg.auto_run ? chalk.green("yes") : chalk.dim("no")}`);
      console.log();
    });

  pc
    .command("list")
    .description("List all page agent configs")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const rows = (getDb()
        .prepare("SELECT * FROM page_agent_config ORDER BY page")
        .all()) as Array<{ page: string; agent_name: string | null; auto_run: number }>;
      if (opts.json) { console.log(JSON.stringify(rows)); return; }
      if (rows.length === 0) {
        console.log(chalk.dim("\n  No page configs set.\n"));
        return;
      }
      console.log(chalk.bold("\n  Page Agent Config\n"));
      for (const r of rows) {
        const agent = r.agent_name ? chalk.cyan(r.agent_name) : chalk.dim("(none)");
        const auto  = r.auto_run ? chalk.green("auto") : "";
        console.log(`  ${chalk.bold(r.page.padEnd(12))} ${agent} ${auto}`);
      }
      console.log();
    });

  pc
    .command("clear <page>")
    .description("Remove default agent config for a page")
    .option("--json", "Output as JSON")
    .action((page, opts) => {
      const ok = deletePageAgentConfig(page);
      if (opts.json) { console.log(JSON.stringify({ cleared: ok, page })); return; }
      if (ok) console.log(chalk.green(`Cleared page-config for "${page}".`));
      else console.log(chalk.dim(`No config found for "${page}".`));
    });
}
