import type { Command } from "commander";
import chalk from "chalk";
import {
  createUiMap,
  getUiMap,
  listUiMaps,
  updateUiMap,
  deleteUiMap,
  resolveUiMap,
  upsertPage,
  getPage,
  listPages,
  updatePageStatus,
  upsertElement,
  listElements,
  lookupElements,
  hitElement,
  missElement,
  addAltSelector,
  updateElementStatus,
  getFlakyElements,
  upsertNavigation,
  listNavigations,
  findPath,
  upsertForm,
  listForms,
  getMapStats,
  scanSnapshotIntoPage,
} from "../../db/repositories/uimaps.js";
import { readFileSync } from "fs";

export function registerUiMapCommands(program: Command): void {
  const uimap = program
    .command("uimap")
    .description(
      "Manage UI maps — persistent knowledge base of app UI structure, selectors, and navigation",
    );

  // ── Map CRUD ──

  uimap
    .command("create")
    .description("Create a new UI map for an application")
    .requiredOption("--name <name>", "Map name (e.g. 'My App')")
    .option("--description <text>", "Description")
    .option("--repos <urls>", "Comma-separated repo URLs")
    .option("--targets <urls>", "Comma-separated target URLs")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .action((opts) => {
      const id = createUiMap({
        name: opts.name,
        description: opts.description,
        repoUrls: opts.repos
          ? (opts.repos as string).split(",").map((s: string) => s.trim())
          : undefined,
        targetUrls: opts.targets
          ? (opts.targets as string).split(",").map((s: string) => s.trim())
          : undefined,
        ticketIds: opts.tickets
          ? (opts.tickets as string).split(",").map((s: string) => s.trim())
          : undefined,
      });
      console.log(JSON.stringify({ uiMapId: id, name: opts.name }));
    });

  uimap
    .command("get <id>")
    .description("Get UI map details")
    .action((id) => {
      const map = getUiMap(id);
      if (!map) {
        console.error("UI map not found");
        process.exit(1);
      }
      const stats = getMapStats(id);
      console.log(JSON.stringify({ ...map, stats }));
    });

  uimap
    .command("list")
    .description("List all UI maps")
    .option("--json", "JSON output")
    .action((opts) => {
      const maps = listUiMaps();
      if (opts.json) {
        console.log(JSON.stringify(maps));
        return;
      }
      if (maps.length === 0) {
        console.log(chalk.dim("No UI maps."));
        return;
      }
      console.log(chalk.bold("\nUI Maps\n"));
      for (const m of maps) {
        const stats = getMapStats(m.id);
        const repos = JSON.parse(m.repo_urls) as string[];
        const targets = JSON.parse(m.target_urls) as string[];
        console.log(`  ${chalk.cyan(m.id.slice(0, 8))} ${chalk.bold(m.name)}`);
        console.log(
          `    ${chalk.dim(`${stats.pages}pg ${stats.elements}el ${stats.navigations}nav ${stats.forms}form`)} ${chalk.green(`${stats.working}ok`)} ${chalk.yellow(`${stats.flaky}flaky`)} ${chalk.red(`${stats.broken}broken`)}`,
        );
        if (repos.length)
          console.log(`    ${chalk.dim("repos:")} ${repos.join(", ")}`);
        if (targets.length)
          console.log(`    ${chalk.dim("targets:")} ${targets.join(", ")}`);
      }
      console.log();
    });

  uimap
    .command("resolve")
    .description("Find a UI map by ticket ID, repo URL, or target URL")
    .option("--ticket <id>", "Ticket ID")
    .option("--repo <url>", "Repository URL")
    .option("--target <url>", "Target URL")
    .action((opts) => {
      const map = resolveUiMap({
        ticketId: opts.ticket,
        repoUrl: opts.repo,
        targetUrl: opts.target,
      });
      if (!map) {
        console.log(JSON.stringify({ found: false }));
        return;
      }
      const stats = getMapStats(map.id);
      console.log(JSON.stringify({ found: true, ...map, stats }));
    });

  uimap
    .command("update <id>")
    .description("Update a UI map — add repos, targets, ticket IDs")
    .option("--name <name>", "Update name")
    .option("--description <text>", "Update description")
    .option("--add-repos <urls>", "Comma-separated repo URLs to add")
    .option("--add-targets <urls>", "Comma-separated target URLs to add")
    .option("--add-tickets <ids>", "Comma-separated ticket IDs to add")
    .action((id, opts) => {
      updateUiMap(id, {
        name: opts.name,
        description: opts.description,
        addRepos: opts.addRepos
          ? (opts.addRepos as string).split(",").map((s: string) => s.trim())
          : undefined,
        addTargets: opts.addTargets
          ? (opts.addTargets as string).split(",").map((s: string) => s.trim())
          : undefined,
        addTicketIds: opts.addTickets
          ? (opts.addTickets as string).split(",").map((s: string) => s.trim())
          : undefined,
      });
      console.log(JSON.stringify({ updated: true }));
    });

  uimap
    .command("delete <id>")
    .description("Delete a UI map and all its data")
    .option("--yes", "Skip confirmation")
    .action((id, opts) => {
      if (!opts.yes) {
        console.log(chalk.yellow("Run with --yes to confirm."));
        return;
      }
      deleteUiMap(id);
      console.log(chalk.green("UI map deleted."));
    });

  // ── Pages ──

  uimap
    .command("page <mapId>")
    .description("Record or update a page in the UI map (upserts by url)")
    .requiredOption(
      "--url <pattern>",
      "URL pattern (e.g. /login, /dashboard/:id)",
    )
    .option("--title <text>", "Page title")
    .option("--description <text>", "Description")
    .option("--snapshot <path>", "Accessibility snapshot file path")
    .option("--screenshot <path>", "Screenshot file path")
    .option("--auth-required", "Page requires authentication")
    .option("--auth-roles <roles>", "Comma-separated roles that can access")
    .option("--code <files>", "Comma-separated related code files")
    .option("--repos <urls>", "Comma-separated related repo URLs")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .option(
      "--parity <json>",
      'Target parity JSON (e.g. {"staging":true,"prod":false})',
    )
    .option("--run <runId>", "Run ID")
    .option("--session <sessionId>", "Session ID")
    .option("--ticket <id>", "Primary ticket ID for this action")
    .action((mapId, opts) => {
      const pageId = upsertPage({
        uiMapId: mapId,
        urlPattern: opts.url,
        pageTitle: opts.title,
        description: opts.description,
        snapshotPath: opts.snapshot,
        screenshotPath: opts.screenshot,
        authRequired: opts.authRequired,
        authRoles: opts.authRoles
          ? (opts.authRoles as string).split(",").map((s: string) => s.trim())
          : undefined,
        relatedCode: opts.code
          ? (opts.code as string).split(",").map((s: string) => s.trim())
          : undefined,
        relatedRepos: opts.repos
          ? (opts.repos as string).split(",").map((s: string) => s.trim())
          : undefined,
        ticketIds: opts.tickets
          ? (opts.tickets as string).split(",").map((s: string) => s.trim())
          : opts.ticket
            ? [opts.ticket]
            : undefined,
        targetParity: opts.parity ? JSON.parse(opts.parity) : undefined,
        createdByRun: opts.run,
        createdBySession: opts.session,
        createdByTicket: opts.ticket,
      });
      console.log(JSON.stringify({ pageId, url: opts.url }));
    });

  uimap
    .command("pages <mapId>")
    .description("List pages in a UI map")
    .option("--json", "JSON output")
    .action((mapId, opts) => {
      const pages = listPages(mapId);
      if (opts.json) {
        console.log(JSON.stringify(pages));
        return;
      }
      if (pages.length === 0) {
        console.log(chalk.dim("No pages."));
        return;
      }
      console.log(chalk.bold("\nPages\n"));
      for (const p of pages) {
        const statusColor =
          p.status === "active"
            ? chalk.green
            : p.status === "changed"
              ? chalk.yellow
              : chalk.red;
        const tickets = JSON.parse(p.ticket_ids) as string[];
        console.log(
          `  ${statusColor(p.status.padEnd(8))} ${chalk.cyan(p.url_pattern)} ${p.page_title || ""}`,
        );
        if (tickets.length)
          console.log(`    ${chalk.dim("tickets:")} ${tickets.join(", ")}`);
      }
      console.log();
    });

  // ── Elements ──

  uimap
    .command("element <pageId>")
    .description("Record or update an element on a page (upserts by selector)")
    .requiredOption("--selector <sel>", "CSS selector")
    .requiredOption(
      "--type <type>",
      "Element type: button|input|link|select|checkbox|radio|tab|menu|modal|text|image|other",
    )
    .option("--role <role>", "ARIA role")
    .option("--text <text>", "Visible text/label")
    .option("--name <name>", "Form name/id")
    .option(
      "--position <hint>",
      "Position hint: top-nav|sidebar|main|footer|modal|form|header",
    )
    .option(
      "--action <type>",
      "Action type: click|type|select|hover|scroll|toggle|submit",
    )
    .option("--result <text>", "What happens after the action")
    .option("--code <file>", "Related source code file:line")
    .option("--repos <urls>", "Comma-separated repo URLs")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .option("--auth-roles <roles>", "Comma-separated roles that can see this")
    .option("--parity <json>", "Target parity JSON")
    .option("--run <runId>", "Run ID")
    .option("--session <sessionId>", "Session ID")
    .option("--ticket <id>", "Primary ticket ID")
    .option("--testcase <id>", "Test case ID")
    .option(
      "--map <mapId>",
      "UI map ID (required if pageId is not directly under a map)",
    )
    .action((pageId, opts) => {
      const page = getPage(pageId);
      if (!page) {
        console.error("Page not found");
        process.exit(1);
      }

      const elementId = upsertElement({
        pageId,
        uiMapId: opts.map || page.ui_map_id,
        selector: opts.selector,
        elementType: opts.type,
        elementRole: opts.role,
        elementText: opts.text,
        elementName: opts.name,
        positionHint: opts.position,
        actionType: opts.action,
        actionResult: opts.result,
        relatedCode: opts.code,
        relatedRepos: opts.repos
          ? (opts.repos as string).split(",").map((s: string) => s.trim())
          : undefined,
        ticketIds: opts.tickets
          ? (opts.tickets as string).split(",").map((s: string) => s.trim())
          : opts.ticket
            ? [opts.ticket]
            : undefined,
        authRoles: opts.authRoles
          ? (opts.authRoles as string).split(",").map((s: string) => s.trim())
          : undefined,
        targetParity: opts.parity ? JSON.parse(opts.parity) : undefined,
        createdByRun: opts.run,
        createdBySession: opts.session,
        createdByTicket: opts.ticket,
        createdByTestcase: opts.testcase,
      });
      console.log(
        JSON.stringify({ elementId, selector: opts.selector, type: opts.type }),
      );
    });

  uimap
    .command("elements <pageId>")
    .description("List elements on a page")
    .option("--json", "JSON output")
    .action((pageId, opts) => {
      const elements = listElements(pageId);
      if (opts.json) {
        console.log(JSON.stringify(elements));
        return;
      }
      if (elements.length === 0) {
        console.log(chalk.dim("No elements."));
        return;
      }
      for (const e of elements) {
        const statusColor =
          e.status === "working"
            ? chalk.green
            : e.status === "flaky"
              ? chalk.yellow
              : chalk.red;
        const reliability =
          e.times_used > 0
            ? Math.round((e.times_succeeded / e.times_used) * 100)
            : 0;
        console.log(
          `  ${statusColor(e.status.padEnd(8))} ${chalk.cyan(e.element_type.padEnd(8))} ${e.selector.slice(0, 50)} ${e.element_text || ""} ${chalk.dim(`${reliability}% (${e.times_succeeded}/${e.times_used})`)}`,
        );
      }
    });

  // ── Reliability ──

  uimap
    .command("hit <elementId>")
    .description("Record a selector success (worked)")
    .option("--run <runId>", "Run ID")
    .action((elementId, opts) => {
      hitElement(elementId, opts.run);
      console.log(JSON.stringify({ hit: true }));
    });

  uimap
    .command("miss <elementId>")
    .description("Record a selector failure (didn't work)")
    .option("--run <runId>", "Run ID")
    .action((elementId, opts) => {
      missElement(elementId, opts.run);
      console.log(JSON.stringify({ miss: true }));
    });

  uimap
    .command("alt <elementId>")
    .description("Add an alternative selector to an element")
    .requiredOption("--selector <sel>", "Alternative CSS selector")
    .action((elementId, opts) => {
      addAltSelector(elementId, opts.selector);
      console.log(JSON.stringify({ added: true }));
    });

  uimap
    .command("flaky <mapId>")
    .description("List flaky and broken elements in a map")
    .option("--json", "JSON output")
    .action((mapId, opts) => {
      const elements = getFlakyElements(mapId);
      if (opts.json) {
        console.log(JSON.stringify(elements));
        return;
      }
      if (elements.length === 0) {
        console.log(chalk.green("No flaky or broken elements."));
        return;
      }
      for (const e of elements) {
        const statusColor = e.status === "flaky" ? chalk.yellow : chalk.red;
        const reliability =
          e.times_used > 0
            ? Math.round((e.times_succeeded / e.times_used) * 100)
            : 0;
        console.log(
          `  ${statusColor(e.status.padEnd(8))} ${e.selector.slice(0, 50)} ${chalk.dim(`${reliability}% (${e.times_failed} failures)`)}`,
        );
      }
    });

  // ── Lookup ──

  uimap
    .command("lookup")
    .description("Look up page elements by URL pattern")
    .requiredOption("--map <mapId>", "UI map ID")
    .requiredOption("--url <pattern>", "URL pattern to look up")
    .option("--type <elementType>", "Filter by element type")
    .option("--json", "JSON output")
    .action((opts) => {
      const elements = lookupElements(opts.map, opts.url, opts.type);
      if (opts.json) {
        console.log(JSON.stringify(elements));
        return;
      }
      if (elements.length === 0) {
        console.log(chalk.dim(`No elements found for ${opts.url}`));
        return;
      }
      console.log(chalk.bold(`\nElements at ${opts.url}\n`));
      for (const e of elements) {
        const statusColor =
          e.status === "working"
            ? chalk.green
            : e.status === "flaky"
              ? chalk.yellow
              : chalk.red;
        const reliability =
          e.times_used > 0
            ? `${Math.round((e.times_succeeded / e.times_used) * 100)}%`
            : "new";
        console.log(
          `  ${statusColor(e.status.padEnd(8))} ${chalk.cyan(e.element_type.padEnd(8))} ${e.selector}`,
        );
        console.log(
          `    ${e.element_text || ""} ${e.action_type ? `→ ${e.action_type}` : ""} ${e.action_result ? `→ ${e.action_result}` : ""} ${chalk.dim(reliability)}`,
        );
      }
      console.log();
    });

  // ── Navigation ──

  uimap
    .command("nav <mapId>")
    .description("Record a navigation between pages")
    .requiredOption("--from <pageId>", "Source page ID")
    .requiredOption("--to <pageId>", "Destination page ID")
    .option("--via <elementId>", "Element that triggers the navigation")
    .option(
      "--type <navType>",
      "Navigation type: click|redirect|form_submit|url_change",
      "click",
    )
    .option("--conditions <json>", "Conditions JSON array")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .option("--auth-roles <roles>", "Comma-separated roles")
    .option("--run <runId>", "Run ID")
    .option("--ticket <id>", "Primary ticket ID")
    .action((mapId, opts) => {
      const navId = upsertNavigation({
        uiMapId: mapId,
        fromPageId: opts.from,
        toPageId: opts.to,
        viaElementId: opts.via,
        navType: opts.type,
        conditions: opts.conditions ? JSON.parse(opts.conditions) : undefined,
        ticketIds: opts.tickets
          ? (opts.tickets as string).split(",").map((s: string) => s.trim())
          : opts.ticket
            ? [opts.ticket]
            : undefined,
        authRoles: opts.authRoles
          ? (opts.authRoles as string).split(",").map((s: string) => s.trim())
          : undefined,
        createdByRun: opts.run,
        createdByTicket: opts.ticket,
      });
      console.log(JSON.stringify({ navId }));
    });

  uimap
    .command("path")
    .description("Find navigation path between two URLs")
    .requiredOption("--map <mapId>", "UI map ID")
    .requiredOption("--from <url>", "Source URL pattern")
    .requiredOption("--to <url>", "Destination URL pattern")
    .action((opts) => {
      const path = findPath(opts.map, opts.from, opts.to);
      if (!path) {
        console.log(
          JSON.stringify({
            found: false,
            message: `No path from ${opts.from} to ${opts.to}`,
          }),
        );
        return;
      }
      console.log(
        JSON.stringify(
          {
            found: true,
            steps: path.length,
            path: path.map((s) => ({
              url: s.page.url_pattern,
              title: s.page.page_title,
              via: s.element
                ? {
                    selector: s.element.selector,
                    text: s.element.element_text,
                    action: s.element.action_type,
                  }
                : null,
              navType: s.nav?.nav_type,
            })),
          },
          null,
          2,
        ),
      );
    });

  // ── Forms ──

  uimap
    .command("form <pageId>")
    .description("Record or update a form on a page")
    .option("--selector <sel>", "Form CSS selector")
    .option("--name <name>", "Form name")
    .option(
      "--fields <json>",
      "Fields JSON array [{elementId, inputType, label}]",
    )
    .option("--submit <elementId>", "Submit button element ID")
    .option("--success <text>", "Success indicator description")
    .option("--error <text>", "Error indicator description")
    .option("--sample-values <json>", "Sample values JSON {fieldName: value}")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .option("--run <runId>", "Run ID")
    .option("--ticket <id>", "Primary ticket ID")
    .option("--map <mapId>", "UI map ID")
    .action((pageId, opts) => {
      const page = getPage(pageId);
      if (!page) {
        console.error("Page not found");
        process.exit(1);
      }

      const formId = upsertForm({
        pageId,
        uiMapId: opts.map || page.ui_map_id,
        formSelector: opts.selector,
        formName: opts.name,
        fields: opts.fields ? JSON.parse(opts.fields) : undefined,
        submitElementId: opts.submit,
        successIndicator: opts.success,
        errorIndicator: opts.error,
        sampleValues: opts.sampleValues
          ? JSON.parse(opts.sampleValues)
          : undefined,
        ticketIds: opts.tickets
          ? (opts.tickets as string).split(",").map((s: string) => s.trim())
          : opts.ticket
            ? [opts.ticket]
            : undefined,
        createdByRun: opts.run,
        createdByTicket: opts.ticket,
      });
      console.log(JSON.stringify({ formId }));
    });

  // ── Stats ──

  uimap
    .command("scan <pageId>")
    .description(
      "Parse an accessibility snapshot and bulk-record all elements + forms on a page",
    )
    .requiredOption("--snapshot <path>", "Path to accessibility snapshot file")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .option("--ticket <id>", "Primary ticket ID")
    .option("--run <runId>", "Run ID")
    .option("--session <sessionId>", "Session ID")
    .option("--testcase <id>", "Test case ID")
    .option("--map <mapId>", "UI map ID (auto-detected from page if omitted)")
    .action((pageId, opts) => {
      const page = getPage(pageId);
      if (!page) {
        console.error("Page not found");
        process.exit(1);
      }

      let snapshotText: string;
      try {
        snapshotText = readFileSync(opts.snapshot, "utf-8");
      } catch (err) {
        console.error(`Failed to read snapshot: ${err}`);
        process.exit(1);
      }

      const ticketIds = opts.tickets
        ? (opts.tickets as string).split(",").map((s: string) => s.trim())
        : opts.ticket
          ? [opts.ticket]
          : undefined;

      const result = scanSnapshotIntoPage(
        pageId,
        opts.map || page.ui_map_id,
        snapshotText,
        {
          ticketIds,
          runId: opts.run,
          sessionId: opts.session,
          testcaseId: opts.testcase,
        },
      );

      console.log(JSON.stringify(result));
    });

  uimap
    .command("stats <mapId>")
    .description("Show UI map statistics")
    .action((mapId) => {
      const map = getUiMap(mapId);
      if (!map) {
        console.error("UI map not found");
        process.exit(1);
      }
      const stats = getMapStats(mapId);
      console.log(JSON.stringify({ name: map.name, ...stats }));
    });
}
