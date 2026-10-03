# Vue Doctor 🩺

Diagnose and fix performance issues in your Vue.js app. Get a 0–100 health score with actionable recommendations.

## Quick Start

```bash
npx vue-doctor@latest
```

## What It Checks

Vue Doctor runs **three parallel analysis passes** on your codebase:

### 1. Oxlint + Vue Doctor Plugin (59 rules, 54 on by default)
Custom ESTree-based rules for Vue.js:

| Category | Rules | Examples |
|----------|-------|---------|
| **Reactivity** | 9 | `no-fetch-in-watch`, `no-watch-for-computed`, `prefer-computed` |
| **Ecosystem** | 4 | `pinia-no-destructure`, `router-no-string-push` |
| **Architecture** | 2 | `no-giant-component`, `no-nested-component-definition` |
| **Performance** | 18 | `no-transition-all`, `no-layout-property-animation`, `async-parallel` |
| **Security** | 3 | `no-secrets-in-client-code`, `no-unsafe-html-sink` |
| **Bundle Size** | 5 | `no-full-lodash-import`, `no-moment`, `prefer-dynamic-import` |
| **Correctness** | 8 | `no-array-index-as-key`, `no-prevent-default`, `no-direct-dom-manipulation` |
| **Nuxt** | 9 | `nuxt-no-img-element`, `nuxt-no-a-element`, `nuxt-async-client-component` |
| **Server** | 1 | `server-no-console-in-handler` |
| **Supply Chain** | 3 | `lockfile-integrity`, `no-remote-dependency-spec`, `no-dependency-install-scripts` (project checks) |

### 2. ESLint Plugin Vue (20 template rules)
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

Put one config file in the project root: `vue-doctor.config.ts` (or `.mts`, `.js`, `.mjs`, `.json`), or a `vueDoctor` key in `package.json`. Parent directories are never searched.

```ts
// vue-doctor.config.ts
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  extends: ["vue-doctor/recommended"], // or "vue-doctor/strict", "vue-doctor/security"
  rules: {
    "no-giant-component": "off",
    "vue-doctor/security/no-unsafe-html-sink": "error",
  },
  ignore: { files: ["src/legacy/**"], rules: ["no-prevent-default"] },
  gate: { failOn: "error", scope: "new", minScore: 70 },
  deadCode: true,
});
```

```json
{
  "$schema": "./node_modules/@remylagerweij/vue-doctor/schema/vue-doctor.schema.json",
  "ignore": { "files": ["src/legacy/**"] }
}
```

- `rules` sets a severity (`"off"`, `"warn"`, `"error"`) per rule. Rule IDs are `vue-doctor/<category>/<rule>` (e.g. `vue-doctor/bundle-size/no-moment`), `vue/<rule>` for template rules and `knip/<type>`; `vue-doctor/security/*` selects a whole group. The 1.x forms `no-moment` and `vue-doctor/no-moment` still work but print a deprecation warning.
- `gate`, `lint`, `deadCode`, `verbose` and `diff` are defaults; command-line flags win.
- The config is validated: unknown keys and invalid values exit with code 2 and say what is wrong.
- `.ts`/`.js` configs are executed. Use JSON when scanning untrusted code.

## Baseline

Adopting Vue Doctor on an existing codebase? Record today's findings and only fail on new ones:

```bash
npx @remylagerweij/vue-doctor baseline              # writes .vue-doctor-baseline.json (commit it)
npx @remylagerweij/vue-doctor --baseline .vue-doctor-baseline.json --gate new --fail-on error
```

Set `"baseline": ".vue-doctor-baseline.json"` in the config to apply it by default. Fingerprints survive code moving within a file.

## Suppressing Findings

Vue Doctor has its own suppression comments. `eslint-disable` / `oxlint-disable` comments do **not** hide Vue Doctor findings, and Vue Doctor never modifies your files.

```ts
// vue-doctor-disable-next-line vue-doctor/bundle-size/no-moment -- legacy report page
import moment from "moment";
const html = render(); // vue-doctor-disable-line
/* vue-doctor-disable vue-doctor/bundle-size/no-moment */ /* vue-doctor-enable vue-doctor/bundle-size/no-moment */
// vue-doctor-disable-file no-giant-component
```

In `.vue` templates use HTML comments: `<!-- vue-doctor-disable-next-line vue-doctor/security/no-unsafe-html-sink -->`. Without a rule list every rule is suppressed; rules are written as canonical IDs (`vue-doctor/<category>/<rule>`, `vue/<rule>`); the 1.x forms `rule` and `vue-doctor/rule` still work with a deprecation warning.

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
