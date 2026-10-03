---
name: vue-doctor
description: Diagnose and fix performance, security, architecture, and correctness issues in Vue.js and Nuxt applications using Vue Doctor
---

# Vue Doctor — AI Agent Playbook

Vue Doctor is the diagnostic engine and linter for Vue.js and Nuxt applications. It combines static AST analysis (oxlint), template validation (eslint-plugin-vue), project structure checks, and dead code detection (Knip) to calculate a 0–100 health score with actionable recommendations.

## When to Run

- **After editing code:** Whenever you create or modify `.vue`, `.ts`, `.js`, or Nuxt `server/` files.
- **Before committing:** To ensure changes do not introduce new security vulnerabilities or regressions.
- **During code reviews & audits:** When asked to review a Vue codebase, audit dependencies, or improve performance.

---

## The Scan → Fix → Verify Loop

When assisting on a Vue or Nuxt repository, follow this structured loop:

### 1. Run the Diagnostic Scan

For focused changes (in a git branch or PR), scan only modified files:

```bash
npx @remylagerweij/vue-doctor@latest . --scope changed --format json
```

For full repository audits:

```bash
npx @remylagerweij/vue-doctor@latest . --format json
```

### 2. Parse the Findings

In the JSON output:
- Read `projects[0].findings`.
- Each finding contains:
  - `ruleId`: Canonical rule name (e.g. `vue-doctor/security/no-unsafe-html-sink`).
  - `severity`: `"error"` or `"warning"`.
  - `file`, `line`, `column`: Source code location.
  - `message` and `help`: Description of the problem and how to resolve it.
  - `codeFrame`: Contextual code snippet.
  - `docsUrl`: Direct documentation URL.

### 3. Prioritize Fixes

Resolve findings in priority order:
1. **Errors & Security Findings:** Fix security risks (XSS, prototype pollution, secret exposure, SSRF) and correctness errors first.
2. **Deterministic Fixes:** Run `npx @remylagerweij/vue-doctor@latest . --fix` to automatically repair fixable rules (e.g., lodash imports, `v-for` keys, `toSorted`).
3. **Performance & Reactivity:** Resolve reactive loss, heavy dependencies, and unneeded watchers.
4. **Architecture & Dead Code:** Remove unused exports or files reported by Knip.

### 4. Consult Rule Guidance

If unsure how to fix a specific rule, inspect its offline documentation and agent guidance:

```bash
npx @remylagerweij/vue-doctor@latest explain <ruleId>
```

Example:
```bash
npx @remylagerweij/vue-doctor@latest explain vue-doctor/security/no-unsafe-html-sink
```

### 5. Re-scan and Verify

Re-run the scan to ensure the finding is resolved and no new issues were introduced:

```bash
npx @remylagerweij/vue-doctor@latest . --scope changed --format json
```

Verify that `summary.errors === 0` and the targeted finding no longer appears.

---

## Fix Discipline & Rules of Engagement

- **Do Not Mask Issues:** Never suppress a rule with `<!-- vue-doctor-disable -->` or `// vue-doctor-disable-next-line` without an explicit, well-reasoned inline justification comment.
- **Preserve Behavior:** Ensure bug fixes and refactorings maintain existing functionality and pass project tests.
- **Security Guardrails:** When resolving security findings (such as `no-unsafe-html-sink`), always sanitize with DOMPurify or bind text nodes (`v-text` / `{{ }}`), never disable the rule.

---

## Exit Codes & Diagnostics

Vue Doctor uses strict exit codes:

| Code | Name | Meaning |
|---|---|---|
| `0` | **OK** | Scan succeeded and no gate was breached. |
| `1` | **Gate Breached** | Findings exceeded `--fail-on` (default: `error`) or score was below `--min-score`. |
| `2` | **Usage Error** | Invalid CLI arguments, configuration syntax error, or non-Vue project. |
| `3` | **Analyzer Failure** | An analyzer was skipped or failed while running with `--strict`. |

### Skipped Analyzers

If `projects[0].skipped` is non-empty, an analyzer (e.g. Knip, ESLint, or OSV audit) could not execute. Review the `reason` provided in the JSON report.

---

## Configuration Reference

Vue Doctor is configured via `vue-doctor.config.ts` using `defineConfig`:

```typescript
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  // CI Gate configuration
  gate: {
    failOn: "error", // "none" | "error" | "warning"
    scope: "new",    // "new" (only new findings fail gate) | "all"
    minScore: 80,    // Optional score threshold
  },

  // Analyzers toggles
  lint: true,
  deadCode: true,

  // Rule severity overrides
  rules: {
    "vue-doctor/security/no-unsafe-html-sink": "error",
    "vue-doctor/bundle-size/no-moment": "warn",
    "vue-doctor/architecture/no-giant-component": "off",
  },

  // Paths to exclude
  ignore: {
    paths: ["legacy/**", "dist/**", "coverage/**"],
  },
});
```

---

## Essential CLI Commands

- `vue-doctor .`: Scan current directory and print interactive breakdown.
- `vue-doctor . --format json`: Output machine-readable `report@2` JSON.
- `vue-doctor . --score`: Output only the numeric health score (0–100).
- `vue-doctor rules`: List all registered rules with severities and categories.
- `vue-doctor explain <ruleId>`: View full explanation and remediation guidance for a rule.
- `vue-doctor . --fix [--dry-run]`: Automatically apply deterministic codemods.
- `vue-doctor ci install`: Install GitHub Actions CI workflow into `.github/workflows/vue-doctor.yml`.
- `vue-doctor mcp`: Launch stdio Model Context Protocol (MCP) server.
