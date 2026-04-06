---
name: noob-rca
description: Root cause analysis — classify failures (env/flaky/bug/data/network), update patterns, suggest actions. Run after test execution.
---

# Root Cause Analysis

Classify failures from a completed run pack. Run after `/noob-explore` or `/noob-api-explore`.

## 1. Get Failed Entries

```bash
noob-tester runpack list --pack <PACK_ID> --json | jq '.[] | select(.tc_title != null and (.status == "failed" or .status == "blocked"))'
```

If zero failures → report and stop.

## 2. Clear Previous RCA

```bash
noob-tester rca clear --pack <PACK_ID>
```

## 3. Classify Each Failure

For each failed entry, capture these variables for later use in Step 4b (issue flagging):

```bash
TC_TITLE=$(echo "$ENTRY" | jq -r '.tc_title')
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
TC_ID=$(echo "$ENTRY" | jq -r '.test_case_id')
```

Then classify:

1. **Read artifacts** — `noob-tester capture list --entry <ENTRY_ID> --json` → read screenshots, console, HAR
2. **Check patterns** — `noob-tester query patterns --json`
3. **Check tech issues** — `noob-tester tech-issue check --ticket <TICKET_REF>`

### Classification Decision Tree

1. Connection refused, DNS, CORS, 502/503? → `network`
2. 401/403, login failed, session expired? → `auth_issue`
3. Timeout, waitForSelector? → `timeout`
4. Service down, wrong URL, missing config? → `env_issue`
5. "not found", stale ID, expired token? → `test_data_issue`
6. Element in snapshot but selector didn't match? → `flaky_selector`
7. Wrong value, unexpected error, logic bug? → `actual_bug`
8. Can't determine? → `unknown`

### Confidence

- **0.9-1.0** — clear evidence, obvious cause
- **0.7-0.8** — strong evidence
- **0.5-0.6** — reasonable guess
- **0.3-0.4** — weak evidence

### Suggested Action

- `retry` — transient issue
- `fix_test` — test is wrong
- `fix_app` — actual bug
- `fix_env` — environment issue
- `investigate` — needs manual review
- `skip` — known issue

## 4. Save Result

```bash
noob-tester rca save --pack <PACK_ID> --entry <ENTRY_ID> --testcase <TC_ID> \
  --classification <type> --confidence <0.0-1.0> \
  --cause "Why it failed" --evidence "What was examined" --action <action>
```

## 4b. Flag Issue (if actual_bug)

**If classification is `actual_bug`, flag a noob-tester issue with ALL captured artifacts, maps, and evidence:**

```bash
if [ "$CLASSIFICATION" = "actual_bug" ]; then
  # Get the run ID (from runpack or session context)
  RUN_ID=$(noob-tester runpack list --pack <PACK_ID> --json | jq -r '.[0].run_id // empty')
  if [ -z "$RUN_ID" ]; then
    RUN_ID=$(<run_id_from_init>)  # Use saved RUN_ID from init
  fi

  # Get all captures for this entry (screenshot, console, HAR, snapshot)
  CAPTURES=$(noob-tester capture list --entry <ENTRY_ID> --json)

  # Extract file paths
  SCREENSHOT=$(echo "$CAPTURES" | jq -r '.[] | select(.type == "screenshot") | .path // empty' | head -1)
  CONSOLE=$(echo "$CAPTURES" | jq -r '.[] | select(.type == "console") | .content // empty' | head -1)
  HAR=$(echo "$CAPTURES" | jq -r '.[] | select(.type == "har") | .path // empty' | head -1)
  SNAPSHOT=$(echo "$CAPTURES" | jq -r '.[] | select(.type == "snapshot") | .path // empty' | head -1)

  # Get location (URL) from latest capture
  LOCATION=$(echo "$CAPTURES" | jq -r '.[-1].url // empty')

  # Get map ID if it was used during capture
  MAP_ID=$(echo "$CAPTURES" | jq -r '.[0].map_id // empty' | head -1)

  # Build description with full RCA context
  DESCRIPTION="RCA Classification: actual_bug
Confidence: ${CONFIDENCE}%

Root Cause: $CAUSE

Evidence Examined: $EVIDENCE

Test Case: $TC_TITLE
Artifacts: screenshot, snapshot, console, network"

  if [ -n "$MAP_ID" ]; then
    DESCRIPTION="$DESCRIPTION
UI Map ID: $MAP_ID"
  fi

  if [ -n "$SNAPSHOT" ]; then
    DESCRIPTION="$DESCRIPTION
Snapshot: $SNAPSHOT"
  fi

  # Flag the issue with all artifacts
  noob-tester log issue $RUN_ID \
    --category functional --severity high \
    --title "[Actual Bug RCA] $CAUSE" \
    --description "$DESCRIPTION" \
    --location "$LOCATION" \
    --screenshot "$SCREENSHOT" \
    --console-log "$CONSOLE" \
    --network-data "$HAR"

  echo "✓ Issue flagged with RUN_ID=$RUN_ID, ENTRY_ID=$ENTRY_ID"
fi
```

**Important Guidelines:**

- **Only execute when `$CLASSIFICATION == "actual_bug"`** — skip for env_issue, flaky, timeout, etc.
- **Artifacts must be from the failed run** — `capture list --entry` ensures you get the right captures
- **Include map ID if available** — it links the issue to the UI elements involved
- **Console and HAR are optional** — only include if they exist
- **Screenshot is critical** — always include for visual debugging

## 5. Summary

```bash
noob-tester rca summary --pack <PACK_ID>
noob-tester log action $RUN_ID --phase 4 --agent rca \
  --description "RCA: N failures — X actual bugs, Y env, Z flaky"
```

## Tips

- API failures → look at HTTP status + response body
- UI failures → need screenshot + snapshot + console together
- Multiple failures with same root cause → classify first as real, rest as cascading (`env_issue`)
