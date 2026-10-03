# Secure Fork Pull Requests

Public repositories frequently receive pull requests from community forks. For security reasons, GitHub runs fork PRs with read-only tokens and restricts access to repository secrets.

---

## 1. Security Architecture & Threat Model

> [!WARNING]
> Never use `pull_request_target` to check out and scan code from a fork PR.
> Scanners execute project configurations (such as ESLint flat configs or build tools). Checking out untrusted PR code in a privileged context creates a critical remote code execution vulnerability (CWE-829).

Vue Doctor protects your repository by:
1. **Refusing to run under `pull_request_target`** without the explicit override `--allow-pull-request-target`.
2. Utilizing a safe **two-stage workflow pattern** using GitHub's `workflow_run` event to post comments without checking out fork code.

---

## 2. Generating the Fork Workflows

Generate both workflows automatically:

```bash
npx @remylagerweij/vue-doctor@latest ci install --fork-comments
```

This generates:
- `.github/workflows/vue-doctor.yml` (scans PR code with read-only permissions and uploads the report artifact)
- `.github/workflows/vue-doctor-comment.yml` (runs in default branch context to post PR review comments safely)

---

## 3. Workflow Configurations

### Stage 1: `.github/workflows/vue-doctor.yml` (Untrusted Context)

Runs on the fork pull request with read-only permissions. Annotations and Step Summary work without write tokens:

```yaml
name: Vue Doctor

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read

jobs:
  scan:
    name: Scan
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4
        with:
          fetch-depth: 0

      - name: Run Vue Doctor
        uses: remylagerweij/vue-doctor@v2
        with:
          fail-on: error
          gate: new
          feedback: annotations
          report: true

      - name: Upload report for comment workflow
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: vue-doctor-report
          path: vue-doctor.json
```

### Stage 2: `.github/workflows/vue-doctor-comment.yml` (Privileged Context)

Triggers after Stage 1 finishes. Runs with write permissions on the base branch **without checking out any fork code**:

```yaml
name: Vue Doctor Fork Comments

on:
  workflow_run:
    workflows: ["Vue Doctor"]
    types: [completed]

permissions:
  pull-requests: write

jobs:
  comment:
    name: Post PR Comments
    runs-on: ubuntu-latest
    if: github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.conclusion != 'cancelled'
    steps:
      - name: Download scan results artifact
        uses: actions/download-artifact@cc203385981b70ca67e1cc392babf9cc229d5806 # v4
        with:
          name: vue-doctor-report
          run-id: \${{ github.event.workflow_run.id }}
          github-token: \${{ secrets.GITHUB_TOKEN }}

      - name: Post feedback
        uses: remylagerweij/vue-doctor@v2
        with:
          feedback-only: true
          report-json: vue-doctor.json
          github-token: \${{ secrets.GITHUB_TOKEN }}
```
