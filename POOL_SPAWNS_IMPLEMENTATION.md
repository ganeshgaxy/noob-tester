# Pool Spawns Management System

## Overview
This system tracks spawned pool agents, allowing you to view and kill running agents through the CLI and UI.

## Components Implemented

### 1. Database Migration (012-pool-spawns.sql)
**Table: `pool_spawns`**
- `id` - Unique spawn ID (UUID)
- `ticket_id` - Associated ticket
- `agent_path` - Path to the agent file
- `pid` - Process ID
- `status` - running | completed | killed | error
- `spawn_type` - pool | visual-pool
- `created_at` - When spawned
- `completed_at` - When it finished (null if still running)
- `exit_code` - Process exit code (if completed)
- `notes` - Additional info (e.g., "killed by user")

### 2. Repository Functions (pool-spawns.ts)
**Key functions:**
- `recordSpawn()` - Record a newly spawned agent (called by noob-pool/noob-visual-pool)
- `listSpawnsForTicket()` - Get all spawns for a ticket
- `getActiveSpawnsForTicket()` - Get only running spawns
- `markSpawnCompleted()` - Mark as completed with exit code
- `markSpawnKilled()` - Mark as killed by user
- `killAllSpawnsForTicket()` - Kill all active spawns
- `getActiveSpawnPids()` - Get PIDs for actual process killing

### 3. CLI Commands (pool-spawns.ts)
**Usage:**
```bash
# Record a spawn (called automatically by skills)
noob-tester pool-spawns record --ticket PROJ-123 --agent @agents/qa.md --pid 12345 --type pool

# List all spawns for a ticket
noob-tester pool-spawns list --ticket PROJ-123

# List only active spawns
noob-tester pool-spawns list --ticket PROJ-123 --active

# Kill all active spawns for a ticket (database only)
noob-tester pool-spawns kill-all --ticket PROJ-123

# Actually kill the processes too
noob-tester pool-spawns kill-all --ticket PROJ-123 --force

# Mark a spawn as completed
noob-tester pool-spawns complete --spawn <spawn-id> --exit-code 0
```

## Integration Points

### 1. Update noob-pool Skill
In Step 4 (Launch Sub-Agents), after spawning each agent:

```bash
# After: (cd "$DIR" && claude -p "$INVOCATION" --agent "@${AGENT_PATH}") &
AGENT_PID=$!
noob-tester pool-spawns record --ticket "$TICKET_ID" --agent "@${AGENT_PATH}" --pid $AGENT_PID --type pool
```

### 2. Update noob-visual-pool Skill
Similarly in Step 4, after spawning visual agents:

```bash
# After: (cd "$DIR" && claude -p "$INVOCATION" --agent "@${AGENT_PATH}") &
AGENT_PID=$!
noob-tester pool-spawns record --ticket "$TICKET_ID" --agent "@${AGENT_PATH}" --pid $AGENT_PID --type visual-pool
```

### 3. Dashboard UI Integration
The pool menu should show:
```
Pool Agents for PROJ-123
├── noob-pool
│   ├── [Running] PID 12345 (@agents/qa.md) - Created 2:30pm - [Kill] button
│   ├── [Running] PID 12346 (@agents/qa.md) - Created 2:32pm - [Kill] button
│   └── [Kill All] button
│
└── noob-visual-pool
    ├── [Running] PID 12347 (@agents/visual.md) - Created 2:35pm - [Kill] button
    └── [Kill All] button
```

**UI Actions:**
- Show PID, agent path, status, creation time
- [Kill] button per agent → `pool-spawns kill-all --ticket X --force` (for that agent)
- [Kill All] button per pool type → `pool-spawns kill-all --ticket X --force`
- Display exit codes and completion times for finished spawns

## Status of Implementation

✅ **Completed:**
- Database schema (migration 012)
- Repository functions
- CLI commands (list, record, kill-all, complete)
- Build integration

⏳ **Still Needed:**
- Update noob-pool skill to call `pool-spawns record` after spawning
- Update noob-visual-pool skill to call `pool-spawns record` after spawning
- Dashboard UI integration to show/manage spawns
- Add spawn tracking to the pool menu

## Next Steps

1. Update the two skills to record spawns
2. Update dashboard.ts to fetch and display spawns in the pool menu
3. Add kill buttons that call `pool-spawns kill-all --ticket X --force`
4. Optional: Add agent completion detection (mark as completed when process exits)
