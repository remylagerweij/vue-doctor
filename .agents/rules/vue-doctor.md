---
description: Vue Doctor Antigravity Rules
---

# Vue Doctor Antigravity Rules

These rules define the general behavior and context for the Antigravity agent when working within the `vue-doctor` project.

## Project Context
`vue-doctor` is an advanced static analysis tool for Vue.js and Nuxt applications. It provides a 0-100 health score by running three parallel analysis passes:
1. **Oxlint (Custom Plugin):** 42 rules for reactivity, architecture, security, performance, etc.
2. **ESLint-Plugin-Vue:** 19 rules for template validation.
3. **Knip:** Dead code detection.

The project is structured as an npm monorepo, with the primary logic located in `packages/vue-doctor`.

## Development Guidelines

- **Always run tests** after making functional changes, specifically `npm run test` in the `vue-doctor` package directory.
- **Rules belong in categories**: When creating or editing a rule, ensure it resides in the appropriate file under `packages/vue-doctor/src/plugin/rules/` (e.g., `reactivity.ts`, `performance.ts`).
- **AST awareness**: Familiarize yourself with ESTree and Oxlint AST structures when modifying rule logic. Helpers exist in `packages/vue-doctor/src/plugin/helpers.ts`.
- **Nuxt specific rules**: Rules affecting Nuxt projects should go into `packages/vue-doctor/src/plugin/rules/nuxt.ts`.

## Build & Test Workflow
Always use the established npm commands from the root or the `packages/vue-doctor` directory to verify your changes.

```bash
# From workspace root or packages/vue-doctor
npm run build
npm run test
```

## Creating New Rules
If instructed to create a new rule, follow the `add-rule` workflow defined in `.agents/workflows/add-rule.md`.

## File Structure Reference

```text
packages/vue-doctor/
├── src/
│   ├── cli.ts                    # CLI entry (Commander)
│   ├── scan.ts                   # Scan engine (orchestrates 3 passes)
│   ├── index.ts                  # Programmatic API
│   ├── plugin/
│   │   ├── index.ts              # Plugin registry (all rules)
│   │   ├── rules/                # Rule implementations by category
│   │   ├── helpers.ts            # AST walking utilities
│   │   ├── constants.ts          # Pattern constants
│   │   └── types.ts              # ESTree types
│   └── utils/
│       ├── run-oxlint.ts         # Oxlint runner
│       ├── run-eslint-vue.ts     # ESLint Vue runner
│       ├── run-knip.ts           # Knip runner
│       ├── discover-project.ts   # Framework/Vue detection
│       ├── calculate-score.ts    # Scoring algorithm
└── tests/
    ├── fixtures/                 # Test projects
    └── *.test.ts                 # Test files
```
