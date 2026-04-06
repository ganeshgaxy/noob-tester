import type { Command } from "commander";
import chalk from "chalk";
import {
  addRepo,
  getRepo,
  listRepos,
  deleteRepo,
  addGroup,
  addRepoToGroup,
  listGroups,
  deleteGroup,
  getGroupRepos,
} from "../../db/repositories/repos.js";
import {
  syncRepo,
  indexRepo,
  indexRepoDiff,
  indexGroup,
  searchCode,
  searchWithContext,
  getRepoPath,
  ensureRepo,
  ensureRepos,
  discoverAndEnsure,
  switchRepoBranch,
  isIndexStale,
} from "../../indexer/index.js";

export function registerReposCommands(program: Command): void {
  const repos = program
    .command("repos")
    .description("Manage repositories and codebase index");

  // ── Add / list / delete repos ──

  repos
    .command("add <name> <url>")
    .description("Register a repository")
    .option("--description <text>", "Description")
    .action((name, url, opts) => {
      const id = addRepo(name, url, opts.description);
      console.log(JSON.stringify({ repoId: id, name, url }));
    });

  repos
    .command("list")
    .description("List all registered repos")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const all = listRepos() as Array<{
        name: string;
        url: string;
        description: string | null;
        local_path: string | null;
        last_synced: string | null;
      }>;

      if (opts.json) {
        console.log(JSON.stringify(all));
        return;
      }

      if (all.length === 0) {
        console.log(
          chalk.dim("No repos. Add one: noob-tester repos add <name> <url>"),
        );
        return;
      }

      console.log(chalk.bold("\n  Repositories\n"));
      for (const r of all) {
        const rr = r as Record<string, unknown>;
        const synced = r.last_synced
          ? chalk.green(`synced ${r.last_synced}`)
          : chalk.dim("not synced");
        const branch = rr.current_branch
          ? chalk.cyan(rr.current_branch as string)
          : "";
        const commit = rr.last_commit
          ? chalk.dim((rr.last_commit as string).slice(0, 8))
          : "";
        const indexed = rr.last_indexed
          ? chalk.green("indexed")
          : chalk.yellow("not indexed");
        const stale = rr.last_synced ? isIndexStale(r.name) : { stale: false };
        const staleTag = stale.stale
          ? chalk.yellow(` [STALE: ${stale.reason}]`)
          : "";
        console.log(`  ${chalk.cyan.bold(r.name)} ${chalk.dim(r.url)}`);
        console.log(
          `    ${synced} ${branch} ${commit} ${indexed}${staleTag}${r.description ? ` — ${r.description}` : ""}`,
        );
      }
      console.log();
    });

  repos
    .command("delete <name>")
    .description(
      "Remove a repo from the database and its index (does NOT delete local files)",
    )
    .option("--yes", "Skip confirmation")
    .action((name, opts) => {
      if (!opts.yes) {
        console.log(
          chalk.yellow(
            `Remove repo "${name}" from DB and index? Local files stay. Run with --yes.`,
          ),
        );
        return;
      }
      const ok = deleteRepo(name);
      console.log(JSON.stringify({ deleted: ok }));
    });

  repos
    .command("path <name>")
    .description("Get local path of a synced repo")
    .action((name) => {
      const p = getRepoPath(name);
      if (!p) {
        console.error(`Repo "${name}" not synced.`);
        process.exit(1);
      }
      console.log(p);
    });

  // ── Groups ──

  const group = repos.command("group").description("Manage repo groups");

  group
    .command("add <name>")
    .description("Create a repo group")
    .requiredOption("--repos <names>", "Comma-separated repo names")
    .option("--description <text>", "Description")
    .action((name, opts) => {
      addGroup(name, opts.description);
      const repoNames = (opts.repos as string)
        .split(",")
        .map((s: string) => s.trim());
      for (const rn of repoNames) {
        addRepoToGroup(name, rn);
      }
      console.log(JSON.stringify({ group: name, repos: repoNames }));
    });

  group
    .command("list")
    .description("List all repo groups")
    .action(() => {
      const groups = listGroups();
      if (groups.length === 0) {
        console.log(chalk.dim("No groups."));
        return;
      }
      console.log(chalk.bold("\n  Repo Groups\n"));
      for (const g of groups) {
        console.log(
          `  ${chalk.cyan.bold(g.name)} → ${g.repos.join(", ")}${g.description ? ` (${g.description})` : ""}`,
        );
      }
      console.log();
    });

  group
    .command("delete <name>")
    .description("Delete a repo group")
    .action((name) => {
      deleteGroup(name);
      console.log(JSON.stringify({ deleted: true }));
    });

  // ── Sync + Index ──

  repos
    .command("ensure <urls...>")
    .description(
      "Register + clone/pull + index repos in one command. Accepts URLs or names.",
    )
    .action((urls) => {
      const results = ensureRepos(urls);
      console.log(JSON.stringify(results));
    });

  repos
    .command("discover")
    .description(
      "Find all repos linked to a ticket (from runs, test cases, UI maps) and ensure them",
    )
    .requiredOption("--ticket <id>", "Ticket ID")
    .option("--url <urls...>", "Additional repo URLs to include")
    .action((opts) => {
      const result = discoverAndEnsure(opts.ticket, opts.url);
      console.log(JSON.stringify(result));
    });

  repos
    .command("sync <name>")
    .description(
      "Clone or pull a repo (or all repos in a group). --branch to checkout a specific branch. --reindex to re-index after sync if commit changed.",
    )
    .option(
      "--branch <branch>",
      "Checkout a specific branch after sync (e.g. feature/PROJ-123)",
    )
    .option("--reindex", "Re-index after sync if the commit changed")
    .action((name, opts) => {
      // Check if it's a group
      const groupRepos = getGroupRepos(name) as Array<{ name: string }>;
      if (groupRepos.length > 0) {
        console.log(
          chalk.bold(
            `\n  Syncing group "${name}" (${groupRepos.length} repos)\n`,
          ),
        );
        for (const r of groupRepos) {
          syncRepo(r.name);
          if (opts.branch) switchRepoBranch(r.name, opts.branch);
          if (opts.reindex) {
            const stale = isIndexStale(r.name);
            if (stale.stale) {
              console.log(
                chalk.dim(`  Re-indexing ${r.name} (${stale.reason})...`),
              );
              const s = indexRepoDiff(r.name);
              if (s.mode === "diff")
                console.log(
                  chalk.dim(
                    `    ${s.changedFiles} changed, ${s.files} re-indexed`,
                  ),
                );
            }
          }
          console.log(chalk.green(`  ✔ ${r.name}`));
        }
      } else {
        syncRepo(name);
        if (opts.branch) switchRepoBranch(name, opts.branch);
        if (opts.reindex) {
          const stale = isIndexStale(name);
          if (stale.stale) {
            console.log(
              chalk.dim(`  Re-indexing ${name} (${stale.reason})...`),
            );
            const s = indexRepoDiff(name);
            if (s.mode === "diff")
              console.log(
                chalk.dim(
                  `    ${s.changedFiles} changed, ${s.files} re-indexed`,
                ),
              );
          }
        }
        console.log(chalk.green(`  ✔ ${name} synced`));
      }
    });

  repos
    .command("index <name>")
    .description(
      "Build search index. Uses diff-aware re-index by default (only changed files). --full for complete rebuild.",
    )
    .option("--full", "Full re-index (delete and rebuild everything)")
    .action((name, opts) => {
      // Check if it's a group
      const groupRepos = getGroupRepos(name) as Array<{ name: string }>;
      if (groupRepos.length > 0) {
        console.log(
          chalk.bold(
            `\n  Indexing group "${name}"${opts.full ? " (full)" : ""}\n`,
          ),
        );
        if (opts.full) {
          const results = indexGroup(name);
          for (const [rn, stats] of Object.entries(results)) {
            console.log(
              `  ${chalk.green("✔")} ${rn}: ${stats.files} files, ${stats.imports} imports (full)`,
            );
          }
        } else {
          for (const r of groupRepos) {
            const stats = indexRepoDiff(r.name);
            if (stats.mode === "diff") {
              console.log(
                `  ${chalk.green("✔")} ${r.name}: ${stats.changedFiles ?? 0} changed, ${stats.files} re-indexed, ${stats.imports} imports (diff)`,
              );
            } else {
              console.log(
                `  ${chalk.green("✔")} ${r.name}: ${stats.files} files, ${stats.imports} imports (full)`,
              );
            }
          }
        }
      } else {
        console.log(
          chalk.dim(`  Indexing ${name}${opts.full ? " (full)" : ""}...`),
        );
        if (opts.full) {
          const stats = indexRepo(name);
          console.log(
            chalk.green(
              `  ✔ ${name}: ${stats.files} files, ${stats.imports} imports (full)`,
            ),
          );
        } else {
          const stats = indexRepoDiff(name);
          if (stats.mode === "diff") {
            console.log(
              chalk.green(
                `  ✔ ${name}: ${stats.changedFiles ?? 0} changed, ${stats.files} re-indexed, ${stats.imports} imports (diff)`,
              ),
            );
          } else {
            console.log(
              chalk.green(
                `  ✔ ${name}: ${stats.files} files, ${stats.imports} imports (full)`,
              ),
            );
          }
        }
      }
      console.log();
    });

  // ── Search ──

  repos
    .command("search <query>")
    .description("Search indexed codebases (BM25 + import graph)")
    .option("--repos <names>", "Comma-separated repo names to search")
    .option("--expand", "Include related files via import graph")
    .option("--limit <n>", "Max results", "15")
    .option("--json", "Output as JSON")
    .action((query, opts) => {
      const repoNames = opts.repos
        ? (opts.repos as string).split(",").map((s: string) => s.trim())
        : undefined;

      const results = searchWithContext(query, {
        repos: repoNames,
        limit: parseInt(opts.limit),
        expand: opts.expand ?? false,
      });

      if (opts.json) {
        console.log(JSON.stringify(results));
        return;
      }

      if (results.length === 0) {
        console.log(chalk.dim("No results."));
        return;
      }

      console.log(
        chalk.bold(`\n  ${results.length} result(s) for "${query}"\n`),
      );
      for (const r of results) {
        console.log(`  ${chalk.cyan(r.repo_name)}/${chalk.white(r.file_path)}`);
        console.log(
          chalk.dim(`    ${r.snippet.replace(/\n/g, " ").slice(0, 120)}`),
        );
        if (r.related && r.related.length > 0) {
          console.log(
            chalk.yellow(
              `    related: ${r.related.slice(0, 5).join(", ")}${r.related.length > 5 ? ` (+${r.related.length - 5})` : ""}`,
            ),
          );
        }
      }
      console.log();
    });
}
