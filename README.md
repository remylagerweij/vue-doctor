<div align="center">

# 🩺 Vue Doctor

**Production-grade diagnostics, performance optimization, security auditing, and dead-code detection for Vue.js and Nuxt applications.**

[![npm version](https://img.shields.io/npm/v/@remylagerweij/vue-doctor.svg?color=42b883&logo=npm)](https://www.npmjs.com/package/@remylagerweij/vue-doctor)
[![npm downloads](https://img.shields.io/npm/dm/@remylagerweij/vue-doctor.svg?color=42b883&logo=npm)](https://www.npmjs.com/package/@remylagerweij/vue-doctor)
[![node version](https://img.shields.io/node/v/@remylagerweij/vue-doctor.svg?color=42b883&logo=node.js)](https://nodejs.org)
[![Documentation](https://img.shields.io/badge/docs-vitepress-42b883?logo=vitepress)](https://remylagerweij.github.io/vue-doctor/)
[![CI](https://github.com/remylagerweij/vue-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/remylagerweij/vue-doctor/actions/workflows/ci.yml)
[![Self-Test](https://github.com/remylagerweij/vue-doctor/actions/workflows/self-test.yml/badge.svg)](https://github.com/remylagerweij/vue-doctor/actions/workflows/self-test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Quick Start](#-quick-start) • [Features](#-key-features) • [Rule Categories](#-what-it-checks) • [AI Agents & MCP](#-ai-coding-agents--mcp) • [GitHub Actions CI](#-github-actions-ci) • [Documentation](https://remylagerweij.github.io/vue-doctor/)

</div>

---

Vue Doctor computes an actionable **0–100 health score** for your Vue and Nuxt codebases. It combines **sub-second AST analysis** via custom Oxlint rules, deep template validation via `eslint-plugin-vue`, dead code and unused export detection via Knip, and dependency vulnerability audits via OSV.dev.

---

## ⚡ Quick Start

### Zero-Install (Run Instantly)

Scan your project in seconds without installing anything:

```bash
npx @remylagerweij/vue-doctor@latest .
```

### Install as a Dev Dependency

```bash
# npm
npm i -D @remylagerweij/vue-doctor

# pnpm
pnpm add -D @remylagerweij/vue-doctor

# yarn
yarn add -D @remylagerweij/vue-doctor

# bun
bun add -d @remylagerweij/vue-doctor
```

Then add a script to your `package.json`:

```json
{
  "scripts": {
    "doctor": "vue-doctor",
    "doctor:fix": "vue-doctor --fix",
    "doctor:diff": "vue-doctor --diff"
  }
}
```

---

## 🚀 Key Features

- ⚡ **Sub-Second Performance:** Blazing-fast scans powered by Oxlint and native caching (`node_modules/.cache/vue-doctor`).
- 🛡️ **Comprehensive Quality Gates:** 85 custom rules (85 on by default) + 19 eslint-plugin-vue rules = 104 registered rules.
- 🔒 **Deep Security Guardrails:** Detects hardcoded secrets, unsafe HTML sinks (`v-html`), SSRF, command & SQL injection, prototype pollution, and LLM prompt injection risks.
- 🧹 **Dead Code & Unused Exports:** Finds unused components, unreferenced exports, orphan types, and dead dependencies using Knip.
- 🔧 **Automated Codemods:** Deterministic `--fix` automatically repairs lodash imports, in-place array mutation, missing `v-for` keys, and `rel="noopener noreferrer"`.
- 🤖 **First-Class AI Agent Support:** Built-in stdio Model Context Protocol (MCP) server (`vue-doctor mcp`) and one-command agent playbook installer (`vue-doctor agents install`) for Cursor, Claude Code, Copilot, and Windsurf.
- 🚦 **GitHub Actions CI & PR Feedback:** Full pull request feedback with sticky summary comments, line-level reviews with AI remediation prompts, check annotations, and score delta tracking.
- 📈 **Baseline for Existing Codebases:** Adopt Vue Doctor on legacy applications instantly; record existing issues and only fail on new violations.
- 📊 **Multiple Output Formats:** Terminal text with color banner, JSON, JSONL, SARIF (GitHub Code Scanning), Markdown, HTML, and GitHub Step Summary.

---

## 🔍 What It Checks

Vue Doctor executes **four parallel analysis passes**:

### 1. Oxlint AST Plugin (85 rules)
Custom, sub-second JavaScript/TypeScript and `.vue` script AST analysis:

| Category | Focus | Example Anti-Patterns Detected |
|---|---|---|
| **Reactivity** | Vue 3 reactivity traps | `no-fetch-in-watch`, `no-watch-for-computed`, `prefer-computed`, ref unwrapping |
| **Performance** | Runtime & rendering speed | `no-transition-all`, `no-layout-property-animation`, `async-parallel`, large lists |
| **Security** | XSS, injection & secrets | `no-unsafe-html-sink`, `no-secrets-in-client-code`, `no-eval`, SSRF, prompt injection |
| **Bundle Size** | Bloat & tree-shaking | `no-full-lodash-import`, `no-moment`, `prefer-dynamic-import`, duplicate packages |
| **Nuxt** | SSR & hydration pitfalls | `nuxt-no-img-element`, `nuxt-no-a-element`, `nuxt-async-client-component` |
| **Ecosystem** | Pinia & Vue Router | `pinia-no-destructure`, `router-no-string-push` |
| **Architecture** | Maintainability & design | `no-giant-component`, `no-nested-component-definition` |
| **Correctness** | Logic bugs & runtime errors | `no-array-index-as-key`, `no-prevent-default`, `no-direct-dom-manipulation` |
| **Server** | Nitro / server handlers | `server-no-console-in-handler` |
| **Supply Chain** | Dependencies & lockfiles | `lockfile-integrity`, `no-remote-dependency-spec`, `no-dependency-install-scripts` |

### 2. ESLint Template Validation (19 rules)
Deep `.vue` template structure checks via bundled flat-config ESLint:
- `vue/require-v-for-key`, `vue/no-use-v-if-with-v-for`
- `vue/no-mutating-props`, `vue/no-ref-as-operand`
- `vue/no-side-effects-in-computed-properties`
- `vue/no-template-target-blank`
- `vue/component-name-in-template-casing`

### 3. Dead Code Detection (Knip)
- Unused `.vue`, `.ts`, and `.js` files
- Unused component exports, composables, and TypeScript types
- Unreferenced production dependencies and devDependencies

### 4. Dependency Vulnerability Audits (OSV.dev)
- Real-time advisory lookups against the Open Source Vulnerability (OSV) database using `--audit`.

---

## 💻 Common Commands

```bash
# Scan current directory
vue-doctor

# Scan a specific directory or workspace project
vue-doctor ./apps/web

# Automatically apply deterministic codemods
vue-doctor --fix

# Preview codemods without changing files (unified diff)
vue-doctor --fix --dry-run

# Scan only files changed in your git branch (fast pre-commit / PR mode)
vue-doctor --diff main

# Output numeric score only (0–100, useful for quick shell scripts)
vue-doctor --score

# Fail CI gate if health score is below 80 or if any error occurs
vue-doctor --min-score 80 --fail-on error

# Output formats: text (default), json, sarif, markdown, html
vue-doctor --format json --output report.json
vue-doctor --format sarif --output results.sarif
```

---

## 🤖 AI Coding Agents & MCP

Vue Doctor is built from the ground up for AI-assisted development:

### 1. Model Context Protocol (MCP) Server
Launch the built-in MCP server for Claude Code, Cursor, Windsurf, or Antigravity:

```bash
npx @remylagerweij/vue-doctor@latest mcp
```

Add it to your Claude Desktop or Cursor MCP settings:

```json
{
  "mcpServers": {
    "vue-doctor": {
      "command": "npx",
      "args": ["-y", "@remylagerweij/vue-doctor@latest", "mcp"]
    }
  }
}
```

### 2. Install AI Agent Instructions
Install tailored playbooks for all detected coding assistants (`CLAUDE.md`, `.cursorrules`, Copilot, `AGENTS.md`):

```bash
npx @remylagerweij/vue-doctor@latest agents install
```

### 3. Explain Any Rule with AI Remediation Steps
```bash
npx @remylagerweij/vue-doctor@latest explain vue-doctor/security/no-unsafe-html-sink
```

---

## 🛠️ GitHub Actions CI

Set up automated pull request quality gates and sticky review comments in one command:

```bash
npx @remylagerweij/vue-doctor@latest ci install
```

Or add `.github/workflows/vue-doctor.yml`:

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

jobs:
  diagnose:
    name: Vue Doctor Health Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: remylagerweij/vue-doctor@v2
        with:
          fail-on: error
          gate: new
          feedback: summary,findings
          grouping: rule-per-file
          agent-prompt: true
```

---

## 📈 Baseline (Adopting on Existing Projects)

Adopt Vue Doctor on large or legacy codebases without failing existing code:

```bash
# 1. Record current findings into a baseline file
npx @remylagerweij/vue-doctor@latest baseline

# 2. Commit the baseline file
git add .vue-doctor-baseline.json && git commit -m "chore: add vue-doctor baseline"

# 3. Only fail CI when NEW issues are introduced
npx @remylagerweij/vue-doctor@latest --baseline .vue-doctor-baseline.json --gate new --fail-on error
```

---

## ⚙️ Configuration

Configure Vue Doctor via `vue-doctor.config.ts` (or `.js`, `.mjs`, `.json`, or a `"vueDoctor"` property in `package.json`):

```typescript
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  gate: {
    failOn: "error", // "none" | "error" | "warning"
    scope: "new",    // "new" (only new issues fail) | "all"
    minScore: 80,    // Minimum 0-100 score required to pass gate
  },
  lint: true,
  deadCode: true,
  rules: {
    "vue-doctor/security/no-unsafe-html-sink": "error",
    "vue-doctor/bundle-size/no-moment": "warn",
    "vue-doctor/architecture/no-giant-component": "off",
  },
  ignore: {
    paths: ["legacy/**", "dist/**", "coverage/**"],
    rules: ["vue-doctor/bundle-size/no-full-lodash-import"],
  },
  baseline: ".vue-doctor-baseline.json",
});
```

---

## 🔕 Suppressing Findings

Vue Doctor features non-destructive, dedicated suppression comments. `eslint-disable` comments never hide Vue Doctor findings:

```typescript
// Line suppression
// vue-doctor-disable-next-line vue-doctor/bundle-size/no-moment -- legacy compatibility
import moment from "moment";

// Inline suppression
const html = render(); // vue-doctor-disable-line

// File suppression
// vue-doctor-disable-file vue-doctor/architecture/no-giant-component
```

In `.vue` templates, use standard HTML comments:
```html
<!-- vue-doctor-disable-next-line vue-doctor/security/no-unsafe-html-sink -->
<div v-html="trustedContent" />
```

---

## 🔌 Programmatic API

Use Vue Doctor directly from Node.js scripts or custom build tooling:

```typescript
import { diagnose } from "@remylagerweij/vue-doctor/api";

const result = await diagnose("./my-vue-app", {
  lint: true,
  deadCode: true,
});

console.log(`Health Score: ${result.score}/100`);
console.log(`Total Findings: ${result.diagnostics.length}`);
```

---

## 🌐 Framework & Tooling Support

- **Vue.js:** Vue 3 (Composition API, `<script setup>`, Options API)
- **Nuxt:** Nuxt 3 (auto-detected, with specialized server, routing, and hydration checks)
- **Bundlers:** Vite, Rollup, Webpack, Nuxt CLI, Quasar, Vue CLI
- **Monorepos:** npm, pnpm, yarn, bun workspaces, Turborepo, Nx

---

## 📚 Documentation & Resources

- **[Official Documentation](https://remylagerweij.github.io/vue-doctor/)**
- **[Full Rules Catalog](https://remylagerweij.github.io/vue-doctor/rules/)**
- **[CI & GitHub PR Guide](https://remylagerweij.github.io/vue-doctor/guide/ci)**
- **[AI Agents Playbook](https://remylagerweij.github.io/vue-doctor/guide/agents)**
- **[Model Context Protocol (MCP) Guide](https://remylagerweij.github.io/vue-doctor/guide/mcp)**
- **[CLI Reference](https://remylagerweij.github.io/vue-doctor/reference/cli)**
- **[Configuration Reference](https://remylagerweij.github.io/vue-doctor/reference/config)**
- **[LLM Full-Text Reference (`llms.txt`)](https://remylagerweij.github.io/vue-doctor/llms.txt)**

---

## 🤝 Credits & Acknowledgements

- Created and maintained by [Remy Martin Lagerweij](https://github.com/remylagerweij).
- Inspired by [react-doctor](https://github.com/millionco/react-doctor) by [Million](https://github.com/millionco).

## 📄 License

[MIT](https://github.com/remylagerweij/vue-doctor/blob/main/LICENSE) © [Remy Martin Lagerweij](https://github.com/remylagerweij)
