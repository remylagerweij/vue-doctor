# Continuous Integration & PR Feedback

Vue Doctor integrates natively into CI workflows to prevent regressions, evaluate quality gates, and post actionable PR feedback.

## Quick Setup

Generate a complete GitHub Actions workflow with one command:

```bash
npx @remylagerweij/vue-doctor@latest ci install
```

This creates `.github/workflows/vue-doctor.yml` configured with optimal defaults and permissions.

---

## Complete GitHub Actions Workflow

Here is a full, production-ready workflow using the `@v2` composite action:

```yaml
name: Vue Doctor

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  checks: write
  statuses: write

concurrency:
  group: vue-doctor-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  vue-doctor:
    name: Vue Doctor
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4
        with:
          fetch-depth: 0 # Needed for PR diff and base branch score comparison

      - name: Run Vue Doctor
        uses: remylagerweij/vue-doctor@v2
        with:
          fail-on: error
          gate: new
          feedback: summary,findings
          grouping: rule-per-file
          agent-prompt: true
```

---

## PR Feedback Modes

Vue Doctor supports multiple feedback modes configured via the `feedback` input:

| Mode | Behavior |
|---|---|
| `summary` | A **sticky PR comment** updated in place on every commit. Displays health score, score delta against base, error/warning counts, and an AI fix prompt. Each scanned directory keeps its own comment (`<!-- vue-doctor:summary:apps/web -->`; a scan of the repository root uses `<!-- vue-doctor:summary -->`), so a matrix job per monorepo project shows every project. |
| `findings` | Inline PR review comments anchored to modified code lines. Each comment includes description, remediation guidance, and an AI prompt block. A scan only updates or removes the comments of its own directory, so parallel scans of one PR leave each other's comments alone. |
| `annotations` | Workflow check annotations (`::error` and `::warning`) displayed directly in the GitHub diff view without requiring PR write permissions. |
| `none` | Disables PR comments and outputs results only to the GitHub Step Summary and console. |

Example:
```yaml
with:
  feedback: summary,findings,annotations
```

### Review Comment Grouping

When using `findings`, control comment volume with the `grouping` option:
- `rule-per-file` (default): Groups multiple occurrences of the same rule within a file into a single comment.
- `finding`: One comment per individual finding.
- `rule`: Groups all occurrences of a rule across the entire PR into one comment.

---

## Quality Gates & Thresholds

Configure exit conditions to block pull requests that introduce violations:

```yaml
with:
  fail-on: error    # Fails if any error-severity finding exists
  gate: new         # Only evaluate new findings vs. the base branch
  min-score: 85     # Fails if the overall health score drops below 85
  strict: true      # Exits with code 3 if any analyzer fails or is skipped
```

---

## Base Branch Score Comparison (Score Delta)

When `fetch-depth: 0` is set in `actions/checkout`, Vue Doctor compares the PR's health score against the base branch (`main`).
The sticky comment displays the score delta (e.g., `85 (+5)` or `78 (-4)`) along with counts of newly introduced and resolved issues.
