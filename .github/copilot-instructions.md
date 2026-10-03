# GitHub Copilot Instructions

See [AGENTS.md](../AGENTS.md) at the repository root for the canonical architecture, invariants, coding standards, commands, and rule-authoring workflows.

## Key Development Commands

- `npm run build`: Build `@remylagerweij/vue-doctor` with tsdown.
- `npm run test`: Run the test suite (Vitest).
- `npm run typecheck`: Run strict TypeScript validation.
- `npm run rules:generate`: Regenerate the rule barrel export (`packages/vue-doctor/src/plugin/rules/index.ts`).
- `npm run docs:gen`: Regenerate VitePress rule documentation and `llms.txt`.
- `npm run snapshot:update`: Update fixture test snapshots after rule additions or scoring updates.
