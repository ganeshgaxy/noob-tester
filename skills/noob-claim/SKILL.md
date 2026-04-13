---
name: noob-claim
description: Claim test cases from run packs. Supports claiming next unclaimed test, claiming by name (with validation), and retrying specific tests.
---

# Test Case Claiming

Claim test cases from a run pack for execution. Handles three modes: claim next, claim by name, and retry.

## Output

Returns `$ENTRY` JSON object with the claimed test case:
```json
{
  "id": "<entry-id>",
  "tc_title": "Test case title",
  "tc_format": "bdd",
  "test_case_id": "<id>",
  "status": "claimed"
}
```

Pass `$ENTRY` to noob-explore skill for test execution.

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

## Mode A: Claim next unclaimed test case (default)

```bash
# Save output to file to avoid shell escaping issues with deeply nested JSON
noob-tester claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk > /tmp/claim.json
ENTRY=$(cat /tmp/claim.json)

# Check if all tests are done
DONE=$(echo "$ENTRY" | jq -r '.done // empty')
if [ "$DONE" = "true" ]; then
  echo "All test cases completed"
  exit 0
fi

ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
TC_TITLE=$(echo "$ENTRY" | jq -r '.tc_title')
```

## Mode A+: Claim by name with validation

⚠️ **CRITICAL: Validate matches before claiming**

```bash
PARTIAL_TITLE="<partial-title>"

# Find all matching test cases
MATCHES=$(noob-tester runpack list --pack $RUNPACK_ID --json | jq "[.[] | select(.tc_title | contains(\"$PARTIAL_TITLE\"))]")
MATCH_COUNT=$(echo "$MATCHES" | jq 'length')

# Check for zero matches
if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "ERROR: No test case matches '$PARTIAL_TITLE'"
  echo ""
  echo "Available test cases in pack:"
  noob-tester runpack list --pack $RUNPACK_ID --json | jq '.[] | {tc_title, status}'
  exit 1
fi

# Check for multiple matches (ambiguous)
if [ "$MATCH_COUNT" -gt 1 ]; then
  echo "ERROR: Multiple test cases match '$PARTIAL_TITLE' (ambiguous)"
  echo ""
  echo "Matching test cases:"
  echo "$MATCHES" | jq '.[] | {tc_title, status}'
  exit 1
fi

# Exactly one match — proceed to claim
noob-tester claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --name "$PARTIAL_TITLE" > /tmp/claim.json
ENTRY=$(cat /tmp/claim.json)
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
TC_TITLE=$(echo "$ENTRY" | jq -r '.tc_title')
```

## Mode B: Retry a specific test case by title or test_case_id

Use when retrying a previously failed/passed/blocked test.

⚠️ **Important field distinction:**

- `.id` = the entry ID (run pack entry ID) — unique per run
- `.test_case_id` = the actual test case ID — same across runs
- `.tc_title` = the human-readable test case title (same as `--name` in retry command)

### Retry by tc_title (preferred — human-readable)

```bash
# Reset the test case's status back to pending
noob-tester runpack retry --name "<tc_title>" --pack $RUNPACK_ID

# Now claim it (will be at top of queue)
noob-tester claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk > /tmp/claim.json
ENTRY=$(cat /tmp/claim.json)
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
TC_TITLE=$(echo "$ENTRY" | jq -r '.tc_title')
```

### Retry by test_case_id

```bash
# Find entry by test_case_id
ENTRY=$(noob-tester runpack list --pack $RUNPACK_ID --json | jq '.[] | select(.test_case_id == "<test-case-id>")')
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')

# Reset and claim
noob-tester runpack retry --pack $RUNPACK_ID --entry $ENTRY_ID

noob-tester claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk > /tmp/claim.json
ENTRY=$(cat /tmp/claim.json)
```

### Retry in the latest run pack for the ticket

```bash
noob-tester runpack retry --name "<tc_title>"

# Then claim from the latest run pack
noob-tester claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk > /tmp/claim.json
ENTRY=$(cat /tmp/claim.json)
```

## Return Values

After claiming, the `$ENTRY` will contain:

```json
{
  "id": "<entry-id>",
  "tc_title": "...",
  "tc_format": "bdd|gherkin|...",
  "test_case_id": "<test-case-id>",
  "status": "claimed",
  "done": false
}
```

Use these for subsequent operations:
```bash
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
TC_TITLE=$(echo "$ENTRY" | jq -r '.tc_title')
TC_FORMAT=$(echo "$ENTRY" | jq -r '.tc_format')
```
