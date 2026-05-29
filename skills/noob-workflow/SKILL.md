---
name: noob-workflow
description: Register one or more ticket IDs into the ticket_workflow table and set them up for processing. Run this first when tickets enter the QA pool. Accepts a single ticket or a space/comma-separated list. Creates the canonical workflow record that all other skills (analyze, plan, test) track against.
---

# Ticket Workflow Setup

Register one or more ticket IDs in the workflow system so their full lifecycle can be tracked — from `new` through `running` to `completed`.

## Usage

```bash
# /noob-workflow <TICKET-ID>
# /noob-workflow <TICKET-ID-1> <TICKET-ID-2> <TICKET-ID-3>
# /noob-workflow SP-123, SP-124, SP-125
```

Parse all ticket IDs from the args — split on spaces and/or commas, strip whitespace, ignore empty tokens.

## 1. Create Session

Use the first ticket ID (or a combined label) for the session:

```bash
INIT=$(noob-tester init --ticket <FIRST-TICKET-ID> --task "Workflow setup: <ALL-TICKET-IDS>" --labels "workflow")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
noob-tester session heartbeat $SESSION_ID --phase 1 --run-id $RUN_ID
```

## 2. For each ticket ID, register it

Loop through every ticket ID and run the following:

```bash
# Check if already registered
EXISTING=$(noob-tester ticket-workflow get <TICKET-ID> --json 2>/dev/null)
STATUS=$(echo "$EXISTING" | jq -r '.status // empty')

# Register if new
if [ -z "$STATUS" ]; then
  noob-tester ticket-workflow add <TICKET-ID> --json
fi

# Log action
noob-tester log action $RUN_ID --phase 1 --agent workflow --description "Ticket <TICKET-ID> registered in workflow"

# Get final state
noob-tester ticket-workflow get <TICKET-ID> --json
```

Each registration creates a row with:
- `status: new`
- `progress: 0`
- `active: 0`
- `added_at`: current timestamp

If a ticket already exists, skip registration (idempotent) and just report current state.

## 3. Complete

```bash
noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "Workflow setup complete for <ALL-TICKET-IDS>"
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):

> Done. Session: $SESSION_ID

## Output

For each ticket, output whether it was newly registered or already existed, and its current state:

```json
[
  {
    "ticket_id": "PROJ-123",
    "status": "new",
    "registered": true,
    "added_at": "2026-05-18 10:00:00",
    "run_count": 0,
    "analysis_count": 0,
    "plan_count": 0,
    "test_case_count": 0,
    "issue_count": 0
  },
  {
    "ticket_id": "PROJ-124",
    "status": "running",
    "registered": false,
    "added_at": "2026-05-17 09:00:00",
    "run_count": 2,
    "analysis_count": 4,
    "plan_count": 1,
    "test_case_count": 12,
    "issue_count": 3
  }
]
```

## Notes

- Ticket IDs are always uppercased automatically (e.g. `proj-123` → `PROJ-123`)
- Registration is idempotent — existing tickets are reported but not overwritten
- This skill only registers tickets. Transitioning to `queued` or `running` is done by the orchestrator
- To update status later: `noob-tester ticket-workflow transition <TICKET-ID> --status queued`
