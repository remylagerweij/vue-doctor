# Vue Doctor — Agent Instructions

## Project Overview

Vue Doctor is a diagnostic tool for Vue.js and Nuxt applications. It scans codebases for performance, security, and correctness issues, producing a 0–100 health score with actionable recommendations.

## Architecture

- **Monorepo** using npm workspaces with `packages/vue-doctor` as the main package
- **Three parallel analysis passes**: oxlint (custom plugin), eslint-plugin-vue (templates), Knip (dead code)
- **54 custom rules** + 19 eslint-plugin-vue rules = **73 total rules**
- **Build tool**: tsdown (rolldown-based)
- **Test framework**: Vitest

## Key Commands

```bash
npm run build     # Build the package
npm run test      # Build + run tests
npm run dev       # Watch mode
```

## File Structure

```
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
│       └── ...                   # Other utilities
└── tests/
    ├── fixtures/                 # Test projects
    └── *.test.ts                 # Test files
```

## Rules

Rules are organized in `src/plugin/rules/` by category:
- `reactivity.ts` — Vue reactivity anti-patterns
- `performance.ts` — CSS animation and watcher performance
- `security.ts` — Secrets and XSS prevention
- `architecture.ts` — Component structure
- `correctness.ts` — Common Vue mistakes
- `bundle-size.ts` — Import optimization
- `nuxt.ts` — Nuxt-specific rules
- `js-performance.ts` — General JS performance
- `vue-specific.ts` — Vue API usage patterns
- `server.ts` — Server-side rules
- `client.ts` — Browser-specific rules

## Adding a New Rule

1. Add the rule function in the appropriate `rules/*.ts` file
2. Export it from that file
3. Import and register it in `plugin/index.ts`
4. Add to `oxlint-config.ts` rule categories
5. Add to `run-oxlint.ts` help map and category map
6. Add a test fixture if needed
7. Run `npm run test` to verify
