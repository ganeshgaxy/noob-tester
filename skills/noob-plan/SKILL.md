---
name: noob-plan
description: Create a test plan for a dev-complete ticket. Reads MRs, analyzes code diffs, checks deployed target, produces plan with steps, blockers, coverage gaps.
---

# Test Planning

Create a test plan AFTER dev is done. Read wide for context, write narrow from MR diff + ticket.

## Understanding the Data Flow

**Read WIDE for context (parent + siblings + ticket):**
- Parent Jira → feature area, user roles, overall goals
- Sibling Jiras (other children of parent) → related work, dependencies, shared components
- This Jira → specific requirements, acceptance criteria

**Write NARROW from code truth (MR diff + this Jira only):**
- Plan steps come ONLY from this Jira's description/AC + what the MR diff actually changed
- Do NOT plan steps for sibling Jira features — those get their own plans

## 1. Build Context Block (MANDATORY)

```
=== CONTEXT BLOCK ===
TICKET: <id> — <title>
GRANDPARENT: <grandparent-key> — <grandparent title> — <top-level feature context, e.g. "New Course Creation">
PARENT: <parent-key> — <parent title> — <what the parent feature is about>
SIBLINGS: <list other children of parent — title only, to understand related work>
USER_ROLE: <from parent + ticket + auth code>
NAVIGATION: <exact menu path — verified from route definitions>
FEATURE_FLAG: <flag name or "none">

WHAT THIS JIRA DESCRIBES (from ticket description + AC):
- <requirement 1>
- <requirement 2>

WHAT THE MR ACTUALLY CHANGED (from diff — file by file):
- <file1> — <added/modified/deleted> — <what it does>
- <file2> — <what it does>

MATCH (requirements vs code):
- <requirement 1> → <matched to file X> or → NOT IMPLEMENTED
- <requirement 2> → <matched to file Y> or → NOT IMPLEMENTED

IMPACTED AREAS (from import graph of changed files):
- <file that imports changed file 1> — could be affected
- <shared service used by changed files> — regression risk

KEY_COMPONENTS:
- UI: <component> at <path>
- API: <endpoint> at <path>
- Auth: <guard> at <path>
=== END CONTEXT BLOCK ===
```

### How to fill:

**GRANDPARENT + PARENT + SIBLINGS:** Walk up two levels: grandparent gives the top-level feature context (e.g., "New Course Creation" vs "Edit Course"), parent gives the specific feature area + user roles. This hierarchy is critical for specificity — without the grandparent, plans lose the distinguishing context. Read siblings to understand related work — do NOT write steps for sibling work.

**WHAT THIS JIRA DESCRIBES:** Extract every requirement from the ticket description and acceptance criteria.

**WHAT THE MR ACTUALLY CHANGED:** Read every file in the MR diff. List each with what it does.

**MATCH:** For each requirement, find the matching changed file. If no file matches → mark as NOT IMPLEMENTED. This is critical — it tells you what to plan for and what to flag as a blocker/gap.

**IMPACTED AREAS:** `noob-tester query codebase "<changed file>" --expand` → find files that import the changed files. These are regression risks.

## 2. Create Session

```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --target-url "<url>" --task "Planning: <ticket>" --labels "plan")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
noob-tester session heartbeat $SESSION_ID --phase 2 --run-id $RUN_ID
```

## 3. Prior Context

```bash
noob-tester query analysis --ticket <TICKET-ID>   # prior analysis
noob-tester query failures --limit 20               # known failure patterns
```

## 4. Save Plan

**Plan sections derive from Context Block:**

- `strategy` — derived from GRANDPARENT context + USER_ROLE + NAVIGATION + WHAT THIS JIRA DESCRIBES
- `importance` — from GRANDPARENT + PARENT context: why this matters to users and the business
- `functionality` — ONLY items from MATCH that have matching code (not NOT IMPLEMENTED)
- `regressions` — from IMPACTED AREAS
- `nonFunctional` — usability, accessibility (WCAG), design consistency, responsive design considerations derived from UI components in KEY_COMPONENTS + CHANGED_FILES
- `automation` — unit/component, API, E2E automation strategy derived from KEY_COMPONENTS layers (UI → component tests, API → endpoint tests, both → E2E)
- `testData` — required users, roles, content, permissions derived from USER_ROLE + PRECONDITIONS + ticket AC
- `testEnvironments` — staging/prod needs, FF requirements derived from FEATURE_FLAG + deployment context
- `platforms` — browsers, devices, OS derived from UI layer (web app = browsers, mobile components = devices)
- `toolsAndHelpers` — Figma links, DevTools tips, FF management tools derived from design refs in ticket + KEY_COMPONENTS
- `importantToRemember` — caveats, gotchas, partial implementations derived from MATCH (NOT IMPLEMENTED items) + ticket comments
- `questionsForDevs` — open questions about unclear implementation details derived from MATCH gaps + ambiguous ticket AC
- `featureFlags` — FEATURE_FLAG value + risk when ON/OFF + what it gates
- `ffRemovalTests` — tests to run when FF is removed: verify feature works without flag, existing flows unaffected
- `security` — auth/role requirements from KEY_COMPONENTS Auth + USER_ROLE restrictions
- `performance` — load times, responsiveness concerns derived from UI complexity + data volume in CHANGED_FILES
- `postReleaseSanity` — quick smoke test steps to verify on production after deploy
- `postRelease` — monitoring, metrics, canary/rollout strategy derived from FEATURE_FLAG + KEY_COMPONENTS
- `dependencies` — dependent services, shared components, related epics from IMPACTED AREAS + PARENT/SIBLINGS
- `outOfScope` — sibling Jira features + explicitly excluded items from ticket
- `blockers` — items marked NOT IMPLEMENTED + missing preconditions
- `coverageGaps` — requirements with no matching code
- `testNotes` — P1 = implemented requirements, P2 = impacted areas, P3 = regressions

```bash
noob-tester save plan $RUN_ID --ticket <TICKET-ID> --plan '$(cat <<'PLAN'
{
  "targetUrl": "<TARGET_URL>",
  "strategy": "<USER_ROLE navigates via NAVIGATION to test WHAT WAS BUILT — include GRANDPARENT context for specificity>",
  "importance": "<why this feature matters from user & business perspective — derived from GRANDPARENT + PARENT context>",
  "requirements": "<bullet list of ALL requirements from WHAT THIS JIRA DESCRIBES>",
  "functionality": "<ONLY matched requirements from MATCH — what to test>",
  "regressions": "<from IMPACTED AREAS — what could break>",
  "nonFunctional": "<usability, accessibility (WCAG AA), design consistency, responsive design — derived from UI components>",
  "automation": "<unit/component tests for X, API tests for Y endpoints, E2E for Z flows — derived from KEY_COMPONENTS>",
  "testData": "<required users, roles, content, permissions — derived from USER_ROLE + ticket AC>",
  "testEnvironments": "<staging/prod needs, FF requirements, config dependencies>",
  "platforms": "<browsers, devices, OS to test on — derived from UI layer>",
  "toolsAndHelpers": "<Figma links, DevTools tips, FF management tools — from ticket refs + KEY_COMPONENTS>",
  "importantToRemember": "<caveats, gotchas, partial implementations, out-of-scope items that look in-scope>",
  "questionsForDevs": ["<open questions about unclear implementation — from MATCH gaps + ambiguous AC>"],
  "featureFlags": "<flag name, risk when ON/OFF, what it gates, existing feature impact>",
  "ffRemovalTests": "<tests when FF removed: feature works without flag, existing flows unaffected>",
  "security": "<auth/role restrictions, data tampering risks, permission boundaries>",
  "performance": "<load times, responsiveness, data volume concerns — from UI complexity + changed files>",
  "postReleaseSanity": "<quick smoke test steps for production after deploy>",
  "postRelease": "<monitoring, metrics to track, canary/rollout strategy, Pendo/analytics>",
  "dependencies": "<dependent services, shared components, related epics — from IMPACTED AREAS + SIBLINGS>",
  "outOfScope": "<sibling Jira features + explicitly excluded items from ticket>",
  "blockers": ["<NOT IMPLEMENTED items>"],
  "coverageGaps": ["<requirements with no code>"],
  "mrRefs": ["<from mr_metadata>"],
  "testNotes": "Testing Focus:\n- <from MATCH — implemented items>\n\nPriority:\n- P1: <core changes from MR diff>\n- P2: <impacted dependencies>\n- P3: <regression risks>\n\nRisk Areas:\n- <shared components from IMPACTED AREAS>"
}
PLAN
)'
```

### Steps — derived from THIS Jira + MR diff ONLY

```bash
PLAN_ID=$(noob-tester query plan --ticket <TICKET-ID> --json | jq -r '.plan.id')

# Each step tests a specific requirement matched to a specific changed file
noob-tester save step $PLAN_ID --run $RUN_ID --order 1 \
  --description "<test WHAT THIS JIRA DESCRIBES using NAVIGATION and USER_ROLE>" \
  --confidence confident --category functional --priority 1 \
  --source "<requirement X → file Y from MR diff>"
```

### Do NOT include:
- Steps for sibling Jira features (they get their own plans)
- Steps for requirements marked NOT IMPLEMENTED
- Generic steps not tied to a specific changed file
- Steps with unverified URLs or assumed navigation

## 5. Complete

```bash
noob-tester log action $RUN_ID --phase 2 --agent planner --description "Plan: N steps"
noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "Plan created: N steps"
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):
> Plan complete. Session: $SESSION_ID
