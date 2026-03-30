---
name: noob-analyze
description: Deep analysis of a ticket — gap, requirements, feasibility, and impact analysis against the codebase. Runs before development starts.
---

# Requirements & Impact Analysis

Analyze a ticket deeply against the codebase. Produces 4 analyses: gap, requirements, feasibility, impact.

**This runs BEFORE dev starts** — analyzing the EXISTING codebase to predict impact.

## 1. Create Session

```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --target-url "<url>" --task "Analyzing: <brief>" --labels "analyze")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
noob-tester session heartbeat $SESSION_ID --phase 1 --run-id $RUN_ID
```

## 2. Search Codebase

```bash
noob-tester query codebase "<requirement keyword>" --expand
REPO_PATH=$(noob-tester repos path <repo-name>)
# Use Glob, Grep, Read on $REPO_PATH for deep analysis
```

Also browse repos via glab/bb/gh (detect provider from URL).

## 3. Produce 4 Analyses

1. **Gap analysis** — known facts, unknowns, assumptions, blocked items
2. **Requirements analysis** — explicit, implicit, missing, ambiguous
3. **Feasibility analysis** — testability, blockers, risks
4. **Impact analysis (DEEP DIVE — spend most time here):**
    - Impacted areas (files, modules, API endpoints, call chains)
    - Dependency risks (shared utilities, tight coupling, circular deps)
    - Configuration concerns (env vars, feature flags, build configs)
    - Compatibility issues (API contracts, DB migrations, browser compat)
    - Infrastructure concerns (new services, migrations, CI/CD changes)
    - Hidden edge cases (race conditions, i18n, permissions)
    - Existing test coverage gaps
    - Regression risks (shared code paths, silent breakage)

### Save format

```bash
noob-tester save analysis $RUN_ID --type gap \
  --content '{"known_facts":[...],"unknowns":[...],"assumptions":[...],"blocked_items":[...]}' \
  --summary "..."

noob-tester save analysis $RUN_ID --type requirements \
  --content '{"explicit_requirements":[...],"implicit_requirements":[...],"missing_requirements":[...],"ambiguous_requirements":[...]}' \
  --summary "..."

noob-tester save analysis $RUN_ID --type feasibility \
  --content '{"testable":true,"recommended_approach":{...},"blockers":[...],"risks":[...]}' \
  --summary "..."

noob-tester save analysis $RUN_ID --type impact \
  --content '{"impacted_areas":[...],"dependency_risks":[...],"config_concerns":[...],"compatibility_issues":[...],"infrastructure_concerns":[...],"hidden_edge_cases":[...],"test_gaps":[...],"regression_risks":[...]}' \
  --summary "..."
```

## 4. Complete

```bash
noob-tester log action $RUN_ID --phase 1 --agent analyst --description "4 analyses complete"
noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "Analysis complete for <TICKET-ID>"
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):

> Done. Session: $SESSION_ID
