import type { Command } from "commander";
import chalk from "chalk";
import { getDb } from "../../db/client.js";
import { randomUUID } from "crypto";
import { createInterface } from "readline";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuthSession {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  org_id: string;
  org_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_at: string | null;
  anttest_url: string;
  auth_method: string;
  created_at: string;
  last_used_at: string;
  is_active: number;
}

interface TokenValidationResponse {
  valid: boolean;
  user: {
    id: string;
    email: string;
    name?: string;
  };
  organization: {
    id: string;
    name?: string;
  } | null;
}

interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
  organization: {
    id: string;
    name?: string;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository functions
// ─────────────────────────────────────────────────────────────────────────────

function getActiveSession(): AuthSession | null {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM auth_sessions WHERE is_active = 1 ORDER BY last_used_at DESC LIMIT 1`,
    )
    .get() as AuthSession | null;
}

function deactivateAllSessions(): void {
  const db = getDb();
  db.prepare(`UPDATE auth_sessions SET is_active = 0`).run();
}

function createAuthSession(data: {
  userId: string;
  userEmail: string;
  userName?: string;
  orgId: string;
  orgName?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  anttestUrl: string;
  authMethod: "token" | "password";
}): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO auth_sessions (id, user_id, user_email, user_name, org_id, org_name, access_token, refresh_token, expires_at, anttest_url, auth_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    data.userId,
    data.userEmail,
    data.userName ?? null,
    data.orgId,
    data.orgName ?? null,
    data.accessToken,
    data.refreshToken ?? null,
    data.expiresAt ?? null,
    data.anttestUrl,
    data.authMethod,
  );
  return id;
}

function updateSessionLastUsed(sessionId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE auth_sessions SET last_used_at = datetime('now') WHERE id = ?`,
  ).run(sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

async function validateToken(
  token: string,
  anttestUrl: string,
): Promise<TokenValidationResponse> {
  const res = await fetch(`${anttestUrl}/api/cli/auth/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  if (!res.ok)
    throw new Error(`Token validation failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<TokenValidationResponse>;
}

async function loginWithPassword(
  email: string,
  password: string,
  anttestUrl: string,
): Promise<LoginResponse> {
  const res = await fetch(`${anttestUrl}/api/cli/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Login failed: ${res.status} ${errBody}`);
  }
  return res.json() as Promise<LoginResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    if (!hidden) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
    // Hidden input for passwords
    process.stdout.write(question);
    let answer = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (char) => {
      const c = char.toString();
      if (c === "\n" || c === "\r") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        rl.close();
        resolve(answer);
      } else if (c === "\u0003") {
        process.exit();
      } else if (c === "\u007F") {
        answer = answer.slice(0, -1);
      } else {
        answer += c;
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Command registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerAuthCommands(program: Command): void {
  // Login command
  program
    .command("login")
    .description("Authenticate with AntTest for cloud sync")
    .option("-t, --token <token>", "API token from AntTest dashboard")
    .option("-u, --url <url>", "AntTest server URL", "https://anttest.app")
    .action(async (opts) => {
      const anttestUrl = opts.url as string;

      try {
        // Option B: API Token login
        if (opts.token) {
          console.log(chalk.blue("→ Validating API token..."));
          const validation = await validateToken(opts.token, anttestUrl);

          if (!validation.valid) {
            console.error(chalk.red("✗ Invalid token"));
            process.exit(1);
          }

          deactivateAllSessions();
          createAuthSession({
            userId: validation.user.id,
            userEmail: validation.user.email,
            userName: validation.user.name,
            orgId: validation.organization?.id ?? "",
            orgName: validation.organization?.name,
            accessToken: opts.token,
            anttestUrl,
            authMethod: "token",
          });

          console.log(chalk.green(`✓ Logged in as ${validation.user.email}`));
          if (validation.organization) {
            console.log(
              chalk.dim(
                `  Organization: ${validation.organization.name || validation.organization.id}`,
              ),
            );
          }
          return;
        }

        // Option C: Interactive email/password login
        console.log(chalk.blue("AntTest Login"));
        console.log(chalk.dim(`Server: ${anttestUrl}\n`));

        const email = await prompt("Email: ");
        const password = await prompt("Password: ", true);

        console.log(chalk.blue("\n→ Authenticating..."));
        const loginRes = await loginWithPassword(email, password, anttestUrl);

        deactivateAllSessions();
        createAuthSession({
          userId: loginRes.user.id,
          userEmail: loginRes.user.email,
          userName: loginRes.user.name,
          orgId: loginRes.organization?.id ?? "",
          orgName: loginRes.organization?.name,
          accessToken: loginRes.accessToken,
          refreshToken: loginRes.refreshToken,
          expiresAt: loginRes.expiresAt,
          anttestUrl,
          authMethod: "password",
        });

        console.log(chalk.green(`✓ Logged in as ${loginRes.user.email}`));
        if (loginRes.organization) {
          console.log(
            chalk.dim(
              `  Organization: ${loginRes.organization.name || loginRes.organization.id}`,
            ),
          );
        }
      } catch (err) {
        console.error(chalk.red(`✗ Login failed: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Logout command
  program
    .command("logout")
    .description("Log out from AntTest")
    .action(() => {
      const session = getActiveSession();
      if (!session) {
        console.log(chalk.yellow("Not logged in."));
        return;
      }

      deactivateAllSessions();
      console.log(chalk.green(`✓ Logged out from ${session.user_email}`));
    });

  // Whoami command
  program
    .command("whoami")
    .description("Show current login status")
    .action(() => {
      const session = getActiveSession();
      if (!session) {
        console.log(
          chalk.yellow("Not logged in. Run `nt login` to authenticate."),
        );
        process.exit(1);
      }

      console.log(chalk.green("✓ Logged in"));
      console.log(
        `  User:    ${session.user_email}${session.user_name ? ` (${session.user_name})` : ""}`,
      );
      console.log(`  Org:     ${session.org_name || session.org_id}`);
      console.log(`  Server:  ${session.anttest_url}`);
      console.log(`  Method:  ${session.auth_method}`);
      console.log(chalk.dim(`  Since:   ${session.created_at}`));
    });
}

export function getAuthSession(): AuthSession | null {
  return getActiveSession();
}

export function requireAuth(): AuthSession {
  const session = getActiveSession();
  if (!session) {
    console.error(chalk.red("✗ Not logged in. Run `nt login` first."));
    process.exit(1);
  }
  updateSessionLastUsed(session.id);
  return session;
}
