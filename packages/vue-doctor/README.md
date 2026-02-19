# Vue Doctor 🩺

Diagnose and fix performance issues in your Vue.js app. Get a 0–100 health score with actionable recommendations.

## Quick Start

```bash
npx vue-doctor@latest
```

## What It Checks

Vue Doctor runs **three parallel analysis passes** on your codebase:

### 1. Oxlint + Vue Doctor Plugin (46 rules)
Custom ESTree-based rules for Vue.js:

| Category | Rules | Examples |
|----------|-------|---------|
| **Reactivity** | 7 | `no-fetch-in-watch`, `no-watch-for-computed`, `prefer-computed` |
| **Ecosystem** | 4 | `pinia-no-destructure`, `router-no-string-push` |
| **Architecture** | 2 | `no-giant-component`, `no-nested-component-definition` |
| **Performance** | 16 | `no-transition-all`, `no-layout-property-animation`, `async-parallel` |
| **Security** | 2 | `no-secrets-in-client-code`, `no-v-html` |
| **Bundle Size** | 5 | `no-full-lodash-import`, `no-moment`, `prefer-dynamic-import` |
| **Correctness** | 4 | `no-array-index-as-key`, `no-prevent-default`, `no-direct-dom-manipulation` |
| **Nuxt** | 5 | `nuxt-no-img-element`, `nuxt-no-a-element`, `nuxt-async-client-component` |
| **Server** | 1 | `server-no-console-in-handler` |

### 2. ESLint Plugin Vue (19 template rules)
Template-level analysis with `eslint-plugin-vue`:
- `vue/require-v-for-key`, `vue/no-use-v-if-with-v-for`
- `vue/no-mutating-props`, `vue/no-ref-as-operand`
- `vue/no-side-effects-in-computed-properties`
- `vue/component-name-in-template-casing`
- And more...

### 3. Dead Code Detection
Powered by [Knip](https://github.com/webpro/knip):
- Unused files, exports, types, dependencies

## Usage

```bash
# Scan current directory
vue-doctor

# Scan a specific project
vue-doctor --project ./my-vue-app

# Score only (for CI)
vue-doctor --score

# Verbose output with file details
vue-doctor --verbose

# Only lint checks (skip dead code)
vue-doctor --no-dead-code

# Only dead code checks (skip lint)
vue-doctor --no-lint

# Scan only changed files (diff mode)
vue-doctor --diff main
```

## Configuration

Create a `vue-doctor.config.json` in your project root:

```json
{
  "ignore": {
    "rules": ["no-giant-component"],
    "paths": ["legacy/**"]
  }
}
```

Or add to `package.json`:

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
  verbose: false,
});

console.log(result.scoreResult?.score); // 0–100
console.log(result.diagnostics.length); // number of issues
```

## GitHub Action

```yaml
- uses: remylagerweij/vue-doctor@v1
  with:
    directory: "."
```

## Framework Support

- **Vue 3** (Composition API, `<script setup>`)
- **Nuxt 3** (auto-detected, enables Nuxt-specific rules)
- **Vite** / **Quasar** / **Vue CLI**
- **Monorepo** workspaces (npm, pnpm, yarn)

## License

MIT
