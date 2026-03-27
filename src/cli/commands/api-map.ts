import type { Command } from "commander";
import {
  resolveApiMap,
  upsertEndpoint,
  recordEndpointCall,
  addParam,
  upsertResponse,
  addChain,
  getEndpointByMethodPath,
  getFullApiMap,
  getApiMapStats,
  listApiMaps,
  getApiMapByName,
} from "../../db/repositories/api-map.js";

export function registerApiMapCommands(program: Command): void {
  const am = program.command("apimap").description("API Maps — register endpoints, params, responses, chains, track health");

  am.command("resolve <name>")
    .description("Resolve (find or create) an API map by name")
    .option("--base-url <url>", "Base URL for the API")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .option("--repos <urls>", "Comma-separated repo URLs")
    .action((name, opts) => {
      const result = resolveApiMap({
        name,
        baseUrl: opts.baseUrl,
        ticketIds: opts.tickets?.split(","),
        repoUrls: opts.repos?.split(","),
      });
      console.log(JSON.stringify(result));
    });

  am.command("endpoint <apiMapId>")
    .description("Register or update an endpoint")
    .requiredOption("--method <method>", "HTTP method (GET, POST, PUT, DELETE, PATCH)")
    .requiredOption("--path <path>", "Endpoint path (e.g. /api/users/:id)")
    .option("--summary <text>", "Brief description")
    .option("--auth-type <type>", "Auth type: none, bearer, api_key, session, basic")
    .option("--auth-roles <roles>", "Comma-separated roles")
    .option("--content-type <type>", "Request content type")
    .option("--run <runId>", "Run that discovered this endpoint")
    .option("--ticket <ticketId>", "Ticket associated with this endpoint")
    .action((apiMapId, opts) => {
      const id = upsertEndpoint({
        apiMapId,
        method: opts.method,
        path: opts.path,
        summary: opts.summary,
        authType: opts.authType,
        authRoles: opts.authRoles?.split(","),
        requestContentType: opts.contentType,
        createdByRun: opts.run,
        createdByTicket: opts.ticket,
        ticketIds: opts.ticket ? [opts.ticket] : undefined,
      });
      console.log(JSON.stringify({ endpointId: id }));
    });

  am.command("call <endpointId>")
    .description("Record an endpoint call result (updates health stats)")
    .requiredOption("--status <code>", "HTTP status code", parseInt)
    .requiredOption("--time <ms>", "Response time in ms", parseFloat)
    .option("--run <runId>", "Run ID")
    .action((endpointId, opts) => {
      recordEndpointCall(endpointId, opts.status, opts.time, opts.run);
      console.log(JSON.stringify({ ok: true }));
    });

  am.command("param <endpointId>")
    .description("Add a parameter to an endpoint")
    .requiredOption("--name <name>", "Parameter name")
    .requiredOption("--in <location>", "Location: path, query, body, header")
    .option("--type <type>", "Parameter type (string, number, boolean, object, array)")
    .option("--required", "Mark as required")
    .option("--description <text>", "Description")
    .option("--example <value>", "Example value")
    .option("--validation <rule>", "Validation rule (e.g. min:1, max:100, email)")
    .option("--map <apiMapId>", "API map ID (required)")
    .action((endpointId, opts) => {
      const id = addParam({
        endpointId,
        apiMapId: opts.map,
        name: opts.name,
        location: opts.in,
        paramType: opts.type,
        required: opts.required,
        description: opts.description,
        exampleValue: opts.example,
        validation: opts.validation,
      });
      console.log(JSON.stringify({ paramId: id }));
    });

  am.command("response <endpointId>")
    .description("Register an expected response for an endpoint")
    .requiredOption("--status <code>", "HTTP status code", parseInt)
    .option("--description <text>", "Description")
    .option("--schema <json>", "Response schema as JSON")
    .option("--example <json>", "Example response body as JSON")
    .option("--map <apiMapId>", "API map ID (required)")
    .action((endpointId, opts) => {
      const id = upsertResponse({
        endpointId,
        apiMapId: opts.map,
        statusCode: opts.status,
        description: opts.description,
        schemaJson: opts.schema,
        exampleJson: opts.example,
      });
      console.log(JSON.stringify({ responseId: id }));
    });

  am.command("chain <apiMapId>")
    .description("Add a dependency chain between endpoints")
    .requiredOption("--from <endpointId>", "Source endpoint ID")
    .requiredOption("--to <endpointId>", "Target endpoint ID")
    .option("--type <type>", "Chain type: depends, creates, reads, updates, deletes, cleanup")
    .option("--description <text>", "Description of the dependency")
    .option("--run <runId>", "Run that discovered this chain")
    .option("--tickets <ids>", "Comma-separated ticket IDs")
    .action((apiMapId, opts) => {
      const id = addChain({
        apiMapId,
        fromEndpointId: opts.from,
        toEndpointId: opts.to,
        chainType: opts.type,
        description: opts.description,
        createdByRun: opts.run,
        ticketIds: opts.tickets?.split(","),
      });
      console.log(JSON.stringify({ chainId: id }));
    });

  am.command("lookup <apiMapId>")
    .description("Look up an endpoint by method + path")
    .requiredOption("--method <method>", "HTTP method")
    .requiredOption("--path <path>", "Endpoint path")
    .action((apiMapId, opts) => {
      const ep = getEndpointByMethodPath(apiMapId, opts.method, opts.path);
      console.log(JSON.stringify(ep ?? { found: false }));
    });

  am.command("list")
    .description("List all API maps")
    .action(() => {
      const maps = listApiMaps();
      console.log(JSON.stringify(maps));
    });

  am.command("get <nameOrId>")
    .description("Get full API map data (endpoints, params, responses, chains)")
    .option("--json", "JSON output")
    .action((nameOrId) => {
      const map = getApiMapByName(nameOrId);
      const id = map?.id ?? nameOrId;
      const full = getFullApiMap(id);
      console.log(JSON.stringify(full));
    });

  am.command("stats <nameOrId>")
    .description("Get API map statistics")
    .action((nameOrId) => {
      const map = getApiMapByName(nameOrId);
      const id = map?.id ?? nameOrId;
      const stats = getApiMapStats(id);
      console.log(JSON.stringify(stats));
    });
}
