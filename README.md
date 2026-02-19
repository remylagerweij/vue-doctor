<div align="center">

# 🩺 Vue Doctor

**Diagnose and fix performance issues in your Vue.js app.**

[![CI](https://github.com/remylagerweij/vue-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/remylagerweij/vue-doctor/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@nicepkg/vue-doctor.svg?color=42b883)](https://www.npmjs.com/package/@nicepkg/vue-doctor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

Get a **0–100 health score** for your Vue.js project with actionable recommendations. Vue Doctor runs three parallel analysis passes — custom oxlint rules, eslint-plugin-vue template checks, and dead code detection — to catch performance, security, and correctness issues.

## Quick Start

```bash
npx @nicepkg/vue-doctor@latest
```

## What It Checks

| Pass | Engine | Rules |
|------|--------|-------|
| **Custom Lint** | Oxlint + Vue Doctor plugin | 42 rules (reactivity, architecture, CSS perf, security, bundle size, Nuxt, JS perf) |
| **Template Lint** | eslint-plugin-vue | 19 rules (v-for-key, no-mutating-props, no-v-html, etc.) |
| **Dead Code** | Knip | Unused files, exports, types, dependencies |

### Rule Categories

<table>
<tr><td><b>🔄 Reactivity</b></td><td>no-fetch-in-watch, no-watch-for-computed, prefer-computed, no-ref-from-prop, no-reactive-replace, no-cascading-mutations, no-missing-await-nextTick</td></tr>
<tr><td><b>🏗️ Architecture</b></td><td>no-giant-component, no-nested-component-definition</td></tr>
<tr><td><b>⚡ Performance</b></td><td>no-transition-all, no-layout-property-animation, no-global-css-variable-animation, no-large-animated-blur, no-scale-from-zero, no-permanent-will-change, no-deep-watch, passive-event-listeners, async-parallel, js-combine-iterations, js-tosorted-immutable, js-hoist-regexp, js-min-max-loop, js-set-map-lookups, js-batch-dom-css, js-index-maps, js-cache-storage, js-early-exit</td></tr>
<tr><td><b>🔒 Security</b></td><td>no-secrets-in-client-code, no-v-html</td></tr>
<tr><td><b>📦 Bundle Size</b></td><td>no-full-lodash-import, no-moment, prefer-dynamic-import, no-barrel-import, no-undeferred-third-party</td></tr>
<tr><td><b>✅ Correctness</b></td><td>no-array-index-as-key, no-prevent-default, no-direct-dom-manipulation, prefer-defineProps-destructure, no-this-in-setup, require-defineprops-types</td></tr>
<tr><td><b>💚 Nuxt</b></td><td>nuxt-no-img-element, nuxt-no-a-element, nuxt-no-head-import, nuxt-no-client-fetch-for-server-data, nuxt-async-client-component, nuxt-no-window-in-ssr, nuxt-require-seo-meta, nuxt-no-process-env-in-client, nuxt-require-server-route-error-handling</td></tr>
<tr><td><b>🖥️ Server</b></td><td>server-no-console-in-handler</td></tr>
</table>

## Usage

```bash
# Scan current directory
vue-doctor

# Scan a specific project
vue-doctor --project ./my-vue-app

# Score only (CI mode)
vue-doctor --score

# Verbose — show file locations per rule
vue-doctor --verbose

# Skip passes
vue-doctor --no-dead-code
vue-doctor --no-lint

# Diff mode — only scan changed files
vue-doctor --diff main
```

## GitHub Action

Use Vue Doctor in your CI pipeline:

```yaml
- name: Vue Doctor
  uses: remylagerweij/vue-doctor@v1
  with:
    directory: "."
    verbose: "true"
```

The action outputs the health score:

```yaml
- name: Vue Doctor
  id: doctor
  uses: remylagerweij/vue-doctor@v1

- name: Check score
  run: echo "Score: ${{ steps.doctor.outputs.score }}"
```

## Configuration

Create `vue-doctor.config.json`:

```json
{
  "ignore": {
    "rules": ["no-giant-component"],
    "paths": ["legacy/**"]
  }
}
```

Or in `package.json`:

```json
{
  "vueDoctor": {
    "ignore": {
      "rules": ["no-prevent-default"]
    }
  }
}
```

## Programmatic API

```ts
import { diagnose } from "vue-doctor/api";

const result = await diagnose({
  directory: "./my-vue-app",
  lint: true,
  deadCode: true,
});

console.log(result.scoreResult?.score); // 0–100
```

## Framework Support

| Framework | Auto-detected | Extra rules |
|-----------|--------------|-------------|
| Vue 3 | ✅ | Composition API, `<script setup>` |
| Nuxt 3 | ✅ | 5 Nuxt-specific rules |
| Vite | ✅ | — |
| Quasar | ✅ | — |
| Vue CLI | ✅ | — |

Monorepo workspaces (npm, pnpm, yarn) are supported.

## Project Structure

```
vue-doctor/
├── action.yml                     # GitHub Action (Marketplace)
├── .github/workflows/
│   ├── ci.yml                     # Build + Test
│   ├── release.yml                # Changeset → npm publish
│   └── self-test.yml              # Action smoke test
└── packages/vue-doctor/
    ├── src/
    │   ├── cli.ts                 # CLI entry point
    │   ├── scan.ts                # Scan engine (3 parallel passes)
    │   ├── plugin/                # Oxlint plugin (42 rules)
    │   └── utils/                 # Discovery, scoring, runners
    └── tests/                     # 38 tests
```

## Contributing

```bash
git clone https://github.com/remylagerweij/vue-doctor.git
cd vue-doctor
npm install
npm run build
npm run test
```

## License

[MIT](LICENSE) — Originally inspired by [react-doctor](https://github.com/nicepkg/react-doctor) by Million.
