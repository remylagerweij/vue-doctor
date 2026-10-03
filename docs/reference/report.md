# Report format

`vue-doctor --format json` prints one JSON document in the versioned `vue-doctor/report@2` format; `--format jsonl` prints the same data as one JSON object per line. Both are meant for CI, AI agents and integrations. The format is described by a [JSON Schema](/schema/report.schema.json), also shipped as `@remylagerweij/vue-doctor/report-schema.json`.

```bash
vue-doctor --format json --output vue-doctor.json
vue-doctor --format jsonl --no-timestamp > findings.jsonl
```

- `--json` is an alias of `--format json`.
- `--output <file>` writes the report to a file (parent directories are created) instead of stdout. Status output stays on stderr either way.
- `--no-timestamp` omits `generatedAt` and the per-project `timings`, the only fields that differ between runs. Two runs over the same code then produce byte-identical output.

Within `report@2` the format only gains optional fields; consumers must ignore fields they do not know. Breaking changes bump the format name.

## JSON document

```jsonc
{
  "$schema": "https://remylagerweij.github.io/vue-doctor/schema/report.schema.json",
  "format": "vue-doctor/report@2",
  "scoreVersion": 2,
  "tool": { "name": "vue-doctor", "version": "2.0.0" },
  "generatedAt": "2026-10-03T09:00:00.000Z",
  "summary": { "projects": 1, "errors": 2, "warnings": 9 },
  "projects": [{
    "name": "my-app",
    "root": ".",
    "framework": "nuxt",
    "vueVersion": "^3.5.0",
    "typescript": true,
    "sourceFiles": 120,
    "scope": { "mode": "full" },
    "score": {
      "value": 50, "label": "Needs work", "rawScore": 84,
      "cap": { "value": 50, "reason": "security-error", "ruleId": "vue-doctor/security/no-eval" },
      "categories": [{ "category": "Security", "score": 99, "label": "Great", "errors": 1, "warnings": 0 }],
      "impact": [{ "ruleId": "vue-doctor/security/no-eval", "gain": 34 }]
    },
    "categories": { "Security": { "errors": 1, "warnings": 0 } },
    "summary": { "errors": 2, "warnings": 9, "suppressed": 4 },
    "findings": [{
      "ruleId": "vue-doctor/security/no-hardcoded-secret",
      "category": "Security",
      "severity": "error",
      "confidence": "high",
      "cwe": ["CWE-798"],
      "file": "src/components/Post.vue",
      "line": 12,
      "column": 5,
      "message": "…",
      "help": "…",
      "docsUrl": "https://remylagerweij.github.io/vue-doctor/rules/security/no-hardcoded-secret",
      "fingerprint": "7d074462e616dbcd",
      "status": "new",
      "fixable": false,
      "agentPrompt": "You are fixing a Vue Doctor finding …"
    }],
    "ruleGroups": [{ "ruleId": "vue-doctor/security/no-unsafe-html-sink", "count": 4, "agentPrompt": "You are fixing Vue Doctor findings …" }],
    "skipped": [{ "tool": "knip", "reason": "…" }],
    "timings": { "lint": 900, "template": 700, "dead-code": 1800, "project": 15, "total": 1900 },
    "suppressed": { "count": 4, "byRule": { "vue-doctor/security/no-unsafe-html-sink": 4 } },
    "baseline": { "path": ".vue-doctor-baseline.json", "matched": 3, "new": 8, "fixed": 1 },
    "offline": false
  }]
}
```

The shape is always `projects[]`, also for a single project. Projects are ordered by name; findings by file, line, column and rule ID. All paths use forward slashes: `file` is relative to the project, `root` relative to the scanned directory (the directory argument; `.` for the project at that directory).

### Findings

| Field | Description |
|-------|-------------|
| `ruleId` | `vue-doctor/<category>/<rule>` for Vue Doctor rules, `vue/<rule>` for template rules, `knip/<issue>` for dead code |
| `category`, `severity`, `confidence` | Rule category, `error` or `warning`, and how likely a true positive it is (`high`, `medium`, `low`) |
| `cwe`, `owasp` | Security classification, when the rule has one |
| `file`, `line`, `column` | Location. `line` and `column` are 1-based; `0` means the finding concerns the whole file. `endLine` and `endColumn` appear when the analyzer reports a range |
| `message`, `help`, `docsUrl` | What is wrong, how to fix it, and the rule's documentation page |
| `codeFrame` | Up to five numbered source lines around the finding; the finding's line is prefixed with `>`. Read from disk, never modified. Omitted when the file cannot be read |
| `fingerprint`, `status` | Stable ID, and `new`, `existing` or `baseline` when a baseline or base branch applies |
| `fixable`, `suggestion` | Whether the rule has an automatic fix, and an optional text suggestion |
| `agentPrompt` | A plain-text, self-contained prompt for an AI coding agent: rule, location, problem, the rule's `agentGuidance`, constraints and a verify command. Values that look like credentials are masked, and findings of secret rules never include a code frame |

`ruleGroups` lists every rule with at least two findings (most findings first), each with its `count` and one `agentPrompt` that covers all of them: locations sorted by file and line, at most 10 listed, then "and N more". The JSONL summary line omits it.

`score` holds the overall score after caps (`value`, what `--min-score` compares), `rawScore` before the caps, the `cap` that applied, per-category `categories` and the per-rule `impact` hints; `scoreVersion` identifies the formula. See [Scoring](/guide/scoring).

`skipped` lists analyzers that did not run (`oxlint`, `eslint`, `knip`, and `vue-doctor` for the project checks); the score is incomplete when it is not empty. `baseline` is present only when a baseline was applied, and `scope.mode` is `changed` for `--diff` runs.

## JSONL

Each line is a self-contained JSON object. Every finding is one line with `"type": "finding"` that carries the finding fields above plus `project` (the project name). The last line is always the summary:

```jsonl
{"type":"finding","project":"my-app","ruleId":"vue-doctor/bundle-size/no-moment","category":"Bundle Size","severity":"warning","file":"src/a.vue","line":3,"column":1,"…":"…"}
{"type":"summary","format":"vue-doctor/report@2","tool":{"name":"vue-doctor","version":"2.0.0"},"summary":{"projects":1,"errors":0,"warnings":1},"projects":[{"name":"my-app","score":{"value":96,"label":"Great"},"…":"…"}]}
```

The summary has the same fields as the JSON document, with the projects' `findings` left out. A run without findings produces just the summary line.

## Migrating from 1.x

`--json` previously printed a flat object (`score`, `diagnostics`, …), or `{ "projects": [...] }` for several workspace projects. It now always prints the document above:

| 1.x | 2.0 |
|-----|-----|
| `score`, `label` | `projects[].score.value`, `projects[].score.label` |
| `diagnostics[]` | `projects[].findings[]` |
| `diagnostics[].rule` | `findings[].ruleId` (now namespaced: `vue-doctor/<category>/<rule>`) |
| `diagnostics[].file` | `findings[].file` (POSIX, project-relative) |
| `categories` | `projects[].categories` |
| `skippedChecks` | `projects[].skipped` |
| `timings`, `elapsed` | `projects[].timings` (`total` in milliseconds) |
| `timestamp` | `generatedAt` |
