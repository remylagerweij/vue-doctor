# Configuration Reference

Vue Doctor is configured using `vue-doctor.config.ts` in the root of your project or workspace.

## TypeScript Configuration (`defineConfig`)

```typescript
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  // Gate settings for CI
  gate: {
    failOn: "error", // "none" | "error" | "warning"
    scope: "new",    // "new" (vs baseline/base branch) | "all"
    minScore: 80,    // Minimum overall score required
    strict: false,   // Exit 3 if an analyzer fails
  },

  // Analyzers
  lint: true,
  deadCode: true,
  cache: true,

  // Rule overrides
  rules: {
    "vue-doctor/security/no-eval": "error",
    "vue-doctor/bundle-size/no-moment": "warn",
    "vue-doctor/architecture/no-giant-component": "off",
  },

  // Ignore settings
  ignore: {
    rules: ["vue-doctor/bundle-size/no-lodash"],
    paths: [
      "dist/**",
      "coverage/**",
      "legacy/**",
      "**/*.generated.ts"
    ],
  },

  // Dependency audit (OSV.dev)
  audit: {
    enabled: false,
    severity: "moderate", // "low" | "moderate" | "high" | "critical"
  },

  // Baseline file
  baseline: "vue-doctor-baseline.json",

  // Diff scanning default
  diff: true,
});
```

## JSON Schema Validation

The configuration file is validated against the official JSON Schema:
`https://remylagerweij.github.io/vue-doctor/schema/vue-doctor.schema.json`
