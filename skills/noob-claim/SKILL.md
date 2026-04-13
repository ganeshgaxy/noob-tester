---
name: noob-claim
description: Claim test cases from run packs. Supports claiming next unclaimed test, claiming by name (with validation), and retrying specific tests.
---

# Test Case Claiming

Claim test cases from a run pack for execution. Handles three modes: claim next, claim by name, and retry.

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

Pass `$CLAIM` to noob-explore skill for test execution.

## Prerequisites

- Ticket ID (`TICKET-ID`)
- Session ID (`SESSION_ID`) — **auto-created if not provided**
- Run pack ID (`RUNPACK_ID`) — **auto-created if not provided**

If RUNPACK_ID doesn't exist, create it first:
```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --task "Claim test case" --labels "claim")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
```

---

## Input

Inputs from orchestrator (e.g., noob-pool):

```bash
TICKET_ID=<ticket-id>
RUNPACK_ID=<runpack-id>
SESSION_ID=<session-id>
RUN_ID=<run-id>
TC_TITLE=<test-case-title>  # optional — if omitted, claim next pending
```

## Mode A: Claim next unclaimed test case (default)

```bash
# Fetch the next pending entry from the run pack
ENTRY=$(noob-tester runpack claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk)

# Check if all tests are done
CLAIMED=$(echo "$ENTRY" | jq -r '.claimed // false')

if [ "$CLAIMED" = "false" ]; then
  echo "All test cases completed for run pack $RUNPACK_ID"
  exit 0
fi

# Extract entry and TC data
ENTRY_ID=$(echo "$ENTRY" | jq -r '.entry.id')
TC_ID=$(echo "$ENTRY" | jq -r '.entry.tc_id')
TC_TITLE=$(echo "$ENTRY" | jq -r '.entry.tc.title')
TC_FORMAT=$(echo "$ENTRY" | jq -r '.entry.tc.format')

# Build $CLAIM output (matching noob-visual-claim format)
CLAIM=$(cat <<EOF
{
  "claimed": true,
  "entry": {
    "id": "$ENTRY_ID",
    "runpack_id": "$RUNPACK_ID",
    "tc_id": "$TC_ID",
    "status": "running",
    "tc": $(echo "$ENTRY" | jq '.entry.tc')
  }
}
EOF
)

# Save to /tmp/claim.json for noob-explore to use
echo "$CLAIM" > /tmp/claim.json

echo "Claimed: $TC_TITLE (entry $ENTRY_ID)"
```

## Mode A+: Claim by name with validation

⚠️ **CRITICAL: Validate matches before claiming**

```bash
TC_TITLE="<exact-test-case-title>"

# Find all matching test cases
MATCHES=$(noob-tester runpack list --pack $RUNPACK_ID --json | jq "[.[] | select(.tc_title | contains(\"$TC_TITLE\"))]")
MATCH_COUNT=$(echo "$MATCHES" | jq 'length')

# Check for zero matches
if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "ERROR: No test case matches '$TC_TITLE'"
  echo ""
  echo "Available test cases in pack:"
  noob-tester runpack list --pack $RUNPACK_ID --json | jq '.[] | {tc_title, status}'
  exit 1
fi

# Check for multiple matches (ambiguous)
if [ "$MATCH_COUNT" -gt 1 ]; then
  echo "ERROR: Multiple test cases match '$TC_TITLE' (ambiguous)"
  echo ""
  echo "Matching test cases:"
  echo "$MATCHES" | jq '.[] | {tc_title, status}'
  exit 1
fi

# Exactly one match — proceed to claim
ENTRY=$(noob-tester runpack claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --name "$TC_TITLE")

ENTRY_ID=$(echo "$ENTRY" | jq -r '.entry.id')
TC_ID=$(echo "$ENTRY" | jq -r '.entry.tc_id')
TC_FORMAT=$(echo "$ENTRY" | jq -r '.entry.tc.format')

# Build $CLAIM output
CLAIM=$(cat <<EOF
{
  "claimed": true,
  "entry": {
    "id": "$ENTRY_ID",
    "runpack_id": "$RUNPACK_ID",
    "tc_id": "$TC_ID",
    "status": "running",
    "tc": $(echo "$ENTRY" | jq '.entry.tc')
  }
}
EOF
)

# Save to /tmp/claim.json for noob-explore to use
echo "$CLAIM" > /tmp/claim.json

echo "Claimed: $TC_TITLE (entry $ENTRY_ID)"
```

## Mode B: Retry a specific test case by title or tc_id

Use when retrying a previously failed/passed/blocked test.

### Retry by tc_title (preferred — human-readable)

```bash
# Reset the test case's status back to pending
noob-tester runpack retry --name "<tc_title>" --pack $RUNPACK_ID

# Now claim it (will be at top of queue)
ENTRY=$(noob-tester runpack claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk)

ENTRY_ID=$(echo "$ENTRY" | jq -r '.entry.id')
TC_ID=$(echo "$ENTRY" | jq -r '.entry.tc_id')
TC_TITLE=$(echo "$ENTRY" | jq -r '.entry.tc.title')

# Build $CLAIM output
CLAIM=$(cat <<EOF
{
  "claimed": true,
  "entry": {
    "id": "$ENTRY_ID",
    "runpack_id": "$RUNPACK_ID",
    "tc_id": "$TC_ID",
    "status": "running",
    "tc": $(echo "$ENTRY" | jq '.entry.tc')
  }
}
EOF
)

echo "$CLAIM" > /tmp/claim.json
```

### Retry by tc_id

```bash
# Find entry by tc_id
ENTRY=$(noob-tester runpack list --pack $RUNPACK_ID --json | jq '.[] | select(.tc_id == "<tc-id>")')
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')

# Reset and claim
noob-tester runpack retry --pack $RUNPACK_ID --entry $ENTRY_ID

ENTRY=$(noob-tester runpack claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk)

# Build and save $CLAIM
CLAIM=$(cat <<EOF
{
  "claimed": true,
  "entry": {
    "id": "$(echo "$ENTRY" | jq -r '.entry.id')",
    "runpack_id": "$RUNPACK_ID",
    "tc_id": "$(echo "$ENTRY" | jq -r '.entry.tc_id')",
    "status": "running",
    "tc": $(echo "$ENTRY" | jq '.entry.tc')
  }
}
EOF
)

echo "$CLAIM" > /tmp/claim.json
```

## Return Values

After claiming, `$CLAIM` (saved to `/tmp/claim.json`) will contain:

```bash
CLAIM=$(cat /tmp/claim.json)

# Extract for use in noob-explore
ENTRY_ID=$(echo "$CLAIM" | jq -r '.entry.id')
TC_ID=$(echo "$CLAIM" | jq -r '.entry.tc_id')
TC_TITLE=$(echo "$CLAIM" | jq -r '.entry.tc.title')
TC_FORMAT=$(echo "$CLAIM" | jq -r '.entry.tc.format')
BDD_GIVEN=$(echo "$CLAIM" | jq '.entry.tc.bdd_given // empty')
BDD_WHEN=$(echo "$CLAIM" | jq '.entry.tc.bdd_when // empty')
BDD_THEN=$(echo "$CLAIM" | jq '.entry.tc.bdd_then // empty')
TRAD_STEPS=$(echo "$CLAIM" | jq '.entry.tc.trad_steps // empty')
```

Pass `$CLAIM` directly to `noob-explore` for execution.
