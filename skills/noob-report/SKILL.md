---
name: noob-report
description: Generate comprehensive test report — analyses, plans, test cases, execution results, issues, RCA, accessibility. Determine verdict, notify Slack, update ticket.
---

# Reporting

Generate a report by pulling ALL data for a ticket and analyzing it.

## 1. Gather Data

```bash
REPORT=$(noob-tester report --ticket <TICKET-ID> --json)
```

This pulls: summary, analyses, plan, test cases, issues, execution (run packs), UI map, tech issues, sessions, runs.

## 2. Initialize

```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --task "Report: <TICKET-ID>" --labels "report")
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
noob-tester session heartbeat $SESSION_ID --phase 5
```

## 3. Run RCA (if not done)

```bash
RCA_SUMMARY=$(noob-tester rca summary --pack $RUNPACK_ID)
# If total = 0, invoke /noob-rca first
```

## 4. Gather A11y + False Positive Stats

```bash
noob-tester a11y summary $RUN_ID --json
noob-tester runpack false-positives $RUNPACK_ID --json
# Use confirmed failures (excluding false positives) for verdict
```

## 5. Determine Verdict

**PASS** — no critical/high issues, all direct functional passed, no blockers
**FAIL** — critical issues, direct functional failed, auth blocked
**PARTIAL** — mixed results, some high issues, API failed but UI passed

## 6. Write Report

Structure: Verdict → Test Notes → Issues by Severity → Execution Results (UI + API) → RCA Breakdown → Accessibility → Coverage → Impact → UI Map Health → Tech Issues → Recommendations

## 7. Save Report

```bash
noob-tester report-save --ticket <TICKET-ID> \
  --verdict <PASS|FAIL|PARTIAL> \
  --summary "One-line verdict" \
  --analysis "<Full written analysis>" \
  --improvements "<Prioritized recommendations>" \
  --run $RUN_ID --session $SESSION_ID
```

## 8. Update Ticket + Notify

Use Atlassian MCP `addCommentToJiraIssue` to post summary to the ticket. Post to Slack if requested.

## 9. Complete

```bash
noob-tester log action $RUN_ID --phase 5 --agent reporter --description "Report: VERDICT"
noob-tester finish --run $RUN_ID --session $SESSION_ID --summary "VERDICT: N issues, X/Y passed"
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):
> Done. Session: $SESSION_ID
