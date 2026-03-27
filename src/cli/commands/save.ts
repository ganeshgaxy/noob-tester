import type { Command } from "commander";
import { saveAnalysis } from "../../db/repositories/analyses.js";
import { saveTestPlan, createPlan, addStep, deletePlan, deletePlansByTicket } from "../../db/repositories/plans.js";

export function registerSaveCommands(program: Command): void {
  const save = program.command("save").description("Save analysis or plan data");

  save
    .command("analysis <runId>")
    .description("Save an analysis result")
    .requiredOption("--type <type>", "Analysis type: gap | requirements | feasibility")
    .requiredOption("--content <json>", "Analysis content as JSON")
    .option("--confidence <n>", "Confidence score 0-1", parseFloat)
    .option("--summary <text>", "Human-readable summary")
    .action((runId, opts) => {
      const id = saveAnalysis({
        runId,
        analysisType: opts.type,
        contentJson: opts.content,
        confidence: opts.confidence,
        summary: opts.summary,
      });
      console.log(JSON.stringify({ analysisId: id }));
    });

  save
    .command("plan <runId>")
    .description("Save a test plan — pass ONE JSON with all sections")
    .requiredOption("--ticket <id>", "Ticket ID")
    .requiredOption("--plan <json>", "Full plan as JSON: {strategy, importance, regressions, requirements, functionality, nonFunctional, automation, testData, environments, platforms, tools, featureFlags, security, performance, dependencies, outOfScope, questions, postRelease, blockers, coverageGaps, mrRefs, targetUrl, testNotes}")
    .action((runId, opts) => {
      const p = JSON.parse(opts.plan);

      const id = createPlan({
        runId,
        ticketId: opts.ticket,
        targetUrl: p.targetUrl,
        strategy: p.strategy,
        blockers: p.blockers,
        coverageGaps: p.coverageGaps,
        mrRefs: p.mrRefs,
        planJson: JSON.stringify(p),
        testNotes: p.testNotes,
      });
      console.log(JSON.stringify({ planId: id }));
    });

  save
    .command("step <planId>")
    .description("Add a step to a test plan (linked to test case, MR, UI map)")
    .requiredOption("--run <runId>", "Run ID")
    .requiredOption("--order <n>", "Step order", parseInt)
    .requiredOption("--description <text>", "Step description")
    .requiredOption("--confidence <level>", "confident | uncertain")
    .option("--category <cat>", "functional | visual | accessibility | performance | security")
    .option("--priority <n>", "Priority (lower = higher priority)", parseInt)
    .option("--testcase <id>", "Linked test case ID")
    .option("--mr <ref>", "Linked MR reference")
    .option("--uimap-page <id>", "Linked UI map page ID")
    .option("--page-url <url>", "Page URL where this step executes")
    .option("--source <text>", "Why this step exists (MR diff, analysis, gap, etc.)")
    .action((planId, opts) => {
      const id = addStep({
        planId,
        runId: opts.run,
        order: opts.order,
        description: opts.description,
        confidence: opts.confidence,
        category: opts.category,
        priority: opts.priority,
        testcaseId: opts.testcase,
        mrRef: opts.mr,
        uimapPageId: opts.uimapPage,
        pageUrl: opts.pageUrl,
        source: opts.source,
      });
      console.log(JSON.stringify({ stepId: id }));
    });

  save
    .command("delete-plan")
    .description("Delete a test plan and all its steps")
    .option("--id <planId>", "Delete a specific plan")
    .option("--ticket <id>", "Delete all plans for a ticket")
    .option("--yes", "Skip confirmation")
    .action((opts) => {
      if (!opts.id && !opts.ticket) { console.error("Provide --id or --ticket"); process.exit(1); }
      if (!opts.yes) {
        const target = opts.id ? "plan " + opts.id.slice(0, 8) : "all plans for " + opts.ticket;
        console.log("This will delete " + target + " and all its steps. Run with --yes to confirm.");
        return;
      }
      if (opts.id) {
        const count = deletePlan(opts.id);
        console.log(JSON.stringify({ deleted: count > 0 }));
      } else {
        const count = deletePlansByTicket(opts.ticket);
        console.log(JSON.stringify({ deleted: count }));
      }
    });
}
