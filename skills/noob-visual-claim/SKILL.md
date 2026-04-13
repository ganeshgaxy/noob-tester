---
name: noob-visual-claim
description: Claim the next visual test case from a visual run. Supports creating a new run (first invocation) or resuming an existing one. Returns $CLAIM for noob-visual to execute.
---

# Visual Test Case Claiming

Claim one visual test case entry from a visual run. Pass `$CLAIM` to `noob-visual` for execution.

## Output

Returns `$CLAIM` JSON with the claimed entry and its full test case data:

```json
{
    "claimed": true,
    "entry": {
        "id": "<entry-id>",
        "visual_run_id": "<run-id>",
        "visual_tc_id": "<tc-id>",
        "status": "running",
        "tc": {
            "id": "<tc-id>",
            "title": "Homepage layout",
            "viewport": "1280x720",
            "default_threshold": 0.1,
            "steps_json": "[...]"
        }
    }
}
```

When `"claimed": false`, all entries in the run are done — call `visual-run complete`.

## Prerequisites

- Ticket ID (`TICKET-ID`)
- Mode: `baseline` or `verification`
- Secret target name + role
- `VISUAL_RUN_ID` — **auto-created on first invocation**, reuse on subsequent ones

---

## Mode A — First invocation (no VISUAL_RUN_ID yet)

Create the visual run, populate all test case entries as pending, then claim the first one.

```bash
# Resolve target URL
TARGET_URL=$(noob-tester secrets target list --json | jq -r '.[] | select(.name == "<target-name>") | .url')
if [ -z "$TARGET_URL" ] || [ "$TARGET_URL" = "null" ]; then
  echo "ERROR: Could not resolve URL for '<target-name>'. Available targets:"
  noob-tester secrets target list --json | jq '.[].name'
  exit 1
fi

# Create the visual run
VISUAL_RUN_ID=$(noob-tester visual-run start \
  --ticket <TICKET-ID> \
  --mode <baseline|verification> \
  --target-url "$TARGET_URL" \
  --secret-target <target-name> \
  --secret-role <role> | jq -r '.visualRunId')

# Populate one pending entry per visual test case (do this ONCE per run)
VISUAL_TCS=$(noob-tester visual-tc list --ticket <TICKET-ID> --json)
TC_COUNT=$(echo "$VISUAL_TCS" | jq 'length')

if [ "$TC_COUNT" -eq 0 ]; then
  echo "ERROR: No active visual test cases found for ticket <TICKET-ID>"
  exit 1
fi

echo "$VISUAL_TCS" | jq -r '.[].id' | while read -r TC_ID; do
  noob-tester visual-run entry-create \
    --run "$VISUAL_RUN_ID" --tc "$TC_ID" --ticket <TICKET-ID> > /dev/null
done

echo "Visual run created: $VISUAL_RUN_ID  ($TC_COUNT test cases queued)"
```

---

## Mode B — Subsequent invocations (VISUAL_RUN_ID already known)

Skip run creation — just claim the next pending entry.

```bash
VISUAL_RUN_ID=<existing-visual-run-id>
```

---

## Claim Next Entry

```bash
noob-tester visual-run claim-next "$VISUAL_RUN_ID" > /tmp/visual-claim.json
CLAIM=$(cat /tmp/visual-claim.json)
CLAIMED=$(echo "$CLAIM" | jq -r '.claimed')

if [ "$CLAIMED" = "false" ]; then
  echo "All visual test cases complete for run $VISUAL_RUN_ID"
  noob-tester visual-run complete "$VISUAL_RUN_ID"
  exit 0
fi

ENTRY_ID=$(echo "$CLAIM"   | jq -r '.entry.id')
TC_ID=$(echo "$CLAIM"      | jq -r '.entry.tc.id')
TC_TITLE=$(echo "$CLAIM"   | jq -r '.entry.tc.title')
VIEWPORT=$(echo "$CLAIM"   | jq -r '.entry.tc.viewport')
STEP_COUNT=$(echo "$CLAIM" | jq -r '.entry.tc.steps_json | length')

echo "Claimed: $TC_TITLE  (entry $ENTRY_ID, $STEP_COUNT steps, viewport $VIEWPORT)"
echo "Pass VISUAL_RUN_ID=$VISUAL_RUN_ID and CLAIM to noob-visual for execution."
```

---

## Return Values

Pass these to `noob-visual`:

```bash
VISUAL_RUN_ID=<run-id>     # persist across invocations
ENTRY_ID=<entry-id>        # the claimed entry
CLAIM=<json>               # full claim output (entry + tc data)
```

## Rules

- Always save claim output to `/tmp/visual-claim.json` to avoid shell escaping issues with nested JSON.
- Do NOT modify or re-claim entries — each entry is owned by exactly one invocation.
- If `claimed` is `false`, call `visual-run complete` and stop.
