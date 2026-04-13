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
noob-tester qa-pool update "$ENTRY_ID" --target <new-target>       # if target changed
noob-tester qa-pool update "$ENTRY_ID" --role <new-role>           # if role changed
noob-tester qa-pool update "$ENTRY_ID" --agent <new-path>          # if agent changed
noob-tester qa-pool update "$ENTRY_ID" --file <new-file>           # if file changed
noob-tester qa-pool update "$ENTRY_ID" --launch-dir <new-dir>     # if launch dir changed

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
  --file <file-path> \
  --launch-dir <directory>   # optional — defaults to pwd if omitted

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

---

## Step 1.5 — Detect Agent Type and Create Runs

Determine if agents are functional (noob-explore) or visual (noob-visual) by checking agent paths:

```bash
# Check agent types — assumes agents are named with "visual" in path if visual
AGENT_TYPE_VISUAL=0
AGENT_TYPE_FUNCTIONAL=0

for AGENT in $(echo "$AGENTS" | jq -r '.[].agent_path'); do
  if [[ "$AGENT" == *"visual"* ]]; then
    ((AGENT_TYPE_VISUAL++))
  else
    ((AGENT_TYPE_FUNCTIONAL++))
  fi
done

echo "Detected: $AGENT_TYPE_FUNCTIONAL functional agent(s), $AGENT_TYPE_VISUAL visual agent(s)"

# Create visual run if any visual agents exist
VISUAL_RUN_ID=""
if [ "$AGENT_TYPE_VISUAL" -gt 0 ]; then
  # Resolve target URL for visual run
  FIRST_TARGET=$(echo "$AGENTS" | jq -r '.[] | select(.agent_path | contains("visual")) | .target // "" | first')
  if [ -z "$FIRST_TARGET" ]; then
    FIRST_TARGET=$(echo "$AGENTS" | jq -r '.[0].target // ""')
  fi
  
  TARGET_URL=$(noob-tester secrets target list --json | jq -r '.[] | select(.name == "'"$FIRST_TARGET"'") | .url')
  if [ -z "$TARGET_URL" ] || [ "$TARGET_URL" = "null" ]; then
    echo "ERROR: Could not resolve URL for target '$FIRST_TARGET' (needed for visual run)"
    exit 1
  fi
  
  VISUAL_MODE="baseline"  # or "verification" — user can override
  VISUAL_RUN_ID=$(noob-tester visual-run start \
    --ticket "$TICKET_ID" \
    --mode "$VISUAL_MODE" \
    --target-url "$TARGET_URL" \
    --secret-target "$FIRST_TARGET" \
    --secret-role "default" | jq -r '.visualRunId')
  
  echo "Created visual run: $VISUAL_RUN_ID (mode: $VISUAL_MODE)"
fi

# Create run pack if any functional agents exist (or always, for consistency)
RUNPACK_ID=$(noob-tester init --ticket "$TICKET_ID" --task "QA Pool Run" --labels "pool" | jq -r '.runPackId')
INIT=$(noob-tester init --ticket "$TICKET_ID" --task "QA Pool Run" --labels "pool")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')

echo "Created run pack: $RUNPACK_ID (session: $SESSION_ID)"
```

---

## Step 2 — Enumerate Pending Test Cases (with Run Pack Check)

`MAX_SPAWNS` controls how many agents are launched. Default is **5**. The user can say "run 10 agents" or "spawn 3" to override. Pick this up from the user's request before running.

```bash
MAX_SPAWNS=5   # default — override if user specified a number

# Fetch functional test cases (for noob-explore agents)
TEST_CASES=$(noob-tester testcase list --ticket "$TICKET_ID" --json)

# Fetch visual test cases (for noob-visual agents) — if visual agents exist
VISUAL_TEST_CASES="[]"
if [ "$AGENT_TYPE_VISUAL" -gt 0 ]; then
  VISUAL_TEST_CASES=$(noob-tester visual-tc list --ticket "$TICKET_ID" --json)
  
  # Populate visual run with entries (one per test case)
  echo "$VISUAL_TEST_CASES" | jq -r '.[].id' | while read -r TC_ID; do
    noob-tester visual-run entry-create \
      --run "$VISUAL_RUN_ID" --tc "$TC_ID" --ticket "$TICKET_ID" > /dev/null
  done
fi

# ── Run Pack Check (Functional Tests) ───────────────────────────────────────
CLAIMED_IDS="[]"
RECENT_PACK_ID=$(noob-tester runpack list --ticket "$TICKET_ID" --json | jq -r '.[0].run_pack_id // empty')

if [ -n "$RECENT_PACK_ID" ]; then
  PACK_ENTRIES=$(noob-tester runpack list --pack "$RECENT_PACK_ID" --json)
  CLAIMED_IDS=$(echo "$PACK_ENTRIES" | jq '
    [.[] | select(
      .status == "claimed" or .status == "running" or .status == "passed" or
      .status == "failed" or .status == "skipped" or .status == "blocked"
    ) | .test_case_id]
  ')
  echo "Recent run pack: $RECENT_PACK_ID — $(echo "$CLAIMED_IDS" | jq 'length') already claimed/done entries excluded."
fi
# ────────────────────────────────────────────────────────────────────────────

# ── Visual Run Check (Visual Tests) ─────────────────────────────────────────
CLAIMED_VISUAL_IDS="[]"
if [ "$AGENT_TYPE_VISUAL" -gt 0 ] && [ -n "$VISUAL_RUN_ID" ]; then
  VISUAL_ENTRIES=$(noob-tester visual-run list --run "$VISUAL_RUN_ID" --json)
  CLAIMED_VISUAL_IDS=$(echo "$VISUAL_ENTRIES" | jq '
    [.[] | select(
      .status == "running" or .status == "passed" or
      .status == "failed" or .status == "skipped"
    ) | .visual_tc_id]
  ')
  echo "Visual run: $VISUAL_RUN_ID — $(echo "$CLAIMED_VISUAL_IDS" | jq 'length') already claimed/done entries excluded."
fi
# ────────────────────────────────────────────────────────────────────────────

# Combine functional and visual test cases for dispatch
# Functional test cases (pending/ready, not already claimed)
PENDING_FUNCTIONAL=$(echo "$TEST_CASES" | jq --argjson claimed "$CLAIMED_IDS" '
  [.[] |
    select(.status == "pending" or .status == "ready") |
    select(.id as $id | $claimed | index($id) | not)
  ]
  | sort_by(.priority, .created_at)
  | .[:'"$MAX_SPAWNS"']
')

# Visual test cases (pending/ready, not already claimed)
PENDING_VISUAL=$(echo "$VISUAL_TEST_CASES" | jq --argjson claimed "$CLAIMED_VISUAL_IDS" '
  [.[] |
    select(.status == "pending" or .status == "ready") |
    select(.id as $id | $claimed | index($id) | not)
  ]
  | .[:'"$MAX_SPAWNS"']
')

# Total pending
PENDING_COUNT=$(( $(echo "$PENDING_FUNCTIONAL" | jq 'length') + $(echo "$PENDING_VISUAL" | jq 'length') ))

if [ "$PENDING_COUNT" -eq 0 ]; then
  echo "No unclaimed test cases remaining for $TICKET_ID. Nothing to run."
  exit 0
fi

echo "Dispatching $PENDING_COUNT test cases (functional: $(echo "$PENDING_FUNCTIONAL" | jq 'length'), visual: $(echo "$PENDING_VISUAL" | jq 'length'))."
```

---

## Step 3 — Pre-Claim Test Cases and Build Invocations

**Pre-claim all test cases** using the appropriate claim skill (functional or visual), then build invocations that pass the claimed data to agents.

```bash
# Build an array of agent configs for round-robin
AGENT_PATHS=($(echo "$AGENTS" | jq -r '.[].agent_path'))
AGENT_TARGETS=($(echo "$AGENTS" | jq -r '.[].target // ""'))
AGENT_ROLES=($(echo "$AGENTS" | jq -r '.[].role // "default"'))
AGENT_FILES=($(echo "$AGENTS" | jq -r '.[].file // ""'))
AGENT_DIRS=($(echo "$AGENTS" | jq -r '.[].launch_dir // ""'))

i=0
LAUNCHES=()

# ── Claim and launch functional test cases ──────────────────────────────────
echo "$PENDING_FUNCTIONAL" | jq -c '.[]' | while read -r TC; do
  TITLE=$(echo "$TC" | jq -r '.title')
  IDX=$(( i % AGENT_COUNT ))
  
  AGENT_PATH="${AGENT_PATHS[$IDX]}"
  TARGET="${AGENT_TARGETS[$IDX]}"
  ROLE="${AGENT_ROLES[$IDX]}"
  FILE="${AGENT_FILES[$IDX]}"
  DIR="${AGENT_DIRS[$IDX]}"

  # ← PRE-CLAIM: Call noob-claim to get $CLAIM
  CLAIM_OUTPUT=$(noob-tester claim-smart --pack "$RUNPACK_ID" --ticket "$TICKET_ID" --session "$SESSION_ID" --run "$RUN_ID" --layer ui --risk --name "$TITLE" 2>/dev/null)
  CLAIMED=$(echo "$CLAIM_OUTPUT" | jq -r '.claimed // false')
  
  if [ "$CLAIMED" != "true" ]; then
    echo "  Warning: Could not claim functional test case '$TITLE' — skipping"
    continue
  fi
  
  # Save claimed data to unique file for this agent
  CLAIM_FILE="/tmp/pool-claim-${i}.json"
  echo "$CLAIM_OUTPUT" > "$CLAIM_FILE"
  
  # Build invocation that tells agent to use this claim file
  INVOCATION="run with agent @${AGENT_PATH} on jira ${TICKET_ID}"
  [ -n "$TARGET" ] && INVOCATION="$INVOCATION with target $TARGET"
  [ -n "$ROLE" ] && [ "$ROLE" != "default" ] && INVOCATION="$INVOCATION and role $ROLE"
  [ -n "$FILE" ] && INVOCATION="$INVOCATION and file $FILE"
  INVOCATION="$INVOCATION and use claimed entry from $CLAIM_FILE"

  echo "$DIR|$AGENT_PATH|$INVOCATION" >> /tmp/pool-launches.txt
  i=$(( i + 1 ))
done

# ── Claim and launch visual test cases ──────────────────────────────────────
if [ "$AGENT_TYPE_VISUAL" -gt 0 ]; then
  echo "$PENDING_VISUAL" | jq -c '.[]' | while read -r VTC; do
    TITLE=$(echo "$VTC" | jq -r '.title')
    IDX=$(( i % AGENT_COUNT ))
    
    AGENT_PATH="${AGENT_PATHS[$IDX]}"
    TARGET="${AGENT_TARGETS[$IDX]}"
    ROLE="${AGENT_ROLES[$IDX]}"
    FILE="${AGENT_FILES[$IDX]}"
    DIR="${AGENT_DIRS[$IDX]}"

    # ← PRE-CLAIM: Call noob-visual-claim to get $CLAIM
    CLAIM_OUTPUT=$(noob-tester visual-run claim-next "$VISUAL_RUN_ID" 2>/dev/null)
    CLAIMED=$(echo "$CLAIM_OUTPUT" | jq -r '.claimed // false')
    
    if [ "$CLAIMED" != "true" ]; then
      echo "  Warning: Could not claim visual test case '$TITLE' — skipping"
      continue
    fi
    
    # Save claimed data to unique file for this agent
    CLAIM_FILE="/tmp/pool-visual-claim-${i}.json"
    echo "$CLAIM_OUTPUT" > "$CLAIM_FILE"
    
    # Build invocation for visual test
    INVOCATION="run visual $VISUAL_MODE test for ticket $TICKET_ID, visual run $VISUAL_RUN_ID with agent @${AGENT_PATH}"
    [ -n "$TARGET" ] && INVOCATION="$INVOCATION with target $TARGET"
    [ -n "$ROLE" ] && [ "$ROLE" != "default" ] && INVOCATION="$INVOCATION and role $ROLE"
    [ -n "$FILE" ] && INVOCATION="$INVOCATION and file $FILE"
    INVOCATION="$INVOCATION and use claimed entry from $CLAIM_FILE"

    echo "$DIR|$AGENT_PATH|$INVOCATION" >> /tmp/pool-launches.txt
    i=$(( i + 1 ))
  done
fi

# Read all launches
mapfile -t LAUNCHES < /tmp/pool-launches.txt
rm -f /tmp/pool-launches.txt

echo "Prepared ${#LAUNCHES[@]} agent invocations (all test cases pre-claimed)."
```

---

## Step 4 — Launch Sub-Agents (Fire and Forget)

Each agent gets its own claimed entry file and launch directory. The agent reads from the claim file passed in the invocation.

```bash
for LAUNCH in "${LAUNCHES[@]}"; do
  DIR="${LAUNCH%%|*}"
  REST="${LAUNCH#*|}"
  AGENT_PATH="${REST%%|*}"
  INVOCATION="${REST#*|}"

  # Extract claim file path from invocation (format: "... from /tmp/pool-claim-N.json")
  CLAIM_FILE=$(echo "$INVOCATION" | grep -oP '/tmp/pool.*\.json')
  
  if [ -n "$CLAIM_FILE" ]; then
    echo "→ Spawning @${AGENT_PATH} with claim: $CLAIM_FILE"
  else
    echo "→ Spawning @${AGENT_PATH}"
  fi

  if [ -n "$DIR" ] && [ -d "$DIR" ]; then
    (cd "$DIR" && claude -p "$INVOCATION" --agent "@${AGENT_PATH}") &
  else
    [ -n "$DIR" ] && echo "  Warning: launch_dir '$DIR' not found, using current directory"
    claude -p "$INVOCATION" --agent "@${AGENT_PATH}" &
  fi
done

echo "All ${#LAUNCHES[@]} agents spawned. Monitor progress at http://localhost:4040"
```

**Important:** Agents read from the claim file specified in the invocation. The file contains all test case data needed for execution.

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
