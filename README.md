<div align="center">

# 🩺 Vue Doctor

**Production-grade diagnostics, performance optimization, and security guardrails for Vue.js and Nuxt applications.**

[![CI](https://github.com/remylagerweij/vue-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/remylagerweij/vue-doctor/actions/workflows/ci.yml)
[![Self-Test](https://github.com/remylagerweij/vue-doctor/actions/workflows/self-test.yml/badge.svg)](https://github.com/remylagerweij/vue-doctor/actions/workflows/self-test.yml)
[![npm version](https://img.shields.io/npm/v/@remylagerweij/vue-doctor.svg?color=42b883)](https://www.npmjs.com/package/@remylagerweij/vue-doctor)
[![Documentation](https://img.shields.io/badge/docs-vitepress-42b883)](https://remylagerweij.github.io/vue-doctor/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

Vue Doctor computes an actionable **0–100 health score** for your Vue and Nuxt codebases. It combines sub-second AST analysis via custom Oxlint rules, template validation via `eslint-plugin-vue`, dead code detection via Knip, and dependency vulnerability audits via OSV.dev.

---

## ⚡ Quick Start

Scan your project in seconds without installing anything:

```bash
npx @remylagerweij/vue-doctor@latest .
```

Scan only files modified in your git branch:

```bash
npx @remylagerweij/vue-doctor@latest . --scope changed --format json
```

Print just the numeric health score:

```bash
npx @remylagerweij/vue-doctor@latest . --score
```

---

## 🚀 Key Features

- **Blazing Fast:** Sub-second scans powered by Oxlint and native caching (`node_modules/.cache/vue-doctor`).
- **Comprehensive Quality Gates:** 85 custom rules (85 on by default) + 19 eslint-plugin-vue rules = 104 registered rules.
- **Deep Security Guardrails:** Detects hardcoded secrets, unsafe HTML sinks (`v-html`), SSRF, command & SQL injection, prototype pollution, and LLM prompt injection risks.
- **Automated Codemods:** Deterministic `--fix` automatically repairs lodash imports, in-place array mutation, missing `v-for` keys, and `rel="noopener noreferrer"`.
- **First-Class AI Agent Support:** Built-in stdio Model Context Protocol (MCP) server (`vue-doctor mcp`) and one-command agent playbook installer (`vue-doctor agents install`).
- **GitHub Actions Integration:** Full PR feedback system with sticky summary comments, review comments with AI remediation prompts, check annotations, and score delta tracking.

---

## 🤖 AI Coding Agents & MCP

Install Vue Doctor instructions for all detected agents (Claude Code, Cursor, Copilot, Windsurf, Antigravity, AGENTS.md):

```bash
npx @remylagerweij/vue-doctor@latest agents install
```

Start the built-in MCP server for Claude Code or Cursor:

```bash
npx @remylagerweij/vue-doctor@latest mcp
```

Look up detailed remediation advice and agent guidance for any rule:

```bash
npx @remylagerweij/vue-doctor@latest explain vue-doctor/security/no-unsafe-html-sink
```

---

## 🛠️ GitHub Actions CI

Set up automated CI and PR review comments with one command:

```bash
npx @remylagerweij/vue-doctor@latest ci install
```

Example `.github/workflows/vue-doctor.yml`:

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
  vue-doctor:
    name: Vue Doctor
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

## ⚙️ Configuration

Configure Vue Doctor using `vue-doctor.config.ts`:

```typescript
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  gate: {
    failOn: "error", // "none" | "error" | "warning"
    scope: "new",    // "new" (only new findings fail gate) | "all"
    minScore: 80,
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
  },
  baseline: "vue-doctor-baseline.json",
});
```

---

## 💻 Programmatic API

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

## 📚 Documentation Links

- **[Documentation Site](https://remylagerweij.github.io/vue-doctor/)**
- **[Rules Catalog](https://remylagerweij.github.io/vue-doctor/rules/)**
- **[CI & PR Feedback Guide](https://remylagerweij.github.io/vue-doctor/guide/ci)**
- **[AI Agents Playbook](https://remylagerweij.github.io/vue-doctor/guide/agents)**
- **[MCP Server Guide](https://remylagerweij.github.io/vue-doctor/guide/mcp)**
- **[CLI Reference](https://remylagerweij.github.io/vue-doctor/reference/cli)**
- **[Configuration Reference](https://remylagerweij.github.io/vue-doctor/reference/config)**
- **[LLM Full Text Reference](https://remylagerweij.github.io/vue-doctor/llms-full.txt)**

---

## 🤝 Credits & Acknowledgements

- Created and maintained by [Remy Lagerweij](https://github.com/remylagerweij).
- Inspired by [react-doctor](https://github.com/millionco/react-doctor) by [Million](https://github.com/millionco).

## 📄 License

[MIT](LICENSE)
