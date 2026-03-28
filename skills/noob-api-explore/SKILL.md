---
name: noob-api-explore
description: Execute ALL api-layer test cases in one invocation using curl/jq. Reads codebase once, authenticates per role, loops through every API test, validates responses, cleans up.
---

# API Test Execution

Execute ALL `api` layer test cases in one invocation. Reads codebase once, authenticates once, loops through every test.

## 1. Deep Codebase Analysis + API Map (ONCE)

Read ALL impacted endpoints before the test loop:

```bash
noob-tester query codebase "router" --expand
noob-tester query codebase "controller" --expand
# Read: route definitions, request schemas, response schemas, auth mechanisms, DB models, cleanup endpoints
# Use Glob/Grep/Read on $REPO_PATH for direct file reading
```

### Build API Map

Register discovered endpoints so health is tracked across runs:

```bash
# Resolve or create an API map for this app
APIMAP_ID=$(noob-tester apimap resolve "<app-name>" --base-url "$BASE_URL" --tickets "<TICKET-ID>" | jq -r '.id')

# For each endpoint found in codebase analysis:
EP_ID=$(noob-tester apimap endpoint $APIMAP_ID \
  --method <METHOD> --path "<path>" --summary "<brief>" \
  --auth-type <none|bearer|api_key|session> --run $RUN_ID --ticket <TICKET-ID> | jq -r '.endpointId')

# Register params:
noob-tester apimap param $EP_ID --map $APIMAP_ID --name "<param>" --in <path|query|body|header> --type <string|number> --required

# Register expected responses:
noob-tester apimap response $EP_ID --map $APIMAP_ID --status 200 --description "Success"
noob-tester apimap response $EP_ID --map $APIMAP_ID --status 400 --description "Validation error"

# Register CRUD chains (e.g. POST creates → GET reads):
noob-tester apimap chain $APIMAP_ID --from $POST_EP_ID --to $GET_EP_ID --type creates
```

## 2. Initialize

```bash
INIT=$(noob-tester init --ticket <TICKET-ID> --target-url "<base-url>" --task "API Testing: <TICKET-ID>" --labels "api-explore" --secret-target <target-name> --secret-role <role>)
SESSION_ID=$(echo "$INIT" | jq -r '.sessionId')
RUN_ID=$(echo "$INIT" | jq -r '.runId')
RUNPACK_ID=$(echo "$INIT" | jq -r '.runPackId')
```

## 3. Populate Run Pack + Authenticate

```bash
# Add all API test cases at once
noob-tester runpack populate $RUNPACK_ID <TICKET-ID> --status pending --layer api --runner api

# Resolve credentials — auto-selects target if --secret-target was set in init
CREDS=$(noob-tester auth-resolve --pack $RUNPACK_ID)
BASE_URL=$(noob-tester runpack meta $RUNPACK_ID | jq -r '.target_url')
EMAIL=$(echo "$CREDS" | jq -r '.email')
PASSWORD=$(echo "$CREDS" | jq -r '.password')
API_TOKEN=$(echo "$CREDS" | jq -r '.apiToken // empty')

# If no --secret-target was provided, match URL against stored targets:
# noob-tester secrets target list --json → find target whose URL matches BASE_URL
# Then: noob-tester auth-resolve --target <matched-target> --role admin

# Login if no static token
if [ -z "$API_TOKEN" ] && [ -n "$EMAIL" ]; then
  LOGIN=$(noob-tester api-request --method POST --url "$BASE_URL/api/auth/login" \
    --body "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" --run $RUN_ID --action 0)
  API_TOKEN=$(echo "$LOGIN" | jq -r '.body' | jq -r '.token // .access_token // empty')
fi
```

If auth fails → block all entries, log tech issue, exit.

## 4. Execute Loop

For each test case entry:

```bash
# Look up the endpoint ID from the API map (registered in step 2)
EP_ID=$(noob-tester apimap lookup $APIMAP_ID --method <METHOD> --path "<path>" | jq -r '.id // empty')

# api-request handles: execute + validate + store artifact + log + apimap health tracking
RESULT=$(noob-tester api-request \
  --method <METHOD> --url "$BASE_URL<path>" \
  --body '<json>' --auth "$API_TOKEN" --expect <code> \
  --run $RUN_ID --pack $RUNPACK_ID --entry $ENTRY_ID --action $ACTION_N \
  --ticket <TICKET-ID> --session $SESSION_ID \
  ${EP_ID:+--apimap-endpoint $EP_ID})

STATUS=$(echo "$RESULT" | jq -r '.status')
PASSED=$(echo "$RESULT" | jq -r '.passed')
TIMING=$(echo "$RESULT" | jq -r '.timing')
```

### Validate Each Response

| Check | Log as |
|-------|--------|
| Wrong status code | `log issue --category functional --severity high` |
| Missing response fields | `log issue --category functional --severity high` |
| Slow (>3s) | `log issue --category performance --severity medium` |
| Auth failure (401/403) | `log issue --category functional --severity critical` + `tech-issue log` |
| Server error (5xx) | `log issue --category functional --severity critical` + `tech-issue log` |

### Track Created Resources + Per-Test Cleanup

```bash
CREATED_ID=$(echo "$RESULT" | jq -r '.body' | jq -r '.id')
CLEANUP_STACK+=("DELETE /api/<resource>/$CREATED_ID")
# After test: delete in reverse order
```

## 5. Handle Failures — Trace Root Cause in Code

When an API test fails (wrong status, missing fields, 5xx):

```bash
# Read the MR diff to find the relevant changed file
noob-tester ticket-context get <TICKET-ID> --type mr_diff:!<mr-id>

# Search the codebase for the failing endpoint
noob-tester query codebase "<endpoint path or handler name>" --expand

# Read the specific file — find WHY it fails
# e.g. "The createUser handler at line 23 doesn't validate email uniqueness — that's why POST /api/users returns 500 on duplicate"
```

Include root cause in the result:
```bash
noob-tester runpack result $ENTRY_ID --status failed \
  --results '{"runner":"api","error":"500 on POST /api/users","root_cause":"src/handlers/users.ts:23 — missing unique constraint check"}' \
  --issues '[{"severity":"critical","title":"Server error on duplicate user","description":"Root cause: createUser handler missing email uniqueness validation at src/handlers/users.ts:23"}]'
```

For passing tests:
```bash
noob-tester runpack result $ENTRY_ID --status passed --results '{"runner":"api","summary":"All steps passed"}'
```

## 6. Complete

```bash
noob-tester log action $RUN_ID --phase 4 --agent api-explorer \
  --description "API testing: $TOTAL tests, $PASSED passed, $FAILED failed"
noob-tester finish --run $RUN_ID --session $SESSION_ID \
  --summary "API: $PASSED/$TOTAL passed, $FAILED failed"
```

**IMPORTANT: Include the session ID in your final message to the user** (needed for metrics hook):
> Done. Session: $SESSION_ID

## Key Differences from /noob-explore

- **noob-explore**: one UI test per invocation (browser, screenshots, UI map)
- **noob-api-explore**: ALL API tests in one invocation (curl, lightweight)
- `ui_api` layer belongs to noob-explore (needs browser)
- Both share the same run pack
- Both trace root cause in code on failure
