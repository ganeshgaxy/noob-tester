import { getDb, isVssAvailable } from "../client.js";
import chalk from "chalk";

/** Placeholder — full implementation in the indexer step. */
export async function indexRepo(repoUrl: string): Promise<void> {
  console.log(chalk.bold(`\nIndexing repo: ${repoUrl}\n`));

  if (!isVssAvailable()) {
    console.log(
      chalk.yellow(
        "⚠ sqlite-vss not available. Install it for vector search:\n" +
          "  npm install sqlite-vss\n" +
          "  Falling back to keyword search.\n"
      )
    );
  }

  // TODO: Implement in step 12 (indexer command)
  // 1. Clone/pull repo via glab
  // 2. Walk files, split into chunks
  // 3. Generate embeddings
  // 4. Store in code_chunks + code_embeddings tables
  console.log(chalk.dim("Indexer not yet implemented."));
}

/** Search indexed code by keyword (fallback when vss unavailable). */
export function keywordSearch(
  query: string,
  limit: number = 5
): Array<{ filePath: string; content: string }> {
  return getDb()
    .prepare(
      `SELECT file_path, content FROM code_chunks
       WHERE content LIKE ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(`%${query}%`, limit) as Array<{
    filePath: string;
    content: string;
  }>;
}
