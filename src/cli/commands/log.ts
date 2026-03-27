import type { Command } from "commander";
import { logAction, completeAction } from "../../db/repositories/actions.js";
import { insertIssue } from "../../db/repositories/issues.js";
import { v4 as uuid } from "uuid";
import { getDb } from "../../db/client.js";

export function registerLogCommands(program: Command): void {
  const log = program.command("log").description("Log actions, issues, and outputs");

  log
    .command("action <runId>")
    .description("Log an action taken during testing")
    .requiredOption("--phase <n>", "Phase number (1-4)", parseInt)
    .requiredOption("--agent <name>", "Agent name (analyst, planner, automator, reporter)")
    .requiredOption("--description <text>", "What was done")
    .option("--details <text>", "Additional details")
    .action((runId, opts) => {
      const id = logAction({
        runId,
        phase: opts.phase,
        agentName: opts.agent,
        promptText: opts.description,
      });
      if (opts.details) {
        completeAction({
          actionId: id,
          runId,
          resultText: opts.details,
          status: "success",
        });
      }
      console.log(JSON.stringify({ actionId: id }));
    });

  log
    .command("issue <runId>")
    .description("Record an issue found during testing")
    .requiredOption("--category <cat>", "ui|accessibility|network|console|visual|layout|content|functional|performance")
    .requiredOption("--severity <sev>", "critical|high|medium|low|info")
    .requiredOption("--title <text>", "Issue title")
    .requiredOption("--description <text>", "Issue description")
    .option("--location <loc>", "URL, selector, or page area")
    .option("--screenshot <path>", "Path to screenshot file")
    .option("--video <path>", "Path to video file")
    .option("--console-log <text>", "Console output")
    .option("--network-data <text>", "Network/HAR data")
    .option("--step-id <id>", "Related test step ID")
    .option("--raw-output <text>", "Full raw output from the tool")
    .action((runId, opts) => {
      const id = insertIssue({
        runId,
        stepId: opts.stepId,
        category: opts.category,
        severity: opts.severity,
        title: opts.title,
        description: opts.description,
        location: opts.location,
        screenshotPath: opts.screenshot,
        videoPath: opts.video,
        consoleLog: opts.consoleLog,
        networkData: opts.networkData,
        rawOutput: opts.rawOutput,
      });
      console.log(JSON.stringify({ issueId: id }));
    });

  log
    .command("output <runId>")
    .description("Save raw output from a skill or tool")
    .requiredOption("--source <name>", "Source tool/skill (agent-browser, dogfood, glab, etc.)")
    .requiredOption("--type <type>", "Output type (screenshot, video, har, console, accessibility_tree, text)")
    .option("--content <text>", "Text content or base64")
    .option("--file-path <path>", "Path to artifact file")
    .option("--metadata <json>", "Extra JSON metadata")
    .action((runId, opts) => {
      const id = uuid();
      getDb()
        .prepare(
          `INSERT INTO raw_outputs (id, run_id, created_at, source, output_type, content, file_path, metadata_json)
           VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)`
        )
        .run(
          id, runId,
          opts.source, opts.type,
          opts.content ?? null,
          opts.filePath ?? null,
          opts.metadata ?? null
        );
      console.log(JSON.stringify({ outputId: id }));
    });
}
