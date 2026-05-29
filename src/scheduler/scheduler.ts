import cron from "node-cron";
import { spawn } from "child_process";
import {
  listScheduledAgents,
  updateLastRun,
} from "../db/repositories/scheduled-agents.js";
import {
  createAgentRun,
  finishAgentRun,
  hasAgentRunForTicket,
} from "../db/repositories/agent-runs.js";
import {
  listTicketWorkflows,
  recordWorkflowPollingRun,
  wasPolledToday,
} from "../db/repositories/ticket-workflow.js";

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
      console.error(
        `Invalid cron expression for ${agent.id}: ${agent.cron_expression}`,
      );
      return;
    }

    const task = cron.schedule(agent.cron_expression, () => {
      executeAgent(agent);
    });

    activeTasks.set(agent.id, { id: agent.id, task });
    console.log(
      `Scheduled agent ${agent.id}: ${agent.agent_path} on "${agent.cron_expression}"`,
    );
  } catch (err) {
    console.error(`Failed to schedule agent ${agent.id}:`, err);
  }
}

function spawnClaudeProcess(
  fullPrompt: string,
  displayCmd: string,
  agentName: string,
  ticketId: string | null,
  scheduleId: string,
): void {
  const run = createAgentRun({
    page: "scheduler",
    agent_name: agentName,
    ticket_id: ticketId,
    command: displayCmd,
  });

  const spawnEnv = { ...process.env, FORCE_COLOR: "0" };
  delete spawnEnv.ANTHROPIC_API_KEY;
  const agentProcess = spawn("claude", ["-p", fullPrompt], {
    cwd: process.cwd(),
    env: spawnEnv,
    stdio: ["ignore", "ignore", "ignore"],
    detached: false,
  });

  let finished = false;
  const finish = (exitCode: number) => {
    if (finished) return;
    finished = true;
    const status = exitCode === 0 ? "done" : "failed";
    console.log(`✓ Scheduled run ${status}: ${agentName} (exit: ${exitCode})`);
    finishAgentRun(run.id, status, exitCode);
    updateLastRun(scheduleId);
  };

  agentProcess.on("close", (code) => finish(code ?? -1));
  agentProcess.on("error", (err) => {
    console.error(`✗ Scheduled run error: ${agentName}:`, err.message);
    finish(1);
  });
}

function executeAgent(agent: any): void {
  const params = (agent.parameters || {}) as Record<string, any>;
  const agentPath = agent.agent_path || "";
  const agentName = agentPath.split("/").pop() || agentPath;
  const scheduleType = params.type || "polling";

  if (scheduleType === "workflow") {
    executeWorkflowAgent(agent, agentPath, agentName, params);
  } else {
    executePollingAgent(agent, agentPath, agentName, params);
  }
}

function executePollingAgent(
  agent: any,
  agentPath: string,
  agentName: string,
  params: Record<string, any>,
): void {
  const prompt = typeof params.prompt === "string" ? params.prompt : "";
  const fullPrompt = `use agent @${agentPath} to run ticket polling on ${prompt}`;
  const displayCmd = `claude -p "${fullPrompt.slice(0, 160)}${fullPrompt.length > 160 ? "..." : ""}"`;
  console.log(`\n→ Polling Scheduled: ${displayCmd}`);
  spawnClaudeProcess(fullPrompt, displayCmd, agentName, null, agent.id);
}

function executeWorkflowAgent(
  agent: any,
  agentPath: string,
  agentName: string,
  params: Record<string, any>,
): void {
  const days = params.days || "today";
  const requireRepo = !!params.requireRepo;
  const requireMrPr = !!params.requireMrPr;
  const requirePriorRun = !!params.requirePriorRun;
  const priorRunSameDay = !!params.priorRunSameDay;
  const requirePriorRunAgents: string[] = Array.isArray(
    params.requirePriorRunAgents,
  )
    ? params.requirePriorRunAgents
    : [];
  const maxTickets = Math.min(5, Math.max(1, Number(params.maxTickets) || 5));

  // Fetch all tickets
  let tickets = listTicketWorkflows();

  // Filter: only tickets explicitly marked ready (ready = 1)
  tickets = tickets.filter((t) => {
    if (t.ready === 0) {
      console.log(`  → Skipping ticket ${t.ticket_id} (on hold / not ready)`);
      return false;
    }
    return true;
  });

  // Filter by days
  if (days === "today") {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    tickets = tickets.filter(
      (t) => t.added_at && t.added_at.startsWith(todayStr),
    );
  }

  // Filter by link condition (checkbox-based)
  // At least one checkbox must be checked; if both — both must be present
  if (requireRepo || requireMrPr) {
    tickets = tickets.filter((t) => {
      const hasRepo = !!t.git_repo;
      const hasMrPr = !!t.mr_pr_link;
      if (requireRepo && requireMrPr) return hasRepo && hasMrPr;
      if (requireRepo) return hasRepo;
      return hasMrPr;
    });
  }

  // Filter by prior agent run condition
  if (requirePriorRun) {
    const agentFilter =
      requirePriorRunAgents.length > 0 ? requirePriorRunAgents : undefined;
    tickets = tickets.filter((t) => {
      const hasPrior = hasAgentRunForTicket(
        t.ticket_id,
        priorRunSameDay,
        agentFilter,
      );
      if (!hasPrior) {
        const agentDesc = agentFilter
          ? ` by [${agentFilter.map((p) => p.split("/").pop()).join(", ")}]`
          : "";
        console.log(
          `  → Skipping ticket ${t.ticket_id} (no ${priorRunSameDay ? "same-day " : ""}prior agent run${agentDesc} found)`,
        );
      }
      return hasPrior;
    });
  }

  // Deduplicate: skip tickets already processed by this agent today
  const pendingTickets = tickets.filter((t) => {
    if (wasPolledToday(t.ticket_id, agentPath)) {
      console.log(
        `  → Skipping ticket ${t.ticket_id} (already processed today by ${agentName})`,
      );
      return false;
    }
    return true;
  });

  if (pendingTickets.length === 0) {
    console.log(
      `→ Workflow agent ${agentName}: no new tickets to process for days=${days} requireRepo=${requireRepo} requireMrPr=${requireMrPr}`,
    );
    updateLastRun(agent.id);
    return;
  }

  const batch = pendingTickets.slice(0, maxTickets);
  console.log(
    `\n→ Workflow agent ${agentName}: spawning ${batch.length}/${pendingTickets.length} ticket(s) (max=${maxTickets}, ${tickets.length - pendingTickets.length} already ran today)`,
  );

  for (const ticket of batch) {
    const repoPart = ticket.git_repo ? ` and repo is ${ticket.git_repo}` : "";
    const mrPart = ticket.mr_pr_link
      ? ` and mr/pr is ${ticket.mr_pr_link}`
      : "";
    const fullPrompt = `use agent @${agentPath} on ticket ${ticket.ticket_id}${repoPart}${mrPart}`;
    const displayCmd = `claude -p "${fullPrompt.slice(0, 200)}${fullPrompt.length > 200 ? "..." : ""}"`;
    console.log(`  → Spawning for ticket ${ticket.ticket_id}: ${displayCmd}`);
    recordWorkflowPollingRun(ticket.ticket_id, agentPath);
    spawnClaudeProcess(
      fullPrompt,
      displayCmd,
      agentName,
      ticket.ticket_id,
      agent.id,
    );
  }
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
