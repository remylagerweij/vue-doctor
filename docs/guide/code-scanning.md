# GitHub code scanning (SARIF)

`--format sarif` writes a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) log that GitHub shows in the **Security > Code scanning** tab and as annotations on pull requests.

```bash
vue-doctor --format sarif --output vue-doctor.sarif
```

## Workflow

```yaml
name: Vue Doctor
on:
  push:
    branches: [main]
  pull_request:

jobs:
  vue-doctor:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # upload SARIF
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx vue-doctor@latest --format sarif --output vue-doctor.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: ${{ !cancelled() }}
        with:
          sarif_file: vue-doctor.sarif
```

Result paths are relative to the git repository root (or, outside a git repository, the working directory), which is what GitHub resolves them against, so you can scan a subdirectory such as `vue-doctor apps/web --format sarif` from anywhere in the checkout. Add `--fail-on error` if the job should also fail the build; the upload step still runs because of `!cancelled()`.

## What is in the file

- **Runs.** One `run` per scanned project. GitHub only accepts several runs of the same tool when each has a distinct `automationDetails.id`, so a run is identified by `vue-doctor/<project directory>/` (`vue-doctor/` for a single project in the repository root). Alerts from different projects therefore never overwrite each other.
- **Rules.** `tool.driver.rules` lists the rules that have results in the run, with description, `helpUri` (the rule's documentation page), `defaultConfiguration.level`, tags (the category, `security` and `external/cwe/cwe-<n>` for security rules) and `properties.precision` (the rule's confidence).
- **Results.** `level` is `error` for errors, `warning` for warnings and `note` for low-confidence warnings. Locations are POSIX paths with `uriBaseId: "%SRCROOT%"`; findings that concern a whole file have no `region`.
- **Fingerprints.** `partialFingerprints["vueDoctor/v1"]` is the same fingerprint [baselines](/guide/configuration) use, so alerts stay the same when code moves within a file. With a baseline, `baselineState` is `new` or `unchanged`.
- **No source text.** Code frames are never written, so a secret in your code does not end up in the file. Messages name the variable, not its value.
- **Inline-suppressed findings** (`vue-doctor-disable-next-line`) are not part of the report, so the file has no `suppressions`.
- **Skipped analyzers** appear as `invocations[].toolExecutionNotifications`.

### Severity in the Security tab

Security rules carry `properties["security-severity"]`, the number GitHub uses to label alerts Critical, High, Medium or Low. It is derived from the rule's default severity and its confidence:

| Rule severity | high confidence | medium | low |
|---|---|---|---|
| `error` | 8.0 (High) | 7.0 (High) | 5.0 (Medium) |
| `warning` | 6.0 (Medium) | 5.0 (Medium) | 3.0 (Low) |

Other rules have no `security-severity`; GitHub shows them by `level`.

## GitHub limits

GitHub rejects runs with more than 25,000 results and uploads larger than 10 MB gzipped. Vue Doctor keeps the first 25,000 results of a run (all errors first, then warnings, each in file/line order), halves the budget if the compressed file is still too large, prints a warning on stderr and records the omitted count in the run's `properties.omittedResults`.
