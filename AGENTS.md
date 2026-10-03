# Vue Doctor — Agent Instructions

## Project Overview

Vue Doctor is a high-performance diagnostic tool for Vue.js and Nuxt applications. It analyzes codebases for performance anti-patterns, security vulnerabilities, bundle bloat, and architectural anti-patterns, computing an actionable 0–100 health score with automated codemods and AI remediation prompts.

---

## Architecture

- **Monorepo** using npm workspaces:
  - `packages/vue-doctor` — Main package (CLI, diagnostic engine, AST plugin, CI client, MCP server).
  - `docs` — VitePress documentation site with automated rule pages and `llms.txt`.
- **Four Parallel Analysis Passes**:
  1. **Oxlint AST Plugin** (`packages/vue-doctor/src/plugin/`): Sub-second AST analysis of `.vue`, `.js`, `.ts` files using custom JavaScript-implemented Oxlint rules.
  2. **ESLint Vue Pass** (`run-eslint-vue.ts`): Deep template validation via `eslint-plugin-vue` and `vue-eslint-parser` for template-specific anti-patterns.
  3. **Knip Pass** (`run-knip.ts`): Unused exports, dead files, and unreferenced dependencies.
  4. **Project Checks Pass** (`engine: "fs"` via `run-project-checks.ts`): Filesystem inspection for committed secrets, lockfile integrity, and sensitive files in `public/`.
- **104 Registered Rules** (`RULE_REGISTRY` in `src/plugin/registry.ts`):
  - 85 own rules (`vue-doctor/<category>/<rule>`) on the oxlint, `fs` and `audit` engines.
  - 19 `eslint-plugin-vue` template rules (`vue/<rule>`).
  - Dead-code findings come from Knip as `knip/<type>`.
- **Build System**: `tsdown` (Rolldown-based bundler producing dual ESM/DTS output).
- **Test Framework**: `Vitest` with fixture snapshots, registry verification, and isolation tests.

---

## Architectural Invariants & Contracts

### 1. Lazy Loading Contract
`tests/lazy-loading.test.ts` enforces that `--version` and `--help` never load the heavyweight libraries (`eslint`, `eslint-plugin-vue`, `vue-eslint-parser`, `knip`, `zod`, `jiti`, `@clack/prompts`), and that a `--no-dead-code` scan without a config file loads none of `knip`, `zod`, `jiti` or `@clack/prompts`.
- Use dynamic `await import(...)` inside command handlers (`mcp`, `ci`, `init`, `agents`, `rules`, `--fix`).
- `src/cli.ts` is a shim; keep the top-level imports of `src/program.ts` limited to lightweight utilities and Commander.

### 2. Registry Invariants
`tests/registry.test.ts` enforces that every rule:
- Has valid metadata: unique canonical ID (`vue-doctor/<category>/<rule-id>`), category, default severity, description, help, and agent remediation guidance.
- Has security classifications (CWE / OWASP) when in security categories.
- Follows the severity policy: `error` only for Security and Correctness rules with high confidence.
- Has a companion `.cases.ts` file with at least 3 valid near-misses and 3 invalid violations.
- Is registered in the generated barrel `src/plugin/rules/index.ts`.

### 3. Exit Code Contract
CLI commands return deterministic exit codes (`EXIT_CODES` in `src/core/gate.ts`):
- `0`: Success — the scan completed and no gate was breached.
- `1`: Gate breached — score below `--min-score` or findings at or above `--fail-on`.
- `2`: Usage error — invalid arguments or config, no Vue project, cancelled prompt, crash.
- `3`: Analyzer failure — an analyzer failed or was skipped and `--strict` was set.

### 4. Filesystem Rule Safety
Rules using `engine: "fs"`:
- Must only read files through `context.readFile` and `context.readDirectory` (to allow tracking for incremental scan caching).
- **Never** include secret or credential values in report messages or diagnostic metadata.

---

## Key Commands

Run from workspace root:

```bash
# Development & Build
npm run build              # Build packages/vue-doctor via tsdown
npm run dev                # Watch mode for packages/vue-doctor
npm run typecheck          # Strict TypeScript checks for code & tests

# Testing
npm run test               # Build and run all test suites
npm run snapshot:update    # Update fixture snapshots after rule additions

# Code & Documentation Generation
npm run rules:generate     # Regenerate src/plugin/rules/index.ts from rule files
npm run docs:gen           # Regenerate rule markdown pages, CLI/config refs, llms.txt
npm run docs:build         # Build VitePress documentation site

# Release & Versioning
npm run changeset          # Create a new changeset for release notes
npm run version            # Apply changesets and update package version
npm run release            # Build and publish to npm with provenance
```

---

## File Structure

```
packages/vue-doctor/
├── src/
│   ├── cli.ts                    # 3-line shim that calls runCli()
│   ├── program.ts                # Commander program: scan options and subcommands
│   ├── scan.ts                   # Scans projects and renders terminal output
│   ├── index.ts                  # Public package API exports
│   ├── commands/                 # Subcommands: agents, baseline, ci, init, mcp, rules
│   ├── config/                   # defineConfig, config loader and Zod schema
│   ├── core/
│   │   ├── diagnose.ts           # Pure pipeline: runs the analyzers, applies config
│   │   ├── gate.ts               # --fail-on / --min-score gate and exit codes
│   │   ├── baseline.ts           # Baselines (finding identity in fingerprint.ts)
│   │   └── cache.ts              # Analysis cache (keys in cache-keys.ts)
│   ├── plugin/
│   │   ├── registry.ts           # RULE_REGISTRY (all 104 rules)
│   │   ├── rule-ids.ts           # Canonical IDs, 1.x aliases, removed-rule aliases
│   │   ├── define-rule.ts        # Oxlint rule helper and RULE_CATEGORIES
│   │   ├── define-fs-rule.ts     # Filesystem rule helper
│   │   ├── template-rules.ts     # eslint-plugin-vue rule configuration
│   │   ├── custom-template-rules.ts # Template halves of own rules
│   │   ├── helpers.ts            # AST walking and pattern matching
│   │   └── rules/                # One folder per category, generated barrel index.ts:
│   │                             # architecture, bundle-size, correctness, ecosystem, nuxt,
│   │                             # performance, reactivity, security, server, supply-chain
│   ├── report/                   # text, json, jsonl, sarif, github, markdown, html formatters
│   ├── ci/                       # GitHub REST client, PR feedback, score cache, workflow generator
│   ├── fix/                      # Deterministic --fix codemods and runner
│   ├── mcp/                      # Model Context Protocol stdio server
│   └── utils/                    # Analyzer runners (oxlint, eslint, knip, project checks, audit)
└── tests/
    ├── fixtures/                 # Vue and Nuxt fixture applications
    ├── fixture-snapshots.test.ts # Snapshot tests that fail when an analyzer goes silent
    ├── registry.test.ts          # Metadata and registry invariant tests
    └── rules/rule-cases.test.ts  # Runs every rule's .cases.ts
```

---

## Rule Authoring Workflow

### 1. Oxlint AST Rule (`engine: "oxlint"`)
1. Create `src/plugin/rules/<category-slug>/<rule-id>.ts`. `meta.id` is the bare rule name; the canonical ID
   `vue-doctor/<category-slug>/<rule-id>` is derived from it and the category. See `RuleMeta` in `define-rule.ts`
   for every field.
   ```typescript
   import { defineRule } from "../../define-rule.js";
   import type { EsTreeNode, RuleContext } from "../../types.js";

   export default defineRule({
     meta: {
       id: "no-eval",
       category: "Security", // one of RULE_CATEGORIES
       defaultSeverity: "error", // "error" | "warning" | "off"; error only for high-confidence Security/Correctness
       confidence: "high", // "high" | "medium" | "low"
       frameworks: ["vue", "nuxt"],
       cwe: ["CWE-95"], // Security rules: CWE and OWASP are required
       owasp: "A03:2021",
       fixable: false,
       since: "1.0.0",
       help: "One-line remediation shown in reports.",
       agentGuidance: "Step-by-step fix instructions for AI agents.",
     },
     create: (context: RuleContext) => ({
       CallExpression(node: EsTreeNode) {
         if (node.callee?.type === "Identifier" && node.callee.name === "eval") {
           context.report({ node, message: "eval() is a security risk — use safer alternatives" });
         }
       },
     }),
   });
   ```
2. Create `src/plugin/rules/<category-slug>/<rule-id>.cases.ts` with at least 3 valid near-misses and 3 invalid cases:
   ```typescript
   import type { RuleCases } from "../../rule-cases.js";

   const cases: RuleCases = {
     valid: [{ name: "method on a non-global object", code: "export const mode = model.eval();
" }],
     invalid: [{ name: "direct eval", code: 'export const result = eval("1 + 1");
' }],
   };

   export default cases;
   ```
3. Template checks for an own rule go in `custom-template-rules.ts` (same registry ID, `template` cases);
   eslint-plugin-vue rules are configured in `template-rules.ts` with cases in `template-rules.cases.ts`.

### 2. Filesystem Rule (`engine: "fs"`)
1. Create `src/plugin/rules/<category-slug>/<rule-id>.ts` with the same `meta` and a `check` function. Read files
   only through the context (reads are recorded for the cache) and never put secret values in a message:
   ```typescript
   import { defineFsRule } from "../../define-fs-rule.js";

   export default defineFsRule({
     meta: { id: "no-committed-env", category: "Security", defaultSeverity: "warning", confidence: "medium", /* ... */ },
     check: (context) => {
       if (!context.isGitRepository) return;
       for (const file of context.trackedFiles) {
         if (!file.endsWith(".env.local")) continue;
         context.report({ file, line: 1, column: 1, message: ".env.local is tracked by git" });
       }
     },
   });
   ```
2. Create `<rule-id>.cases.ts` with `FsRuleCases` (`src/plugin/fs-rule-cases.ts`): virtual file trees as `files`,
   optional `ignored` / `untracked` / `git: false`; invalid cases list the expected `findings`.

### 3. Registry & Documentation Updates
After creating rule and cases:
```bash
npm run rules:generate    # Updates the barrel src/plugin/rules/index.ts
npm run rules:table --workspace=@remylagerweij/vue-doctor   # Updates docs/rules/table.md
npm run docs:gen          # Generates rule pages, CLI/config references and llms.txt
npm run snapshot:update   # Updates fixture snapshots
npm run schema:update --workspace=@remylagerweij/vue-doctor # Updates the config/report JSON schemas
npm run test              # Validates registry invariants and runs all rule cases
```

---

## Release Flow

1. **Changesets**: When making user-facing changes, run `npm run changeset` and select the appropriate package and bump type (patch, minor, major).
2. **Version Bump**: Run `npm run version` to consume changesets and update package version numbers and `CHANGELOG.md`.
3. **Verify**: Run `npm run build && npm run typecheck && npm run test && npm run docs:build`.
4. **Publish**: In CI or via `npm run release` with npm provenance enabled.
5. **Action Tag**: For major releases (e.g., `v2.0.0`), ensure the moving `v2` git tag is updated:
   ```bash
   git tag -fa v2 -m "Release v2.0.0"
   git push origin v2 --force
   ```
