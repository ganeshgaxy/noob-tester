# noob-tester

An AI-powered QA testing system that turns Claude Code into a fully autonomous test engineer. Give it a ticket and a target URL — it reads the requirements, analyzes the codebase, writes test cases, executes them via browser automation and direct API testing, finds bugs, and delivers a comprehensive report with root cause analysis and improvement recommendations.

## Why

**For QA engineers** — You spend half your day reading tickets, setting up test data, clicking through the same flows, and writing bug reports. noob-tester handles that grunt work. It reads the ticket, writes the test cases, runs them, and hands you a report with findings. You spend your time on what actually needs your brain — validating edge cases, questioning requirements, exploratory testing that requires domain knowledge. Your output per sprint doubles because you're reviewing results instead of producing them from scratch.

**For developers** — You push a PR and want to know if it breaks anything before QA even looks at it. Point noob-tester at your ticket — it analyzes the code diff, figures out what's impacted, and runs targeted tests against the staging deploy. You get feedback in minutes, not days. Fewer bugs bounce back from QA. Fewer "works on my machine" surprises. The impact analysis alone saves you from the PRs that silently break three other features.

**For engineering managers** — Every ticket gets the same testing depth regardless of sprint pressure, team capacity, or who's on PTO. The dashboard shows exactly what was tested, what passed, what failed, and what wasn't covered — across every ticket, every sprint. No more "we tested it" without evidence. Reports include risk hotspots, coverage gaps, and improvement recommendations — data you can use in sprint retros and release decisions.

**For the business** — Testing that used to take days happens in hours. Releases move faster because QA isn't the bottleneck. Bug escapes drop because coverage is consistent. Every run can use you Claude code subscription — run it on every ticket, not just the ones your team has time for. The system compounds: UI maps, failure patterns, and test cases persist across runs, so each cycle is faster and more targeted than the last.

**ROI** — It runs on Claude Code. Multiple tickets tested in parallel. Test cases, UI maps, and failure patterns persist across runs so each cycle builds on the last. QA reviews results instead of producing them. Releases don't wait for a testing queue.

## What It Does

- **Reads your ticket** — pulls requirements, acceptance criteria, dev comments, linked MRs, and builds a full understanding of what was built
- **Analyzes your codebase** — clones repos, builds a searchable index with import graph, traces full dependency chains (UI → API → service → database) to understand impact
- **Writes test cases** — generates BDD and traditional test cases for UI, API, and integration layers, tagged by priority and test layer
- **Plans the testing** — creates a test plan with steps, confidence levels, coverage gaps, blockers, and concise test notes
- **Executes UI tests** — browser automation via agent-browser (Playwright), captures screenshots, snapshots, HAR, console logs, video per action, learns the UI map
- **Executes API tests** — direct HTTP testing via curl/jq, validates status codes, response schemas, auth flows, error handling, with full request/response artifacts
- **Finds every issue** — functional bugs, console errors, network failures, accessibility problems, performance issues, visual regressions — all categorized by severity
- **Cleans up after itself** — API tests track created resources and delete them in reverse order after execution
- **Generates intelligent reports** — Claude analyzes all findings, identifies risk hotspots, detects issue patterns, evaluates coverage gaps, and writes prioritized improvement recommendations
- **Updates ticket and Slack** — posts test results back to the ticket, notifies the team
- **Runs in parallel** — multiple Claude Code sessions claim different test cases from the same pool, no duplicates
- **Caches intelligently** — ticket info, MR diffs, and linked data are cached after the first fetch and reused by subsequent skills, saving tokens and reducing API calls
- **Maps your APIs** — builds a persistent API map with endpoints, parameters, response schemas, and dependency chains. Tracks endpoint health (active/flaky/failing) and response times across runs
- **Analyzes code coverage** — links test cases to source files via import graph, shows which files have zero test coverage, selects test cases by git diff
- **Classifies failures** — root cause analysis after execution: env issue, flaky selector, actual bug, test data, network, auth, timeout — with confidence scores and suggested actions
- **Detects false positives** — auto-retries failed tests, marks transient failures as likely false positives, surfaces confirmed failures with confidence levels
- **Prioritizes by risk** — scores test cases from failure patterns, code churn, flakiness, and recency — executes highest-risk tests first
- **Audits accessibility** — runs axe-core WCAG checks on every page during browser testing, stores violations with impact levels and WCAG criteria
- **Detects visual regressions** — compares screenshots against baselines per page/viewport, uses Claude vision for diff analysis, supports review and acceptance workflows
- **Audits test suite health** — finds near-duplicate test cases (Jaccard similarity), never-failed tests, orphaned tests, and stale tests for cleanup
- **Learns over time** — UI maps and API maps persist across sessions, failure patterns are tracked, selector reliability is measured, tech issues carry workarounds

## How It Works

```
Ticket + Target URL
         ↓
Claude Code (the brain)    ←  Skills teach it the QA workflow
         ↓
noob-tester CLI (data)     ←  SQLite DB, codebase index, secrets, artifacts
         +
agent-browser (UI tests)   ←  Playwright-based browser automation + axe-core a11y
         +
curl/jq (API tests)        ←  Direct HTTP request testing
         ↓
Root cause analysis        ←  Classify failures, detect false positives
         ↓
Live Dashboard             ←  Real-time results at localhost:4040
```

**noob-tester** is a CLI data layer that Claude Code calls via Bash. Skills (SKILL.md files) teach Claude how to orchestrate the full QA pipeline. Claude does the thinking — reading code, understanding requirements, deciding what to test, interpreting failures. The CLI stores and retrieves data.

Multiple Claude Code sessions run in parallel — they share the same database and claim test cases without duplicates.

---

## Prerequisites

| Dependency                                                                       | Required | Purpose                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Claude Code](https://claude.com/claude-code)                                    | Yes      | The AI agent that runs the skills                                                                                                                                              |
| [agent-browser](https://github.com/vercel-labs/agent-browser)                    | Yes      | Browser automation for UI tests (`/noob-explore`)                                                                                                                              |
| [Atlassian MCP](https://github.com/anthropics/claude-code/blob/main/docs/mcp.md) | Yes      | Ticket reading, linked MR discovery, test result updates, Confluence pages. All skills depend on the ticket as the source of requirements, acceptance criteria, and dev context |
| git                                                                              | Yes      | Repo cloning, syncing, and codebase indexing                                                                                                                                   |
| curl                                                                             | Yes      | API test execution (`/noob-api-explore`)                                                                                                                                       |
| jq                                                                               | Yes      | JSON parsing in CLI commands and API response validation                                                                                                                       |
| [glab](https://gitlab.com/gitlab-org/cli)                                        | Optional | GitLab CLI for reading MR diffs and repo browsing                                                                                                                              |

## Install

```bash
npm install -g @ganeshgaxy/noob-tester
noob-tester setup
```

Install skills into Claude Code:

```bash
cp -r skills/ ~/.claude/skills/
```

Configure the Atlassian MCP server in your Claude Code settings — without it, skills cannot read tickets or discover linked repos.

---

## Quick Start

```bash
# Register your repos
noob-tester repos add frontend https://gitlab.com/org/frontend
noob-tester repos add backend https://gitlab.com/org/backend
noob-tester repos group add myapp --repos frontend,backend

# Sync and index the codebase
noob-tester repos sync myapp
noob-tester repos index myapp

# Set up credentials
noob-tester secrets target add staging --url https://staging.app.com
noob-tester secrets set LOGIN_EMAIL "admin@example.com" --target staging --role admin
noob-tester secrets set LOGIN_PASSWORD "op:Private/MyApp/password" --target staging --role admin

# Open the live dashboard
noob-tester watch
```

In Claude Code:

```
> Use noob-tester to test PROJ-123 at https://staging.app.com
> /noob-analyze PROJ-123
> /noob-testcase PROJ-123
> /noob-explore test the login page at https://staging.app.com
> /noob-api-explore run the API tests for PROJ-123
> /noob-rca analyze the failures
> /noob-report generate a report for PROJ-123
```

Coverage and risk (CLI):
```bash
# Build coverage map and find gaps
noob-tester coverage build frontend
noob-tester coverage uncovered frontend

# Select tests affected by a branch
noob-tester testcase select --repo frontend --diff main

# Score and prioritize by risk
noob-tester testcase risk --ticket PROJ-123
```

---

## Skills

Each skill works **standalone** or as part of a pipeline. Use whichever fits what you're doing.

| Skill               | What it does                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/noob-tester`      | Main orchestrator — routes to the right skill based on what you ask                                             |
| `/noob-analyze`     | Deep analysis: gap, requirements, feasibility, and **impact analysis** against the codebase                     |
| `/noob-testcase`    | Generate BDD + traditional test cases from tickets with deep codebase understanding                        |
| `/noob-plan`        | Test planning for dev-complete tickets — reads MRs, code diffs, prior analysis, test cases, UI map              |
| `/noob-explore`     | Browser automation — execute `ui` and `ui_api` test cases via run packs, UI map learner, configurable capture, **axe-core a11y audit**, **visual regression checks** on every page |
| `/noob-api-explore` | API testing — execute ALL `api` layer test cases in one run via curl/jq, codebase-driven, per-role auth, per-test cleanup |
| `/noob-rca`         | Root cause analysis — classify failures (env/flaky/bug/data/network), update patterns, suggest actions          |
| `/noob-report`      | Generate report with RCA classifications, a11y results, notify Slack, update ticket                             |

| User says...                                 | Use this                                         |
| -------------------------------------------- | ------------------------------------------------ |
| "analyze the impact of PROJ-123"             | `/noob-analyze`                                  |
| "write test cases for PROJ-123"              | `/noob-testcase`                                 |
| "PROJ-123 is ready for QA, plan the testing" | `/noob-plan`                                     |
| "test the login page at https://app.com"     | `/noob-explore`                                  |
| "run the test cases for PROJ-123"            | `/noob-explore` (ui) + `/noob-api-explore` (api) |
| "test the API endpoints for PROJ-123"        | `/noob-api-explore`                              |
| "why did these tests fail?"                  | `/noob-rca`                                      |
| "what's the code coverage for myapp?"        | `noob-tester coverage stats myapp`               |
| "generate a report for run abc123"           | `/noob-report`                                   |
| "full QA test of PROJ-123"                   | `/noob-tester` (full pipeline)                   |

---

## Commands

### `noob-tester repos` — Manage repositories and codebase index

Register repos, group them, sync to local disk, and build a searchable index with BM25 full-text search + import dependency graph.

| Command                                | Description                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos add <name> <url>`               | Register a repository                                                                                                                                 |
| `repos list`                           | List all registered repos                                                                                                                             |
| `repos delete <name> --yes`            | Delete a repo and its index                                                                                                                           |
| `repos path <name>`                    | Get local path of a synced repo                                                                                                                       |
| `repos group add <name> --repos a,b,c` | Create a repo group                                                                                                                                   |
| `repos group list`                     | List all groups                                                                                                                                       |
| `repos group delete <name>`            | Delete a group                                                                                                                                        |
| `repos discover --ticket <id>`           | **Find all repos for a ticket** (from runs, test cases, UI maps) + ensure them. `--url <extra>` to add more. Auto: register + clone/pull + diff-aware index |
| `repos ensure <urls...>`               | Register + clone/pull + index repos. Accepts URLs or names. Uses `glab` for GitLab repos. All repos in `~/.noob-tester/repos/`                        |
| `repos sync <name>`                    | Clone or pull a repo or group. `--branch <branch>` to checkout a specific branch. `--reindex` to auto-re-index if commit changed                      |
| `repos index <name>`                   | Diff-aware re-index (only changed files since last indexed commit). `--full` for complete rebuild. Records branch + commit                             |
| `repos search <query>`                 | Search indexed code                                                                                                                                   |
| `repos search <query> --expand`        | Search + show related files via import graph                                                                                                          |
| `repos search <query> --repos a,b`     | Search specific repos                                                                                                                                 |

```bash
# Register and group
noob-tester repos add frontend https://gitlab.com/org/frontend
noob-tester repos add backend https://gitlab.com/org/backend
noob-tester repos group add myapp --repos frontend,backend

# Sync and index
noob-tester repos sync myapp
noob-tester repos index myapp
# ✔ frontend: 342 files, 1205 imports (main @ a1b2c3d4)
# ✔ backend: 189 files, 567 imports (main @ e5f6g7h8)

# Sync a specific branch (e.g. for testing an MR)
noob-tester repos sync frontend --branch feature/PROJ-123 --reindex
# ✔ frontend: switched to feature/PROJ-123 @ 9i0j1k2l, re-indexed

# Search with import graph expansion
noob-tester repos search "authentication middleware" --expand
# Finds auth.ts + every file that imports it + every file it imports

# Claude Code can also read synced repos directly
noob-tester repos path frontend
# /Users/you/.noob-tester/repos/frontend
```

### `noob-tester run` — Manage test runs

| Command                                             | Description                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `run resolve --input-type <type> --input-ref <ref>` | **Resume or create** a run. Reuses existing running/pending run for same input-ref. `--fresh` to force new |
| `run create --input-type <type> --input-ref <ref>`  | Always create a new run (CLI only — skills should use `resolve`)                                           |
| `run create ... --target-url <url>`                 | Set the target app URL                                                                                     |
| `run create ... --repo <url>`                       | Attach repo URLs (repeatable)                                                                              |
| `run create ... --reuse-run <id>`                   | Reuse prior analysis/plan (skip Phase 1 & 2)                                                               |
| `run create ... --fresh`                            | Ignore all prior run data                                                                                  |
| `run create ... --force`                            | Override — regenerate analysis/plan/testcases even if they exist                                           |
| `run create ... --capture <types>`                  | Comma-separated capture types: `screenshot,snapshot,video,har,console,trace` (default: all)                |
| `run create ... --secret-target <name>`             | Secret target name for login credentials                                                                   |
| `run create ... --secret-role <role>`               | Secret role within the target (default: "default")                                                         |
| `run update <id> --phase <n>`                       | Update current phase                                                                                       |
| `run complete <id> --status <s> --summary <text>`   | Mark run completed/failed                                                                                  |
| `run get <id>`                                      | Get run details as JSON                                                                                    |

**Input types:** `ticket`, `confluence`, `text`, `file`

```bash
# From ticket with repos, capture config, and credential reference
noob-tester run create --input-type ticket --input-ref PROJ-123 \
  --target-url https://staging.app.com \
  --repo https://gitlab.com/org/frontend \
  --repo https://gitlab.com/org/backend \
  --capture screenshot,snapshot,video,har,console,trace \
  --secret-target staging --secret-role admin

# Reuse prior analysis
noob-tester run create --input-type text --input-ref "re-test login" \
  --target-url https://app.com --reuse-run <priorRunId>
```

### `noob-tester testcase` — Generate and manage test cases

Test cases in BDD or traditional format, with multi-session claim system.

**Test case types (execution priority):**

1. **direct_functional** — core feature/fix tests (executed first)
2. **impact_regression** — tests for impacted dependencies (executed second)
3. **general_regression** — crucial flows not directly touched (executed last)

**Test layers** (what kind of test):
| Layer | Description |
|---|---|
| `ui` | Pure UI interaction — clicks, forms, navigation (default) |
| `api` | Pure API — request/response, status codes, payloads |
| `ui_api` | Spans both — UI action triggers API call, verify both sides |
| `database` | Data persistence, queries, migrations, constraints |
| `ai` | AI/ML features — prompts, responses, model behavior |
| `unit` | Code-level unit test — functions, utilities, pure logic |
| `other` | Does not fit above categories |

`/noob-explore` only executes `ui` and `ui_api` tests (browser automation). Other layers need different runners.

| Command                                                                              | Description                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `testcase create <runId> --ticket <ref> --type <type> --format <fmt> --title <text>` | Create a test case (draft by default)                                                    |
| `testcase create ... --layer <layer>`                                                | Set test layer: `ui`, `api`, `ui_api`, `database`, `ai`, `unit`, `other` (default: `ui`) |
| `testcase create ... --ready`                                                        | Create and mark as ready for execution                                                   |
| `testcase mark-ready <id>`                                                           | Mark a test case as ready                                                                |
| `testcase mark-draft <id>`                                                           | Mark a test case as draft (not executable)                                               |
| `testcase ready-all <ticketRef>`                                                     | Mark all test cases for a ticket as ready                                                |
| `testcase draft-all <ticketRef>`                                                     | Mark all test cases for a ticket as draft                                                |
| `testcase claim <ticketRef> <sessionId>`                                             | Claim next available **ready** case (priority order)                                     |
| `testcase claim ... --fresh`                                                         | Also claim previously completed cases                                                    |
| `testcase result <id> --status <s> --run <runId>`                                    | Record execution result                                                                  |
| `testcase release <id>`                                                              | Release a claimed case                                                                   |
| `testcase release-session <sessionId>`                                               | Release all claims by a session                                                          |
| `testcase list --ticket <ref>`                                                       | List cases for a ticket                                                                  |
| `testcase stats <ticketRef>`                                                         | Show counts by type/status                                                               |
| `testcase select --repo <name> --diff <branch>`                                     | Select test cases affected by code changes (via coverage_map + import graph)             |
| `testcase risk --ticket <ref>`                                                       | Compute risk scores from failure patterns, code churn, flakiness, recency                |
| `testcase audit --ticket <ref>`                                                      | Audit: find duplicates, never-failed, stale. `--duplicates`, `--orphaned`, `--stale`     |

```bash
# BDD format with test layer
noob-tester testcase create $RUN_ID \
  --ticket PROJ-123 --type direct_functional --format bdd \
  --title "Login with valid credentials" \
  --bdd-feature "Login" --bdd-scenario "Valid login" \
  --bdd-given '["user on /login"]' \
  --bdd-when '["enters email","enters password","clicks Sign In"]' \
  --bdd-then '["redirected to dashboard"]' \
  --impacted-files '["src/auth/login.ts"]' \
  --layer ui

# Traditional format — API test (won't be picked up by noob-explore)
noob-tester testcase create $RUN_ID \
  --ticket PROJ-123 --type direct_functional --format traditional \
  --title "POST /api/auth/login returns 200 with valid creds" \
  --trad-steps '[{"step":"POST /api/auth/login with valid body","expected":"200 + session token"}]' \
  --layer api

# UI + API test
noob-tester testcase create $RUN_ID \
  --ticket PROJ-123 --type impact_regression --format traditional \
  --title "Checkout still works after auth change" \
  --trad-steps '[{"step":"Go to checkout","expected":"Page loads"}]' \
  --layer ui_api

# Multi-session: each session claims one test case at a time
noob-tester testcase claim PROJ-123 $SESSION_ID       # gets next unclaimed
noob-tester testcase claim PROJ-123 $SESSION_ID --fresh  # re-runs completed too
```

### `noob-tester runpack` — Run packs (execution batches)

Run packs are the execution layer for `/noob-explore`. Each pack groups test case executions for a ticket, with stored target URL, credential references, and capture config.

**Default behavior:** `/noob-explore` resumes an existing pack with pending/failed entries. If none exist, it creates a new pack. If the user says "rerun" or "fresh", it forces a new pack.

| Command                                            | Description                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runpack resolve --ticket <id> --run <runId>`        | **Resume or create** a run pack. Checks for existing packs with pending/failed entries first. `--fresh` to force new. Optional: `--target-url`, `--secret-target`, `--secret-role`, `--capture`, `--session` |
| `runpack create --ticket <id> --run <runId>`         | Create a new run pack (always fresh, CLI only — skills should use `resolve`). Optional: `--target-url`, `--secret-target`, `--secret-role`, `--capture`, `--session`                                         |
| `runpack meta <packId>`                            | Get pack metadata (target, credentials, capture config)                                                                                                                                                      |
| `runpack add <packId> <testCaseId>`                | Add a specific test case to a pack                                                                                                                                                                           |
| `runpack claim <packId> <sessionId>`               | Claim next pending entry already in the pack (resume mode)                                                                                                                                                   |
| `runpack claim-next <packId> <ticketId> <sessionId>` | Pick next test case not yet in the pack, add and claim it. `--layer` to filter by test layer. `--runner` to set runner type (ui/api, auto-detected from layer)                                               |
| `runpack populate <packId> <ticketId> --status <s>`  | Add ready test cases to pack with status: `pending`, `blocked`, `skipped`. `--layer` to filter by test layer (e.g. `--layer api`). `--runner` to stamp entries. Optional: `--reason`, `--run`, `--session` |
| `runpack result <entryId> --status <s>`            | Record result: `passed`, `failed`, `skipped`, `blocked`. Optional: `--results`, `--logs`, `--observations`, `--issues` (all JSON)                                                                            |
| `runpack artifact <entryId> --type <t> --path <p>` | Attach artifact: `screenshot`, `snapshot`, `video`, `har`, `console`, `trace`. Optional: `--label`, `--step`, `--metadata`                                                                                   |
| `runpack observe <entryId> --text <t>`             | Add an observation                                                                                                                                                                                           |
| `runpack log <entryId> --text <t>`                 | Add a log entry                                                                                                                                                                                              |
| `runpack list --ticket <id>`                         | List run packs for a ticket (with pass/fail/pending counts)                                                                                                                                                  |
| `runpack list --pack <packId>`                     | List entries in a specific pack                                                                                                                                                                              |
| `runpack release <packId>`                         | Release all claimed entries back to pending                                                                                                                                                                  |
| `runpack retry --entry <entryId>`                  | Retry a specific entry (reset to pending)                                                                                                                                                                    |
| `runpack retry --name <text> --pack <packId>`      | Retry entries matching test case name (substring)                                                                                                                                                            |
| `runpack retry --pack <packId>`                    | Retry all failed/blocked entries                                                                                                                                                                             |
| `runpack retry --all <packId>`                     | Retry ALL entries including passed (full rerun of same pack)                                                                                                                                                 |
| `runpack delete --pack <packId> --yes`             | Delete a specific pack                                                                                                                                                                                       |
| `runpack delete --ticket <id> --yes`                 | Delete all packs for a ticket                                                                                                                                                                                |
| `runpack auto-retry <packId>`                        | Mark all failed/blocked entries for auto-retry (max 1 retry per entry)                                                                                                                                       |
| `runpack classify-retry <entryId> --status <s>`      | Classify retry result: `likely_false_positive` if passed, confidence level if failed                                                                                                                         |
| `runpack false-positives <packId>`                   | Show false positive analysis (total, retried, false positives, confirmed, by confidence)                                                                                                                     |

```bash
# Resolve — resumes existing pack or creates new (always use this, not create)
noob-tester runpack resolve --ticket PROJ-123 --run $RUN_ID \
  --target-url "https://staging.app.com" \
  --secret-target staging --secret-role admin \
  --capture screenshot,snapshot,har
# Returns: { runPackId, resumed: true/false }

# Claim one test case (resume pending first, then fresh)
noob-tester runpack claim $RUNPACK_ID $SESSION_ID         # resume pending entry
noob-tester runpack claim-next $RUNPACK_ID PROJ-123 $SESSION_ID  # or claim fresh
noob-tester runpack claim-next $RUNPACK_ID PROJ-123 $SESSION_ID --layer ui  # only UI tests

# Record results and artifacts per entry
noob-tester runpack result $ENTRY_ID --status passed --results '{"summary":"all good"}'
noob-tester runpack artifact $ENTRY_ID --type screenshot --path ./step1.png --label "After login" --step 1
```

### `noob-tester capture` — Per-action artifact storage

Stores snapshots, console logs, HAR network data, screenshots, and network errors per action, linked to run, runpack entry, page URL, and action number.

| Command                                     | Description                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture store --run <runId> --type <type>` | Store an artifact. Types: `snapshot`, `screenshot`, `console`, `har`, `video`, `trace`, `network_error`, `api_request`. `--file <path>` or `--content <text>`. Optional: `--pack`, `--entry`, `--session`, `--ticket`, `--action <n>`, `--desc`, `--url <pageUrl>` |
| `capture list --run <runId>`                | List artifacts for a run. `--entry <id>` for a specific entry. `--type` to filter                                                                                                                                                                                |
| `capture stats --run <runId>`               | Show artifact counts by type                                                                                                                                                                                                                                     |

```bash
# Store console logs for an action
noob-tester capture store --run $RUN_ID --type console --file ./evidence/console.txt \
  --url "/dashboard" --action 3 --desc "After clicking Save" --ticket FEAT-7679

# List all HAR files for a run
noob-tester capture list --run $RUN_ID --type har

# Stats
noob-tester capture stats --run $RUN_ID
# {"snapshot":5,"screenshot":5,"console":5,"har":5}
```

### `noob-tester uimap` — UI maps (persistent app knowledge)

UI maps are a persistent knowledge base of how an app's UI works — pages, selectors, navigation paths, forms, reliability tracking. Shared across targets with the same repos. Grows with every `/noob-explore` session.

**A map is defined by repos, not targets.** Multiple targets (staging, prod, dev) sharing the same codebase share the same map. Fetchable by ticket ID, repo URL, or target URL.

**Stable selectors** — `uimap scan` stores elements using role + text/label/placeholder/url (e.g. `button[name="Sign In"]`, `textbox[placeholder="Search"]`), not ephemeral `[ref=eN]` refs. Each element records its selector strategy type (`role+text`, `role+placeholder`, `role+url`, `ref`). The map tells you WHAT elements to expect, the current browser snapshot tells you WHERE they are.

| Command                                              | Description                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `uimap create --name <n>`                            | Create a map. Optional: `--repos`, `--targets`, `--tickets` (comma-separated)                                                                                                                                                                            |
| `uimap get <id>`                                     | Get map details + stats                                                                                                                                                                                                                                |
| `uimap list`                                         | List all maps with stats                                                                                                                                                                                                                               |
| `uimap resolve --ticket <id>`                          | Find a map by ticket ID, `--repo`, or `--target`. Returns first match                                                                                                                                                                                    |
| `uimap update <id>`                                  | Add repos/targets/tickets: `--add-repos`, `--add-targets`, `--add-tickets`                                                                                                                                                                                 |
| `uimap delete <id> --yes`                            | Delete map and all its data                                                                                                                                                                                                                            |
| `uimap page <mapId> --url <pattern>`                 | Record/update a page (upserts by URL). Optional: `--title`, `--snapshot`, `--screenshot`, `--auth-required`, `--auth-roles`, `--code`, `--repos`, `--tickets`, `--parity`, `--run`, `--session`                                                          |
| `uimap pages <mapId>`                                | List all pages                                                                                                                                                                                                                                         |
| `uimap element <pageId> --selector <sel> --type <t>` | Record/update an element (upserts by selector). Optional: `--role`, `--text`, `--action`, `--result`, `--code`, `--tickets`, `--auth-roles`, `--run`, `--testcase`                                                                                       |
| `uimap elements <pageId>`                            | List elements on a page                                                                                                                                                                                                                                |
| `uimap lookup --map <id> --url <pattern>`            | Look up elements by URL. `--type` to filter. Sorted by reliability                                                                                                                                                                                     |
| `uimap hit <elementId>`                              | Record selector success. `--run` optional                                                                                                                                                                                                              |
| `uimap miss <elementId>`                             | Record selector failure. Auto-updates status (working/flaky/broken)                                                                                                                                                                                    |
| `uimap alt <elementId> --selector <sel>`             | Add alternative selector                                                                                                                                                                                                                               |
| `uimap flaky <mapId>`                                | List flaky/broken elements                                                                                                                                                                                                                             |
| `uimap nav <mapId> --from <pageId> --to <pageId>`    | Record navigation. `--via` element, `--type`, `--conditions`                                                                                                                                                                                           |
| `uimap path --map <id> --from <url> --to <url>`      | Find navigation path between URLs (BFS pathfinding)                                                                                                                                                                                                    |
| `uimap form <pageId>`                                | Record/update a form. `--selector`, `--fields` (JSON), `--submit`, `--success`, `--error`, `--sample-values`                                                                                                                                           |
| `uimap scan <pageId> --snapshot <path>`              | **Parse accessibility snapshot and bulk-record all elements + forms.** Stores stable selectors: `role[name="text"]`, `role[placeholder]`, `role[url]`, `@ref` fallback. Records selector strategy per element. `--ticket`, `--run`, `--session` optional |
| `uimap stats <mapId>`                                | Show map statistics                                                                                                                                                                                                                                    |

```bash
# Create a map for the app (defined by repos, not target)
noob-tester uimap create --name "My App" \
  --repos "https://gitlab.com/org/frontend,https://gitlab.com/org/backend" \
  --targets "https://staging.app.com,https://prod.app.com" \
  --tickets "PROJ-123"

# Find existing map by ticket, repo, or target
noob-tester uimap resolve --ticket PROJ-456

# Record pages and scan elements from snapshot (2 commands per page)
noob-tester uimap page $MAP_ID --url "/login" --title "Login" --ticket PROJ-123 --run $RUN_ID
noob-tester uimap scan $PAGE_ID --snapshot ./snapshot.txt --ticket PROJ-123 --run $RUN_ID
# Scan creates: button[name="Sign In"], textbox[name="Email"], link[url="/forgot-password"]

# Track selector reliability
noob-tester uimap hit $ELEMENT_ID --run $RUN_ID   # worked
noob-tester uimap miss $ELEMENT_ID --run $RUN_ID  # failed

# Navigation pathfinding
noob-tester uimap path --map $MAP_ID --from "/login" --to "/checkout"

# Track target parity (staging has it, prod doesn't)
noob-tester uimap page $MAP_ID --url "/beta-feature" \
  --parity '{"staging":true,"prod":false}'
```

### `noob-tester apimap` — API maps (persistent endpoint registry)

Like UI maps for the frontend, API maps are a persistent knowledge base of your backend. Endpoints, parameters, response schemas, dependency chains, and health tracking — all visualized as a force-directed graph in the dashboard.

| Command                                     | Description                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apimap resolve <name>`                     | Find or create an API map. `--base-url`, `--tickets`, `--repos`                            |
| `apimap endpoint <mapId>`                   | Register/update an endpoint. `--method`, `--path`, `--summary`, `--auth-type`, `--auth-roles` |
| `apimap call <endpointId>`                  | Record a call result. `--status` (HTTP code), `--time` (ms). Updates health automatically  |
| `apimap param <endpointId>`                 | Add a parameter. `--name`, `--in` (path/query/body/header), `--type`, `--required`         |
| `apimap response <endpointId>`              | Register expected response. `--status`, `--schema`, `--example`                            |
| `apimap chain <mapId>`                      | Add dependency. `--from`, `--to`, `--type` (creates/reads/updates/deletes/cleanup)         |
| `apimap lookup <mapId>`                     | Find endpoint by `--method` + `--path`                                                     |
| `apimap list`                               | List all API maps                                                                          |
| `apimap get <name>`                         | Full map data (endpoints, params, responses, chains)                                       |
| `apimap stats <name>`                       | Statistics (total, active, flaky, failing, avg response time)                              |

```bash
# Create or find an API map
APIMAP_ID=$(noob-tester apimap resolve "my-api" --base-url https://api.staging.com --tickets PROJ-123 | jq -r '.id')

# Register endpoints discovered from code analysis
EP_ID=$(noob-tester apimap endpoint $APIMAP_ID --method POST --path "/api/users" \
  --summary "Create user" --auth-type bearer --auth-roles "admin" | jq -r '.endpointId')

# Add params and responses
noob-tester apimap param $EP_ID --map $APIMAP_ID --name email --in body --type string --required
noob-tester apimap response $EP_ID --map $APIMAP_ID --status 201 --schema '{"id":"string","email":"string"}'

# Record call results during testing (auto-updates health)
noob-tester apimap call $EP_ID --status 201 --time 150 --run $RUN_ID

# Add dependency chains
GET_EP_ID=$(noob-tester apimap endpoint $APIMAP_ID --method GET --path "/api/users/:id" | jq -r '.endpointId')
noob-tester apimap chain $APIMAP_ID --from $EP_ID --to $GET_EP_ID --type creates
```

**Endpoint health** updates automatically based on call results:
- **active** — no failures or low failure rate
- **flaky** — intermittent failures (some succeed, some fail)
- **failing** — consistently failing (3+ consecutive failures)

### `noob-tester coverage` — Code-level coverage mapping

Link test cases to source files via `impacted_files` + import graph expansion. Find which source files have no test coverage.

| Command                                   | Description                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `coverage build <repoName>`               | Build coverage map from test case `impacted_files` + 1-level import graph expansion                     |
| `coverage stats <repoName>`               | Show coverage statistics (total/covered/uncovered files, coverage %)                                    |
| `coverage uncovered <repoName>`           | List files with no test case coverage, sorted by importer count (more importers = higher risk)          |
| `coverage file <repoName> <filePath>`     | Show which test cases cover a specific file (with link type and confidence)                              |
| `coverage clear <repoName>`               | Clear coverage map for a repo (rebuild with `coverage build`)                                           |

```bash
# Build coverage map (reads test_cases.impacted_files, expands via import_graph)
noob-tester coverage build frontend

# View stats
noob-tester coverage stats frontend
# Total: 342, Covered: 89, Uncovered: 253, Coverage: 26%

# Find highest-risk uncovered files
noob-tester coverage uncovered frontend --limit 20

# Which test cases cover auth.ts?
noob-tester coverage file frontend src/auth/login.ts
```

### `noob-tester rca` — Root cause analysis

Classify failures from completed run packs. Used by `/noob-rca` skill or standalone.

| Command                          | Description                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `rca save`                       | Save an RCA result. `--pack`, `--entry`, `--testcase`, `--classification`, `--confidence`, `--cause` required. Optional: `--evidence`, `--pattern`, `--action` |
| `rca list --pack <id>`           | List RCA results for a run pack (with test case details)                                                     |
| `rca summary --pack <id>`        | Summary counts by classification and suggested action                                                        |
| `rca get <entryId>`              | Get RCA result for a specific entry                                                                          |
| `rca clear --pack <id>`          | Clear all RCA results for re-analysis                                                                        |

**Classifications:** `env_issue`, `flaky_selector`, `actual_bug`, `test_data_issue`, `network`, `auth_issue`, `timeout`, `unknown`

**Suggested actions:** `retry`, `fix_test`, `fix_app`, `fix_env`, `investigate`, `skip`

```bash
# Save an RCA result
noob-tester rca save --pack $PACKID --entry $ENTRY_ID --testcase $TC_ID \
  --classification actual_bug --confidence 0.9 \
  --cause "Auth middleware doesn't pass session to downstream services" \
  --evidence "Console shows 500 on /api/orders, HAR confirms missing session header" \
  --action fix_app

# View summary
noob-tester rca summary --pack $PACKID
# { total: 8, byClassification: { actual_bug: 3, env_issue: 2, flaky_selector: 1, network: 2 } }
```

### `noob-tester a11y` — Accessibility testing

Store and query axe-core WCAG audit results. Automatically populated by `/noob-explore` on every page load.

| Command                          | Description                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `a11y scan <runId>`              | Store axe-core violations JSON. `--url`, `--results` (JSON array). Optional: `--pack`, `--entry`, `--page-id` |
| `a11y add <runId>`               | Store a single a11y issue. `--url`, `--rule`, `--impact`, `--description`. Optional: `--wcag`, `--selector`, `--html` |
| `a11y list`                      | List a11y issues. `--run`, `--pack`, or `--page` to filter                                            |
| `a11y summary <runId>`           | Summary by impact level and rule, with page count                                                     |

**Impact levels:** `critical`, `serious`, `moderate`, `minor` (mapped from axe-core)

```bash
# Store axe-core results from browser evaluation
noob-tester a11y scan $RUN_ID --url "/login" --results "$AXE_VIOLATIONS" \
  --pack $PACKID --entry $ENTRY_ID

# View summary
noob-tester a11y summary $RUN_ID
# { total: 12, byImpact: { serious: 4, moderate: 6, minor: 2 }, pageCount: 3 }

# List all issues for a pack
noob-tester a11y list --pack $PACKID --json
```

### `noob-tester testcase select` — Test selection by code changes

Given a git diff, find which test cases should run based on coverage map + import graph.

| Command | Description |
|---------|-------------|
| `testcase select --repo <name> --diff <branch>` | Select test cases affected by changed files. `--ticket` to scope. `--depth <n>` for deeper expansion. `--json` |

```bash
# Which test cases should run for this branch?
noob-tester testcase select --repo frontend --diff main
# Changed: 5 files, Affected: 12 files (with imports), Test cases: 8

noob-tester testcase select --repo frontend --diff main --ticket PROJ-123 --json
```

**Requires `coverage build` first** — builds the file-to-testcase mapping.

### `noob-tester testcase risk` — Risk-based prioritization

Compute risk scores from failure patterns, code churn, flakiness, and recency.

| Command | Description |
|---------|-------------|
| `testcase risk --ticket <ref>` | Compute and store risk scores for all ready test cases. `--json` |

```bash
noob-tester testcase risk --ticket PROJ-123
# Computed: 15 test cases, Avg score: 0.42, High risk: 3

# Claim in risk order (highest risk first)
noob-tester runpack claim-next $PACKID PROJ-123 $SESSION --layer ui --risk
```

### `noob-tester runpack auto-retry / false-positives` — False positive reduction

Auto-retry failed entries to distinguish real failures from transient issues.

| Command | Description |
|---------|-------------|
| `runpack auto-retry <packId>` | Mark all failed/blocked entries for retry (max 1 retry each) |
| `runpack classify-retry <entryId> --status <s>` | Classify retry result: `likely_false_positive` if passed, confidence if failed |
| `runpack false-positives <packId>` | Show false positive stats. `--json` |

```bash
# After execution completes with failures:
noob-tester runpack auto-retry $PACKID  # resets failed → pending (retry_count++)

# After retry pass completes:
noob-tester runpack classify-retry $ENTRY_ID --status passed  # → likely_false_positive

# View analysis
noob-tester runpack false-positives $PACKID
# Total failed: 8, Retried: 8, False positives: 3, Confirmed: 5
```

### `noob-tester testcase audit` — Test suite cleanup & deduplication

Audit test cases for duplicates, never-failed, orphaned, and stale entries.

| Command | Description |
|---------|-------------|
| `testcase audit --ticket <ref>` | Full audit: duplicates + never-failed + stale. `--json` |
| `testcase audit --duplicates --ticket <ref>` | Only near-duplicate pairs (Jaccard similarity). `--threshold <n>` (default: 0.65) |
| `testcase audit --never-failed --ticket <ref>` | Test cases executed but never failed (potential low-value) |
| `testcase audit --orphaned` | Test cases with no run pack activity in 90 days (across all tickets) |
| `testcase audit --stale --ticket <ref>` | Test cases not executed in 30+ days |

```bash
# Full audit
noob-tester testcase audit --ticket PROJ-123
# Total: 24, Duplicates: 2 pairs, Never failed: 5, Stale: 3

# Just duplicates with custom threshold
noob-tester testcase audit --duplicates --ticket PROJ-123 --threshold 0.7 --json
```

### `noob-tester visual` — Visual regression testing

Compare screenshots against baselines per page/viewport. Hash-based quick check + Claude vision for detailed analysis.

| Command | Description |
|---------|-------------|
| `visual baseline --page <id> --url <pattern> --screenshot <path>` | Set baseline. `--viewport`, `--run`, `--entry` |
| `visual compare --page <id> --screenshot <path>` | Compare against baseline (hash check). Returns `{ hasBaseline, hashMatch, baselinePath }` |
| `visual diff-save --baseline <id> --run <runId> --current <path>` | Save diff result. `--score`, `--description`, `--regression`, `--entry` |
| `visual list` | List diffs. `--run`, `--unreviewed`, `--json` |
| `visual accept <diffId>` | Accept current screenshot as new baseline |
| `visual review <diffId>` | Mark reviewed: `--regression` or `--ok` |
| `visual stats` | Stats: baselines, diffs, regressions, reviewed/unreviewed. `--run`, `--json` |

```bash
# Set baseline on first passing run
noob-tester visual baseline --page $PAGE_ID --url "/login" \
  --screenshot ./evidence/login.png --run $RUN_ID

# Compare on next run
noob-tester visual compare --page $PAGE_ID --screenshot ./evidence/login-current.png
# { hasBaseline: true, hashMatch: false, baselinePath: "...", baselineId: "..." }

# Save diff after Claude vision analysis
noob-tester visual diff-save --baseline $BASELINE_ID --run $RUN_ID \
  --current ./evidence/login-current.png \
  --score 0.6 --description "Submit button changed from blue to green" --regression

# Review
noob-tester visual list --unreviewed
noob-tester visual review $DIFF_ID --regression
noob-tester visual accept $DIFF_ID  # promote as new baseline
```

### `noob-tester secrets` — Manage credentials

Scoped to **targets** (environments/apps) and **roles** (admin, user, api). Supports literal values, environment variables (`env:`), and 1Password (`op:`).

| Command                                                  | Description                         |
| -------------------------------------------------------- | ----------------------------------- |
| `secrets target add <name> --url <url>`                  | Register a target                   |
| `secrets target list`                                    | List all targets and roles          |
| `secrets target delete <name> --yes`                     | Delete a target and all its secrets |
| `secrets set <key> <value> --target <t> --role <r>`      | Set a secret                        |
| `secrets get-profile --target <t> --role <r>`            | Get all resolved secrets            |
| `secrets get-profile --url <url> --role <r>`             | Get secrets by matching URL         |
| `secrets delete <key> --target <t> --role <r>`           | Delete a secret                     |
| `secrets delete-role --target <t> --role <r>`            | Delete all secrets for a role       |
| `secrets list`                                           | List all (values masked)            |
| `secrets list --target <t>`                              | Filter by target                    |
| `secrets list --role <r>`                                | Filter by role                      |
| `secrets list --url <url>`                               | Filter by URL                       |
| `secrets find <search>`                                  | Find by key or value (e.g. email)   |
| `secrets import-op <vault/item> --target <t> --role <r>` | Import from 1Password               |
| `secrets import-op ... --live`                           | Store as `op:` refs (always fresh)  |
| `secrets import-op ... --map label=KEY`                  | Custom field mapping                |
| `secrets import-op ... --prefix APP_`                    | Prefix all keys                     |

```bash
# Register targets
noob-tester secrets target add staging --url https://staging.app.com
noob-tester secrets target add prod --url https://prod.app.com

# Set credentials
noob-tester secrets set LOGIN_EMAIL "admin@example.com" --target staging --role admin
noob-tester secrets set LOGIN_PASSWORD "op:Private/MyApp/password" --target staging --role admin
noob-tester secrets set API_TOKEN "env:STAGING_TOKEN" --target staging --role api

# Import all fields from 1Password at once
noob-tester secrets import-op "Private/MyApp" --target staging --role admin
noob-tester secrets import-op "Private/MyApp" --target staging --role admin --live  # keep as op:// refs

# Vault names with slashes work — last segment is the item name
noob-tester secrets import-op "ENG/Development/TeamEnablementQA" --target staging --role admin --live

# Query
noob-tester secrets get-profile --target staging --role admin
noob-tester secrets get-profile --url https://staging.app.com --role admin
noob-tester secrets find "admin@example.com"
```

### `noob-tester session` — Track active sessions

| Command                                                                    | Description                                    |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| `session start --task <text> --labels <a,b> --tickets <PROJ-123,PROJ-456>` | Register a session with labels and ticket refs |
| `session heartbeat <id> --phase <n> --run-id <id> --tickets <PROJ-789>`    | Keep alive, add tickets                        |
| `session end <id>`                                                         | Mark completed                                 |
| `session get <id>`                                                         | Get details                                    |
| `session link <runId> <sessionId>`                                         | Link a run to a session                        |
| `session list`                                                             | List all (marks stale after 5min)              |
| `session list --active`                                                    | Only active sessions                           |

### `noob-tester watch` — Live web dashboard

```bash
noob-tester watch                    # http://localhost:4040
noob-tester watch --port 3000
noob-tester watch --session <id>     # focus on one session
```

**Layout:** Left sidebar navigation with logo at top, nav links in middle, live stats at bottom. Content area fills remaining space. Breadcrumb navigation (clickable chips with `|` separator) on all detail pages. Split views with independent scroll per panel.

**Pages:**

- **Dashboard** — sessions grouped by ticket. Click a ticket → split view with sessions (left) and issues (right) for that ticket. Click a session → full session detail with breadcrumb `Dashboard | FEAT-7679 | abc123`
- **Issues** — all issues grouped by ticket → sortable table (click column headers to sort by severity, category, title, location, time). Click any issue → full detail modal
- **Analyses** — grouped by run, viewable per analysis type
- **Explore** — run packs grouped by ticket → pack detail with test case entries, results, per-action artifacts (snapshots, console logs, HAR, screenshots), logs, observations
- **Test Cases** — suites grouped by ticket → split view with BDD/traditional steps, ready/draft badges
- **Plans** — test plans by ticket → plan detail with Requirements, Steps, and Test Notes tabs. Steps linked to test cases, MRs, UI map pages. Blockers, coverage gaps, strategy
- **Repos** — registered repos with sync status, index stats, groups
- **UI Maps** — force-directed canvas sitemap (zoom, pan, drag nodes/clusters). Click a page → modal with element map canvas + screenshot + elements/forms/navigations
- **Metrics** — aggregate usage stats
- **Secrets** — targets → roles → secrets with reveal/add/delete, 1Password import
- **Docs** — tabbed CLI command reference (CLI Commands, Skills, Concepts)

**Issue detail modal** — click any issue anywhere → full modal with: severity/category badges, description, location, screenshot, console output, network data, per-action artifacts (from `run_artifacts` table), related run info, test case, analyses, technical issues with workarounds, UI map sitemap canvas (affected page highlighted), element list, metadata.

Updates live via SSE every 2 seconds. Zero external dependencies.

### `noob-tester tech-issue` — Technical issue tracking

Track and manage technical difficulties (timeouts, crashes, env issues) encountered during testing. Serves as a knowledge base — future agents check for known tech issues before each step and apply workarounds.

| Command                                                               | Description                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `tech-issue log <runId> --ticket <ref> --title <t> --description <d>` | Log a tech issue (ticket required)                                         |
| `tech-issue resolve <id> --status <s>`                                | Update status: `workaround_found`, `resolved`, `investigating`, `wont_fix` |
| `tech-issue resolve <id> --workaround <text>`                         | Record a workaround                                                        |
| `tech-issue check --url <url>`                                        | Check for known tech issues at a URL (run before each step)                |
| `tech-issue check --ticket <ref>`                                     | Check for known tech issues for a ticket                                   |
| `tech-issue list`                                                     | List all tech issues. `--ticket`, `--status`, `--category` to filter       |

**Categories:** `timeout`, `crash`, `network_failure`, `js_error`, `element_not_found`, `auth_issue`, `env_issue`, `unknown`

**Status flow:** `unresolved` → `investigating` → `workaround_found` or `resolved` or `wont_fix`

```bash
# Log a tech issue with full context
noob-tester tech-issue log $RUN_ID \
  --title "504 timeout on /api/orders" \
  --description "Page stuck after clicking Submit. Console shows 504." \
  --category timeout --severity high \
  --url "/checkout" --ticket PROJ-123 \
  --recovery '[{"attempt":"refresh","result":"fixed","duration_ms":3000}]' \
  --outcome recovered

# Record a workaround
noob-tester tech-issue resolve <id> --status workaround_found \
  --workaround "Refresh page after Submit, wait 5s for API"

# Check before running a step
noob-tester tech-issue check --url /checkout
```

Every tech issue is tagged to a ticket ID (`--ticket` is required). Recurring issues are auto-deduplicated per ticket — same problem on the same ticket increments the count, different tickets track separately.

### `noob-tester log` — Record actions, issues, and outputs

| Command                                                                             | Description     |
| ----------------------------------------------------------------------------------- | --------------- |
| `log action <runId> --phase <n> --agent <name> --description <text>`                | Log an action   |
| `log issue <runId> --category <cat> --severity <sev> --title <t> --description <d>` | Record an issue |
| `log output <runId> --source <tool> --type <type>`                                  | Save raw output |

**Issue categories:** `ui`, `accessibility`, `network`, `console`, `visual`, `layout`, `content`, `functional`, `performance`

**Severity levels:** `critical`, `high`, `medium`, `low`, `info`

### `noob-tester query` — Query stored data

All query commands support `--ticket <TICKET-ID>` (finds latest run) or `--run <runId>` (specific run). Ticket-based lookup means any skill can reuse data from any other skill without knowing the run ID.

| Command                                                                         | Description                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `query runs --ticket <ref>`                                                     | List all runs for a ticket                                    |
| `query issues --ticket <ref>`                                                   | Issues across all runs for a ticket                           |
| `query issues --run <id>`                                                       | Issues for a specific run                                     |
| `query issues --location <pattern>`                                             | Issues by location pattern                                    |
| `query issues --category <cat> --severity <sev>`                                | Filter by category/severity                                   |
| `query failures --limit <n>`                                                    | Known failure patterns (collective memory)                    |
| `query analysis --ticket <ref>`                                                 | All analyses for a ticket (latest run)                        |
| `query analysis --ticket <ref> --type <gap\|requirements\|feasibility\|impact>` | Specific analysis type                                        |
| `query plan --ticket <ref>`                                                     | Test plan for a ticket                                        |
| `query steps --ticket <ref>`                                                    | Test steps for a ticket                                       |
| `query codebase <search> --expand`                                              | BM25 search + import graph                                    |
| `query repos --ticket <ref>`                                                    | Repo URLs for a ticket                                        |
| `query context --ticket <ref>`                                                  | Full prior context dump (analysis + plan + issues + failures) |

### `noob-tester save` — Store analysis and plans

| Command                                                                                  | Description                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `save analysis <runId> --type <type> --content <json>`                                   | Save analysis (gap/requirements/feasibility/impact)                                                                                        |
| `save plan <runId> --ticket <id>`                                                          | Save a test plan. `--plan` JSON includes all sections: strategy, requirements, testNotes, blockers, coverageGaps, mrRefs, targetUrl, etc.  |
| `save step <planId> --run <runId> --order <n> --description <text> --confidence <level>` | Add a step to a plan. Optional: `--category`, `--priority`, `--testcase <id>`, `--mr <ref>`, `--uimap-page <id>`, `--page-url`, `--source` |
| `save delete-plan --id <planId> --yes`                                                   | Delete a specific plan and all its steps                                                                                                   |
| `save delete-plan --ticket <id> --yes`                                                     | Delete all plans for a ticket                                                                                                         |

### `noob-tester cleanup` — Clean up data and processes

| Command                                       | Description                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cleanup watch`                               | Kill the dashboard process                                                                            |
| `cleanup watch --port <n>`                    | Kill on specific port                                                                                 |
| `cleanup session <id> --yes`                  | Delete a session and all its data                                                                     |
| `cleanup stale --yes`                         | Delete stale/crashed sessions                                                                         |
| `cleanup all --yes`                           | Delete runs, sessions, analyses, test cases, issues, run packs, UI maps (keeps secrets, repos, index) |
| `cleanup secrets --yes`                       | Delete all secrets and targets                                                                        |
| `cleanup tech-issues --yes`                   | Delete all technical issues                                                                           |
| `cleanup tech-issues --ticket <ref> --yes`    | Delete tech issues for a ticket                                                                       |
| `cleanup tech-issues --status resolved --yes` | Delete resolved tech issues                                                                           |
| `cleanup repos --yes`                         | Delete all repos, groups, index, and synced files                                                     |
| `cleanup repos --name <name> --yes`           | Delete a specific repo and its index                                                                  |
| `cleanup testcases --yes`                     | Delete all test cases                                                                                 |
| `cleanup testcases --ticket <ref> --yes`      | Delete for a specific ticket                                                                          |
| `cleanup testcases --status passed --yes`     | Delete by status                                                                                      |
| `cleanup nuke --yes`                          | **Full reset** — delete EVERYTHING including secrets, targets, repos, index, synced files             |

### `noob-tester ticket-context` — Cache ticket info and MR diffs across skills

Avoids redundant Atlassian MCP calls and `glab mr view` fetches. First skill to read a ticket saves the data; subsequent skills check cache first. Hybrid storage: SQLite index + JSON files in `~/.noob-tester/ticket-context/`.

| Command                                  | Description                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ticket-context save <ticket>`           | Save content. `--type`, `--content`, `--ttl <min>` (default: 30), `--source`                      |
| `ticket-context get <ticket>`            | Get cached data. `--type` (exact or prefix). Returns `{cached: true/false, content}`              |
| `ticket-context invalidate <ticket>`     | Delete entries. `--type` for specific (e.g. `mr_diff:!423`), prefix (e.g. `mr_diff`), or all      |
| `ticket-context list <ticket>`           | List all cached entries for a ticket                                                              |
| `ticket-context tickets`                 | List all tickets with cached context                                                              |
| `ticket-context purge`                   | Remove all stale entries past their TTL                                                           |

**Context types:**

| Type                | Default TTL | Content                                     |
| ------------------- | ----------- | ------------------------------------------- |
| `ticket_info`       | 30 min      | Title, description, AC, status, comments     |
| `comments`          | 15 min      | All ticket comments                          |
| `linked_tickets`    | 60 min      | Parent, subtasks, blockers                   |
| `mr_metadata`       | 60 min      | List of MR refs (repo, branch, ID)           |
| `mr_diff:!<id>`     | 120 min     | Full diff for one MR                         |
| `confluence:<id>`   | 60 min      | Confluence page content                      |

```bash
# First skill (noob-analyze) fetches and saves
noob-tester ticket-context save PROJ-123 --type ticket_info \
  --content '{"title":"...","description":"..."}' --source atlassian_mcp

# Later skills check cache first
noob-tester ticket-context get PROJ-123 --type ticket_info
# → {cached: true, content: {...}}  — no MCP call needed

# Invalidate one MR diff after a new commit
noob-tester ticket-context invalidate PROJ-123 --type mr_diff:!423

# Invalidate all MR diffs
noob-tester ticket-context invalidate PROJ-123 --type mr_diff

# Clean up everything for a ticket
noob-tester ticket-context invalidate PROJ-123
```

### `noob-tester report` / `history` / `status`

| Command                                    | Description                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report --ticket <id>`                       | **Comprehensive ticket report** — pulls analyses, plans, test cases, run packs (UI + API), issues, UI maps, tech issues, sessions. Formatted text output |
| `report --ticket <id> --json`                | Same data as structured JSON — used by `/noob-report` skill for deep analysis                                                                            |
| `report --run <runId>`                     | Legacy single-run report (issues only)                                                                                                                   |
| `history` / `history --json`               | List past runs                                                                                                                                           |
| `status <runId>` / `status <runId> --json` | Show run details                                                                                                                                         |

### Chain Commands — Composite Operations

These commands replace multi-step bash sequences, eliminating jq parsing and reducing agent errors.

| Command | What it replaces |
|---------|-----------------|
| `init --ticket X --target-url Y` | `session start` + jq + `run resolve` + jq + `session link` + `runpack resolve` + jq (4 commands → 1) |
| `finish --run X --session Y` | `run complete` + `session end` (2 → 1) |
| `capture-page --run X --url Y --action N` | 4× `agent-browser` + 4× `capture store` + `uimap page` + `uimap scan` (11 → 1) |
| `claim-smart --pack X --ticket Y --session Z` | Retry failed → resume pending → claim new → done check (20+ lines → 1) |
| `auth-resolve --pack X` | `runpack meta` + `secrets get-profile` + 4× jq for email/password/token (6 → 1) |
| `repos setup-for-ticket --ticket X` | `repos discover` + `repos sync` + `repos index` per repo (5+ → 1) |
| `api-request --method POST --url X` | `curl` + parse response + `capture store` + `runpack log` + `apimap call` (6+ → 1) |

```bash
# Example: Full noob-explore setup in 3 lines instead of 20+
INIT=$(noob-tester init --ticket FEAT-7679 --target-url https://staging.app.com --labels explore --secret-target staging)
CREDS=$(noob-tester auth-resolve --pack $(echo "$INIT" | jq -r '.runPackId'))
ENTRY=$(noob-tester claim-smart --pack $(echo "$INIT" | jq -r '.runPackId') --ticket FEAT-7679 --session $(echo "$INIT" | jq -r '.sessionId'))
```

### `noob-tester setup`

Comprehensive setup check — verifies CLIs, skills, symlinks, auth, and database.

```bash
noob-tester setup                      # check everything (gitlab + bitbucket)
noob-tester setup --provider gitlab    # only check GitLab tools
noob-tester setup --provider bitbucket # only check Bitbucket tools
```

Checks:
- **Core CLIs** — git, curl, jq, claude
- **Browser Automation** — agent-browser CLI, agent-browser skills
- **GitLab** — glab CLI, glab auth, glab plugin, glab skill symlink
- **Bitbucket** — bb CLI, bb auth, bb plugin, bb skill symlink
- **1Password** (optional) — op CLI, op sign-in
- **Hooks** — subagent-metrics hook
- **MCP** — Atlassian MCP reminder
- **Database** — initialization, table count

Any missing item shows the exact command to fix it. Plugin versions are detected dynamically — no hardcoded version paths.

---

## Analysis Phases

### Phase 1: Understanding & Analysis (`/noob-analyze`)

- Reads task from the ticket, Confluence, text, or file
- **Auto-detects repositories** from MR links, ticket description, Confluence pages, or `--repo` flag
- **Syncs and indexes** repos — BM25 full-text search + import dependency graph
- Produces **gap analysis**, **requirements analysis**, **feasibility analysis**
- **Impact analysis** (deep dive) — takes every requirement and analyzes against the existing codebase:
  - Impacted files/modules and dependency chains
  - Dependency risks (shared code)
  - Configuration concerns (env vars, feature flags)
  - Compatibility issues (API contracts, migrations)
  - Infrastructure concerns (new services, deployment order)
  - Hidden edge cases
  - Existing test gaps
  - Regression risks
- If no repo found → records blocker, stops the run

### Phase 2: Test Planning (`/noob-plan`)

- Runs when a dev ticket is **complete and ready for QA** (not during grooming — that's `/noob-analyze`)
- **Fetches linked MRs/PRs** — reads the actual code diff to understand what was implemented
- **Syncs and indexes repos** — searches codebase with `--expand` for changed areas and dependencies
- **Reads prior context** — analysis, existing test cases, UI map, known failures, tech issues
- **Checks deployed target** — verifies accessibility and credentials
- Creates ordered test steps: direct changes → impact areas → regression → edge cases
- Each step classified as **confident** or **uncertain**, categorized by type
- **Test Notes** — concise plain-text summary with Testing Focus, Priority (P1/P2/P3), and Risk Areas (200 words max)
- **Identifies coverage gaps** — what test cases miss vs what was actually built

### Phase 3: Test Case Generation (`/noob-testcase`)

- Runs after planning — generates test cases from the plan, analysis, and codebase
- Deep codebase analysis: traces full call chains, understands UI/API/service/data layers
- Three types: **direct functional** → **impact regression** → **general regression**
- Two formats: **BDD** (Given/When/Then) and **Traditional** (Steps/Expected)
- **Test layers**: each test case tagged as `ui`, `api`, `ui_api`, `database`, `ai`, `unit`, or `other` — determines which runner can execute it
- Stored in DB with execution tracking, session claims, and priority ordering
- Reusable by `/noob-explore` for automated execution (`ui` and `ui_api` layers only)

### Phase 4: Test Execution (`/noob-explore` + `/noob-api-explore`)

Two runners share the same run pack, each claiming test cases for layers they can handle:

**`/noob-explore` — Browser automation (ui, ui_api layers)**

- Three modes: execute stored test cases (via run packs), follow a test plan, or free exploration
- **Run packs**: execution containers with target URL, credential refs, and configurable capture (screenshot, snapshot, video, HAR, console, trace). Per-entry results, artifacts, logs, observations — all visible in the Explore dashboard tab
- **Resume-first**: automatically resumes existing packs with pending/failed entries. Creates new pack only when nothing to resume (or user says "rerun"/"fresh")
- **UI Map learner**: reads page structure and navigation paths before execution. Writes discoveries back via `uimap scan` (stable selectors: role+text/placeholder/url). Every page load = snapshot + screenshot + scan
- **Failure recovery — UI map stale check**: when an action fails, first retries from a fresh snapshot (ignoring UI map). If fresh retry works → updates UI map, records `miss`. If still fails → standard recovery (wait, refresh, retry). If all fails → logs tech issue, blocks entry, ends session
- **Tech issue auto-resolution**: before each step, pulls ALL tech issues for that URL (including resolved — old issues can come back). After a successful step, auto-resolves matching unresolved/workaround tech issues. Matches by URL, action, and error description
- **Fresh browser every time** — no persistent cookies. Login happens every invocation using run pack `secret_target` credentials. Stops if no credentials
- Deep inspection: network, console, UI, accessibility, visual, functional, performance
- **One test case per invocation** — invoke repeatedly or use `/loop`. Parallel sessions each grab one case at a time via the claim system

**`/noob-api-explore` — API testing (api layer, all tests in one run)**

- **Runs ALL `api` layer test cases in a single invocation** — reads codebase once, authenticates once per role, loops through every test
- Uses `curl` + `jq` — no browser, no new tool dependencies
- Reads all test cases first, groups by required auth role from preconditions, authenticates once per role
- Translates BDD/traditional steps into HTTP requests using codebase knowledge (endpoint paths, request schemas, response shapes)
- Validates status codes, response bodies, headers, timing per step
- Per-test cleanup — tracks created resources and deletes in reverse order after each test case
- Uses unique timestamped test data to avoid collisions across runs
- Uses `runpack populate --layer api --runner api` to bulk-add all API tests to the pack
- Completes the run when done (unlike `/noob-explore` which stays open)

### Phase 5: Reporting (`/noob-report`)

- Generates PASS/FAIL/PARTIAL verdict
- Issues by severity and category
- Updates ticket, notifies Slack
- Can be run standalone on any run with data

---

## Codebase Intelligence

**BM25 Search** — full-text search with Porter stemming over all indexed files. Finds code by keyword relevance.

**Import Graph** — extracts import/require statements from JS/TS/Python/Go/Java/Ruby/PHP. When search finds a file, `--expand` traces everything it imports and everything that imports it.

```bash
noob-tester repos search "session validation" --expand
# Finds: src/middleware/session.ts
# Related: src/routes/checkout.ts, src/routes/profile.ts, src/auth/index.ts, ...
```

**Diff-Aware Indexing** — `repos index` uses `git diff` between the last indexed commit and current HEAD. Only added, modified, and deleted files are re-indexed. Everything else stays untouched. Falls back to full rebuild on force push or rebase. `repos discover` uses this automatically on subsequent runs.

**Branch Switching** — `repos sync --branch feature/X --reindex` checks out an MR source branch and diff-re-indexes. All skills do this automatically when they find linked MRs with source branches. The index always reflects the branch being tested.

**Staleness Detection** — `repos list` compares the stored indexed commit with the actual repo HEAD. Shows `[STALE]` if they differ so you know the index is outdated.

Skills use `noob-tester query codebase` + `noob-tester repos path` to combine indexed search with Claude Code's native Glob/Grep/Read for deep code understanding.

---

## Data Reuse Across Skills

All data is linked through the **ticket ref**. Any skill can look up data created by any other skill — no need to pass run IDs between sessions.

```bash
# /noob-analyze stores analysis → /noob-testcase reads it
noob-tester query analysis --ticket PROJ-123 --type impact

# /noob-testcase stores test cases with layers → runners pick them up
noob-tester testcase list --ticket PROJ-123
# /noob-explore claims ui/ui_api (one per invocation), /noob-api-explore runs all api tests in one shot

# /noob-explore + /noob-api-explore record issues → /noob-report reads them all
noob-tester query issues --ticket PROJ-123

# Full context dump — everything for a ticket
noob-tester query context --ticket PROJ-123
```

**Ticket context cache** — ticket info, MR diffs, comments, and linked tickets are cached after the first skill fetches them. Subsequent skills skip redundant Atlassian MCP and `glab` calls:

```bash
# Check if ticket info is already cached
noob-tester ticket-context get PROJ-123 --type ticket_info
# → {cached: true, content: {...}}  — skip MCP call

# Check MR diffs
noob-tester ticket-context get PROJ-123 --type mr_diff
# → returns all cached diffs  — skip glab calls
```

**Flow across separate sessions:**

1. `/noob-analyze` (Phase 1) on PROJ-123 → fetches ticket + saves to context cache → stores gap, requirements, feasibility, impact analysis
2. `/noob-plan` (Phase 2) on PROJ-123 → reads ticket + MR diffs from cache → reads analysis + impact data, creates test plan with blockers + coverage gaps
3. `/noob-testcase` (Phase 3) on PROJ-123 → reads ticket from cache (skip MCP) → reads the plan + analysis, generates test cases
4. `/noob-explore` + `/noob-api-explore` (Phase 4) on PROJ-123 → execute test cases from run packs, record issues, update UI/API maps
5. `/noob-report` (Phase 5) on PROJ-123 → reads everything (issues, test cases, run packs, analyses), generates report

## Reusing Prior Runs

```bash
# Skip analysis — reuse from a prior run
noob-tester run create --input-type text --input-ref "re-test" \
  --target-url https://app.com --reuse-run <priorRunId>

# Force fresh
noob-tester run create ... --fresh

# Get full context dump
noob-tester query context --ticket PROJ-123
```

## Collective Memory

- **Failure patterns** tracked across all runs — `noob-tester query failures`
- **Test cases** persist and are reusable — `noob-tester testcase list --ticket PROJ-123`
- **Run packs** store execution results, artifacts, and config — `noob-tester runpack list --ticket PROJ-123`
- **UI maps** grow with every explore session — pages, selectors, navigation paths, forms, reliability stats — `noob-tester uimap resolve --ticket PROJ-123`
- **Tech issues** knowledge base — workarounds, recovery attempts — `noob-tester tech-issue check --ticket PROJ-123`
- **Codebase index** persists — no need to re-index unless code changes

## Parallel Testing

```bash
# Multiple Claude Code sessions
claude "test login at https://app.com using PROJ-123" &
claude "test signup at https://app.com using PROJ-456" &

# Monitor everything
noob-tester watch
```

Sessions auto-register, claim different test cases, share the DB.

## Database

All data in `~/.noob-tester/noob-tester.db` (SQLite).

**Tables:** runs, sessions, action_log, analyses, test_plans, test_steps, issues, failure_patterns, raw_outputs, test_cases, run_pack_entries, run_artifacts, tech_issues, ui_maps, ui_map_pages, ui_map_elements, ui_map_navigations, ui_map_forms, targets, secrets, repos, repo_groups, repo_group_members, code_fts, import_graph

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [agent-browser](https://github.com/vercel-labs/agent-browser) — for UI automation
- [glab](https://gitlab.com/gitlab-org/cli) — for GitLab access (optional)
- Claude Code with Atlassian MCP — for ticket/Confluence (optional)
- [1Password CLI](https://developer.1password.com/docs/cli/) — for `secrets import-op` (optional)

## License

MIT
