---
name: noob-tester
description: Automated QA tester for web applications. Can run full test cycles or individual phases — analysis, test case generation, planning, browser exploration, reporting. Use when asked to QA test, find bugs, analyze requirements, write test cases, or test a web application.
---

# noob-tester — Automated QA Tester

The `noob-tester` CLI is your data layer — use it via Bash for runs, sessions, test cases, run packs, UI maps, codebase search, secrets, and issue tracking. You do the actual testing using your tools (Atlassian MCP, glab/bb, agent-browser, dogfood).

**Provider detection:** When you get MR/PR links from tickets, detect the provider from the URL:
- `gitlab.com` or `gitlab.*` → use `glab` CLI
- `bitbucket.org` or `bitbucket.*` → use `bb` CLI
- Other → use `git clone` directly

## Skills — Use What Fits

Each skill works **standalone** or as part of a pipeline:

| User says... | Use this |
|---|---|
| "cache ticket context for PROJ-123" / "fetch ticket data" | `/noob-ticket-cache` |
| "set up repos for PROJ-123" / "clone the repos" | `/noob-ticket-cache` → `/noob-repos-setup` |
| "analyze the impact of PROJ-123" | `/noob-ticket-cache` → `/noob-repos-setup` → `/noob-analyze` |
| "write test cases for PROJ-123" | `/noob-ticket-cache` → `/noob-repos-setup` → `/noob-testcase` |
| "PROJ-123 is ready for QA" / "plan the testing" | `/noob-ticket-cache` → `/noob-repos-setup` → `/noob-plan` |
| "test the login page at https://app.com" | `/noob-ticket-cache` → `/noob-repos-setup` → `/noob-explore` |
| "run the test cases for PROJ-123" | `/noob-ticket-cache` → `/noob-repos-setup` → `/noob-explore` (ui/ui_api) + `/noob-api-explore` (api) |
| "run the API tests for PROJ-123" | `/noob-ticket-cache` → `/noob-repos-setup` → `/noob-api-explore` |
| "test the endpoints for PROJ-123" | `/noob-ticket-cache` → `/noob-repos-setup` → `/noob-api-explore` |
| "rerun PROJ-123" / "fresh run" | `/noob-explore` or `/noob-api-explore` (forces new run pack) |
| "continue testing PROJ-123" | `/noob-explore` or `/noob-api-explore` (resume only) |
| "why did these tests fail?" | `/noob-rca` |
| "analyze the failures for PROJ-123" | `/noob-rca` |
| "check accessibility of PROJ-123" | `/noob-explore` (a11y scans happen automatically on every page) |
| "what's the coverage for repo X?" | `noob-tester coverage stats <repo>` / `coverage uncovered <repo>` |
| "generate a report" | `/noob-report` |
| "full QA test of PROJ-123" | Full pipeline (ticket-cache → repos-setup → analyze → testcase → plan → explore + api-explore → rca → report) |

## Before Starting

### 1. Initialize (Session + Run + Runpack in one command)

```bash
# One command — no jq needed for setup
INIT=$(noob-tester init \
  --ticket PROJ-123 \
  --target-url "https://staging.app.com" \
  --task "Testing PROJ-123" \
  --labels "explore" \
  --secret-target staging --secret-role admin \
  --capture screenshot,snapshot,console,har)

# Returns: { sessionId, runId, runPackId, evidenceDir, runResumed, packResumed }
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
```

Heartbeat after major actions: `noob-tester session heartbeat $SESSION_ID --phase <n> --run-id $RUN_ID`

### 2. Repos

Check registered repos:
```bash
noob-tester repos list
```

To find and ensure repos:
1. Atlassian MCP (`getJiraIssue`, `getJiraIssueRemoteIssueLinks`) → get MR/PR links from the ticket's dev panel
2. Extract repo URLs from MR links (e.g. `https://gitlab.com/org/repo/-/merge_requests/123` → `https://gitlab.com/org/repo`)
3. Pass all repo URLs to discover:
```bash
noob-tester repos discover --ticket PROJ-123 --url <repo-url-from-MR>
```

**NEVER use the current working directory. ALL repos from `~/.noob-tester/repos/` only.**

### 3. Credentials

If the target needs login:
```bash
noob-tester secrets list --target staging
noob-tester secrets get-profile --target staging --role admin
```

### 4. Prior Context

Check failures from past runs:
```bash
noob-tester query failures --limit 20
```

### 5. Resolve a Run

**Always use `run resolve` — it reuses an existing running/pending run for the same ticket, or creates a new one.**

```bash
RUN_RESULT=$(noob-tester run resolve \
  --input-type <ticket|confluence|text|file> \
  --input-ref "<reference>" \
  --target-url "<url>" \
  --capture screenshot,snapshot,video,har,console,trace \
  --secret-target <target-name> \
  --secret-role <role>)
RUN_ID=$(echo "$RUN_RESULT" | jq -r '.runId')
noob-tester session link $RUN_ID $SESSION_ID
```

**Override flags:**
- `--fresh` — force create a new run, skip resume check
- `--capture <types>` — comma-separated artifact types to record: screenshot, snapshot, video, har, console, trace (default: all)
- `--secret-target <name>` — secret target for login credentials (from `noob-tester secrets`)
- `--secret-role <role>` — role within the secret target (default: "default")

### 6. Run Skills & Track Metrics

Invoke skills as sub-agents. When each sub-agent returns, its result includes a `<usage>` block with **real** token counts:

```
<usage>total_tokens: 89124, tool_uses: 31, duration_ms: 71758</usage>
```

**After EVERY sub-agent returns, immediately log these values:**

```bash
# If token breakdown is available (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens):
noob-tester metrics log $SESSION_ID \
  --input-tokens <input_tokens> \
  --output-tokens <output_tokens> \
  --cache-read-tokens <cache_read_input_tokens> \
  --cache-create-tokens <cache_creation_input_tokens> \
  --tools <tool_uses from usage> \
  --duration <duration_ms from usage> \
  --model <full model ID, e.g. claude-opus-4-6> \
  --actions 1

# If only total_tokens is available:
noob-tester metrics log $SESSION_ID \
  --tokens <total_tokens from usage> \
  --tools <tool_uses from usage> \
  --duration <duration_ms from usage> \
  --model <full model ID> \
  --actions 1
```

**Always prefer the breakdown** when available — it gives exact cost. With only `--tokens`, cost is estimated using a 30/70 input/output split. Pass the full model ID (e.g. `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`).

**This is NOT optional.** Extract the exact numbers from the `<usage>` block — do not estimate or guess. Every skill invocation must be followed by a `metrics log` call before proceeding to the next skill.

When done:
```bash
noob-tester run complete $RUN_ID --status completed --summary "<summary>"
noob-tester session end $SESSION_ID
```

## Code Coverage

Build and query code-level coverage maps — link test cases to source files via `impacted_files` + import graph expansion:

```bash
# Build coverage map for a repo (reads test_cases.impacted_files, expands via import_graph)
noob-tester coverage build <repoName>

# View stats
noob-tester coverage stats <repoName>

# Find uncovered files (sorted by importer count — more importers = higher risk)
noob-tester coverage uncovered <repoName>

# See which test cases cover a specific file
noob-tester coverage file <repoName> <filePath>
```

## Test Selection by Code Changes

Given a git diff, find which test cases should run:

```bash
# Select test cases affected by a branch diff (uses coverage_map + import graph)
noob-tester testcase select --repo <repoName> --diff <baseBranch>
noob-tester testcase select --repo <repoName> --diff main --ticket PROJ-123 --json

# Deeper expansion (2 levels of import graph)
noob-tester testcase select --repo <repoName> --diff main --depth 2
```

**Requires `coverage build` first** — without coverage_map, no file-to-testcase links exist.

## Risk-based Test Prioritization

Compute risk scores for test cases based on multiple signals, then execute highest-risk tests first:

```bash
# Compute risk scores (stored on test_cases.risk_score)
noob-tester testcase risk --ticket PROJ-123

# Claim test cases in risk order (highest risk first)
noob-tester runpack claim-next $RUNPACK_ID PROJ-123 $SESSION_ID --layer ui --risk
```

Risk factors (weighted):
- **Failure pattern frequency** (30%) — files with recurring failures
- **Code churn** (25%) — files with many recent commits
- **Element/endpoint flakiness** (20%) — flaky UI selectors or API endpoints
- **Recency** (15%) — files changed after last test execution
- **Historical failure rate** (10%) — test cases that fail often

## False Positive Reduction

After execution, auto-retry failed entries to distinguish real failures from transient ones:

```bash
# Mark failed entries for auto-retry (max 1 retry per entry)
noob-tester runpack auto-retry $RUNPACK_ID

# After retry completes, classify the result
noob-tester runpack classify-retry $ENTRY_ID --status passed  # → likely_false_positive
noob-tester runpack classify-retry $ENTRY_ID --status failed  # → high/medium/low confidence

# View false positive stats
noob-tester runpack false-positives $RUNPACK_ID
```

Confidence levels:
- **likely_false_positive** — passed on retry
- **low** — matches known issue or resolved tech issue
- **medium** — matches recurring failure pattern
- **high** — no matches, first occurrence, likely real failure

## Root Cause Analysis (after execution)

After `/noob-explore` and/or `/noob-api-explore` complete, run `/noob-rca` on the run pack to classify failures:

```bash
# RCA classifies each failed entry: env_issue, flaky_selector, actual_bug, test_data_issue, network, auth_issue, timeout, unknown
# Run this BEFORE /noob-report so the report includes failure classifications

# View RCA results
noob-tester rca list --pack $RUNPACK_ID
noob-tester rca summary --pack $RUNPACK_ID
```

**When to use `/noob-rca`:**
- After a run pack has failures (automatic in full pipeline)
- User asks "why did tests fail?" or "analyze failures"
- Before reporting — RCA classifications feed into the report

## Accessibility Testing

Accessibility issues are captured automatically during `/noob-explore` via axe-core injection on every page load. Results stored in `a11y_issues` table.

```bash
# View a11y issues
noob-tester a11y list --run $RUN_ID
noob-tester a11y list --pack $RUNPACK_ID
noob-tester a11y summary $RUN_ID
```

## Test Cleanup & Deduplication

Audit test suite health — find duplicates, stale, never-failed, and orphaned test cases:

```bash
# Full audit
noob-tester testcase audit --ticket PROJ-123

# Individual checks
noob-tester testcase audit --ticket PROJ-123 --duplicates
noob-tester testcase audit --ticket PROJ-123 --never-failed
noob-tester testcase audit --orphaned  # across all tickets
noob-tester testcase audit --stale
```

## Visual Regression Testing (deferred)

Data layer ready (`visual baseline`, `visual compare`, `visual diff-save`, `visual review`, `visual accept`, `visual stats`) but not integrated into noob-explore yet. Requires deterministic e2e automation scripts for reliable baseline comparison.

## Chain Commands (Composite Operations)

These commands replace multi-step bash sequences. Use them instead of the individual commands:

| Command | Replaces | When to use |
|---------|----------|-------------|
| `noob-tester init --ticket X --target-url Y` | `session start` + `run resolve` + `session link` + `runpack resolve` | Start of every skill |
| `noob-tester finish --run X --session Y` | `run complete` + `session end` | End of every skill |
| `noob-tester capture-page --run X --url Y --action N` | 4× `agent-browser` + 4× `capture store` + `uimap page` + `uimap scan` | Every page load in noob-explore |
| `noob-tester claim-smart --pack X --ticket Y --session Z` | 20+ lines of claim/retry/done logic | noob-explore claim loop |
| `noob-tester auth-resolve --pack X` | `runpack meta` + `secrets get-profile` + jq parsing | Login/auth in explore + api-explore |
| `noob-tester repos setup-for-ticket --ticket X` | `repos discover` + `repos sync` + `repos index` | `/noob-repos-setup` |
| `noob-tester api-request --method POST --url X` | `curl` + parse + `capture store` + `runpack log` + `apimap call` | Every HTTP request in api-explore |

## Data Reuse Across Skills

All data is linked through the **ticket ref**. Any skill can look up data from any other skill using `--ticket`:

```bash
# Check if analysis already exists for this ticket
noob-tester query analysis --ticket PROJ-123

# Check if test cases exist
noob-tester testcase list --ticket PROJ-123

# Check if a plan exists
noob-tester query plan --ticket PROJ-123

# Check if run packs exist (execution history)
noob-tester runpack list --ticket PROJ-123

# Get all issues found across all runs for this ticket
noob-tester query issues --ticket PROJ-123

# Get full context dump (analysis + plan + issues + failures)
noob-tester query context --ticket PROJ-123

# List all runs for this ticket
noob-tester query runs --ticket PROJ-123
```

**This means:**
- `/noob-testcase` on PROJ-123 automatically reuses `/noob-analyze`'s analysis
- `/noob-plan` on PROJ-123 automatically reuses the impact analysis
- `/noob-explore` on PROJ-123 resumes or creates a **run pack** and executes **one UI test case per invocation** (`ui` and `ui_api` layers) — with configurable capture (screenshot, video, etc.), stored credentials, and UI map learning. Invoke repeatedly for all cases
- `/noob-api-explore` on PROJ-123 runs ALL `api` layer tests in one invocation — reads codebase once, authenticates per role, loops through every API test case, cleans up per test
- `/noob-report` on PROJ-123 sees everything — all issues, test cases, run packs, analyses
- No need to pass run IDs between sessions — the ticket ref links everything

## Run Packs

Run packs are the execution layer for `/noob-explore`. Each run pack:
- Groups test case executions for a ticket
- Stores **target URL**, **secret credentials reference**, and **capture config**
- Tracks per-entry results, artifacts (screenshots, videos, HAR), logs, and observations
- Supports parallel execution via the claim system
- Is fully visible in the watch dashboard (Explore tab)

```bash
# ALWAYS use resolve — it resumes existing pack or creates new automatically
noob-tester runpack resolve --ticket PROJ-123 --run $RUN_ID \
  --target-url "https://staging.app.com" \
  --secret-target staging --secret-role admin \
  --capture screenshot,snapshot,har
# Returns: { runPackId, resumed: true/false }

# Force fresh pack ONLY when user says "rerun" or "fresh":
noob-tester runpack resolve --ticket PROJ-123 --run $RUN_ID --fresh ...

# Populate — bulk-add test cases with a status (e.g. after login failure, or for api-explore)
noob-tester runpack populate $RUNPACK_ID PROJ-123 --status blocked --reason "Login failed"
noob-tester runpack populate $RUNPACK_ID PROJ-123 --status pending --layer api --runner api  # api-explore uses this

# View run pack metadata
noob-tester runpack meta $RUNPACK_ID

# List run packs for a ticket
noob-tester runpack list --ticket PROJ-123

# View entries in a run pack
noob-tester runpack list --pack $RUNPACK_ID

# Retry by test case name
noob-tester runpack retry --name "login" --pack $RUNPACK_ID

# Retry all failed/blocked
noob-tester runpack retry --pack $RUNPACK_ID

# Retry everything (full rerun of same pack)
noob-tester runpack retry --all $RUNPACK_ID
```

**IMPORTANT: Never use `runpack create` directly.** Always use `runpack resolve` — it handles resume-or-create logic automatically.

## UI Maps

UI maps are a persistent knowledge base of how an app's UI works. They grow with every `/noob-explore` session and are shared across targets with the same repos.

```bash
# Find existing map by ticket, repo, or target
noob-tester uimap resolve --ticket PROJ-123
noob-tester uimap resolve --repo "https://gitlab.com/org/frontend"
noob-tester uimap resolve --target "https://staging.app.com"

# Create if none exists
noob-tester uimap create --name "My App" \
  --repos "repo1,repo2" --targets "staging,prod" --tickets "PROJ-123"

# Query what the map knows
noob-tester uimap pages $MAP_ID                           # all pages
noob-tester uimap lookup --map $MAP_ID --url "/login"     # selectors for a page
noob-tester uimap path --map $MAP_ID --from "/login" --to "/checkout"  # navigation path
noob-tester uimap flaky $MAP_ID                           # broken/flaky selectors
noob-tester uimap stats $MAP_ID                           # overall health

# Scan a page's accessibility snapshot — bulk-records all elements + forms
noob-tester uimap scan $PAGE_ID --snapshot ./snapshot.txt --ticket PROJ-123 --run $RUN_ID
```

**Key concepts:**
- **Map = app, not target** — defined by repos. Multiple targets share the same map
- **`uimap scan`** — parses accessibility snapshot, bulk-records every element and auto-detects forms. Stores stable selectors: `role[name="text"]`, `role[placeholder="..."]`, `role[url="..."]`, with `@ref` as fallback
- **Stable selectors** — elements identified by role+text/placeholder/url (not ephemeral `[ref=eN]`). The map tells you WHAT to look for, the current snapshot tells you WHERE (`@eN`)
- **Selector strategy** — each element stores its strategy type: `role+text`, `role+placeholder`, `role+title`, `role+alt`, `role+url`, or `ref`
- **Reliability tracking** — `hit`/`miss` auto-computes working/flaky/broken status
- **Target parity** — tracks what exists on which target
- **Audit trail** — every entity tracks created_by/updated_by (run, ticket, session)

The watch dashboard's **UI Maps** tab shows a force-directed canvas sitemap with page nodes, navigation edges, and a page element map with elements grouped by type.

## Codebase Search

Search indexed repos at any point:
```bash
noob-tester query codebase "authentication" --expand
noob-tester repos search "login handler" --repos frontend,backend --expand
```

`--expand` traces the import dependency graph — finds related files automatically.

## Per-Action Capture

**Use `capture-page` for one-command capture of everything:**
```bash
noob-tester capture-page --run $RUN_ID --url "<page-url>" --action 3 \
  --pack $RUNPACK_ID --entry $ENTRY_ID --desc "After Save" --page-name "save-result" \
  --map $MAP_ID --page-title "Dashboard"
```

This captures snapshot + screenshot + console + HAR, registers all in DB, and optionally updates the UI map. One command replaces 11.

For manual/individual captures, the old commands still work:
```bash
noob-tester capture store --run $RUN_ID --type console --file ./evidence/console.txt --url "/dashboard" --action 3
noob-tester capture list --run $RUN_ID --type har
noob-tester capture stats --run $RUN_ID
```

## Live Dashboard

```bash
noob-tester watch
```

Left sidebar navigation at http://localhost:4040. Pages:
- **Dashboard** — sessions grouped by ticket → click for sessions + issues split view
- **Issues** — sortable table (severity, category, title, location, time). Click any issue → full detail modal with artifacts, tech issues, UI map sitemap
- **Explore** — run packs with per-action artifacts (snapshots, console, HAR)
- **Test Cases** — ready/draft badges, BDD/traditional steps
- **UI Maps** — force-directed canvas sitemap, page element map
- Breadcrumb navigation on all detail pages (`Dashboard | FEAT-7679 | abc123`)

## Cleanup

```bash
noob-tester cleanup watch              # kill dashboard
noob-tester cleanup session <id> --yes # delete a session and its data
noob-tester cleanup stale --yes        # delete stale/crashed sessions
noob-tester cleanup all --yes          # delete runs/sessions/analyses/issues (keeps secrets, repos, index)
noob-tester cleanup secrets --yes      # delete all secrets and targets
noob-tester cleanup repos --yes        # delete all repos, index, synced files
noob-tester cleanup repos --name frontend --yes  # delete one repo
noob-tester cleanup testcases --yes    # delete all test cases
noob-tester cleanup nuke --yes         # FULL RESET — delete everything including secrets, repos, index
```
