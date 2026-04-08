import type { Command } from "commander";
import chalk from "chalk";
import { getDb, dataDir } from "../../db/client.js";
import { existsSync, statSync, mkdirSync, copyFileSync } from "fs";
import { extname, resolve as resolvePath, join, basename } from "path";
import { v4 as uuidv4 } from "uuid";

export function registerFilesCommands(program: Command): void {
  const files = program
    .command("files")
    .description("Manage default local files for agent-browser upload");

  files
    .command("list")
    .description("List all registered default files")
    .option("--json", "Output as JSON")
    .option(
      "--type <type>",
      "Filter by file type (document, pdf, image, spreadsheet, video, archive, other)",
    )
    .action((opts) => {
      const db = getDb();
      let rows: any[];
      if (opts.type) {
        rows = db
          .prepare(
            "SELECT * FROM default_files WHERE file_type = ? ORDER BY label",
          )
          .all(opts.type);
      } else {
        rows = db
          .prepare("SELECT * FROM default_files ORDER BY file_type, label")
          .all();
      }
      if (opts.json) {
        const enriched = rows.map((r: any) => ({
          ...r,
          exists: existsSync(r.file_path),
        }));
        console.log(JSON.stringify(enriched, null, 2));
        return;
      }
      if (rows.length === 0) {
        console.log(
          chalk.dim(
            "No files registered. Use 'noob-tester files add' to register one.",
          ),
        );
        return;
      }
      for (const r of rows as any[]) {
        const exists = existsSync(r.file_path);
        const badge = exists ? chalk.green("✓") : chalk.red("✗ missing");
        console.log(
          `${badge} ${chalk.cyan(r.label)} (${r.file_type}) → ${chalk.dim(r.file_path)}`,
        );
        if (r.description) console.log(`  ${chalk.dim(r.description)}`);
      }
    });

  files
    .command("add")
    .description("Register a local file for upload")
    .requiredOption("--label <label>", "Human-readable label")
    .requiredOption("--path <path>", "Absolute file path")
    .option(
      "--type <type>",
      "File type (document, pdf, image, spreadsheet, video, archive, other)",
      "document",
    )
    .option("--description <desc>", "Optional description")
    .action((opts) => {
      const resolved = resolvePath(opts.path);
      let size = 0;
      let mime = "";
      if (existsSync(resolved)) {
        size = statSync(resolved).size;
        const ext = extname(resolved).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".pdf": "application/pdf",
          ".doc": "application/msword",
          ".docx":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ".xls": "application/vnd.ms-excel",
          ".xlsx":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ".csv": "text/csv",
          ".txt": "text/plain",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
          ".mp4": "video/mp4",
          ".webm": "video/webm",
          ".json": "application/json",
          ".xml": "application/xml",
          ".zip": "application/zip",
        };
        mime = mimeMap[ext] || "application/octet-stream";
      } else {
        console.log(
          chalk.yellow(`Warning: file does not exist at ${resolved}`),
        );
      }
      // Copy file into ~/.noob-tester/files/
      const id = uuidv4();
      const filesDir = join(dataDir(), "files");
      mkdirSync(filesDir, { recursive: true });
      const destPath = join(filesDir, id + "-" + basename(resolved));
      copyFileSync(resolved, destPath);

      const db = getDb();
      db.prepare(
        "INSERT INTO default_files (id, label, file_path, file_type, mime_type, file_size, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        opts.label,
        destPath,
        opts.type,
        mime,
        size,
        opts.description || null,
      );
      console.log(chalk.green(`✓ Registered: ${opts.label} → ${destPath}`));
    });

  files
    .command("delete")
    .description("Remove a registered file by label")
    .argument("<label>", "File label to delete")
    .action((label) => {
      const db = getDb();
      const row = db
        .prepare("SELECT id FROM default_files WHERE label = ?")
        .get(label) as any;
      if (!row) {
        console.log(chalk.red(`No file found with label "${label}"`));
        return;
      }
      db.prepare("DELETE FROM default_files WHERE id = ?").run(row.id);
      console.log(chalk.green(`✓ Deleted: ${label}`));
    });
}
