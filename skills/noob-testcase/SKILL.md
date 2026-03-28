---
name: noob-testcase
description: Generate BDD and traditional test cases from tickets with deep codebase analysis. Produces direct functional, impact regression, and general regression test cases.
---

# Test Case Generator

Read wide for context, write narrow from MR diff + ticket.

## Understanding the Data Flow

**Read WIDE for context (parent + siblings + ticket):**
- Parent Jira → feature area, user roles, overall goals, navigation context
- Sibling Jiras (other children of parent) → related work, shared components, dependencies
- This Jira → specific requirements, acceptance criteria

**Write NARROW — each test case type has a different source:**
- **Direct Functional** → from THIS Jira's description/AC + MR diff (what was built)
- **Impact Regression** → from MR diff's IMPACTED AREAS (import graph of changed files)
- **General Regression** → from IMPACTED AREAS + known critical flows near changed code

## Test Case Types (Priority Order)

1. **Direct Functional** (priority 1) — tests for THIS Jira's requirements, verified against MR diff
2. **Impact Regression** (priority 2) — tests for code IMPACTED by the MR changes (imports, dependents)
3. **General Regression** (priority 3) — critical app flows near changed areas

## 1. Build Context Block (MANDATORY)

```
=== CONTEXT BLOCK ===
TICKET: <id> — <title>
GRANDPARENT: <grandparent-key> — <grandparent title> — <top-level feature context, e.g. "New Course Creation">
PARENT: <parent-key> — <parent title> — <feature area, user roles, goals>
SIBLINGS: <other children titles — for understanding only, NOT for writing test cases>
USER_ROLE: <from parent + ticket + auth code>
NAVIGATION: <exact menu path — verified from route definitions in codebase>
FEATURE_FLAG: <flag name or "none">

WHAT THIS JIRA REQUIRES (from ticket description + AC):
- <requirement 1>
- <requirement 2>

WHAT THE MR ACTUALLY CHANGED (from diff — every file):
- <file1> — <what it does>
- <file2> — <what it does>

MATCH (requirements vs code):
- <requirement 1> → <file X> ✓
- <requirement 2> → NOT IMPLEMENTED ✗

IMPACTED AREAS (import graph of changed files):
- <file importing changed file> — used for impact regression tests
- <shared service> — used for general regression tests

KEY_COMPONENTS:
- UI: <component> at <path>
- API: <endpoint> at <path>
- Auth: <guard> at <path>

PRECONDITIONS:
- <role, data, flags, environment>
=== END CONTEXT BLOCK ===
```

### How to fill:

**GRANDPARENT + PARENT + SIBLINGS:** Walk up two levels: grandparent gives the top-level feature context (e.g., "New Course Creation" vs "Edit Course"), parent gives the specific feature area + user roles. This hierarchy is critical for specificity — without the grandparent, test cases lose the distinguishing context (e.g., "course form" could be new or edit). Read siblings to understand related work — but do NOT write test cases for sibling features.

**NAVIGATION:** Search route definitions in codebase → trace menu/sidebar → verify the exact click path. Use generic grep patterns for any framework:
- `noob-tester query codebase "route path" --expand`
- `grep -ri "route\|path:\|@Get\|@Post\|HandleFunc\|@app.route\|urlpatterns" $REPO_PATH/`

**MATCH:** Map each requirement to a changed file. If no file → NOT IMPLEMENTED. Only write direct functional tests for matched items.

**IMPACTED AREAS:** `noob-tester query codebase "<changed file>" --expand` → files that import changed files = impact regression targets.

## 2. Create Session

```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --task "Test cases: <ticket>" --labels "testcase")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
noob-tester session heartbeat $SESSION_ID --phase 3 --run-id $RUN_ID
```

## 3. Check Existing Plan

```bash
noob-tester query plan --ticket <TICKET-ID> --json | jq '.plan.id'
```

If a plan exists, use it — but still verify against Context Block.

## 4. Write Test Cases (using Context Block)

**If a companion skill provides test-writing instructions, follow those instead of the default templates below. However, these rules are NON-NEGOTIABLE regardless of companion skill:**
- GRANDPARENT + PARENT context MUST appear in every test case's steps (Given, When, Then), not just the title
- Every step must name the specific flow — if a step could apply to multiple flows, it's too generic
- Preconditions MUST specify the exact flow (e.g., "new course creation" not just "course creation")

**STOP — verify before writing:**
- [ ] Context Block is complete
- [ ] NAVIGATION is verified from codebase
- [ ] MATCH maps every requirement to code (or marks NOT IMPLEMENTED)
- [ ] USER_ROLE confirmed from auth code

### Direct Functional (from THIS Jira + MR diff)

For each item in MATCH marked ✓ (requirement has matching code):

**CRITICAL — GRANDPARENT + PARENT context goes into EVERY field, not just title/Given.**

The agent reads the hierarchy but then writes generic steps like "course creation form is displayed" or "drag image to drop zone". That's useless — a tester can't tell if this is new course, edit course, or clone course. The hierarchy context MUST flow into Given, When, AND Then.

**Rule: every step must name the specific flow.** Before writing any step, ask: "could this step apply to a different flow?" If yes, add the distinguishing context.

**BAD example (generic — could be any course flow):**
```
Given: course creation form is displayed
When: drag and drop image file to the thumbnail drop zone
Then: live preview of thumbnail image displays
```

**GOOD example (specific — clearly new course creation):**
```
Given: New Course Builder meta info form is displayed (via Libraries → New Courses → Create New Course)
When: drag and drop image file to the thumbnail drop zone on the new course meta info form
Then: live preview of thumbnail image displays in the new course thumbnail section
```

The difference: every Given/When/Then names "new course" because GRANDPARENT = "New Course Builder V1". A tester reading this knows exactly which page and flow.

```bash
noob-tester testcase create $RUN_ID --ticket <TICKET-ID> --type direct_functional --format bdd \
  --title "<GRANDPARENT/PARENT flow context> — <requirement from THIS Jira>" --layer ui --ready \
  --bdd-given '["<USER_ROLE> logged in","navigated via <NAVIGATION> to <GRANDPARENT feature> — <PARENT feature area>","<flow-specific state: e.g. New Course Builder meta info form is displayed>"]' \
  --bdd-when '["<action on component from CHANGED_FILES> on the <GRANDPARENT/PARENT specific page/form>"]' \
  --bdd-then '["<expected result from ticket AC> in the <GRANDPARENT/PARENT specific context>"]' \
  --impacted-files '["<from MATCH — the file that implements this>"]' \
  --preconditions '["<USER_ROLE>","<FEATURE_FLAG>","<specific flow: e.g. new course creation, not edit course>","<data needed>"]'
```

### Impact Regression (from IMPACTED AREAS)

For each file in IMPACTED AREAS that imports a changed file:

```bash
noob-tester testcase create $RUN_ID --ticket <TICKET-ID> --type impact_regression --format bdd \
  --title "<GRANDPARENT context> — <impacted feature> still works after <PARENT change area>" --layer ui --ready \
  --bdd-given '["<existing feature setup — name the exact page and flow, e.g. existing Coach course editing page>"]' \
  --bdd-when '["<use the impacted feature — name what and where, e.g. edit an existing Coach course thumbnail>"]' \
  --bdd-then '["<state what must be unchanged — e.g. existing Coach course thumbnail still saves and displays correctly>"]' \
  --impacted-files '["<the impacted file from import graph>"]'
```

### General Regression (critical flows near changed code)

For shared services/components in IMPACTED AREAS that other features depend on:

```bash
noob-tester testcase create $RUN_ID --ticket <TICKET-ID> --type general_regression --format bdd \
  --title "<GRANDPARENT context> — <critical flow> unaffected by <PARENT change area>" --layer ui --ready \
  --bdd-given '["<standard user flow — name the exact flow, page, and entry point>"]' \
  --bdd-when '["<use the shared component — name the component, on which page, in which flow>"]' \
  --bdd-then '["<state exactly what must still work — not just no regression but what specific behavior is preserved>"]' \
  --impacted-files '["<shared component path>"]'
```

### Test Layers
| Layer | Runner |
|-------|--------|
| `ui` | noob-explore |
| `api` | noob-api-explore |
| `ui_api` | noob-explore |

### Do NOT write test cases that:
- Cover sibling Jira features (they get their own test cases)
- Cover requirements marked NOT IMPLEMENTED in MATCH
- Use URLs not verified in route definitions
- Use roles not confirmed from auth code
- Cover features described in ticket but not in MR diff
- Are **generic enough to apply to multiple flows** — every test case MUST be unambiguous about which flow it belongs to (e.g., "new course creation" not just "course creation"). If GRANDPARENT/PARENT context distinguishes this flow from others, that context MUST appear in the title, preconditions, and Given clause

## 5. Mark Ready

```bash
noob-tester testcase ready-all <TICKET-ID>
```

## 6. Complete

```bash
noob-tester log action $RUN_ID --phase 3 --agent testcase-writer --description "Generated N test cases"
noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "N test cases for <TICKET-ID>"
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):
> Done. Session: $SESSION_ID
