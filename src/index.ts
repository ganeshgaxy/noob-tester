import { program } from "commander";
import { registerRunCommands } from "./cli/commands/run.js";
import { registerLogCommands } from "./cli/commands/log.js";
import { registerQueryCommands } from "./cli/commands/query.js";
import { registerSaveCommands } from "./cli/commands/save.js";
import { registerReportCommands } from "./cli/commands/report.js";
import { registerSetupCommand } from "./cli/commands/setup.js";
import { registerSessionCommands } from "./cli/commands/session.js";
import { registerWatchCommand } from "./cli/commands/watch.js";
import { registerSecretsCommands } from "./cli/commands/secrets.js";
import { registerFilesCommands } from "./cli/commands/files.js";
import { registerReposCommands } from "./cli/commands/repos.js";
import { registerTechIssueCommands } from "./cli/commands/tech-issue.js";
import { registerMetricsCommands } from "./cli/commands/metrics.js";
import { registerCleanupCommands } from "./cli/commands/cleanup.js";
import { registerTestCaseCommands } from "./cli/commands/testcase.js";
import { registerRunPackCommands } from "./cli/commands/runpack.js";
import { registerUiMapCommands } from "./cli/commands/uimap.js";
import { registerRunArtifactCommands } from "./cli/commands/run-artifacts.js";
import { registerTicketContextCommands } from "./cli/commands/ticket-context.js";
import { registerApiMapCommands } from "./cli/commands/api-map.js";
import { registerCoverageCommands } from "./cli/commands/coverage.js";
import { registerRcaCommands } from "./cli/commands/rca.js";
import { registerA11yCommands } from "./cli/commands/a11y.js";
import { registerVisualCommands } from "./cli/commands/visual.js";
import { registerChainCommands } from "./cli/commands/chain.js";
import { registerSettingsCommands } from "./cli/commands/settings.js";
import { registerAuthCommands } from "./cli/commands/auth.js";
import { registerSyncCommands } from "./cli/commands/sync.js";
import { registerQaPoolCommands } from "./cli/commands/qa-pool.js";
import { registerVisualRunCommands } from "./cli/commands/visual-run.js";
import { registerVisualTcCommands } from "./cli/commands/visual-tc.js";
import { registerWorkspaceCommands } from "./cli/commands/workspace.js";

program
  .name("noob-tester")
  .description(
    "Automated QA tester — CLI data layer + live dashboard for Claude Code skills.\n\n" +
      "  Commands:\n" +
      "    repos       Repos — discover (find by ticket), ensure (register+clone+index), search\n" +
      "    run         Runs — resolve (resume/create), update, complete, get\n" +
      "    testcase    Test cases — generate, claim, track, select by diff, risk scoring, audit\n" +
      "    runpack     Run packs — resolve, claim, result, artifact, retry, auto-retry, false-positives\n" +
      "    capture     Per-action artifacts — snapshot, console, har, screenshot, network errors\n" +
      "    uimap       UI maps — scan (stable selectors: role+text/placeholder/url), pages, navs, forms\n" +
      "    apimap      API maps — endpoints, params, responses, chains, health tracking\n" +
      "    secrets     Manage credentials per target/role (literal, env:, op:)\n" +
      "    files       Manage default local files for agent-browser upload\n" +
      "    session     Track active testing sessions across terminals\n" +
      "    tech-issue  Track technical issues, workarounds, and recovery attempts\n" +
      "    ticket-context  Cache ticket info, MR diffs, linked data across skills\n" +
      "    coverage    Code-level coverage mapping — link test cases to source files, find gaps\n" +
      "    rca         Root cause analysis — classify failures, track patterns, suggest actions\n" +
      "    a11y        Accessibility testing — store axe-core results, track WCAG violations\n" +
      "    visual      Visual regression — baselines, screenshot comparison, diff review\n" +
      "    watch       Live dashboard — Explore, UI Maps, Test Cases, Metrics, Secrets\n" +
      "    log         Record actions, issues, and raw outputs\n" +
      "    query       Search issues, analysis, codebase, and prior context\n" +
      "    cleanup     Clean up sessions, data, secrets, test cases, ui maps\n" +
      "    init        One-command setup — session + run + runpack (replaces 4 commands + 3 jq calls)\n" +
      "    finish      One-command teardown — complete run + end session\n" +
      "    capture-page Capture snapshot + screenshot + console + HAR + register all artifacts\n" +
      "    claim-smart Smart claim — retry failed, resume pending, or claim new test case\n" +
      "    auth-resolve Resolve credentials for target+role (1Password, env, literal)\n" +
      "    api-request  Execute HTTP request, validate, store artifact, log result\n" +
      "    repos setup-for-ticket  Discover + clone + sync + index all repos for a ticket (5+ commands → 1)\n" +
      "    setup       Full setup check — CLIs, skills, symlinks, 1Password, MCP, DB. --provider gitlab|bitbucket|both",
  )
  .version("0.1.0");

registerRunCommands(program);
registerLogCommands(program);
registerQueryCommands(program);
registerSaveCommands(program);
registerReportCommands(program);
registerSessionCommands(program);
registerWatchCommand(program);
registerSecretsCommands(program);
registerFilesCommands(program);
registerTestCaseCommands(program);
registerReposCommands(program);
registerTechIssueCommands(program);
registerMetricsCommands(program);
registerRunPackCommands(program);
registerUiMapCommands(program);
registerRunArtifactCommands(program);
registerCleanupCommands(program);
registerTicketContextCommands(program);
registerApiMapCommands(program);
registerCoverageCommands(program);
registerRcaCommands(program);
registerA11yCommands(program);
registerVisualCommands(program);
registerChainCommands(program);
registerSettingsCommands(program);
registerAuthCommands(program);
registerSyncCommands(program);
registerQaPoolCommands(program);
registerVisualRunCommands(program);
registerVisualTcCommands(program);
registerWorkspaceCommands(program);
registerSetupCommand(program);

// Evidence path command
import { evidenceDir } from "./db/client.js";
import {
  readdirSync,
  copyFileSync,
  existsSync as fsExists,
  mkdirSync as fsMkdir,
} from "fs";
import { join as pathJoin, basename } from "path";

program
  .command("evidence-path")
  .description(
    "Print the dedicated evidence directory path (~/.noob-tester/evidence/)",
  )
  .action(() => {
    console.log(evidenceDir());
  });

program
  .command("evidence-migrate")
  .description(
    "Move evidence files from a source folder to ~/.noob-tester/evidence/ and update all DB paths",
  )
  .requiredOption("--from <path>", "Source folder with evidence files")
  .option("--yes", "Skip confirmation")
  .action((opts) => {
    const src = opts.from;
    const dest = evidenceDir();
    if (!fsExists(src)) {
      console.error("Source not found: " + src);
      process.exit(1);
    }

    const files = readdirSync(src).filter((f) => !f.startsWith("."));
    if (!opts.yes) {
      console.log(
        `Will copy ${files.length} files from ${src} to ${dest} and update DB paths.`,
      );
      console.log("Run with --yes to proceed.");
      return;
    }

    // Copy files
    let copied = 0;
    for (const f of files) {
      const srcPath = pathJoin(src, f);
      const destPath = pathJoin(dest, f);
      try {
        copyFileSync(srcPath, destPath);
        copied++;
      } catch {}
    }
    console.log(`Copied ${copied} files to ${dest}`);

    // Update all DB paths
    const { getDb } = require("./db/client.js");
    const db = getDb();
    const tables = [
      { table: "issues", cols: ["screenshot_path", "video_path"] },
      { table: "ui_map_pages", cols: ["snapshot_path", "screenshot_path"] },
      { table: "run_artifacts", cols: ["file_path"] },
      { table: "run_pack_entries", cols: ["artifacts"] },
    ];

    let updated = 0;
    for (const { table, cols } of tables) {
      for (const col of cols) {
        if (col === "artifacts") {
          // JSON column — need to parse and update paths inside
          const rows = db
            .prepare(
              `SELECT id, artifacts FROM ${table} WHERE artifacts LIKE ?`,
            )
            .all("%" + src + "%") as Array<{ id: string; artifacts: string }>;
          for (const row of rows) {
            const newArtifacts = row.artifacts.replace(
              new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
              dest,
            );
            db.prepare(`UPDATE ${table} SET artifacts = ? WHERE id = ?`).run(
              newArtifacts,
              row.id,
            );
            updated++;
          }
        } else {
          const result = db
            .prepare(
              `UPDATE ${table} SET ${col} = REPLACE(${col}, ?, ?) WHERE ${col} LIKE ?`,
            )
            .run(src, dest, "%" + src + "%");
          updated += result.changes;
        }
      }
    }
    console.log(`Updated ${updated} DB path(s) from ${src} → ${dest}`);
  });

program.parse();
