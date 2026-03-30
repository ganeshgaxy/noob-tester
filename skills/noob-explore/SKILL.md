---
name: noob-explore
description: Execute UI test cases via browser automation. Uses run packs for tracking, UI maps for learning, capture-page for evidence. One test case per invocation.
---

# UI Test Execution

Execute ONE test case per invocation via browser automation. Invoke repeatedly for all cases.

## JSON Output Shapes (jq reference)

```bash
# runpack list --pack returns ARRAY (not {entries: [...]})
noob-tester runpack list --pack $RUNPACK_ID --json | jq '.[] | select(.tc_title != null) | {id, status, tc_title}'

# Find specific entry (always null-check tc_title)
noob-tester runpack list --pack $RUNPACK_ID --json | jq '.[] | select(.tc_title != null and (.tc_title | test("keyword"; "i"))) | {id, status}'

# query plan returns SINGLE OBJECT: {plan, steps}
noob-tester query plan --ticket <TICKET-ID> --json | jq '.plan.id'
```

## 1. Resolve Target URL + Initialize + UI Map + Claim or Retry

**Before init, resolve the target URL from the secret target name.** Do NOT guess or hardcode URLs.

```bash
# Resolve target URL from secret target name — REQUIRED before init
TARGET_URL=$(noob-tester secrets target get <target-name> --json | jq -r '.url')
if [ -z "$TARGET_URL" ] || [ "$TARGET_URL" = "null" ]; then
  echo "ERROR: Could not resolve URL for target '<target-name>'. Available targets:"
  noob-tester secrets target list --json | jq '.[].name'
  exit 1
fi

INIT=$(noob-tester init --ticket <TICKET-ID> --target-url "$TARGET_URL" --task "Exploring: <brief>" --labels "explore" --secret-target <target-name> --secret-role <role> --capture screenshot,snapshot,console,har)
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
EVIDENCE_DIR=$(echo "$INIT" | jq -r '.evidenceDir')

# Create UI map so ALL captures get --map
MAP_ID=$(noob-tester uimap resolve --ticket <TICKET-ID> --target <TARGET_URL> | jq -r '.id // empty')
if [ -z "$MAP_ID" ]; then
  MAP_ID=$(noob-tester uimap create --name "<App Name>" --targets "<url>" --tickets "<TICKET-ID>" | jq -r '.uiMapId')
fi
```

### Claim Next OR Retry

Decide which test case to run **before** login. There are two modes:

**Mode A: Claim next unclaimed test case (default)**

```bash
ENTRY=$(noob-tester claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk)

DONE=$(echo "$ENTRY" | jq -r '.done // empty')
if [ "$DONE" = "true" ]; then
  noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "All test cases executed"
  exit 0
fi
```

**Mode B: Retry a specific test case by name**

Use when the user asks to rerun a previously failed/passed/blocked test.

```bash
# Retry in a specific run pack
noob-tester runpack retry --name "<test-case-name>" --pack $RUNPACK_ID

# Retry in the latest run pack for the ticket (no --pack needed)
noob-tester runpack retry --name "<test-case-name>"
```

`retry` resets the entry status so `claim-smart` picks it up. Then claim it:

```bash
ENTRY=$(noob-tester claim-smart --pack $RUNPACK_ID --ticket <TICKET-ID> --session $SESSION_ID --run $RUN_ID --layer ui --risk)
```

### Continue with claimed entry

```bash
ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')

agent-browser open $TARGET_URL
noob-tester session heartbeat $SESSION_ID --phase 4 --run-id $RUN_ID
```

## 2. Login

The user provides the `--secret-target` and `--secret-role` in the init command (Step 1). Use those to resolve credentials.

```bash
CREDS=$(noob-tester auth-resolve --target <secret-target> --role <secret-role>)

# If no credentials found → STOP. Do NOT guess or try other targets.
if [ -z "$CREDS" ] || echo "$CREDS" | jq -e '.error' > /dev/null 2>&1; then
  echo "ERROR: No credentials found for target '<secret-target>' with role '<secret-role>'."
  noob-tester session end $SESSION_ID --status failed
  exit 1
fi

EMAIL=$(echo "$CREDS" | jq -r '.email')
PASSWORD=$(echo "$CREDS" | jq -r '.password')

# ALL captures include --entry and --map so they're visible in the UI
CAPTURE_LOGIN=$(noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action 1 \
  --pack $RUNPACK_ID --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> --desc "Login page" --page-name "login" \
  --map $MAP_ID --page-title "Login")

# ╔══════════════════════════════════════════════════════════════════╗
# ║ HOW TO FILL FORMS WITH agent-browser                           ║
# ║                                                                ║
# ║ 1. Read the snapshot from capture-page to find element refs:   ║
# ║    The snapshot shows elements like:                           ║
# ║      textbox "Email address" [ref=e3]                          ║
# ║      textbox "Password" [ref=e4]                               ║
# ║      button "Log In" [ref=e5]                                  ║
# ║                                                                ║
# ║ 2. Use the @eN syntax to target elements:                     ║
# ║    ✅ agent-browser fill '@e3' "value"    ← correct            ║
# ║    ❌ agent-browser fill '[ref=e3]' "v"   ← CSS, won't work   ║
# ║    ❌ agent-browser fill '@emailField' "v" ← not a real ref    ║
# ║    ❌ agent-browser type "value"           ← missing selector  ║
# ║                                                                ║
# ║ 3. The ref numbers (e3, e4...) change per page. ALWAYS read   ║
# ║    the snapshot first. NEVER guess or hardcode ref numbers.    ║
# ╚══════════════════════════════════════════════════════════════════╝

# Step A: Read the snapshot to discover the actual @eN refs for email, password, and login button
SNAPSHOT_FILE=$(echo "$CAPTURE_LOGIN" | jq -r '.files.snapshot')
cat "$SNAPSHOT_FILE"

# Step B: Find the refs — look for textbox/input with "Email"/"Password" labels and the login button
# Then fill using those refs. Do NOT copy the commands below literally — replace @eN with the real refs you found.
agent-browser fill '@emailRef' "$EMAIL"
agent-browser fill '@passwordRef' "$PASSWORD"

noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action 2 \
  --pack $RUNPACK_ID --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> --desc "Login form filled" --page-name "login-filled" \
  --map $MAP_ID --page-title "Login"

# Step C: Click the login/submit button using its @eN ref from the snapshot
agent-browser click '@loginRef'
agent-browser wait 3000

noob-tester capture-page --run $RUN_ID --url "$(agent-browser get url)" --action 3 \
  --pack $RUNPACK_ID --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> --desc "After login" --page-name "post-login" \
  --map $MAP_ID --page-title "Post-login"
```

If login fails (URL still on /login, error message visible) → log tech issue, end session, exit. Do NOT guess credentials.

## 3. Extract Test Case Info

```bash
TC_TITLE=$(echo "$ENTRY" | jq -r '.tc_title')
TC_FORMAT=$(echo "$ENTRY" | jq -r '.tc_format')
```

## 4. EVERY Page Load

**Run after EVERY navigation/click that changes the page. No exceptions.**

```bash
# Captures snapshot + screenshot + console + HAR, registers all in DB,
# scans elements into UI map, and records navigation from previous page.
CAPTURE=$(noob-tester capture-page --run $RUN_ID --url "<page-url>" --action $ACTION_N \
  --pack $RUNPACK_ID --entry $ENTRY_ID --session $SESSION_ID --ticket <TICKET-ID> \
  --desc "<what happened>" --page-name "<page>" \
  --map $MAP_ID --page-title "<title>" --prev-page $PREV_PAGE_ID)

# Track page ID for navigation chain
PREV_PAGE_ID=$(echo "$CAPTURE" | jq -r '.pageId // empty')
```

## 5. Execute Test Steps

For each step:

1. **Perform action** — `agent-browser click/fill/navigate`
2. **Capture page** — `noob-tester capture-page ...` (auto-logs + auto-observes the `--desc`)
3. **READ the capture output** — the snapshot contains the full accessibility tree. **Analyse it.** Look at what elements are on the page, what's visible, what's missing, what state toggles/fields are in. This is your primary source of truth for the page state.
4. **Log and observe based on your analysis** — this is NOT optional:

```bash
# After EVERY capture, read the snapshot and log what you found:
noob-tester runpack log $ENTRY_ID --text "Notification Settings: 3 toggles visible — Visit Summary (ON), Joiner Updates (ON), Comments (ON)"
noob-tester runpack log $ENTRY_ID --text "No External Participants tab or section found in modal"

# Observe the state of the page — what's present, what's missing, what's unexpected:
noob-tester runpack observe $ENTRY_ID --text "Modal has toggles for internal participants only — no external participant controls"
noob-tester runpack observe $ENTRY_ID --text "Done button is disabled until title is filled"
```

5. **Track elements** — `noob-tester uimap hit $ELEMENT_ID` or `uimap miss $ELEMENT_ID`
6. **Check for issues** — console errors, network failures, visual problems

**IMPORTANT: Every `capture-page` call MUST be followed by analysis.** The output contains:

- `captured` — what was recorded (snapshot, screenshot, console, har)
- `a11yIssues` — count of accessibility violations found by axe-core
- `a11yViolations` — array of `{rule, impact, description, nodes}` for each violation

**After EVERY capture, you MUST:**

1. Read the snapshot output — check what elements are on the page, their states
2. Check `a11yViolations` — if any exist, log them and file issues for serious/critical ones:

```bash
# If capture returned a11y violations:
noob-tester runpack log $ENTRY_ID --text "a11y: color-contrast violation (serious) on 3 elements"
noob-tester runpack observe $ENTRY_ID --text "Accessibility: 2 serious violations — color-contrast (3 elements), button-name (1 element)"
# File issue for serious/critical a11y violations:
noob-tester log issue $RUN_ID --category accessibility --severity high \
  --title "Color contrast fails WCAG AA" --description "3 elements fail color-contrast check" --location "<url>"
```

3. Check console output for errors/warnings
4. Log and observe your findings about the page state

A test run with only auto-logs and no agent analysis is incomplete.

**What to log vs observe:**

- **Logs** (`runpack log`): actions taken, decisions made, what you checked, errors found, console/network/a11y findings
- **Observations** (`runpack observe`): factual statements about page state — what elements exist, their values/states, what's present vs missing, a11y status

### Deep Inspection (check ALL after each page load)

- **Network** — failed requests (4xx, 5xx), slow responses (>3s), CORS errors
- **Console** — JS errors, warnings, unhandled rejections
- **UI** — broken layouts, overlapping elements, missing content
- **Accessibility** — missing labels, no keyboard access, contrast issues

Log anything notable:

```bash
noob-tester runpack log $ENTRY_ID --text "Console: 2 warnings about deprecated API calls"
noob-tester runpack observe $ENTRY_ID --text "Network: GET /api/v3/shares returned 200 in 1.2s"
```

### Record Issues

```bash
noob-tester log issue $RUN_ID \
  --category <ui|accessibility|network|console|visual|layout|content|functional|performance> \
  --severity <critical|high|medium|low|info> \
  --title "Brief title" --description "Details" --location "<url>"
```

## 6. Handle Failures — Trace Root Cause in Code

When a test fails:

1. **Capture evidence** — `noob-tester capture-page ...`
2. **Retry from fresh snapshot** — ignore UI map, find element directly
3. **If retry works** — scan page again: `noob-tester uimap scan $PAGE_ID --snapshot ...`
4. **If retry still fails** — TRACE THE ROOT CAUSE:

```bash
# Read the MR diff to find the relevant changed file
noob-tester ticket-context get <TICKET-ID> --type mr_diff:!<mr-id>

# Search the codebase for the failing component/endpoint
noob-tester query codebase "<failing element or URL path>" --expand

# Read the specific file to understand WHY it fails
# e.g. "The createCourse handler at line 45 doesn't validate file size — that's why the upload test fails"
```

Include the root cause finding in the issue description:

```bash
noob-tester log issue $RUN_ID --category functional --severity high \
  --title "File upload missing from course builder" \
  --description "Expected file drop zone on Create Course page but none exists. MR diff shows no file input component was added. The CourseBuilderComponent (src/course-builder/course-builder.component.ts) renders sections/lessons but has no upload handler." \
  --location "/admin2/libraries/.../course-builder/.../editor"
```

5. **Log tech issue if environment problem:**

```bash
noob-tester tech-issue log $RUN_ID --title "Page stuck" --description "Details" \
  --category timeout --severity high --url "<url>" --ticket <TICKET-ID> --session $SESSION_ID --outcome failed
```

6. **Mark entry:**

```bash
# Blocked (environment/tech issue)
noob-tester runpack result $ENTRY_ID --status blocked --results '{"reason":"..."}'

# Failed (actual bug found — include root cause)
noob-tester runpack result $ENTRY_ID --status failed \
  --results '{"error":"...","root_cause":"file in MR: src/x.ts line 45 — missing validation"}' \
  --issues '[{"severity":"high","title":"...","description":"Root cause: ..."}]'
```

## 7. Record Result

```bash
# Passed
noob-tester runpack result $ENTRY_ID --status passed \
  --results '{"summary":"..."}' --observations '["obs1","obs2"]'

# Failed (with root cause)
noob-tester runpack result $ENTRY_ID --status failed \
  --results '{"error":"...","root_cause":"..."}' \
  --issues '[{"severity":"high","title":"...","description":"Root cause traced to src/x.ts"}]'
```

**After recording the result, go DIRECTLY to Step 8 (End Session). Do NOT:**

- Call `claim-smart` again — this is ONE test case per invocation
- Call `runpack populate` — entries are added one at a time by `claim-smart`
- Call `runpack list` to check remaining tests — the next invocation handles that
- Retry in the same invocation — start a new invocation using Step 1 Mode B

## 8. End Session

```bash
noob-tester session heartbeat $SESSION_ID --phase 4
agent-browser close
noob-tester session end $SESSION_ID --status completed
# Run stays open for next invocation — only complete when ALL test cases done
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):

> Done. Session: $SESSION_ID
