# Claude Code Guide

See [@AGENTS.md](./AGENTS.md) for the canonical architecture, invariants, rules catalog, commands, and rule-authoring instructions.

## Essential Commands

```bash
npm run build            # Build the package via tsdown
npm run test             # Run all Vitest suites
npm run typecheck        # Strict TypeScript typecheck
npm run rules:generate   # Regenerate plugin rule barrel after adding/editing rules
npm run docs:gen         # Regenerate markdown rule docs and llms.txt
npm run snapshot:update  # Update fixture test snapshots
```

## Adding Rules

Always create:
1. `packages/vue-doctor/src/plugin/rules/<category>/<rule-name>.ts`
2. `packages/vue-doctor/src/plugin/rules/<category>/<rule-name>.cases.ts`
3. Run `npm run rules:generate && npm run docs:gen && npm run test`
