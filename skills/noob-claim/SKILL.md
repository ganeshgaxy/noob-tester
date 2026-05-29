---
name: noob-claim
description: Claim the next test case from a run pack. Supports creating a new run pack (first invocation) or resuming an existing one. Returns $CLAIM for noob-explore to execute.
---

# Test Case Claiming

Claim one test case entry from a run pack. Pass `$CLAIM` to `noob-explore` for execution.

## Output

Returns `$CLAIM` JSON with the claimed entry and its full test case data:

```json
{
    "claimed": true,
    "entry": {
        "id": "<entry-id>",
        "runpack_id": "<runpack-id>",
        "tc_id": "<tc-id>",
        "status": "running",
        "tc": {
            "id": "<tc-id>",
            "title": "Test case title",
            "format": "bdd",
            "trad_steps": "[...]",
            "bdd_given": "[...]",
            "bdd_when": "[...]",
            "bdd_then": "[...]"
        }
    }
}
```

When `"claimed": false`, all entries in the run pack are done — no more test cases to claim.

## Prerequisites

- Ticket ID (`TICKET-ID`)
- `RUNPACK_ID` — **auto-created on first invocation**, reuse latest on subsequent ones

---

## Mode A — First invocation (no RUNPACK_ID yet)

Create the run pack, populate all test case entries as pending, then claim the first one.

```bash
# Get the latest run pack for this ticket (if exists)
LATEST_PACK=$(noob-tester runpack list --ticket <TICKET-ID> --json | jq -r '.[0].run_pack_id // empty')

# Determine if we need to create a new pack or use latest
# If user requested a new pack via --new-runpack flag, or no pack exists, create one
NEW_PACK_REQUESTED=false  # set to true if agent passes --new-runpack flag

if [ -z "$LATEST_PACK" ] || [ "$NEW_PACK_REQUESTED" = "true" ]; then
  # Create new run pack
  INIT=$(noob-tester init --ticket <TICKET-ID> --task "Claim test case" --labels "claim")
  SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
  RUN_ID=$(echo "$INIT" | jq -r '.runId')
  RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
  echo "Created new run pack: $RUNPACK_ID"
else
  # Use latest pack
  RUNPACK_ID="$LATEST_PACK"
  echo "Using latest run pack: $RUNPACK_ID"
fi

# ── Populate all test cases as pending entries ────────────────────────────
# Fetch all test cases for the ticket
TEST_CASES=$(noob-tester testcase list --ticket <TICKET-ID> --json)
TC_COUNT=$(echo "$TEST_CASES" | jq 'length')

if [ "$TC_COUNT" -eq 0 ]; then
  echo "ERROR: No test cases found for ticket <TICKET-ID>"
  exit 1
fi

# Check for already-claimed/done entries in the run pack to filter them out
CLAIMED_IDS="[]"
PACK_ENTRIES=$(noob-tester runpack list --pack "$RUNPACK_ID" --json)
PACK_ENTRY_COUNT=$(echo "$PACK_ENTRIES" | jq 'length')

if [ "$PACK_ENTRY_COUNT" -gt 0 ]; then
  # Build a set of tc_ids that are already claimed/running/done
  # Statuses to exclude: claimed, running, passed, failed, skipped, blocked
  CLAIMED_IDS=$(echo "$PACK_ENTRIES" | jq '
    [.[] | select(
      .status == "claimed" or
      .status == "running" or
      .status == "passed" or
      .status == "failed" or
      .status == "skipped" or
      .status == "blocked"
    ) | .tc_id]
  ')
  echo "Run pack $RUNPACK_ID — $(echo "$CLAIMED_IDS" | jq 'length') already claimed/done entries will be filtered."
fi

# Filter and populate only pending/unclaimed test cases
PENDING=$(echo "$TEST_CASES" | jq --argjson claimed "$CLAIMED_IDS" '
  [.[] |
    select(.id as $id | $claimed | index($id) | not)
  ]
')
PENDING_COUNT=$(echo "$PENDING" | jq 'length')

if [ "$PENDING_COUNT" -gt 0 ]; then
  echo "Populating $PENDING_COUNT pending test cases into run pack..."
  noob-tester runpack populate "$RUNPACK_ID" <TICKET-ID> --status pending
fi

echo "$PENDING_COUNT test case entries queued in run pack $RUNPACK_ID."
# ────────────────────────────────────────────────────────────────────────────
```

---

## Mode C — Setup only (no claim)

Create the run pack and populate all test cases as pending, but do NOT claim any entry. Use this when you want to set up the run pack ahead of time and let a separate invocation (Mode B) do the claiming.

```bash
# Get the latest run pack for this ticket (if exists)
LATEST_PACK=$(noob-tester runpack list --ticket <TICKET-ID> --json | jq -r '.[0].run_pack_id // empty')

NEW_PACK_REQUESTED=false  # set to true if agent passes --new-runpack flag

if [ -z "$LATEST_PACK" ] || [ "$NEW_PACK_REQUESTED" = "true" ]; then
  INIT=$(noob-tester init --ticket <TICKET-ID> --task "Claim test case" --labels "claim")
  SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
  RUN_ID=$(echo "$INIT" | jq -r '.runId')
  RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
  echo "Created new run pack: $RUNPACK_ID"
else
  RUNPACK_ID="$LATEST_PACK"
  echo "Using latest run pack: $RUNPACK_ID"
fi

TEST_CASES=$(noob-tester testcase list --ticket <TICKET-ID> --json)
TC_COUNT=$(echo "$TEST_CASES" | jq 'length')

if [ "$TC_COUNT" -eq 0 ]; then
  echo "ERROR: No test cases found for ticket <TICKET-ID>"
  exit 1
fi

CLAIMED_IDS="[]"
PACK_ENTRIES=$(noob-tester runpack list --pack "$RUNPACK_ID" --json)
PACK_ENTRY_COUNT=$(echo "$PACK_ENTRIES" | jq 'length')

if [ "$PACK_ENTRY_COUNT" -gt 0 ]; then
  CLAIMED_IDS=$(echo "$PACK_ENTRIES" | jq '
    [.[] | select(
      .status == "claimed" or
      .status == "running" or
      .status == "passed" or
      .status == "failed" or
      .status == "skipped" or
      .status == "blocked"
    ) | .tc_id]
  ')
  echo "Run pack $RUNPACK_ID — $(echo "$CLAIMED_IDS" | jq 'length') already claimed/done entries will be filtered."
fi

PENDING=$(echo "$TEST_CASES" | jq --argjson claimed "$CLAIMED_IDS" '
  [.[] |
    select(.id as $id | $claimed | index($id) | not)
  ]
')
PENDING_COUNT=$(echo "$PENDING" | jq 'length')

if [ "$PENDING_COUNT" -gt 0 ]; then
  echo "Populating $PENDING_COUNT pending test cases into run pack..."
  noob-tester runpack populate "$RUNPACK_ID" <TICKET-ID> --status pending
fi

echo "$PENDING_COUNT test case entries queued in run pack $RUNPACK_ID."
echo "Run pack ready. Use Mode B with RUNPACK_ID=$RUNPACK_ID to claim and execute."
# No claim — stop here.
```

---

## Mode B — Subsequent invocations (RUNPACK_ID already known)

Use the latest run pack for the ticket and claim the next pending entry.

```bash
# Get the latest run pack for this ticket
RUNPACK_ID=$(noob-tester runpack list --ticket <TICKET-ID> --json | jq -r '.[0].run_pack_id // empty')

if [ -z "$RUNPACK_ID" ]; then
  echo "ERROR: No run pack found for ticket <TICKET-ID>. Start with Mode A first."
  exit 1
fi
```

---

## Claim Next Entry (Default)

```bash
noob-tester runpack claim-smart --pack "$RUNPACK_ID" --ticket <TICKET-ID> --layer ui --risk > /tmp/claim.json
CLAIM=$(cat /tmp/claim.json)
CLAIMED=$(echo "$CLAIM" | jq -r '.claimed')

if [ "$CLAIMED" = "false" ]; then
  echo "All test cases complete for run pack $RUNPACK_ID"
  exit 0
fi

ENTRY_ID=$(echo "$CLAIM"   | jq -r '.entry.id')
TC_ID=$(echo "$CLAIM"      | jq -r '.entry.tc_id')
TC_TITLE=$(echo "$CLAIM"   | jq -r '.entry.tc.title')
TC_FORMAT=$(echo "$CLAIM"  | jq -r '.entry.tc.format')

echo "Claimed: $TC_TITLE (entry $ENTRY_ID, format: $TC_FORMAT)"
echo "Pass RUNPACK_ID=$RUNPACK_ID and CLAIM to noob-explore for execution."
```

---

## Claim Specific Test Case by Name/Title/ID

When user targets a specific test case, bypass pending filtering and claim it regardless of status.

### Claim by title (exact match required)

```bash
TC_TITLE="<exact-test-case-title>"

# Find all matching test cases in the ticket
MATCHES=$(noob-tester testcase list --ticket <TICKET-ID> --json | jq "[.[] | select(.title | contains(\"$TC_TITLE\"))]")
MATCH_COUNT=$(echo "$MATCHES" | jq 'length')

# Validate: exactly one match
if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "ERROR: No test case matches '$TC_TITLE'"
  echo ""
  echo "Available test cases:"
  noob-tester testcase list --ticket <TICKET-ID> --json | jq '.[] | {title, status}'
  exit 1
fi

if [ "$MATCH_COUNT" -gt 1 ]; then
  echo "ERROR: Multiple test cases match '$TC_TITLE' (ambiguous)"
  echo ""
  echo "Matching test cases:"
  echo "$MATCHES" | jq '.[] | {title, status}'
  exit 1
fi

# Get the tc_id of the exact match
TC_ID=$(echo "$MATCHES" | jq -r '.[0].id')

# Get latest run pack (or create if none exists)
RUNPACK_ID=$(noob-tester runpack list --ticket <TICKET-ID> --json | jq -r '.[0].run_pack_id // empty')
if [ -z "$RUNPACK_ID" ]; then
  INIT=$(noob-tester init --ticket <TICKET-ID> --task "Claim test case" --labels "claim")
  RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
fi

# Claim by name (bypasses pending filtering)
noob-tester runpack claim-smart --pack "$RUNPACK_ID" --ticket <TICKET-ID> --layer ui --name "$TC_TITLE" > /tmp/claim.json
CLAIM=$(cat /tmp/claim.json)
CLAIMED=$(echo "$CLAIM" | jq -r '.claimed')

if [ "$CLAIMED" != "true" ]; then
  echo "ERROR: Could not claim test case '$TC_TITLE'"
  exit 1
fi

ENTRY_ID=$(echo "$CLAIM" | jq -r '.entry.id')
echo "Claimed: $TC_TITLE (entry $ENTRY_ID) — bypassed status filtering"
```

### Claim by tc_id

```bash
TC_ID="<test-case-id>"

# Get latest run pack
RUNPACK_ID=$(noob-tester runpack list --ticket <TICKET-ID> --json | jq -r '.[0].run_pack_id // empty')
if [ -z "$RUNPACK_ID" ]; then
  INIT=$(noob-tester init --ticket <TICKET-ID> --task "Claim test case" --labels "claim")
  RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
fi

# Find the entry for this tc_id in the run pack
ENTRY=$(noob-tester runpack list --pack "$RUNPACK_ID" --json | jq '.[] | select(.tc_id == "'"$TC_ID"'")')
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')

# If entry doesn't exist in pack, add it
if [ -z "$ENTRY_ID" ] || [ "$ENTRY_ID" = "null" ]; then
  noob-tester runpack populate "$RUNPACK_ID" <TICKET-ID> --tc-id "$TC_ID" --status pending
  ENTRY=$(noob-tester runpack list --pack "$RUNPACK_ID" --json | jq '.[] | select(.tc_id == "'"$TC_ID"'")')
  ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
fi

# Claim the entry directly by entry ID or via claim-smart
noob-tester runpack claim-smart --pack "$RUNPACK_ID" --ticket <TICKET-ID> --layer ui --entry "$ENTRY_ID" > /tmp/claim.json
CLAIM=$(cat /tmp/claim.json)
CLAIMED=$(echo "$CLAIM" | jq -r '.claimed')

if [ "$CLAIMED" != "true" ]; then
  echo "ERROR: Could not claim test case with ID '$TC_ID'"
  exit 1
fi

TC_TITLE=$(echo "$CLAIM" | jq -r '.entry.tc.title')
echo "Claimed: $TC_TITLE (tc_id: $TC_ID, entry: $ENTRY_ID) — bypassed status filtering"
```

---

## Return Values

Pass these to `noob-explore`:

```bash
RUNPACK_ID=<runpack-id>     # persist across invocations
ENTRY_ID=<entry-id>         # the claimed entry
CLAIM=<json>                # full claim output (entry + tc data from /tmp/claim.json)
```

## Rules

- Always save claim output to `/tmp/claim.json` to avoid shell escaping issues with nested JSON.
- Do NOT modify or re-claim entries — each entry is owned by exactly one invocation.
- If `claimed` is `false`, all tests are done — stop and report completion.
- When user targets a specific test case by name/title/id, bypass all filtering and claim it regardless of status.
- Always use the latest run pack for the ticket — no environment variables needed.
