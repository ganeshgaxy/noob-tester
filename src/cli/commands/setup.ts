import type { Command } from "commander";
import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { getDb } from "../../db/client.js";

function cmdExists(cmd: string): boolean {
  try { execSync(`which ${cmd}`, { stdio: "ignore" }); return true; } catch { return false; }
}

function pathExists(p: string): boolean {
  return existsSync(p);
}

/**
 * Find the latest version directory inside a plugin cache path.
 * e.g. ~/.claude/plugins/cache/cc-handbook/handbook-glab/ → "1.19.6"
 */
function findPluginVersion(basePath: string): string | null {
  if (!existsSync(basePath)) return null;
  try {
    const entries = readdirSync(basePath).filter(e => !e.startsWith(".")).sort();
    return entries.length > 0 ? entries[entries.length - 1] : null;
  } catch { return null; }
}

/**
 * Resolve full plugin skill path with dynamic version detection.
 */
function resolvePluginSkillPath(pluginsCache: string, pluginName: string, packageName: string, skillSubPath: string): { path: string; version: string | null } {
  const pkgDir = join(pluginsCache, pluginName, packageName);
  const version = findPluginVersion(pkgDir);
  if (!version) return { path: join(pkgDir, "<version>", skillSubPath), version: null };
  return { path: join(pkgDir, version, skillSubPath), version };
}

function check(label: string, ok: boolean, hint?: string): boolean {
  if (ok) {
    console.log(`  ${chalk.green("✔")} ${label}`);
  } else {
    console.log(`  ${chalk.red("✖")} ${label}`);
    if (hint) console.log(chalk.dim(`    → ${hint}`));
  }
  return ok;
}

function checkOptional(label: string, ok: boolean, hint?: string): boolean {
  if (ok) {
    console.log(`  ${chalk.green("✔")} ${label}`);
  } else {
    console.log(`  ${chalk.yellow("⚠")} ${label} ${chalk.dim("(optional)")}`);
    if (hint) console.log(chalk.dim(`    → ${hint}`));
  }
  return ok;
}

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Check prerequisites, skills, symlinks, and initialize DB. Use --provider to select git provider.")
    .option("--provider <name>", "Git provider to set up: gitlab, bitbucket, both (default: both)")
    .action((opts) => {
      const provider = (opts.provider ?? "both").toLowerCase();
      const wantGlab = provider === "gitlab" || provider === "both";
      const wantBb = provider === "bitbucket" || provider === "bb" || provider === "both";
      const claudeDir = join(homedir(), ".claude");
      const skillsDir = join(claudeDir, "skills");
      const pluginsCache = join(claudeDir, "plugins", "cache");

      let allGood = true;
      let missingSteps: Array<{ section: string; command: string }> = [];

      console.log(chalk.bold.cyan("\n  noob-tester setup\n"));

      // ── 1. Core CLIs ──
      console.log(chalk.bold("Core CLIs:\n"));
      if (!check("git", cmdExists("git"), "brew install git")) allGood = false;
      if (!check("curl", cmdExists("curl"), "brew install curl")) allGood = false;
      if (!check("jq", cmdExists("jq"), "brew install jq")) allGood = false;
      if (!check("claude", cmdExists("claude"), "Install Claude Code: https://claude.ai/claude-code")) allGood = false;

      // ── 2. Agent Browser ──
      console.log(chalk.bold("\nBrowser Automation:\n"));
      const hasAgentBrowser = cmdExists("agent-browser");
      if (!check("agent-browser CLI", hasAgentBrowser, "npm install -g agent-browser")) {
        allGood = false;
        missingSteps.push({ section: "Agent Browser", command: "npm install -g agent-browser" });
      }

      // Agent browser skills
      const abSkillPath = join(skillsDir, "agent-browser");
      const hasAbSkill = pathExists(abSkillPath);
      if (!check("agent-browser skills", hasAbSkill, "npx skills add vercel-labs/agent-browser")) {
        missingSteps.push({ section: "Agent Browser Skills", command: "npx skills add vercel-labs/agent-browser" });
      }

      // ── 3. Git Provider CLIs & Skills ──
      if (wantGlab) {
        console.log(chalk.bold("\nGitLab (glab):\n"));

        const hasGlab = cmdExists("glab");
        checkOptional("glab CLI", hasGlab, "brew install glab");
        if (!hasGlab) missingSteps.push({ section: "GitLab CLI", command: "brew install glab && glab auth login" });

        // glab auth
        if (hasGlab) {
          let glabAuthed = false;
          try { execSync("glab auth status", { stdio: "ignore" }); glabAuthed = true; } catch {}
          checkOptional("glab authenticated", glabAuthed, "glab auth login");
          if (!glabAuthed) missingSteps.push({ section: "GitLab Auth", command: "glab auth login" });
        }

        // glab plugin
        const glabPluginPath = join(pluginsCache, "cc-handbook");
        const hasGlabPlugin = pathExists(glabPluginPath);
        checkOptional("glab plugin installed", hasGlabPlugin, "claude plugin marketplace add nikiforovall/claude-code-rules && claude plugin install handbook@handbook-glab");
        if (!hasGlabPlugin) missingSteps.push({ section: "GitLab Plugin", command: "claude plugin marketplace add nikiforovall/claude-code-rules && claude plugin install handbook@handbook-glab" });

        // glab skill symlink
        const glabSkillPath = join(skillsDir, "glab");
        const hasGlabSkill = pathExists(glabSkillPath);
        const glabResolved = resolvePluginSkillPath(pluginsCache, "cc-handbook", "handbook-glab", "skills/glab-skill");
        const glabSymCmd = "ln -s " + glabResolved.path + " ~/.claude/skills/glab";
        checkOptional("glab skill symlink", hasGlabSkill, glabSymCmd);
        if (!hasGlabSkill) missingSteps.push({ section: "GitLab Skill Symlink", command: glabSymCmd });
      }

      if (wantBb) {
        console.log(chalk.bold("\nBitbucket (bb):\n"));

        const hasBb = cmdExists("bb");
        checkOptional("bb CLI", hasBb, "npm install -g bb-cli");
        if (!hasBb) missingSteps.push({ section: "Bitbucket CLI", command: "npm install -g bb-cli" });

        // bb auth
        if (hasBb) {
          let bbAuthed = false;
          try { execSync("bb auth status", { stdio: "ignore" }); bbAuthed = true; } catch {}
          checkOptional("bb authenticated", bbAuthed, "bb auth login");
          if (!bbAuthed) missingSteps.push({ section: "Bitbucket Auth", command: "bb auth login" });
        }

        // bb plugin
        const bbPluginPath = join(pluginsCache, "noob-tester-skills");
        const hasBbPlugin = pathExists(bbPluginPath);
        checkOptional("bb plugin installed", hasBbPlugin, "claude plugin marketplace add ganeshgaxy/noob-tester-skills && claude plugin install bb@noob-tester-skills");
        if (!hasBbPlugin) missingSteps.push({ section: "Bitbucket Plugin", command: "claude plugin marketplace add ganeshgaxy/noob-tester-skills && claude plugin install bb@noob-tester-skills" });

        // bb skill symlink
        const bbSkillPath = join(skillsDir, "bb");
        const hasBbSkill = pathExists(bbSkillPath);
        const bbResolved = resolvePluginSkillPath(pluginsCache, "noob-tester-skills", "bb", "skills/bb");
        const bbSymCmd = "ln -s " + bbResolved.path + " ~/.claude/skills/bb";
        checkOptional("bb skill symlink", hasBbSkill, bbSymCmd);
        if (!hasBbSkill) missingSteps.push({ section: "Bitbucket Skill Symlink", command: bbSymCmd });
      }

      // ── 4. 1Password (optional) ──
      console.log(chalk.bold("\n1Password (optional):\n"));
      const hasOp = cmdExists("op");
      checkOptional("1Password CLI (op)", hasOp, "brew install 1password-cli");
      if (!hasOp) missingSteps.push({ section: "1Password CLI", command: "brew install 1password-cli && op signin" });
      if (hasOp) {
        let opAuthed = false;
        try { execSync("op whoami", { stdio: "ignore" }); opAuthed = true; } catch {}
        checkOptional("1Password signed in", opAuthed, "op signin");
        if (!opAuthed) missingSteps.push({ section: "1Password Auth", command: "op signin" });
      }

      // ── 5. Hooks ──
      console.log(chalk.bold("\nHooks:\n"));
      const hooksDir = join(claudeDir, "hooks");
      const metricsHook = join(hooksDir, "subagent-metrics.sh");
      const hasMetricsHook = pathExists(metricsHook);
      const hookResolved = resolvePluginSkillPath(pluginsCache, "noob-tester-skills", "subagent-metrics", "hooks/subagent-metrics.sh");
      const hookCmd = "mkdir -p ~/.claude/hooks && ln -sf " + hookResolved.path + " ~/.claude/hooks/subagent-metrics.sh";
      checkOptional("subagent-metrics hook", hasMetricsHook, hookCmd);
      if (!hasMetricsHook) missingSteps.push({ section: "Metrics Hook", command: hookCmd });

      // ── 5. MCP Servers ──
      console.log(chalk.bold("\nMCP Servers:\n"));
      console.log(`  ${chalk.yellow("⚠")} Atlassian MCP — verify manually`);
      console.log(chalk.dim("    Required for reading Jira tickets, Confluence pages, and updating tickets"));
      console.log(chalk.dim("    Setup: https://github.com/anthropics/claude-code/blob/main/docs/mcp.md"));

      // ── 6. Database ──
      console.log(chalk.bold("\nDatabase:\n"));
      try {
        const db = getDb();
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'code_fts%'")
          .all() as { name: string }[];
        check("DB initialized", true);
        console.log(chalk.dim(`    ${tables.length} tables in ~/.noob-tester/noob-tester.db`));
      } catch (err) {
        check("DB initialized", false, String(err));
        allGood = false;
      }

      // ── Summary ──
      console.log();
      if (missingSteps.length === 0 && allGood) {
        console.log(chalk.green.bold("  All good! Ready to use with Claude Code.\n"));
      } else {
        if (missingSteps.length > 0) {
          console.log(chalk.yellow.bold("  Missing steps — run these commands:\n"));
          for (const step of missingSteps) {
            console.log(chalk.dim(`  # ${step.section}`));
            console.log(chalk.cyan(`  ${step.command}`));
            console.log();
          }
        }
        if (!allGood) {
          console.log(chalk.red("  Some required prerequisites are missing.\n"));
        }
      }
    });
}
