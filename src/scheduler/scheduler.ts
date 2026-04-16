import cron from "node-cron";
import { spawn } from "child_process";
import { listScheduledAgents, recordExecution, updateLastRun, completeExecution } from "../db/repositories/scheduled-agents.js";
import { v4 as uuid } from "uuid";

interface ScheduledTask {
  id: string;
  task: cron.ScheduledTask;
}

const activeTasks = new Map<string, ScheduledTask>();

export function startScheduler(): void {
  console.log("Starting scheduler...");

  // Load all active scheduled agents
  const agents = listScheduledAgents({ status: "active" });
  console.log(`Found ${agents.length} active scheduled agents`);

  for (const agent of agents) {
    scheduleAgent(agent);
  }

  // Check for new agents every minute
  setInterval(() => {
    const agents = listScheduledAgents({ status: "active" });
    for (const agent of agents) {
      if (!activeTasks.has(agent.id)) {
        console.log(`New agent detected: ${agent.id}`);
        scheduleAgent(agent);
      }
    }
  }, 60000);
}

function scheduleAgent(agent: any): void {
  try {
    // Validate cron expression
    if (!cron.validate(agent.cron_expression)) {
      console.error(`Invalid cron expression for ${agent.id}: ${agent.cron_expression}`);
      return;
    }

    const task = cron.schedule(agent.cron_expression, () => {
      executeAgent(agent);
    });

    activeTasks.set(agent.id, { id: agent.id, task });
    console.log(`Scheduled agent ${agent.id}: ${agent.agent_path} on "${agent.cron_expression}"`);
  } catch (err) {
    console.error(`Failed to schedule agent ${agent.id}:`, err);
  }
}

function executeAgent(agent: any): void {
  const executionId = uuid();

  console.log(`\n→ Executing scheduled agent: ${agent.agent_path} (${agent.ticket_id})`);
  console.log(`  Execution ID: ${executionId}`);

  // Record execution start
  recordExecution({
    schedule_id: agent.id,
    status: "running",
  });

  // Build the Claude invocation
  const params = agent.parameters || {};
  const invocation = buildInvocation(agent.agent_path, agent.ticket_id, params);

  // Spawn the agent process
  const agentProcess = spawn("claude", ["-p", invocation], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  let stdout = "";
  let stderr = "";

  if (agentProcess.stdout) {
    agentProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });
  }

  if (agentProcess.stderr) {
    agentProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });
  }

  agentProcess.on("close", (exitCode) => {
    const success = exitCode === 0;
    const status = success ? "success" : "failed";

    console.log(`✓ Execution ${status}: ${agent.agent_path} (exit code: ${exitCode})`);

    // Record execution completion
    completeExecution(executionId, {
      status,
      exit_code: exitCode || undefined,
      logs: stdout || undefined,
    });

    // Update last run time
    updateLastRun(agent.id);
  });

  agentProcess.on("error", (err) => {
    console.error(`✗ Execution error: ${agent.agent_path}:`, err.message);
    completeExecution(executionId, {
      status: "failed",
      exit_code: -1,
    });
  });
}

function buildInvocation(agentPath: string, ticketId: string, params: Record<string, any>): string {
  let inv = `run agent ${agentPath} for ticket ${ticketId}`;

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (typeof value === "string") {
        inv += ` with ${key} "${value}"`;
      } else if (typeof value === "number") {
        inv += ` with ${key} ${value}`;
      } else if (typeof value === "boolean") {
        inv += ` with ${key} ${value}`;
      } else if (Array.isArray(value)) {
        inv += ` with ${key} [${value.join(", ")}]`;
      }
    }
  }

  return inv;
}

export function stopScheduler(): void {
  console.log("Stopping scheduler...");
  for (const [id, scheduled] of activeTasks) {
    scheduled.task.stop();
    console.log(`Stopped scheduled agent: ${id}`);
  }
  activeTasks.clear();
}

export function pauseAgent(agentId: string): void {
  const scheduled = activeTasks.get(agentId);
  if (scheduled) {
    scheduled.task.stop();
    console.log(`Paused scheduled agent: ${agentId}`);
  }
}

export function resumeAgent(agent: any): void {
  const scheduled = activeTasks.get(agent.id);
  if (scheduled) {
    scheduled.task.start();
  } else {
    scheduleAgent(agent);
  }
  console.log(`Resumed scheduled agent: ${agent.id}`);
}
