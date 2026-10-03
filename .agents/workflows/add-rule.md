---
description: Add a new diagnostic rule to Vue Doctor
---

# Add a New Diagnostic Rule

Follow these steps to add a new custom diagnostic rule to the Vue Doctor plugin.

## 1. Choose Rule Engine & Category

- **Oxlint AST rule (`engine: "oxlint"`)**: For AST analysis of Vue components, TypeScript, or JavaScript code.
- **Filesystem rule (`engine: "fs"`)**: For inspecting committed files, lockfile integrity, and sensitive files in `public/`.
- Categories: `reactivity`, `performance`, `security`, `architecture`, `correctness`, `bundle-size`, `nuxt`, `nuxt-server`, `js-performance`, `vue-specific`, `supply-chain`, `server`, `client`.

## 2. Implement the Rule File

Create `packages/vue-doctor/src/plugin/rules/<category-slug>/<rule-id>.ts`:

```typescript
import { defineRule } from "../../define-rule";

export default defineRule({
  meta: {
    id: "vue-doctor/<category-slug>/<rule-id>",
    category: "<category-slug>",
    severity: "error", // "error" | "warn" | "info"
    default: true,
    description: "Brief single-sentence explanation of what is flagged.",
    help: "Detailed manual remediation advice for developers.",
    agentRemediation: "Specific step-by-step instructions for AI agents fixing the issue.",
  },
  create(context) {
    return {
      CallExpression(node) {
        // Inspect node using helper functions from src/plugin/helpers.ts
        if (isViolation(node)) {
          context.report({
            node,
            message: "Actionable error message.",
          });
        }
      },
    };
  },
});
```

*(For filesystem rules, use `defineFsRule({ meta, check(context) { ... } })`)*.

## 3. Add Test Cases

Create companion test file `packages/vue-doctor/src/plugin/rules/<category-slug>/<rule-id>.cases.ts`:
- Provide at least 3 valid cases (near-misses).
- Provide at least 3 invalid cases with expected error messages.

```typescript
import type { RuleCases } from "../../rule-cases";

const cases: RuleCases = {
  valid: [
    `const valid1 = ref(0);`,
    `const valid2 = computed(() => count.value * 2);`,
    `// third valid example`,
  ],
  invalid: [
    {
      code: `const bad = computed(() => { state.value++; });`,
      errors: [{ message: "Side effect inside computed property" }],
    },
    // add 2 more invalid cases
  ],
};

export default cases;
```

## 4. Regenerate Registry and Docs

Run the generator scripts from the workspace root:

```bash
npm run rules:generate
npm run docs:gen
```

## 5. Verify Tests and Snapshots

Run the test suite and type check:

```bash
npm run typecheck
npm run test
```

If fixture output has changed as expected:
```bash
npm run snapshot:update
```
