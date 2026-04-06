import type { Command } from "commander";
import {
  storeArtifact,
  getArtifactsByRun,
  getArtifactsByEntry,
  getArtifactStats,
} from "../../db/repositories/run-artifacts.js";
import { updateEvidenceStats } from "../../db/repositories/resource-stats.js";

export function registerRunArtifactCommands(program: Command): void {
  const ra = program
    .command("capture")
    .description(
      "Store per-action artifacts — snapshots, console logs, HAR, screenshots, network errors",
    );

  ra.command("store")
    .description("Store an artifact for a run action")
    .requiredOption("--run <runId>", "Run ID")
    .requiredOption(
      "--type <type>",
      "Artifact type: snapshot | screenshot | console | har | video | trace | network_error",
    )
    .option("--file <path>", "File path to the artifact")
    .option(
      "--content <text>",
      "Inline content (for small data like console errors)",
    )
    .option("--pack <runPackId>", "Run pack ID")
    .option("--entry <entryId>", "Run pack entry ID")
    .option("--session <sessionId>", "Session ID")
    .option("--ticket <id>", "Ticket ID")
    .option("--action <n>", "Action index/step number", parseInt)
    .option("--desc <text>", "Action description")
    .option("--url <pageUrl>", "Page URL where this was captured")
    .option("--metadata <json>", "Extra metadata as JSON")
    .action((opts) => {
      const id = storeArtifact({
        runId: opts.run,
        artifactType: opts.type,
        filePath: opts.file,
        content: opts.content,
        runPackId: opts.pack,
        entryId: opts.entry,
        sessionId: opts.session,
        ticketId: opts.ticket,
        actionIndex: opts.action,
        actionDesc: opts.desc,
        pageUrl: opts.url,
        metadata: opts.metadata ? JSON.parse(opts.metadata) : undefined,
      });
      try {
        updateEvidenceStats();
      } catch {}
      console.log(JSON.stringify({ artifactId: id }));
    });

  ra.command("list")
    .description("List artifacts for a run or entry")
    .option("--run <runId>", "Run ID")
    .option("--entry <entryId>", "Run pack entry ID")
    .option("--type <type>", "Filter by type")
    .option("--json", "JSON output")
    .action((opts) => {
      let artifacts;
      if (opts.entry) {
        artifacts = getArtifactsByEntry(opts.entry);
      } else if (opts.run) {
        artifacts = getArtifactsByRun(opts.run, opts.type);
      } else {
        console.error("Provide --run or --entry");
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(artifacts));
      } else {
        if (artifacts.length === 0) {
          console.log("No artifacts.");
          return;
        }
        for (const a of artifacts) {
          console.log(
            `  ${String(a.action_index).padStart(3)} ${a.artifact_type.padEnd(14)} ${a.page_url || ""} ${a.file_path || a.content?.slice(0, 50) || ""}`,
          );
        }
      }
    });

  ra.command("stats")
    .description("Show artifact counts by type for a run")
    .requiredOption("--run <runId>", "Run ID")
    .action((opts) => {
      console.log(JSON.stringify(getArtifactStats(opts.run)));
    });
}
