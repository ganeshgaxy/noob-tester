---
name: noob-visual
description: Execute ONE pre-claimed visual test case (BDD/traditional format with visual_steps config). Baseline mode captures screenshots, verification mode does pixel-by-pixel diffs. Includes trace, profiler, console, and error collection.
---

# Visual Test Runner

Execute **ONE** pre-claimed visual test case per invocation using its **BDD or traditional steps** with **visual_steps config** that specifies which steps capture screenshots and how.

**Modes:**
- **Baseline** — execute steps → capture screenshots → store as baseline
- **Verification** — execute steps → capture screenshots → diff each against baseline → record pass/fail

Use `noob-visual-claim` first to create/resume a visual run and claim the next entry. Pass `$CLAIM` and `$VISUAL_RUN_ID` to this skill.

## Telemetry Configuration

Optional inputs (all have defaults — omit to use defaults):

| Input             | Default    | Description                                              |
| ----------------- | ---------- | -------------------------------------------------------- |
| `DEVICE`          | `web`      | Browser device type (`web`, `mobile`, `tablet`)          |
| `DIMENSION`       | `standard` | Viewport dimension preset (`standard`, `wide`, `narrow`) |
| `ENABLE_TRACE`    | `true`     | Collect Playwright trace for entire test case run        |
| `ENABLE_PROFILER` | `true`     | Collect CPU profile for entire test case run             |
| `ENABLE_CONSOLE`  | `true`     | Collect console logs (JSON) per step                     |
| `ENABLE_ERRORS`   | `true`     | Collect page errors per step                             |

Set at top of script:

```bash
DEVICE="${DEVICE:-web}"
DIMENSION="${DIMENSION:-standard}"
ENABLE_TRACE="${ENABLE_TRACE:-true}"
ENABLE_PROFILER="${ENABLE_PROFILER:-true}"
ENABLE_CONSOLE="${ENABLE_CONSOLE:-true}"
ENABLE_ERRORS="${ENABLE_ERRORS:-true}"
```

---

## Prerequisites

Inputs from `noob-visual-claim` (or `noob-pool`):

```bash
# Try to read from claim file passed by orchestrator (noob-pool), or use default
CLAIM_FILE="${CLAIM_FILE:-/tmp/visual-claim.json}"

# Support claim file path passed in invocation (e.g., "from /tmp/pool-visual-claim-0.json")
if [[ "$INVOCATION" == *"/tmp/pool-visual-claim"* ]]; then
  CLAIM_FILE=$(echo "$INVOCATION" | grep -oP '/tmp/pool-visual.*\.json')
fi

if [ ! -f "$CLAIM_FILE" ]; then
  echo "ERROR: Claim file not found at $CLAIM_FILE"
  exit 1
fi

CLAIM=$(cat "$CLAIM_FILE")

VISUAL_RUN_ID=$(echo "$CLAIM" | jq -r '.entry.visual_run_id')
ENTRY_ID=$(echo "$CLAIM" | jq -r '.entry.id')
TC_ID=$(echo "$CLAIM"    | jq -r '.entry.tc.id')
TC_TITLE=$(echo "$CLAIM" | jq -r '.entry.tc.title')
TC_TYPE=$(echo "$CLAIM"  | jq -r '.entry.tc.type')
TC_FORMAT=$(echo "$CLAIM" | jq -r '.entry.tc.format')
VIEWPORT=$(echo "$CLAIM" | jq -r '.entry.tc.viewport')
THRESHOLD=$(echo "$CLAIM" | jq -r '.entry.tc.default_threshold')

# steps_json — flat action steps (action/label/description/waitMs + optional diffType/fullPage)
STEPS_JSON=$(echo "$CLAIM" | jq '.entry.tc.steps_json // empty')

# BDD or Traditional steps (fallback when steps_json is absent)
BDD_GIVEN=$(echo "$CLAIM" | jq '.entry.tc.bdd_given // empty')
BDD_WHEN=$(echo "$CLAIM"  | jq '.entry.tc.bdd_when // empty')
BDD_THEN=$(echo "$CLAIM"  | jq '.entry.tc.bdd_then // empty')
TRAD_STEPS=$(echo "$CLAIM" | jq '.entry.tc.trad_steps // empty')

# Visual steps config (specifies which stepIndexes have screenshots)
VISUAL_STEPS=$(echo "$CLAIM" | jq '.entry.tc.visual_steps_json // .entry.tc.visual_steps // "[]"')
```

---

## 1. Resolve Target + Initialize

Resolve the target URL from the secret target name. Do NOT guess or hardcode URLs.

```bash
TARGET_URL=$(noob-tester secrets target list --json | jq -r '.[] | select(.name == "<target-name>") | .url')
if [ -z "$TARGET_URL" ] || [ "$TARGET_URL" = "null" ]; then
  echo "ERROR: Could not resolve URL for '<target-name>'"
  exit 1
fi

INIT=$(noob-tester init --ticket <TICKET-ID> --target-url "$TARGET_URL" \
  --task "Visual <baseline|verification>: $TC_TITLE" --labels "visual-run" \
  --secret-target <target-name> --secret-role <role>)
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
EVIDENCE_DIR=$(echo "$INIT" | jq -r '.evidenceDir')
STREAM_PORT=$(echo "$INIT" | jq -r '.streamPort')

if [ -n "$STREAM_PORT" ] && [ "$STREAM_PORT" != "null" ]; then
  agent-browser stream disable 2>/dev/null
  agent-browser stream enable --port "$STREAM_PORT"
fi

noob-tester session heartbeat $SESSION_ID --phase 4 --run-id $RUN_ID

# ── Telemetry: start trace and profiler for the entire test case run ──────────
TRACE_PATH=""
PROFILE_PATH=""
if [ "$ENABLE_TRACE" = "true" ]; then
  TRACE_PATH="$EVIDENCE_DIR/trace-${ENTRY_ID}.zip"
  agent-browser trace start "$TRACE_PATH"
fi
if [ "$ENABLE_PROFILER" = "true" ]; then
  PROFILE_PATH="$EVIDENCE_DIR/profile-${ENTRY_ID}.json"
  agent-browser profiler start "$PROFILE_PATH"
fi

ACTION_N=1
PREV_PAGE_ID=""
```

---

## 2. Login

Resolve credentials and log in. Read the snapshot to discover real element refs — NEVER guess or hardcode.

```bash
CREDS=$(noob-tester auth-resolve --target <target-name> --role <role>)
if [ -z "$CREDS" ] || echo "$CREDS" | jq -e '.error' > /dev/null 2>&1; then
  echo "ERROR: No credentials found for target '<target-name>' with role '<role>'."
  noob-tester visual-run entry-update "$ENTRY_ID" --status skipped --result '{"reason":"no_credentials"}'
  noob-tester session end $SESSION_ID --status failed
  exit 1
fi
EMAIL=$(echo "$CREDS"    | jq -r '.email')
PASSWORD=$(echo "$CREDS" | jq -r '.password')

agent-browser open "$TARGET_URL"
agent-browser viewport "$VIEWPORT"

# ╔══════════════════════════════════════════════════════════════════╗
# ║ SNAPSHOT READING — find real @eN refs before every interaction  ║
# ║                                                                 ║
# ║ 1. capture-page returns .files.snapshot — READ IT              ║
# ║ 2. Find refs:  textbox "Email" [ref=e3]  → use '@e3'           ║
# ║ 3. NEVER hardcode CSS selectors or guess ref numbers           ║
# ╚══════════════════════════════════════════════════════════════════╝

# Step 1: Capture login page — read snapshot to find form refs
CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
  --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
  --desc "Login page" --page-name "login")
SNAPSHOT_FILE=$(echo "$CAPTURE" | jq -r '.files.snapshot')
cat "$SNAPSHOT_FILE"
# ↑ READ THIS — find email, password, and submit button refs (@eN)
PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
ACTION_N=$((ACTION_N + 1))

# Step 2: Fill form using real refs found in snapshot above
agent-browser fill '@emailRef' "$EMAIL"
agent-browser fill '@passwordRef' "$PASSWORD"

CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
  --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
  --desc "Login form filled" --page-name "login-filled" --prev-page $PREV_PAGE_ID)
PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
ACTION_N=$((ACTION_N + 1))

# Step 3: Click submit using ref from snapshot
agent-browser click '@loginRef'
agent-browser wait 3000

CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
  --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
  --desc "After login" --page-name "post-login" --prev-page $PREV_PAGE_ID)
SNAPSHOT_FILE=$(echo "$CAPTURE" | jq -r '.files.snapshot')
cat "$SNAPSHOT_FILE"
# ↑ Verify login succeeded — if still on /login, stop
PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
ACTION_N=$((ACTION_N + 1))

noob-tester runpack log $ENTRY_ID --text "Login completed — now on $(agent-browser get url)"
```

If login fails (URL still on /login, error visible) → log issue, mark entry skipped, end session, exit.

---

## 3. Execute Steps

**Prefer `steps_json` if present** (flat action list with descriptions). Fall back to BDD/traditional.

### Format A — steps_json (action/label/description/waitMs)

```bash
STEP_INDEX=0
STEP_FAILED=0

# Track console logs and errors per step
STEP_TELEMETRY="[]"

if [ -n "$STEPS_JSON" ] && [ "$STEPS_JSON" != "null" ] && [ "$STEPS_JSON" != "[]" ]; then
  STEP_COUNT=$(echo "$STEPS_JSON" | jq 'length')

  for ((i = 0; i < STEP_COUNT; i++)); do
    STEP=$(echo "$STEPS_JSON" | jq ".[$i]")
    S_ACTION=$(echo "$STEP"      | jq -r '.action')
    S_LABEL=$(echo "$STEP"       | jq -r '.label')
    S_DESC=$(echo "$STEP"        | jq -r '.description // ""')
    S_WAIT=$(echo "$STEP"        | jq -r '.waitMs // 0')
    S_URL=$(echo "$STEP"         | jq -r '.url // ""')
    S_SELECTOR=$(echo "$STEP"    | jq -r '.selector // ""')
    S_VALUE=$(echo "$STEP"       | jq -r '.value // ""')

    echo "Step $i [$S_ACTION] $S_LABEL: $S_DESC"

    # ── Perform action ──────────────────────────────────────────────────────
    case "$S_ACTION" in
      navigate)
        if [ -n "$S_URL" ] && [ "$S_URL" != "null" ]; then
          agent-browser navigate "$S_URL"
        fi
        ;;
      click)
        # Click using either explicit selector or fuzzy text matching
        if [ -n "$S_SELECTOR" ] && [ "$S_SELECTOR" != "null" ]; then
          agent-browser click "$S_SELECTOR"
        else
          # Fuzzy click by text from description (e.g. "Click Libraries" → find button containing "Libraries")
          # Extract clickable text from description (last noun/phrase after "Click" or "click")
          CLICK_TEXT=$(echo "$S_DESC" | sed -E 's/.*[Cc]lick[^a-zA-Z]*//' | sed 's/ in .*//' | xargs)
          if [ -n "$CLICK_TEXT" ]; then
            # Try to find by button role + name, then link, then generic element
            agent-browser find role button --name "$CLICK_TEXT" click 2>/dev/null || \
            agent-browser find role link --name "$CLICK_TEXT" click 2>/dev/null || \
            agent-browser find text "$CLICK_TEXT" click 2>/dev/null || \
            echo "WARNING: Could not find element for: $S_DESC"
          fi
        fi
        ;;
      fill)
        if [ -n "$S_SELECTOR" ] && [ "$S_SELECTOR" != "null" ]; then
          agent-browser fill "$S_SELECTOR" "$S_VALUE"
        else
          # Fuzzy fill by text matching (extract field name from description)
          FIELD_TEXT=$(echo "$S_DESC" | sed -E 's/.*[Ff]ill[^a-zA-Z]*//' | sed 's/ with .*//' | xargs)
          if [ -n "$FIELD_TEXT" ] && [ -n "$S_VALUE" ]; then
            agent-browser find role textbox --name "$FIELD_TEXT" fill "$S_VALUE" 2>/dev/null || \
            agent-browser find role searchbox --name "$FIELD_TEXT" fill "$S_VALUE" 2>/dev/null || \
            echo "WARNING: Could not find textbox for: $S_DESC"
          fi
        fi
        ;;
      login)
        # Login is handled in Step 2 above — skip here
        ;;
      wait)
        agent-browser wait "$S_WAIT"
        ;;
    esac

    # Wait if specified
    if [ "$S_WAIT" -gt 0 ] 2>/dev/null; then
      agent-browser wait "$S_WAIT"
    fi

    # ── Capture page after EVERY action ────────────────────────────────────
    CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
      --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
      --desc "$S_LABEL: $S_DESC" --page-name "$S_LABEL" --prev-page $PREV_PAGE_ID)

    # ── Snapshot Reading — read after every capture ─────────────────────────
    SNAPSHOT_FILE=$(echo "$CAPTURE" | jq -r '.files.snapshot')
    cat "$SNAPSHOT_FILE"
    # ↑ READ: verify action succeeded, find refs for next step, note page state

    PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
    ACTION_N=$((ACTION_N + 1))

    # ── Logging & Analysis ──────────────────────────────────────────────────
    noob-tester runpack log $ENTRY_ID --text "Step $i [$S_ACTION] $S_LABEL — now on $(agent-browser get url)"

    # Check a11y violations
    A11Y_COUNT=$(echo "$CAPTURE" | jq -r '.a11yIssues // 0')
    if [ "$A11Y_COUNT" -gt 0 ]; then
      A11Y_VIOLATIONS=$(echo "$CAPTURE" | jq -r '.a11yViolations // []')
      noob-tester runpack log $ENTRY_ID --text "a11y: $A11Y_COUNT violation(s) on $S_LABEL: $A11Y_VIOLATIONS"
    fi

    # Collect per-step console logs and errors
    STEP_CONSOLE="[]"
    STEP_ERRORS="[]"
    if [ "$ENABLE_CONSOLE" = "true" ]; then
      STEP_CONSOLE=$(agent-browser console --json 2>/dev/null || echo "[]")
      if [ "$STEP_CONSOLE" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Console (step $i / $S_LABEL): $STEP_CONSOLE"
      fi
    fi
    if [ "$ENABLE_ERRORS" = "true" ]; then
      STEP_ERRORS=$(agent-browser errors 2>/dev/null || echo "[]")
      if [ "$STEP_ERRORS" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Page errors (step $i / $S_LABEL): $STEP_ERRORS"
      fi
    fi

    # Add telemetry to step tracking
    STEP_TEL=$(printf '{"step_index":%d,"label":"%s","console_logs":%s,"console_errors":%s}' "$i" "$(echo "$S_LABEL" | sed 's/"/\\"/g')" "$STEP_CONSOLE" "$STEP_ERRORS")
    STEP_TELEMETRY=$(echo "$STEP_TELEMETRY" | jq ". += [$STEP_TEL]")

    # ── Step Validation ─────────────────────────────────────────────────────
    # After reading the snapshot, verify the action had the expected effect.
    # If the page didn't change as expected (wrong URL, element missing, error shown):
    #   noob-tester runpack observe $ENTRY_ID --text "Step $i FAILED: expected <X> but got <Y>"
    #   STEP_FAILED=1
    # Otherwise:
    #   noob-tester runpack observe $ENTRY_ID --text "Step $i OK: <what you confirmed in snapshot>"

    # ── Take visual screenshot if this step has visual config ───────────────
    CHECK_VISUAL_STEP $STEP_INDEX "$S_LABEL"

    STEP_INDEX=$((STEP_INDEX + 1))
  done
fi
```

### Format B — BDD (Given/When/Then)

```bash
STEP_INDEX=0
STEP_FAILED=0

# ── GIVEN (Setup) ───────────────────────────────────────────────────────────
if [ -n "$BDD_GIVEN" ] && [ "$BDD_GIVEN" != "null" ]; then
  GIVEN_COUNT=$(echo "$BDD_GIVEN" | jq 'length')
  for ((i = 0; i < GIVEN_COUNT; i++)); do
    GIVEN_STEP=$(echo "$BDD_GIVEN" | jq -r ".[$i]")
    echo "Given: $GIVEN_STEP"

    # Execute the setup action described in $GIVEN_STEP
    # Capture page + read snapshot to verify setup succeeded
    CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
      --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
      --desc "Given: $GIVEN_STEP" --page-name "given-$i" --prev-page $PREV_PAGE_ID)
    SNAPSHOT_FILE=$(echo "$CAPTURE" | jq -r '.files.snapshot')
    cat "$SNAPSHOT_FILE"
    # ↑ READ: confirm setup state, find refs for When steps
    PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
    ACTION_N=$((ACTION_N + 1))

    noob-tester runpack log $ENTRY_ID --text "Given step $i confirmed: $GIVEN_STEP"
    noob-tester runpack observe $ENTRY_ID --text "<describe what you see on the page after setup>"

    STEP_INDEX=$((STEP_INDEX + 1))
  done
fi

# ── WHEN (Action) ───────────────────────────────────────────────────────────
if [ -n "$BDD_WHEN" ] && [ "$BDD_WHEN" != "null" ]; then
  WHEN_COUNT=$(echo "$BDD_WHEN" | jq 'length')
  for ((i = 0; i < WHEN_COUNT; i++)); do
    WHEN_STEP=$(echo "$BDD_WHEN" | jq -r ".[$i]")
    echo "When: $WHEN_STEP"

    # ── Element Discovery ───────────────────────────────────────────────────
    # Read the snapshot from last capture to find the @eN ref for this action.
    # The step text ($WHEN_STEP) describes what to click/fill — find it in snapshot.
    # agent-browser click '@eN'   ← use the ref you discovered, not a hardcoded selector

    # Capture after action + read snapshot to verify it worked
    CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
      --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
      --desc "When: $WHEN_STEP" --page-name "when-$i" --prev-page $PREV_PAGE_ID)
    SNAPSHOT_FILE=$(echo "$CAPTURE" | jq -r '.files.snapshot')
    cat "$SNAPSHOT_FILE"
    # ↑ READ: verify action result, note what changed, find refs for Then steps

    PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
    ACTION_N=$((ACTION_N + 1))

    # Logging & Analysis
    noob-tester runpack log $ENTRY_ID --text "When step $i: $WHEN_STEP — URL: $(agent-browser get url)"
    noob-tester runpack observe $ENTRY_ID --text "<describe what changed on the page after this action>"

    if [ "$ENABLE_CONSOLE" = "true" ]; then
      STEP_CONSOLE=$(agent-browser console --json 2>/dev/null || echo "[]")
      if [ "$STEP_CONSOLE" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Console (when-$i): $STEP_CONSOLE"
      fi
    fi
    if [ "$ENABLE_ERRORS" = "true" ]; then
      STEP_ERRORS=$(agent-browser errors 2>/dev/null || echo "[]")
      if [ "$STEP_ERRORS" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Page errors (when-$i): $STEP_ERRORS"
      fi
    fi

    # Step Validation — confirm action had expected effect
    # If page doesn't match: STEP_FAILED=1

    CHECK_VISUAL_STEP $STEP_INDEX "when-$i"
    STEP_INDEX=$((STEP_INDEX + 1))
  done
fi

# ── THEN (Assert) ───────────────────────────────────────────────────────────
if [ -n "$BDD_THEN" ] && [ "$BDD_THEN" != "null" ]; then
  THEN_COUNT=$(echo "$BDD_THEN" | jq 'length')
  for ((i = 0; i < THEN_COUNT; i++)); do
    THEN_STEP=$(echo "$BDD_THEN" | jq -r ".[$i]")
    echo "Then: $THEN_STEP"

    CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
      --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
      --desc "Then: $THEN_STEP" --page-name "then-$i" --prev-page $PREV_PAGE_ID)
    SNAPSHOT_FILE=$(echo "$CAPTURE" | jq -r '.files.snapshot')
    cat "$SNAPSHOT_FILE"
    # ↑ READ: verify expected state is present, log findings

    PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
    ACTION_N=$((ACTION_N + 1))

    noob-tester runpack log $ENTRY_ID --text "Then step $i: $THEN_STEP"
    noob-tester runpack observe $ENTRY_ID --text "<describe whether the expected state is present or not>"

    if [ "$ENABLE_CONSOLE" = "true" ]; then
      STEP_CONSOLE=$(agent-browser console --json 2>/dev/null || echo "[]")
      if [ "$STEP_CONSOLE" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Console (then-$i): $STEP_CONSOLE"
      fi
    fi
    if [ "$ENABLE_ERRORS" = "true" ]; then
      STEP_ERRORS=$(agent-browser errors 2>/dev/null || echo "[]")
      if [ "$STEP_ERRORS" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Page errors (then-$i): $STEP_ERRORS"
      fi
    fi

    CHECK_VISUAL_STEP $STEP_INDEX "then-$i"
    STEP_INDEX=$((STEP_INDEX + 1))
  done
fi
```

### Format C — Traditional

```bash
STEP_INDEX=0
STEP_FAILED=0

if [ -n "$TRAD_STEPS" ] && [ "$TRAD_STEPS" != "null" ]; then
  STEP_COUNT=$(echo "$TRAD_STEPS" | jq 'length')
  for ((i = 0; i < STEP_COUNT; i++)); do
    STEP_TEXT=$(echo "$TRAD_STEPS" | jq -r ".[$i].step")
    EXPECTED=$(echo "$TRAD_STEPS"  | jq -r ".[$i].expected")
    echo "Step $i: $STEP_TEXT"
    echo "  Expected: $EXPECTED"

    # Execute action described in $STEP_TEXT
    # Read last snapshot to find @eN refs — never hardcode selectors

    CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action $ACTION_N \
      --pack <RUNPACK_ID> --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
      --desc "Step $i: $STEP_TEXT" --page-name "step-$i" --prev-page $PREV_PAGE_ID)
    SNAPSHOT_FILE=$(echo "$CAPTURE" | jq -r '.files.snapshot')
    cat "$SNAPSHOT_FILE"
    # ↑ READ: verify $EXPECTED is visible on the page

    PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
    ACTION_N=$((ACTION_N + 1))

    noob-tester runpack log $ENTRY_ID --text "Step $i: $STEP_TEXT — URL: $(agent-browser get url)"
    noob-tester runpack observe $ENTRY_ID --text "<describe whether '$EXPECTED' is present>"

    if [ "$ENABLE_CONSOLE" = "true" ]; then
      STEP_CONSOLE=$(agent-browser console --json 2>/dev/null || echo "[]")
      if [ "$STEP_CONSOLE" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Console (step-$i): $STEP_CONSOLE"
      fi
    fi
    if [ "$ENABLE_ERRORS" = "true" ]; then
      STEP_ERRORS=$(agent-browser errors 2>/dev/null || echo "[]")
      if [ "$STEP_ERRORS" != "[]" ]; then
        noob-tester runpack log $ENTRY_ID --text "Page errors (step-$i): $STEP_ERRORS"
      fi
    fi

    CHECK_VISUAL_STEP $STEP_INDEX "step-$i"
    STEP_INDEX=$((STEP_INDEX + 1))
  done
fi
```

---

## 4. Screenshot Capture & Comparison

Helper function — called for each step that has visual config:

```bash
CHECK_VISUAL_STEP() {
  local STEP_IDX=$1
  local STEP_LABEL=$2

  # Check if this step has visual config
  VISUAL_CONFIG=$(echo "$VISUAL_STEPS" | jq ".[] | select(.stepIndex == $STEP_IDX)" 2>/dev/null)
  if [ -z "$VISUAL_CONFIG" ] || [ "$VISUAL_CONFIG" = "null" ]; then
    return  # No visual capture for this step
  fi

  DIFF_TYPE=$(echo "$VISUAL_CONFIG"           | jq -r '.diffType')
  FULL_PAGE=$(echo "$VISUAL_CONFIG"           | jq -r '.fullPage')
  SCREENSHOT_SELECTOR=$(echo "$VISUAL_CONFIG" | jq -r '.screenshotSelector // empty')
  STEP_THRESHOLD=$(echo "$VISUAL_CONFIG"      | jq -r '.threshold // empty')
  if [ -z "$STEP_THRESHOLD" ] || [ "$STEP_THRESHOLD" = "null" ]; then
    STEP_THRESHOLD="$THRESHOLD"
  fi

  SCREENSHOT_PATH="$EVIDENCE_DIR/visual-${TC_ID}-step${STEP_IDX}-${STEP_LABEL}.png"

  # ── Take screenshot ──────────────────────────────────────────────────────
  if [ "$FULL_PAGE" = "true" ]; then
    agent-browser screenshot "$SCREENSHOT_PATH"
  else
    agent-browser screenshot "$SCREENSHOT_PATH" --selector "$SCREENSHOT_SELECTOR"
  fi

  noob-tester runpack log $ENTRY_ID --text "Screenshot captured: step $STEP_IDX ($STEP_LABEL) — $DIFF_TYPE fullPage=$FULL_PAGE"

  # ── Record screenshot in DB ──────────────────────────────────────────────
  SCREENSHOT_ID=$(noob-tester visual-run capture \
    --run "$VISUAL_RUN_ID" --tc "$TC_ID" --ticket <TICKET-ID> \
    --step-index $STEP_IDX --step-label "$STEP_LABEL" \
    --viewport "$VIEWPORT" --file "$SCREENSHOT_PATH" \
    --mode <baseline|verification> \
    --target-url "$TARGET_URL" | jq -r '.screenshotId')

  # ── Compare (verification mode only) ────────────────────────────────────
  if [ "$DIFF_TYPE" = "screenshot" ]; then
    BASELINE_RESULT=$(noob-tester visual-run find-baseline \
      --ticket <TICKET-ID> --tc "$TC_ID" \
      --step-index $STEP_IDX --viewport "$VIEWPORT")
    BASELINE_FOUND=$(echo "$BASELINE_RESULT" | jq -r '.found')

    if [ "$BASELINE_FOUND" = "true" ]; then
      BASELINE_PATH=$(echo "$BASELINE_RESULT" | jq -r '.baseline.file_path')
      BASELINE_ID=$(echo "$BASELINE_RESULT"   | jq -r '.baseline.id')
      DIFF_PATH="$EVIDENCE_DIR/diff-${TC_ID}-step${STEP_IDX}-${STEP_LABEL}.png"

      DIFF_OUTPUT=$(agent-browser diff screenshot \
        --baseline "$BASELINE_PATH" \
        --output "$DIFF_PATH" \
        --threshold "$STEP_THRESHOLD" 2>&1)
      DIFF_EXIT=$?

      DIFF_SCORE=$(echo "$DIFF_OUTPUT" | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "0")
      PASSED_FLAG=$( [ $DIFF_EXIT -eq 0 ] && echo "--passed" || echo "" )

      noob-tester visual-run compare \
        --run "$VISUAL_RUN_ID" --tc "$TC_ID" --ticket <TICKET-ID> \
        --step-index $STEP_IDX --step-label "$STEP_LABEL" \
        --viewport "$VIEWPORT" \
        --baseline-id "$BASELINE_ID" --current-id "$SCREENSHOT_ID" \
        --diff-path "$DIFF_PATH" --diff-score "$DIFF_SCORE" \
        --threshold "$STEP_THRESHOLD" $PASSED_FLAG

      if [ $DIFF_EXIT -ne 0 ]; then
        noob-tester runpack log $ENTRY_ID --text "DIFF FAILED: step $STEP_IDX score=$DIFF_SCORE threshold=$STEP_THRESHOLD"
        STEP_FAILED=1
      else
        noob-tester runpack log $ENTRY_ID --text "DIFF PASSED: step $STEP_IDX score=$DIFF_SCORE threshold=$STEP_THRESHOLD"
      fi
    else
      noob-tester runpack log $ENTRY_ID --text "No baseline for step $STEP_IDX — marking skipped"
      STEP_FAILED=2
    fi
  fi
}
```

---

## 5. Record Entry Result

Stop trace and profiler, then record the result:

```bash
# ── Telemetry: stop trace and profiler ──────────────────────────────────────
if [ "$ENABLE_TRACE" = "true" ] && [ -n "$TRACE_PATH" ]; then
  agent-browser trace stop "$TRACE_PATH" 2>/dev/null || true
fi
if [ "$ENABLE_PROFILER" = "true" ] && [ -n "$PROFILE_PATH" ]; then
  agent-browser profiler stop "$PROFILE_PATH" 2>/dev/null || true
fi

TELEMETRY_CONFIG=$(printf '{"trace":%s,"profiler":%s,"console":%s,"errors":%s,"device":"%s","dimension":"%s"}' \
  "$ENABLE_TRACE" "$ENABLE_PROFILER" "$ENABLE_CONSOLE" "$ENABLE_ERRORS" "$DEVICE" "$DIMENSION")

# ── Record result ────────────────────────────────────────────────────────────
RESULT_JSON=$(printf '{"tc":"%s","type":"%s","format":"%s","step_telemetry":%s}' \
  "$(echo "$TC_TITLE" | sed 's/"/\\"/g')" "$TC_TYPE" "$TC_FORMAT" "$STEP_TELEMETRY")

if [ $STEP_FAILED -eq 0 ]; then
  noob-tester visual-run entry-update "$ENTRY_ID" --status passed \
    --result "$RESULT_JSON" \
    --device "$DEVICE" --dimension "$DIMENSION" \
    --trace-path "$TRACE_PATH" --profile-path "$PROFILE_PATH" \
    --telemetry-config "$TELEMETRY_CONFIG"
elif [ $STEP_FAILED -eq 2 ]; then
  noob-tester visual-run entry-update "$ENTRY_ID" --status skipped \
    --result '{"reason":"no_baseline"}' \
    --device "$DEVICE" --dimension "$DIMENSION" \
    --trace-path "$TRACE_PATH" --profile-path "$PROFILE_PATH" \
    --telemetry-config "$TELEMETRY_CONFIG"
else
  noob-tester visual-run entry-update "$ENTRY_ID" --status failed \
    --result "{\"tc\":\"$TC_TITLE\",\"type\":\"$TC_TYPE\",\"format\":\"$TC_FORMAT\"}" \
    --device "$DEVICE" --dimension "$DIMENSION" \
    --trace-path "$TRACE_PATH" --profile-path "$PROFILE_PATH" \
    --telemetry-config "$TELEMETRY_CONFIG"
fi

agent-browser stream disable
agent-browser close
noob-tester session end $SESSION_ID --status completed
```

---

## Summary

Each visual test execution:
1. ✅ Starts trace + profiler (brackets entire run)
2. ✅ Login with snapshot reading — discovers real @eN refs, never hardcodes
3. ✅ Executes steps_json / BDD / traditional steps
4. ✅ **Snapshot reading** after EVERY capture — reads accessibility tree to verify page state
5. ✅ **Element discovery** — reads last snapshot to find @eN refs before every click/fill
6. ✅ **Logging & analysis** — `runpack log` + `runpack observe` after every step
7. ✅ **Step validation** — confirms action had expected effect from snapshot; sets STEP_FAILED on mismatch
8. ✅ Captures screenshots at steps specified in visual_steps config
9. ✅ Collects console logs + errors per step
10. ✅ In verification mode: diffs screenshots against baselines
11. ✅ Stops trace + profiler
12. ✅ Records trace_path, profile_path, telemetry_config in DB
