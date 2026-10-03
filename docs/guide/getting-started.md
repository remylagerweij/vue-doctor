# Getting started

Vue Doctor diagnoses performance, security and correctness issues in Vue.js and Nuxt applications and produces a 0-100 health score.

## Requirements

- Node.js `^22.12.0` or `>=24.0.0`. Node 23 is not supported. On an unsupported Node version the lint pass is skipped and Vue Doctor prints install guidance.
- A Vue 3 or Nuxt 3 project (Composition API and `<script setup>` included). Vite, Quasar, Vue CLI and npm/pnpm/yarn monorepo workspaces are detected automatically.

## Run it

```bash
npx vue-doctor@latest
```

Pass a directory to scan another project:

```bash
npx vue-doctor@latest ./my-vue-app
```

## What it checks

Vue Doctor runs three analysis passes in parallel:

1. **Oxlint with the Vue Doctor plugin**: custom rules for reactivity, performance, security, bundle size, correctness, architecture, Nuxt and server code.
2. **eslint-plugin-vue**: template-level checks, run in-process with Vue Doctor's own bundled ESLint. Your project's ESLint and config are never loaded.
3. **Knip**: unused files, exports, types and dependencies.

See the [rules index](/rules/) for the rule catalogue.

## Reading the output

The report ends with a score from 0 to 100 and a label. Status output (banner, spinners, hints, warnings) goes to stderr; stdout carries only the report, so `vue-doctor --json > report.json` is safe.

Vue Doctor never writes into the project it scans. Next, see [CLI usage](/guide/cli-usage) for the available flags and [CI](/guide/ci) to gate builds on the result.
