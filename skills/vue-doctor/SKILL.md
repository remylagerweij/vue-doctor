---
name: vue-doctor
description: Run Vue Doctor to diagnose performance, security, and correctness issues in Vue.js projects
---

# Vue Doctor Skill

Use this skill to scan Vue.js and Nuxt projects for issues and get a 0–100 health score.

## Quick Start

```bash
npx @remylagerweij/vue-doctor@latest .
```

## When to Use

- After making significant changes to Vue components
- Before deploying to production
- During code reviews to catch common Vue anti-patterns
- To audit a new Vue codebase for best practices

## Categories Checked

1. **Reactivity** — watch misuse, reactive prop copying, destructuring reactive objects
2. **Performance** — CSS animation issues, deep watchers, expensive inline expressions
3. **Security** — secrets in client code, v-html XSS, eval usage
4. **Architecture** — giant components, nested component definitions
5. **Correctness** — v-for keys, direct DOM manipulation, this in setup
6. **Bundle Size** — lodash, moment, barrel imports, heavy libraries
7. **Nuxt** — SSR safety, server route error handling, SEO meta
8. **Dead Code** — unused files, exports, types, dependencies

## Integration

### Programmatic API

```typescript
import { diagnose } from "@remylagerweij/vue-doctor/api";

const result = await diagnose({
  directory: "./my-vue-app",
  lint: true,
  deadCode: true,
});

// result.scoreResult?.score  → 0–100
// result.diagnostics         → Diagnostic[]
```

### ESLint Plugin

```javascript
import vueDoctorPlugin from "@remylagerweij/vue-doctor/eslint-plugin";
import vueParser from "vue-eslint-parser";

export default [
  {
    files: ["**/*.vue"],
    languageOptions: { parser: vueParser },
    plugins: { "vue-doctor": vueDoctorPlugin },
    rules: {
      "vue-doctor/no-v-html": "error",
      "vue-doctor/no-deep-watch": "warn",
      "vue-doctor/no-mutation-in-computed": "error",
    },
  },
];
```

### GitHub Action

```yaml
- uses: remylagerweij/vue-doctor@v1
  with:
    directory: "."
    verbose: "true"
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
