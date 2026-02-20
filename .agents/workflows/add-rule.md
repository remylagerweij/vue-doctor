---
description: Add a new diagnostic rule to Vue Doctor
---

# Add a New Diagnostic Rule

Follow these steps to add a new custom diagnostic rule to the Vue Doctor plugin.

1. **Identify the Category**: Determine which file in `packages/vue-doctor/src/plugin/rules/` best fits the new rule (e.g., `reactivity.ts`, `performance.ts`, `nuxt.ts`).
2. **Implement the Rule**: Create the rule implementation function.
   - Use ESTree types (`PluginRule`, `PluginContext`, `Program`, `ObjectExpression`, etc.) from `packages/vue-doctor/src/plugin/types.ts`.
   - Utilize existing helpers in `packages/vue-doctor/src/plugin/helpers.ts` for traversing the AST or finding specific node patterns.
3. **Export and Register**:
   - Export your rule function from its category file.
   - Import and register it in `packages/vue-doctor/src/plugin/index.ts`.
4. **Update Oxlint Config**:
   - Add the rule to the appropriate category map in `packages/vue-doctor/src/oxlint-config.ts` (if applicable/exists in the current architecture).
   - Ensure the `run-oxlint.ts` help map and category maps correctly represent your new rule.
5. **Write Tests**:
   - Create or update a test fixture for the rule category in `packages/vue-doctor/tests/fixtures/`.
   - Add test cases in the corresponding test file (e.g., `tests/reactivity.test.ts`).
   - Validate both positive ("bad code") and negative ("good code") scenarios.

// turbo-all
6. **Run Build and Tests**:
   - Ensure you are in the workspace root.
   - Run `npm run build`.
   - Run `npm run test`.
