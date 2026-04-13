---
name: noob-visual-testcase
description: Generate visual test cases (BDD/traditional + visual steps config) from tickets. Maps test steps to visual capture config (screenshot vs snapshot, full-page vs scoped, per-step thresholds).
---

# Visual Test Case Generator

Generate visual test cases with **BDD or traditional format** + **visual steps configuration** that specifies which steps capture screenshots and how.

**Visual tests differ from normal tests:**
- Normal: Given/When/Then steps + assertions → pass/fail on logic
- Visual: Given/When/Then steps + visual_steps config → pass/fail on pixel diffs

## Key Concepts

**Visual Steps Config** — for each test step, specify:
- `stepIndex`: which step (0, 1, 2, etc)
- `diffType`: "screenshot" (pixel diff) or "snapshot" (DOM diff)
- `fullPage`: true = full page, false = use selector
- `screenshotSelector`: optional CSS selector to scope (e.g., ".modal", ".thumbnail-preview")
- `threshold`: override default per-step (0.0–1.0, optional)

Example:
```json
[
  {"stepIndex": 0, "diffType": "screenshot", "fullPage": true},
  {"stepIndex": 1, "diffType": "screenshot", "fullPage": false, "screenshotSelector": ".thumbnail-preview", "threshold": 0.1},
  {"stepIndex": 2, "diffType": "snapshot", "fullPage": true, "threshold": 0.15}
]
```

## Understanding the Data Flow

**Read WIDE for context (parent + siblings + ticket):**
- Parent Jira → feature area, user roles, overall goals
- Sibling Jiras → related work, shared components
- This Jira → specific requirements, acceptance criteria

**Write NARROW — determine what to visually verify:**
- **Direct Functional** → visual verification of THIS Jira's UI changes
- **Impact Regression** → visual verification of components affected by changes
- **General Regression** → visual verification of critical flows unchanged

## Test Case Types

1. **Direct Functional** (priority 1) — visual tests for THIS Jira's requirements
2. **Impact Regression** (priority 2) — visual tests for components impacted by changes
3. **General Regression** (priority 3) — visual tests for critical flows unchanged

---

## 1. Build Context Block (MANDATORY)

```
=== CONTEXT BLOCK ===
TICKET: <id> — <title>
GRANDPARENT: <key> — <title> — <top-level feature context>
PARENT: <key> — <title> — <feature area, user roles>
SIBLINGS: <other children titles>
USER_ROLE: <from parent + ticket>
NAVIGATION: <exact menu path — verified from routes>
FEATURE_FLAG: <flag name or "none">

WHAT THIS JIRA REQUIRES (from ticket description + AC):
- <requirement 1>
- <requirement 2>

WHAT THE MR CHANGED (from diff):
- <file1> — <what it does>
- <file2> — <what it does>

MATCH (requirements vs code):
- <requirement 1> → <file X> ✓
- <requirement 2> → NOT IMPLEMENTED ✗

VIEWPORT & THRESHOLD:
- Viewport: 1280x720 (or others to test: mobile 375x667, tablet 768x1024)
- Default threshold: 0.1 (10% pixel diff tolerance)

KEY_COMPONENTS:
- UI: <component> at <path>
- Styling: <what changed — colors, spacing, layout>
- Responsive: <breakpoints affected>

PRECONDITIONS:
- <role, data, flags>
=== END CONTEXT BLOCK ===
```

---

## 2. Create Session

```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --task "Visual test cases: <ticket>" --labels "visual-testcase")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
noob-tester session heartbeat $SESSION_ID --phase 3 --run-id $RUN_ID
```

---

## 3. Write Visual Test Cases

For each requirement matched to code, create one BDD or traditional visual test case.

### BDD Format

```bash
noob-tester visual-tc create \
  --ticket <TICKET-ID> \
  --title "<GRANDPARENT/PARENT context> — <visual requirement>" \
  --type <direct_functional|impact_regression|general_regression> \
  --format bdd \
  --viewport 1280x720 \
  --threshold 0.1 \
  --description "Visual verification of: <specific UI change>" \
  --bdd-feature "<feature area>" \
  --bdd-scenario "<user flow>" \
  --bdd-given '["<USER_ROLE> logged in","navigated to <page>"]' \
  --bdd-when '["<action — e.g. clicked button, filled form>"]' \
  --bdd-then '["<expected visual result — e.g. modal displays, button style changes>"]' \
  --visual-steps '[
    {"stepIndex":0,"diffType":"screenshot","fullPage":true},
    {"stepIndex":1,"diffType":"screenshot","fullPage":false,"screenshotSelector":".modal","threshold":0.1},
    {"stepIndex":2,"diffType":"screenshot","fullPage":true,"threshold":0.15}
  ]' \
  --preconditions '["<role>","<data state>"]' \
  --impacted-files '["<changed file 1>","<changed file 2>"]' \
  --labels '["visual","ui"]' \
  --ready
```

### Traditional Format

```bash
noob-tester visual-tc create \
  --ticket <TICKET-ID> \
  --title "<GRANDPARENT/PARENT context> — <visual requirement>" \
  --type impact_regression \
  --format traditional \
  --viewport 1280x720 \
  --threshold 0.08 \
  --description "Visual regression: <what should not change>" \
  --trad-steps '[
    {"step":"Navigate to /dashboard","expected":"Page loads with sidebar visible"},
    {"step":"Resize viewport to 768px","expected":"Layout reflows, sidebar accessible"},
    {"step":"Check main content area","expected":"Content displays without overlap"}
  ]' \
  --trad-expected "Dashboard layout remains responsive across breakpoints" \
  --visual-steps '[
    {"stepIndex":0,"diffType":"screenshot","fullPage":true},
    {"stepIndex":1,"diffType":"screenshot","fullPage":true,"threshold":0.12},
    {"stepIndex":2,"diffType":"screenshot","fullPage":false,"screenshotSelector":".content"}
  ]' \
  --impacted-files '["src/styles/layout.css"]' \
  --ready
```

---

## 4. Determine Visual Steps Config

For each BDD/traditional step, decide if it needs a screenshot + how to capture it:

| Step | Needs Screenshot? | Diff Type | Scope | Why |
|------|-------------------|-----------|-------|-----|
| Given (setup) | No | — | — | Just setup, no assertion |
| When (action) | Yes | screenshot | Element or full | Verify action result |
| Then (assert) | Yes | screenshot or snapshot | Varies | Verify expected state |

**Rules:**
- **Full page** for layout/responsive changes, navigation, page structure
- **Scoped** for component changes (modal, button, form, dropdown) — less noise, more precise
- **Snapshot** (DOM diff) for structural changes (elements added/removed) — faster than pixel diff
- **Screenshot** (pixel diff) for visual changes (colors, spacing, typography, shadows)

**Thresholds:**
- Default 0.1 (10%) — suitable for most changes
- 0.05 (5%) — strict, for critical UI (buttons, navigation)
- 0.15–0.2 (15–20%) — lenient, for complex animations/gradients

---

## 5. Do NOT write test cases that:

- Cover sibling Jira features (they get their own test cases)
- Cover requirements marked NOT IMPLEMENTED in MATCH
- Have generic steps (every step must name the specific flow)
- Test before/after without context (always include GRANDPARENT/PARENT)
- Have vague assertions (be specific about what to visually verify)

---

## 6. Mark Ready & Complete

```bash
# Mark all as ready
noob-tester visual-tc ready <tc-id>  # or: noob-tester visual-tc list --ticket <TICKET-ID> | grep draft | awk '{print $2}' | xargs -I {} noob-tester visual-tc ready {}

# Complete
noob-tester log action $RUN_ID --phase 3 --agent visual-testcase-writer --description "Generated N visual test cases"
noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "N visual test cases for <TICKET-ID>"
```

Done. Session: $SESSION_ID
