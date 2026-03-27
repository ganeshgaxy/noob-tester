import type { Command } from "commander";
import chalk from "chalk";
import {
  addTarget,
  deleteTarget,
  listTargets,
  getTargetByName,
  setSecret,
  deleteSecret,
  deleteRole,
  listSecrets,
  findSecretsByValue,
  getRolesForTarget,
  resolveProfile,
  resolveProfileByUrl,
  maskValue,
  deleteAllSecrets,
  importFromOnePassword,
} from "../../secrets/store.js";

export function registerSecretsCommands(program: Command): void {
  const secrets = program
    .command("secrets")
    .description("Manage credentials scoped to targets (environments/apps) and roles");

  // ── Target management ──

  const target = secrets.command("target").description("Manage targets (environments, apps, tenants)");

  target
    .command("add <name>")
    .description("Register a target")
    .option("--url <url>", "Target URL (e.g. https://staging.app.com)")
    .option("--description <text>", "Description")
    .action((name, opts) => {
      const id = addTarget(name, opts.url, opts.description);
      console.log(JSON.stringify({ targetId: id, name }));
    });

  target
    .command("list")
    .description("List all targets")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const targets = listTargets() as Array<{
        name: string; url: string | null; description: string | null;
      }>;

      if (opts.json) {
        console.log(JSON.stringify(targets, null, 2));
        return;
      }

      if (targets.length === 0) {
        console.log(chalk.dim("No targets. Add one: noob-tester secrets target add <name> --url <url>"));
        return;
      }

      console.log(chalk.bold("\n  Targets\n"));
      for (const t of targets) {
        const roles = getRolesForTarget(t.name);
        console.log(`  ${chalk.cyan.bold(t.name)} ${chalk.dim(t.url ?? "no url")}`);
        if (t.description) console.log(chalk.dim(`    ${t.description}`));
        if (roles.length > 0) console.log(chalk.dim(`    roles: ${roles.join(", ")}`));
      }
      console.log();
    });

  target
    .command("delete <name>")
    .description("Delete a target and all its secrets")
    .option("--yes", "Skip confirmation")
    .action((name, opts) => {
      if (!opts.yes) {
        console.log(chalk.yellow(`This will delete target "${name}" and all its secrets. Run with --yes.`));
        return;
      }
      const ok = deleteTarget(name);
      console.log(JSON.stringify({ deleted: ok }));
    });

  // ── Set / Get / Delete secrets ──

  secrets
    .command("set <key> <value>")
    .description("Set a secret. Value can be literal, env:VAR, or op:vault/item/field")
    .requiredOption("-t, --target <name>", "Target name")
    .option("-r, --role <role>", "Role name", "default")
    .action((key, value, opts) => {
      setSecret(opts.target, opts.role, key, value);
      console.log(JSON.stringify({ target: opts.target, role: opts.role, key }));
    });

  secrets
    .command("get-profile")
    .description("Get all resolved secrets for a target + role")
    .option("-t, --target <name>", "Target name")
    .option("-u, --url <url>", "Match target by URL")
    .option("-r, --role <role>", "Role name", "default")
    .action((opts) => {
      let resolved: Record<string, string> | null;
      if (opts.url) {
        resolved = resolveProfileByUrl(opts.url, opts.role);
        if (!resolved) {
          console.error(`No target found matching URL: ${opts.url}`);
          process.exit(1);
        }
      } else if (opts.target) {
        resolved = resolveProfile(opts.target, opts.role);
      } else {
        console.error("Provide --target or --url");
        process.exit(1);
      }
      console.log(JSON.stringify(resolved, null, 2));
    });

  secrets
    .command("delete <key>")
    .description("Delete a secret")
    .requiredOption("-t, --target <name>", "Target name")
    .option("-r, --role <role>", "Role name", "default")
    .action((key, opts) => {
      const ok = deleteSecret(opts.target, opts.role, key);
      console.log(JSON.stringify({ deleted: ok }));
    });

  secrets
    .command("delete-role")
    .description("Delete all secrets for a target + role")
    .requiredOption("-t, --target <name>", "Target name")
    .requiredOption("-r, --role <role>", "Role name")
    .action((opts) => {
      const ok = deleteRole(opts.target, opts.role);
      console.log(JSON.stringify({ deleted: ok }));
    });

  // ── Query ──

  secrets
    .command("list")
    .description("List secrets (values masked)")
    .option("-t, --target <name>", "Filter by target name")
    .option("-u, --url <url>", "Filter by target URL")
    .option("-r, --role <role>", "Filter by role")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const items = listSecrets({
        target: opts.target,
        url: opts.url,
        role: opts.role,
      }) as Array<{
        target_name: string; target_url: string | null; role: string;
        key: string; value: string; source_type: string;
      }>;

      if (opts.json) {
        console.log(JSON.stringify(items.map((i) => ({
          ...i,
          value: maskValue(i.value),
        })), null, 2));
        return;
      }

      if (items.length === 0) {
        console.log(chalk.dim("No secrets found."));
        return;
      }

      console.log(chalk.bold("\n  Secrets\n"));
      let currentTarget = "";
      let currentRole = "";
      for (const item of items) {
        if (item.target_name !== currentTarget) {
          currentTarget = item.target_name;
          console.log(chalk.cyan.bold(`  [${currentTarget}]`) + chalk.dim(` ${item.target_url ?? ""}`));
        }
        if (item.role !== currentRole) {
          currentRole = item.role;
          console.log(chalk.yellow(`    @${currentRole}`));
        }

        const srcTag =
          item.source_type === "env"
            ? chalk.yellow("env")
            : item.source_type === "1password"
              ? chalk.blue("op ")
              : chalk.dim("lit");

        console.log(
          `      ${chalk.white(item.key.padEnd(25))} ${srcTag}  ${chalk.dim(maskValue(item.value))}`
        );
      }
      console.log();
    });

  secrets
    .command("find <search>")
    .description("Find secrets by key or value (e.g. email address, variable name)")
    .action((search) => {
      const results = findSecretsByValue(search) as Array<{
        target_name: string; role: string; key: string; value: string; source_type: string;
      }>;

      if (results.length === 0) {
        console.log(chalk.dim(`No secrets matching "${search}".`));
        return;
      }

      console.log(chalk.bold(`\n  Found ${results.length} match(es):\n`));
      for (const r of results) {
        console.log(
          `  ${chalk.cyan(r.target_name)}/${chalk.yellow(r.role)}  ${chalk.white(r.key)} = ${chalk.dim(maskValue(r.value))}`
        );
      }
      console.log();
    });

  // ── 1Password Import ──

  secrets
    .command("import-op <opRef>")
    .description(
      "Import all fields from a 1Password item. opRef = vault/item (e.g. Private/MyApp)"
    )
    .requiredOption("-t, --target <name>", "Target name")
    .option("-r, --role <role>", "Role name", "default")
    .option("--live", "Store as op: references (always fetched fresh) instead of resolved values")
    .option("--map <mapping...>", "Custom field mapping: label=KEY_NAME (repeatable)")
    .option("--prefix <prefix>", "Prefix all key names (e.g. APP_)")
    .action((opRef, opts) => {
      // Parse --map flags into a Record
      const fieldMap: Record<string, string> = {};
      if (opts.map) {
        for (const m of opts.map as string[]) {
          const [label, keyName] = m.split("=");
          if (label && keyName) fieldMap[label.toLowerCase()] = keyName;
        }
      }

      try {
        const imported = importFromOnePassword(opRef, opts.target, opts.role, {
          live: opts.live ?? false,
          fieldMap: Object.keys(fieldMap).length > 0 ? fieldMap : undefined,
          prefix: opts.prefix,
        });

        if (imported.length === 0) {
          console.log(chalk.yellow("No fields imported. The 1Password item may be empty."));
          return;
        }

        console.log(chalk.bold(`\n  Imported ${imported.length} field(s) → ${opts.target}/${opts.role}\n`));
        for (const f of imported) {
          const srcTag =
            f.source === "env"
              ? chalk.yellow("env")
              : f.source === "1password"
                ? chalk.blue("op ")
                : chalk.dim("lit");
          console.log(`  ${srcTag}  ${chalk.white(f.key.padEnd(25))} ${chalk.dim(`← ${f.label}`)}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(`Import failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}
