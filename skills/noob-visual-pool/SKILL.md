---
name: noob-visual-pool
description: Run visual QA pool agents for a ticket. Checks qa_pool_agents for config, creates a visual run, populates entries, enumerates pending visual test cases (filtering already-claimed), then launches one sub-agent per test case (round-robin across agent configs). Each sub-agent claims its assigned test case by name via --name flag — no race conditions.
---

# Visual QA Pool

Orchestrate visual testing agents for a ticket with zero race conditions. Creates a visual run, populates entries, enumerates pending ones (filtering already-claimed/done), assigns each to a sub-agent by **name** using round-robin, then fires one `claude` process per visual test case. Each sub-agent claims its own specific test case via `visual-run claim-next --name "TITLE"` — no two agents get the same title, so no races.

---

## Step 1 — Check and Prepare Config

```bash
TICKET_ID="<TICKET-ID>"
MODE="<baseline|verification>"   # user specifies baseline or verification

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

**If config found and user asked to update something:**

```bash
ENTRY_ID=$(echo "$AGENTS" | jq -r '.[] | select(.agent_path | contains("<partial-path>")) | .id' | head -1)

noob-tester qa-pool update "$ENTRY_ID" --target <new-target>       # if target changed
noob-tester qa-pool update "$ENTRY_ID" --role <new-role>           # if role changed
noob-tester qa-pool update "$ENTRY_ID" --agent <new-path>          # if agent changed
noob-tester qa-pool update "$ENTRY_ID" --file <new-file>           # if file changed
noob-tester qa-pool update "$ENTRY_ID" --launch-dir <new-dir>     # if launch dir changed

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

## Step 2 — Enumerate Pending Visual Test Cases (with Visual Run Check)

`MAX_SPAWNS` controls how many agents are launched. Default is **5**. The user can say "run 10 agents" or "spawn 3" to override. Pick this up from the user's request before running.

```bash
MAX_SPAWNS=5   # default — override if user specified a number

# Fetch all visual test cases for the ticket
VISUAL_TCS=$(noob-tester visual-tc list --ticket "$TICKET_ID" --json)
TC_COUNT=$(echo "$VISUAL_TCS" | jq 'length')

if [ "$TC_COUNT" -eq 0 ]; then
  echo "No visual test cases for $TICKET_ID. Nothing to run."
  exit 0
fi

# ── Visual Run Check ───────────────────────────────────────────────────────
# Get the most recent visual run for this ticket (list is ordered newest-first)
RECENT_RUN=$(noob-tester visual-run list --ticket "$TICKET_ID" --json \
  | jq -r '.[0] // empty')
RECENT_RUN_ID=$(echo "$RECENT_RUN" | jq -r '.id // empty')

CLAIMED_TC_IDS="[]"
if [ -n "$RECENT_RUN_ID" ]; then
  # Fetch all entries in the most recent visual run
  RUN_ENTRIES=$(noob-tester visual-run get "$RECENT_RUN_ID" --entries \
    | jq '.entries // []')

  # Build a set of visual_tc_ids that are already claimed / running / done
  # Statuses to exclude: running, passed, failed, skipped
  # We keep 'pending' ones — those are still fair game to dispatch
  CLAIMED_TC_IDS=$(echo "$RUN_ENTRIES" | jq '
    [.[] | select(
      .status == "running" or
      .status == "passed" or
      .status == "failed" or
      .status == "skipped"
    ) | .visual_tc_id]
  ')

  echo "Recent visual run: $RECENT_RUN_ID — $(echo "$CLAIMED_TC_IDS" | jq 'length') already claimed/done entries excluded."
fi
# ────────────────────────────────────────────────────────────────────────────

# Keep only visual test cases NOT already claimed/done in the most recent run.
PENDING=$(echo "$VISUAL_TCS" | jq --argjson claimed "$CLAIMED_TC_IDS" '
  [.[] |
    select(.id as $id | $claimed | index($id) | not)
  ]
  | .[:'"$MAX_SPAWNS"']
')
PENDING_COUNT=$(echo "$PENDING" | jq 'length')

if [ "$PENDING_COUNT" -eq 0 ]; then
  echo "No unclaimed visual test cases remaining for $TICKET_ID. Nothing to run."
  exit 0
fi

echo "Dispatching $PENDING_COUNT visual test cases (max: $MAX_SPAWNS, after excluding already-claimed entries)."

# ── Create Visual Run and Populate Entries ─────────────────────────────────
# Get the first agent's target info for the visual run
FIRST_TARGET=$(echo "$AGENTS" | jq -r '.[0].target // ""')
FIRST_ROLE=$(echo "$AGENTS" | jq -r '.[0].role // "default"')

# Resolve target URL
TARGET_URL=$(noob-tester secrets target list --json | jq -r '.[] | select(.name == "'"$FIRST_TARGET"'") | .url')
if [ -z "$TARGET_URL" ] || [ "$TARGET_URL" = "null" ]; then
  echo "ERROR: Could not resolve URL for target '$FIRST_TARGET'"
  noob-tester secrets target list --json | jq '.[].name'
  exit 1
fi

# Create the visual run
VISUAL_RUN_ID=$(noob-tester visual-run start \
  --ticket "$TICKET_ID" \
  --mode "$MODE" \
  --target-url "$TARGET_URL" \
  --secret-target "$FIRST_TARGET" \
  --secret-role "$FIRST_ROLE" | jq -r '.visualRunId')

echo "Created visual run: $VISUAL_RUN_ID (mode: $MODE)"

# Populate one pending entry per visual test case in PENDING
echo "$PENDING" | jq -r '.[].id' | while read -r TC_ID; do
  noob-tester visual-run entry-create \
    --run "$VISUAL_RUN_ID" --tc "$TC_ID" --ticket "$TICKET_ID" > /dev/null
done

echo "$PENDING_COUNT visual test case entries queued in run $VISUAL_RUN_ID."
```

---

## Step 3 — Pre-Claim and Build Per-Test-Case Invocations

**Pre-claim all visual test cases** using `visual-run claim-next`, then cycle through the configured agent configs using round-robin index. Each visual test case gets its own invocation with a claim file containing all needed data.

```bash
# Build an array of agent configs for round-robin
AGENT_PATHS=($(echo "$AGENTS" | jq -r '.[].agent_path'))
AGENT_TARGETS=($(echo "$AGENTS" | jq -r '.[].target // ""'))
AGENT_ROLES=($(echo "$AGENTS" | jq -r '.[].role // "default"'))
AGENT_FILES=($(echo "$AGENTS" | jq -r '.[].file // ""'))
AGENT_DIRS=($(echo "$AGENTS" | jq -r '.[].launch_dir // ""'))

i=0
LAUNCHES=()

# Pre-claim and launch visual test cases
echo "$PENDING" | jq -c '.[]' | while read -r VTC; do
  TITLE=$(echo "$VTC" | jq -r '.title')
  IDX=$(( i % AGENT_COUNT ))
  
  AGENT_PATH="${AGENT_PATHS[$IDX]}"
  TARGET="${AGENT_TARGETS[$IDX]}"
  ROLE="${AGENT_ROLES[$IDX]}"
  FILE="${AGENT_FILES[$IDX]}"
  DIR="${AGENT_DIRS[$IDX]}"

  # ← PRE-CLAIM: Call visual-run claim-next to get the entry
  CLAIM_OUTPUT=$(noob-tester visual-run claim-next "$VISUAL_RUN_ID" 2>/dev/null)
  CLAIMED=$(echo "$CLAIM_OUTPUT" | jq -r '.claimed // false')
  
  if [ "$CLAIMED" != "true" ]; then
    echo "  Warning: Could not claim visual test case '$TITLE' — skipping"
    i=$(( i + 1 ))
    continue
  fi
  
  # Save claimed data to unique file for this agent
  CLAIM_FILE="/tmp/pool-visual-claim-${i}.json"
  echo "$CLAIM_OUTPUT" > "$CLAIM_FILE"
  
  # Build invocation for visual test with claim file
  INVOCATION="run visual $MODE test for ticket $TICKET_ID, visual run $VISUAL_RUN_ID with agent @${AGENT_PATH}"
  [ -n "$TARGET" ] && INVOCATION="$INVOCATION with target $TARGET"
  [ -n "$ROLE" ] && [ "$ROLE" != "default" ] && INVOCATION="$INVOCATION and role $ROLE"
  [ -n "$FILE" ] && INVOCATION="$INVOCATION and file $FILE"
  INVOCATION="$INVOCATION and use claimed entry from $CLAIM_FILE"

  echo "$DIR|$AGENT_PATH|$INVOCATION" >> /tmp/pool-visual-launches.txt
  i=$(( i + 1 ))
done

# Read all launches
if [ -f /tmp/pool-visual-launches.txt ]; then
  mapfile -t LAUNCHES < /tmp/pool-visual-launches.txt
  rm -f /tmp/pool-visual-launches.txt
fi

echo "Prepared ${#LAUNCHES[@]} agent invocations (all test cases pre-claimed)."
```

---

## Step 4 — Launch Sub-Agents (Fire and Forget)

Each agent entry has its own `launch_dir`. The `cd` happens per-spawn in a subshell so agents can launch from different directories.

```bash
for LAUNCH in "${LAUNCHES[@]}"; do
  DIR="${LAUNCH%%|*}"
  REST="${LAUNCH#*|}"
  AGENT_PATH="${REST%%|*}"
  INVOCATION="${REST#*|}"

  echo "→ Spawning @${AGENT_PATH} for: $(echo "$INVOCATION" | grep -o 'Test case: "[^"]*"')"

  if [ -n "$DIR" ] && [ -d "$DIR" ]; then
    (cd "$DIR" && claude -p "$INVOCATION" --agent "@${AGENT_PATH}") &
  else
    [ -n "$DIR" ] && echo "  Warning: launch_dir '$DIR' not found, using current directory"
    claude -p "$INVOCATION" --agent "@${AGENT_PATH}" &
  fi
done

echo "All ${#LAUNCHES[@]} visual test agents spawned. Monitor at http://localhost:4040 → Visual Runs"
```

Do **not** call `wait` — return to the user immediately after spawning. The agents run in the background and record their results to the database as they finish.

---

## Step 5 — Report

Tell the user:

- Visual run ID and mode (baseline / verification)
- How many visual test cases were found and dispatched
- Which agent configs were used (round-robin distribution)
- Whether config was pre-existing or newly registered
- Whether any fields were updated before running
- The dashboard URL to monitor: `http://localhost:4040` → Visual Runs

---

## Notes

- **Pre-claimed entries** — the orchestrator pre-claims all test cases upfront using `visual-run claim-next` and saves the claim response to temp files. Each sub-agent reads its assigned claim file and uses the pre-claimed entry. No two agents compete for the same entry, so no races.
- **Claim file format** — saved to `/tmp/pool-visual-claim-${i}.json` and contains the full entry data including visual_run_id, entry_id, test case details, and visual_steps config. Agents read this via the `CLAIM_FILE` path passed in invocation.
- **Round-robin** — distributes visual test cases evenly across agent configs. With 2 configs and 6 test cases: config[0] gets TCs 0,2,4 — config[1] gets 1,3,5.
- **Agent path** — stored without `@` in the DB; prepend `@` in the `claude` invocation.
- **Target** — a named reference in the `targets` table resolved at runtime by the sub-agent (not a raw URL).
- **Role** — selects which credential set to inject from the `secrets` table for the given target.
- **Missing agent file** — if a `.md` file doesn't exist on disk, warn the user and skip that config entry.
- **Mode** — `baseline` captures reference screenshots; `verification` captures + diffs against baseline. A baseline run must complete before verification.
- **Visual run completion** — the run stays open while agents execute. The last agent to finish processing its pre-claimed entry should call `visual-run complete` to finalize the run.
- **MAX_SPAWNS** — caps how many agents are launched. Default 5. Remaining test cases stay unclaimed for a subsequent `/noob-visual-pool` invocation.
- **Visual Run Check** — Step 2 checks the most recent visual run for already-claimed/done entries and filters them out, just like noob-pool checks run packs. This prevents re-dispatching test cases that are already in progress or completed.
