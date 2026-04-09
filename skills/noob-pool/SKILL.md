---
name: noob-pool
description: Run QA pool agents for a ticket. Checks the qa_pool_agents table for existing config — if found, enumerates all pending test cases and launches one targeted sub-agent per test case (round-robin across agent configs) to eliminate race conditions. If no config found, registers it first. Supports updating fields before running.
---

# QA Pool

Orchestrate all configured QA agents for a ticket with zero race conditions. The key insight: **enumerate test cases first, then assign each one explicitly to a specific agent invocation**. No two agents ever compete for the same test case.

## Why Per-Test-Case Assignment?

When multiple `claude` processes run in parallel, they share the same SQLite database. If each agent independently claims the next available test case (SELECT → INSERT), two agents can race on the same unclaimed entry and duplicate it. Fixing this at the DB level (locks, UNIQUE constraints) is fragile.

The cleaner solution: **the orchestrator picks all test cases upfront** and passes each test case name directly into each `claude` invocation via `--name`. Each sub-agent runs exactly one test case it was explicitly told to claim. No competition possible.

---

## Step 1 — Check and Prepare Config

```bash
TICKET_ID="<TICKET-ID>"

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

**If config found and user asked to update something:**

```bash
# Find the relevant entry (by agent path, or use .[0] if only one)
ENTRY_ID=$(echo "$AGENTS" | jq -r '.[] | select(.agent_path | contains("<partial-path>")) | .id' | head -1)

# Apply only the fields the user asked to change:
noob-tester qa-pool update "$ENTRY_ID" --target <new-target>   # if target changed
noob-tester qa-pool update "$ENTRY_ID" --role <new-role>       # if role changed
noob-tester qa-pool update "$ENTRY_ID" --agent <new-path>      # if agent changed
noob-tester qa-pool update "$ENTRY_ID" --file <new-file>       # if file changed

# Re-fetch after updates
AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

**If no config found, register it first:**

```bash
noob-tester qa-pool add \
  --ticket "$TICKET_ID" \
  --agent <agent-path> \
  --target <target-name> \
  --role <role> \
  --file <file-path>

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

---

## Step 2 — Enumerate Pending Test Cases (with Run Pack Check)

`MAX_SPAWNS` controls how many agents are launched. Default is **5**. The user can say "run 10 agents" or "spawn 3" to override. Pick this up from the user's request before running.

```bash
MAX_SPAWNS=5   # default — override if user specified a number

# Fetch all test cases for the ticket (already ordered by priority ASC, created_at ASC)
# DB priority: 1=direct_functional, 2=impact_regression, 3=general_regression
TEST_CASES=$(noob-tester testcase list --ticket "$TICKET_ID" --json)

# ── Run Pack Check ──────────────────────────────────────────────────────────
# Get the most recent run pack for this ticket (list is ordered newest-first)
RECENT_PACK_ID=$(noob-tester runpack list --ticket "$TICKET_ID" --json \
  | jq -r '.[0].run_pack_id // empty')

CLAIMED_IDS="[]"
if [ -n "$RECENT_PACK_ID" ]; then
  # Fetch all entries in the most recent run pack
  PACK_ENTRIES=$(noob-tester runpack list --pack "$RECENT_PACK_ID" --json)

  # Build a set of test_case_ids that are already claimed / in-progress / done
  # Statuses to exclude: claimed, running, passed, failed, skipped, blocked
  # We keep 'pending' ones — those are still fair game to dispatch
  CLAIMED_IDS=$(echo "$PACK_ENTRIES" | jq '
    [.[] | select(
      .status == "claimed" or
      .status == "running" or
      .status == "passed" or
      .status == "failed" or
      .status == "skipped" or
      .status == "blocked"
    ) | .test_case_id]
  ')

  echo "Recent run pack: $RECENT_PACK_ID — $(echo "$CLAIMED_IDS" | jq 'length') already claimed/done entries excluded."
fi
# ────────────────────────────────────────────────────────────────────────────

# Keep only runnable ones (pending/ready on test_cases table) that are NOT
# already claimed/done in the most recent run pack.
# Sort is guaranteed by the DB query, but enforce it explicitly for safety.
PENDING=$(echo "$TEST_CASES" | jq --argjson claimed "$CLAIMED_IDS" '
  [.[] |
    select(.status == "pending" or .status == "ready") |
    select(.id as $id | $claimed | index($id) | not)
  ]
  | sort_by(.priority, .created_at)
  | .[:'"$MAX_SPAWNS"']
')
PENDING_COUNT=$(echo "$PENDING" | jq 'length')

if [ "$PENDING_COUNT" -eq 0 ]; then
  echo "No unclaimed test cases remaining for $TICKET_ID. Nothing to run."
  exit 0
fi

echo "Dispatching $PENDING_COUNT test cases (max: $MAX_SPAWNS, after excluding already-claimed entries from the run pack)."
```

---

## Step 3 — Build Per-Test-Case Invocations

Cycle through the configured agent configs using round-robin index. Each test case gets its own invocation targeting it by name. The `--name` flag in `runpack claim-next` does a case-insensitive substring match, so the full title works reliably.

```bash
# Build an array of agent configs for round-robin
AGENT_PATHS=($(echo "$AGENTS" | jq -r '.[].agent_path'))
AGENT_TARGETS=($(echo "$AGENTS" | jq -r '.[].target // ""'))
AGENT_ROLES=($(echo "$AGENTS" | jq -r '.[].role // "default"'))
AGENT_FILES=($(echo "$AGENTS" | jq -r '.[].file // ""'))

# Build the list of (test_case_title, agent_index) pairs
i=0
LAUNCHES=()

while IFS= read -r TC; do
  TITLE=$(echo "$TC" | jq -r '.title')   # 'title' is the test case title field
  IDX=$(( i % AGENT_COUNT ))

  AGENT_PATH="${AGENT_PATHS[$IDX]}"
  TARGET="${AGENT_TARGETS[$IDX]}"
  ROLE="${AGENT_ROLES[$IDX]}"
  FILE="${AGENT_FILES[$IDX]}"

  # Build the noob-explore invocation with explicit test case name
  INVOCATION="run with agent @${AGENT_PATH} on jira ${TICKET_ID}"
  [ -n "$TARGET" ] && INVOCATION="$INVOCATION with target $TARGET"
  [ -n "$ROLE" ] && [ "$ROLE" != "default" ] && INVOCATION="$INVOCATION and role $ROLE"
  [ -n "$FILE" ] && INVOCATION="$INVOCATION and file $FILE"
  INVOCATION="$INVOCATION and claim test case named \"$TITLE\""

  LAUNCHES+=("$AGENT_PATH|$INVOCATION")
  i=$(( i + 1 ))
done < <(echo "$PENDING" | jq -c '.[]')

echo "Prepared ${#LAUNCHES[@]} agent invocations."
```

---

## Step 4 — Launch Sub-Agents (Fire and Forget)

Launch all agents as background processes and return immediately. The sub-agents run independently — results are visible in the watch dashboard as they complete.

```bash
for LAUNCH in "${LAUNCHES[@]}"; do
  AGENT_PATH="${LAUNCH%%|*}"
  INVOCATION="${LAUNCH#*|}"

  echo "→ Spawning @${AGENT_PATH} for: $(echo "$INVOCATION" | grep -o 'named "[^"]*"')"
  claude -p "$INVOCATION" --agent "@${AGENT_PATH}" &
done

echo "All $PENDING_COUNT agents spawned. Monitor progress at http://localhost:4040"
```

Do **not** call `wait` — return to the user immediately after spawning. The agents run in the background and record their results to the database as they finish.

---

## Step 5 — Report

Tell the user:

- How many test cases were found and launched
- Which agent configs were used (round-robin distribution)
- Whether config was pre-existing or newly registered
- Whether any fields were updated before running
- If any test cases were skipped (already claimed/passed)

---

## Notes

- **`--name` flag** — `runpack claim-next` supports `--name <title>` for case-insensitive substring match. Each sub-agent uses this to claim only its assigned test case. No two agents receive the same title, so no race is possible.
- **Round-robin** — distributes test cases evenly across agent configs. With 3 configs and 9 test cases: config[0] gets TCs 0,3,6 — config[1] gets 1,4,7 — config[2] gets 2,5,8.
- **Agent path** — stored without `@` in the DB; prepend `@` in the `claude` invocation.
- **Target** — a named reference in the `targets` table resolved at runtime by the sub-agent (not a raw URL).
- **Role** — selects which credential set to inject from the `secrets` table for the given target.
- **Missing agent file** — if a `.md` file doesn't exist on disk, warn the user and skip that config entry.
- **Test case status** — only `ready`/`pending` cases are dispatched. `passed`, `failed`, `claimed` cases are skipped unless the user explicitly says to rerun all.
- **Run pack exclusion** — before dispatching, the most recent run pack for the ticket is checked. Any test case already in that pack with status `claimed`, `running`, `passed`, `failed`, `skipped`, or `blocked` is excluded from the dispatch batch. Only entries that are still `pending` in the pack (or not in the pack at all) are eligible. This prevents re-dispatching work that is already in flight or done.
