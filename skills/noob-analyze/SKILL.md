---
name: noob-analyze
description: Deep analysis of a ticket — gap, requirements, feasibility, and impact analysis against the codebase. Runs before development starts.
---

# Requirements & Impact Analysis

Analyze a ticket deeply against the codebase. Produces 4 analyses: gap, requirements, feasibility, impact.

**This runs BEFORE dev starts** — analyzing the EXISTING codebase to predict impact.

## 1. Read Ticket (cache every MCP call)

```bash
# For EACH type: check cache → if miss, fetch via MCP → save to cache
# Pattern: CACHED=$(noob-tester ticket-context get <TICKET-ID> --type <type>)
#   If cached: false → fetch via Atlassian MCP → noob-tester ticket-context save <TICKET-ID> --type <type> --content '...' --source atlassian_mcp
noob-tester ticket-context get <TICKET-ID> --type ticket_info    # miss → getJiraIssue → save
noob-tester ticket-context get <TICKET-ID> --type remote_links   # miss → getJiraIssueRemoteIssueLinks → save
noob-tester ticket-context get <TICKET-ID> --type comments       # miss → extract from ticket → save
noob-tester ticket-context get <TICKET-ID> --type parent_issue   # miss → getJiraIssue on parent key → save
noob-tester ticket-context get <TICKET-ID> --type linked_tickets
# miss → getJiraIssue on parent key → extract subtasks/children from parent response → save
# Do NOT use searchJiraIssuesUsingJql — the parent issue already contains its children.
noob-tester ticket-context get <TICKET-ID> --type confluence:<pageId>  # miss → getConfluencePage → save
```

## 2. Find Repos

```bash
noob-tester repos setup-for-ticket --ticket <TICKET-ID> --url <repo-url-1> <repo-url-2>
```

**No repos = STOP.** No branch switching — this is pre-dev, analyze default branch.

## 3. Create Session

```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --target-url "<url>" --task "Analyzing: <brief>" --labels "analyze")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
noob-tester session heartbeat $SESSION_ID --phase 1 --run-id $RUN_ID
```

## 4. Search Codebase

```bash
noob-tester query codebase "<requirement keyword>" --expand
REPO_PATH=$(noob-tester repos path <repo-name>)
# Use Glob, Grep, Read on $REPO_PATH for deep analysis
```

Also browse repos via glab/bb (detect provider from URL).

## 5. Produce 4 Analyses

### Gap Analysis
```bash
noob-tester save analysis $RUN_ID --type gap \
  --content '{"known_facts":[...],"unknowns":[...],"assumptions":[...],"blocked_items":[...]}' \
  --summary "..."
```

### Requirements Analysis
```bash
noob-tester save analysis $RUN_ID --type requirements \
  --content '{"explicit_requirements":[...],"implicit_requirements":[...],"missing_requirements":[...],"ambiguous_requirements":[...]}' \
  --summary "..."
```

### Feasibility Analysis
```bash
noob-tester save analysis $RUN_ID --type feasibility \
  --content '{"testable":true,"recommended_approach":{...},"blockers":[...],"risks":[...]}' \
  --summary "..."
```

### Impact Analysis
```bash
noob-tester save analysis $RUN_ID --type impact \
  --content '{"impacted_areas":[...],"dependency_risks":[...],"config_concerns":[...],"hidden_edge_cases":[...],"test_gaps":[...],"regression_risks":[...]}' \
  --summary "..."
```

## 6. Complete

```bash
noob-tester log action $RUN_ID --phase 1 --agent analyst --description "4 analyses complete"
noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "Analysis complete for <TICKET-ID>"
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):
> Done. Session: $SESSION_ID
