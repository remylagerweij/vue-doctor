# Migrating from v1 to v2

Vue Doctor 2.0 is a major release featuring a high-performance rewrite, 104 registered rules, first-class AI agent integration, Model Context Protocol (MCP) support, and a redesigned GitHub Actions workflow.

This guide details all breaking changes and provides step-by-step instructions to upgrade your projects and CI pipelines from v1 to v2.

---

## Overview of Breaking Changes

| Area | Version 1.x | Version 2.0 |
|---|---|---|
| **Node.js Support** | Node 18, 20 | **Node `^22.12.0 || >=24.0.0`** |
| **Rule Identifiers** | Flat IDs (`no-v-html`, `big-v-for`) | **Namespaced canonical IDs** (`vue-doctor/<category>/<rule-id>`) |
| **Configuration** | `.vuedoctorrc.json` / JSON files | **Type-safe `vue-doctor.config.ts`** with `defineConfig` |
| **CLI Exit Codes** | Non-deterministic 0 / 1 | **Deterministic contracts**: `0` (pass), `1` (gate failed), `2` (CLI error), `3` (config error) |
| **Output Schema** | Ad-hoc JSON | **Standardized `report@2`** schema with rule groups and score breakdowns |
| **GitHub Action** | `uses: remylagerweij/vue-doctor@v1` (dual scan) | **`uses: remylagerweij/vue-doctor@v2`** (composite, single scan, PR review comments) |
| **Suppressions** | Diverse comment formats | **`vue-doctor-disable-next-line <id>`** and **`/* vue-doctor-disable <id> */`** |

---

## 1. Node.js Engine Requirement

Vue Doctor 2.0 requires modern Node.js versions supporting ESM natively, modern globbing, and performance enhancements:

- **Supported Node versions:** `^22.12.0 || >=24.0.0`
- **Deprecated / Unsupported:** Node 18, Node 20

If running in CI, ensure your workflow sets up Node 22 or Node 24:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 24
```

*(Note: The `remylagerweij/vue-doctor@v2` GitHub Action handles Node 24 automatically.)*

---

## 2. Canonical Rule IDs & Aliases

In v1, rules used flat, unnamespaced names (e.g. `no-v-html`, `no-eval`, `big-v-for`). In 2.0, all rules belong to a distinct category namespace:

- **Own AST / FS rules:** `vue-doctor/<category>/<rule-name>`
- **ESLint Vue template rules:** `vue/<rule-name>`
- **Dead code analysis:** `knip/<type>`

### Backwards Compatibility

Vue Doctor 2.0 maintains an alias registry. If your config or inline comments use legacy 1.x names, Vue Doctor resolves them automatically with a deprecation warning.

### Rule Rename & Alias Table

| Legacy 1.x ID | Version 2.0 Canonical ID | Notes |
|---|---|---|
| `no-v-html` | `vue-doctor/security/no-unsafe-html-sink` | Covers templates & scripts; skips sanitized HTML |
| `vue/no-v-html` | `vue-doctor/security/no-unsafe-html-sink` | Merged into unified security sink rule |
| `no-secrets-in-client-code` | `vue-doctor/security/no-hardcoded-secret`<br>`vue-doctor/security/no-secret-named-literal` | Split into critical secrets (error) and suspicious literals (warn) |
| `no-eval` | `vue-doctor/security/no-eval` | Namespaced under `security` |
| `no-dangerous-regex` | `vue-doctor/security/no-dangerous-regex` | Namespaced under `security` |
| `no-secret-in-public-env` | `vue-doctor/security/no-secret-in-public-env` | Namespaced under `security` |
| `no-cascading-mutations` | `vue-doctor/reactivity/no-cascading-mutations` | Namespaced under `reactivity` |
| `no-fetch-in-watch` | `vue-doctor/reactivity/no-fetch-in-watch` | Namespaced under `reactivity` |
| `no-mutation-in-computed` | `vue-doctor/reactivity/no-mutation-in-computed` | Namespaced under `reactivity` |
| `no-reactive-destructure` | `vue-doctor/reactivity/no-reactive-destructure` | Namespaced under `reactivity` |
| `no-reactive-replace` | `vue-doctor/reactivity/no-reactive-replace` | Namespaced under `reactivity` |
| `no-ref-from-prop` | `vue-doctor/reactivity/no-ref-from-prop` | Namespaced under `reactivity` |
| `no-deep-watch` | `vue-doctor/performance/no-deep-watch` | Namespaced under `performance` |
| `virtual-scrolling` | `vue-doctor/performance/virtual-scrolling` | Namespaced under `performance` |
| `no-giant-component` | `vue-doctor/architecture/no-giant-component` | Namespaced under `architecture` |
| `no-heavy-deps` | `vue-doctor/bundle-size/no-heavy-deps` | Namespaced under `bundle-size` |
| `no-moment` | `vue-doctor/bundle-size/no-moment` | Namespaced under `bundle-size` |
| `no-barrel-imports` | `vue-doctor/bundle-size/no-barrel-imports` | Namespaced under `bundle-size` |
| `no-window-in-ssr` | `vue-doctor/nuxt/no-window-in-ssr` | Namespaced under `nuxt` |

You can disable entire categories using wildcard patterns in your configuration, such as `"vue-doctor/security/*": "error"` or `"knip/*": "off"`.

---

## 3. Configuration File Migration

In v1, configuration was typically stored in JSON format (`.vuedoctorrc.json`). In 2.0, configuration is authored in `vue-doctor.config.ts` (or `.js` / `.mjs`), providing full TypeScript autocompletion and schema validation.

### Before: v1 (`.vuedoctorrc.json`)

```json
{
  "failOn": "error",
  "minScore": 80,
  "ignore": ["tests/**", "dist/**"],
  "rules": {
    "no-v-html": "error",
    "no-moment": "warn"
  }
}
```

### After: 2.0 (`vue-doctor.config.ts`)

```typescript
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  gate: {
    failOn: "error",     // "none" | "error" | "warning"
    minScore: 80,        // 0-100 threshold
    scope: "new",        // "new" (only new findings fail gate) | "all"
  },
  ignore: {
    paths: ["tests/**", "dist/**"],
  },
  rules: {
    "vue-doctor/security/no-unsafe-html-sink": "error",
    "vue-doctor/bundle-size/no-moment": "warn",
  },
  lint: true,
  deadCode: true,
});
```

---

## 4. Deterministic CLI Exit Codes

Version 2.0 establishes a strict exit code contract for predictable CI/CD pipelines:

| Exit Code | Meaning | Cause |
|---|---|---|
| `0` | **Success** | Diagnostic score meets quality threshold and findings do not breach `fail-on`. |
| `1` | **Quality Gate Failed** | Score dropped below `minScore` or unsuppressed findings exceeded `fail-on`. |
| `2` | **Usage / Runtime Error** | Unsupported flags, conflicting format options, or runtime scanning exceptions. |
| `3` | **Configuration Error** | Malformed `vue-doctor.config.ts`, invalid schema values, or syntax errors. |

Scripts or CI workflows that previously treated any non-zero exit code identically can now distinguish between quality gate breaches (`1`) and configuration errors (`3`).

---

## 5. Standardized Report Schema (`report@2`)

If your tooling consumes `--json` output, note that Vue Doctor 2.0 upgrades the schema to `report@2`:

- Top-level metadata includes `version: 2`, `projects: [...]`, and scan summary.
- Diagnostics are organized into structured `findings` with canonical rule IDs, severity, category, and file positions.
- Finding groups are pre-computed under `ruleGroups`, providing structured AI agent prompts for batch fixes.
- Validated against the published JSON schema at `@remylagerweij/vue-doctor/report-schema.json`.

---

## 6. GitHub Action Migration

Update your workflow file to point to `@v2`:

### Before (v1 Action)

```yaml
- uses: remylagerweij/vue-doctor@v1
  with:
    fail-on: error
    min-score: 80
```

### After (v2 Action)

```yaml
- uses: remylagerweij/vue-doctor@v2
  with:
    fail-on: error
    gate: new
    feedback: summary,findings
    grouping: rule-per-file
    agent-prompt: true
```

### Input Mapping Reference

| v1 Input | v2 Input | Description |
|---|---|---|
| `fail-on` | `fail-on` | Failure threshold (`none`, `error`, `warning`). |
| `min-score` | `min-score` | Minimum score gate (0–100). |
| `path` | `project` / positional | Directory or file path to scan (defaults to repository root). |
| *(new)* | `scope` | `changed` (default on PR) or `full` (default on push). |
| *(new)* | `gate` | `new` (only new issues fail) or `all`. |
| *(new)* | `feedback` | Comma-separated list: `summary`, `findings`, `annotations`. |
| *(new)* | `grouping` | Review comment grouping: `rule-per-file`, `finding`, or `rule`. |
| *(new)* | `agent-prompt` | Attach copy-paste AI agent remediation blocks to PR review comments (`true` / `false`). |
| *(new)* | `sarif` | Generate and upload SARIF to GitHub Code Scanning (`true` / `false`). |
| *(new)* | `baseline` | Path to baseline file for legacy issue suppression. |

---

## 7. Inline Suppressions

In v1, suppressions were unstandardized. In 2.0, suppressions follow strict directive patterns:

```vue
<script setup>
// vue-doctor-disable-next-line vue-doctor/security/no-eval
eval(untrustedCode);
</script>
```

For block suppressions:

```typescript
/* vue-doctor-disable vue-doctor/reactivity/no-mutation-in-computed */
const result = computed(() => {
  mutate();
});
/* vue-doctor-enable vue-doctor/reactivity/no-mutation-in-computed */
```

For environment files (`.env`, `.env.local`):

```bash
# vue-doctor-disable vue-doctor/security/no-hardcoded-secret
INTERNAL_API_KEY=sk_live_1234567890
```

---

## 8. New Features in 2.0 to Explore

Once upgraded, take advantage of the new capabilities introduced in Vue Doctor 2.0:

1. **AI Agent Integration:** Run `npx @remylagerweij/vue-doctor@latest agents install` to configure Claude Code, Cursor, Copilot, or Windsurf.
2. **MCP Server:** Connect your AI editor to Vue Doctor diagnostics with `vue-doctor mcp`.
3. **Automated Codemods:** Automatically fix safe patterns with `vue-doctor --fix`.
4. **Security Guardrails:** Comprehensive detection of SSRF, command injection, and supply-chain lockfile tampering.
