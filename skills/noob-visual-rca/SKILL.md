---
name: noob-visual-rca
description: Visual root cause analysis — classify visual diff failures (visual_regression, intentional_change, env_issue, flaky_render, threshold_issue), file issues for real regressions. Run after a visual verification run completes.
---

# Visual Root Cause Analysis

Classify visual diff failures from a completed verification run. Run after `/noob-visual` or `/noob-visual-pool` verification runs.

## 1. Get Failed Comparisons

```bash
VISUAL_RUN_ID="<VISUAL_RUN_ID>"
TICKET_ID="<TICKET_ID>"

# Get the visual run details with entries and comparisons
RUN_DATA=$(noob-tester visual-run get "$VISUAL_RUN_ID" --entries --comparisons)

# Extract failed entries
FAILED_ENTRIES=$(echo "$RUN_DATA" | jq '[.entries[] | select(.status == "failed")]')
FAILED_COUNT=$(echo "$FAILED_ENTRIES" | jq 'length')

# Extract failed comparisons (passed == 0)
FAILED_COMPARISONS=$(echo "$RUN_DATA" | jq '[.comparisons[] | select(.passed == 0)]')

if [ "$FAILED_COUNT" -eq 0 ]; then
  echo "No visual failures in run $VISUAL_RUN_ID. Nothing to analyze."
  exit 0
fi

echo "$FAILED_COUNT failed visual test case(s) to analyze."
```

## 2. Classify Each Visual Failure

For each failed comparison, examine the **Baseline**, **Current**, and **Diff** images.

```bash
while IFS= read -r COMP; do
  TC_ID=$(echo "$COMP" | jq -r '.visual_tc_id')
  STEP_INDEX=$(echo "$COMP" | jq -r '.step_index')
  STEP_LABEL=$(echo "$COMP" | jq -r '.step_label')
  DIFF_SCORE=$(echo "$COMP" | jq -r '.diff_score')
  THRESHOLD=$(echo "$COMP" | jq -r '.threshold')
  BASELINE_PATH=$(echo "$COMP" | jq -r '.baseline_path // empty')
  CURRENT_PATH=$(echo "$COMP" | jq -r '.current_path // empty')
  DIFF_PATH=$(echo "$COMP" | jq -r '.diff_path // empty')

  # Get test case title
  TC_TITLE=$(noob-tester visual-tc get "$TC_ID" --json | jq -r '.title')

  echo "Analyzing: $TC_TITLE — step $STEP_INDEX ($STEP_LABEL)"
  echo "  Diff score: $DIFF_SCORE (threshold: $THRESHOLD)"
```

### Visual Classification Decision Tree

Examine the Baseline, Current, and Diff images side by side:

1. **Real visual change in the UI?** (layout shift, color change, missing element, broken styling) → `visual_regression`
2. **Change looks intentional?** (new feature, redesigned component, updated copy) → `intentional_change`
3. **Rendering artifact?** (anti-aliasing, sub-pixel shift, font rendering, animation frame) → `flaky_render`
4. **Environment difference?** (different viewport, missing fonts, slow load showing spinner, dark mode vs light) → `env_issue`
5. **Diff score barely above threshold?** (diff_score within 2x of threshold, mostly noise) → `threshold_issue`
6. **Can't determine?** → `unknown`

### Confidence

- **0.9-1.0** — obvious layout break or clear intentional redesign
- **0.7-0.8** — strong visual evidence of regression or env difference
- **0.5-0.6** — ambiguous change, could be flaky or real
- **0.3-0.4** — very subtle, hard to tell

### Suggested Action

- `fix_app` — actual visual regression, needs developer fix
- `update_baseline` — intentional change, baseline should be refreshed
- `adjust_threshold` — threshold too sensitive, increase it
- `retry` — transient rendering issue
- `fix_env` — environment causing false diff
- `investigate` — needs manual review

## 3. File Issue (if visual_regression)

**If classification is `visual_regression`, file a noob-tester issue with all visual artifacts:**

```bash
  if [ "$CLASSIFICATION" = "visual_regression" ]; then
    # Get a run ID (use visual run ID as context)
    RUN_ID=$(echo "$RUN_DATA" | jq -r '.session_id // .id')

    DESCRIPTION="Visual Regression RCA
Classification: visual_regression
Confidence: ${CONFIDENCE}

Root Cause: $CAUSE

Step: $STEP_LABEL (index: $STEP_INDEX)
Diff Score: $DIFF_SCORE (threshold: $THRESHOLD)
Test Case: $TC_TITLE

Baseline: $BASELINE_PATH
Current: $CURRENT_PATH
Diff: $DIFF_PATH"

    noob-tester log issue "$RUN_ID" \
      --category visual --severity high \
      --title "[Visual Regression] $TC_TITLE — $STEP_LABEL" \
      --description "$DESCRIPTION" \
      --location "$STEP_LABEL" \
      --screenshot "$DIFF_PATH"

    echo "  ✓ Issue filed for visual regression: $TC_TITLE"
  fi
```

## 4. Report Summary

After processing all failed comparisons, report:

```bash
done < <(echo "$FAILED_COMPARISONS" | jq -c '.[]')

echo ""
echo "Visual RCA Complete for run $VISUAL_RUN_ID"
echo "  Total failures analyzed: $FAILED_COUNT"
echo "  Classifications: visual_regression=$REGRESSION_COUNT, intentional=$INTENTIONAL_COUNT, flaky=$FLAKY_COUNT, env=$ENV_COUNT, threshold=$THRESHOLD_COUNT, unknown=$UNKNOWN_COUNT"
echo "  Issues filed: $ISSUES_FILED"
echo ""
echo "View results: http://localhost:4040 → Visual Runs → $VISUAL_RUN_ID"
```

## Notes

- **visual_regression** — the only classification that triggers issue filing. All others are informational.
- **Baseline vs Current** — always examine both images. A diff score alone can't tell you if the change is intentional or a bug.
- **Diff image** — highlights the exact pixel differences. Focus on these areas when classifying.
- **threshold_issue** — if many comparisons fail with scores barely above threshold, suggest increasing the test case's `default_threshold`.
- **intentional_change** — suggest running a new baseline capture (`/noob-visual-pool` with `--mode baseline`) to update references.
- **Category is `visual`** — issues filed use `--category visual` to distinguish from functional issues on the Issues page.
- **No RCA table** — unlike `noob-rca` which stores results in an `rca_results` table linked to run packs, visual RCA results are communicated through filed issues and the summary report. If persistent storage is needed later, a `visual_rca_results` table can be added.

