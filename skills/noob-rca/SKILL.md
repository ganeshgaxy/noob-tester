---
name: noob-rca
description: Root cause analysis — classify failures (env/flaky/bug/data/network), update patterns, suggest actions. Run after test execution.
---

# Root Cause Analysis

Classify failures from a completed run pack. Run after `/noob-explore` or `/noob-api-explore`.

## 1. Get Failed Entries

```bash
noob-tester runpack list --pack <PACK_ID> --json | jq '.[] | select(.tc_title != null and (.status == "failed" or .status == "blocked"))'
```

If zero failures → report and stop.

## 2. Clear Previous RCA

```bash
noob-tester rca clear --pack <PACK_ID>
```

## 3. Classify Each Failure

For each failed entry:

1. **Read artifacts** — `noob-tester capture list --entry <ENTRY_ID> --json` → read screenshots, console, HAR
2. **Check patterns** — `noob-tester query patterns --json`
3. **Check tech issues** — `noob-tester tech-issue check --ticket <TICKET_REF>`

### Classification Decision Tree

1. Connection refused, DNS, CORS, 502/503? → `network`
2. 401/403, login failed, session expired? → `auth_issue`
3. Timeout, waitForSelector? → `timeout`
4. Service down, wrong URL, missing config? → `env_issue`
5. "not found", stale ID, expired token? → `test_data_issue`
6. Element in snapshot but selector didn't match? → `flaky_selector`
7. Wrong value, unexpected error, logic bug? → `actual_bug`
8. Can't determine? → `unknown`

### Confidence

- **0.9-1.0** — clear evidence, obvious cause
- **0.7-0.8** — strong evidence
- **0.5-0.6** — reasonable guess
- **0.3-0.4** — weak evidence

### Suggested Action

- `retry` — transient issue
- `fix_test` — test is wrong
- `fix_app` — actual bug
- `fix_env` — environment issue
- `investigate` — needs manual review
- `skip` — known issue

## 4. Save Result

```bash
noob-tester rca save --pack <PACK_ID> --entry <ENTRY_ID> --testcase <TC_ID> \
  --classification <type> --confidence <0.0-1.0> \
  --cause "Why it failed" --evidence "What was examined" --action <action>
```

## 5. Summary

```bash
noob-tester rca summary --pack <PACK_ID>
noob-tester log action $RUN_ID --phase 4 --agent rca \
  --description "RCA: N failures — X actual bugs, Y env, Z flaky"
```

## Tips

- API failures → look at HTTP status + response body
- UI failures → need screenshot + snapshot + console together
- Multiple failures with same root cause → classify first as real, rest as cascading (`env_issue`)
