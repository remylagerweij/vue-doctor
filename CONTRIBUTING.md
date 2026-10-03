# Contributing to Vue Doctor

Thank you for your interest in contributing to Vue Doctor! We welcome contributions from everyone.

## Getting Started

### Prerequisites

- Node.js (v20.19+ or v22.12+)
- npm (v7+)

### Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/remylagerweij/vue-doctor.git
    cd vue-doctor
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the project:**
    ```bash
    npm run build
    ```

4.  **Run tests:**
    ```bash
    npm run test
    ```

## Project Structure

The codebase is a monorepo using npm workspaces. The main package is located in `packages/vue-doctor`.

-   `packages/vue-doctor/src/cli.ts`: The CLI entry point.
-   `packages/vue-doctor/src/scan.ts`: The core scanning logic.
-   `packages/vue-doctor/src/plugin/rules/`: Directory containing all rule implementations.
-   `packages/vue-doctor/tests/`: Unit and integration tests.

## How to Add a New Rule

Adding a new rule is a great way to contribute! Here is a step-by-step guide:

Every rule is one file that carries its own metadata (category, severity, help text, guidance for AI agents). The rule registry, the oxlint config, category and help lookups are all derived from those files.

1.  **Create the rule file**: `packages/vue-doctor/src/plugin/rules/<category-slug>/<rule-id>.ts`, where `<category-slug>` is the kebab-case display category (`reactivity`, `performance`, `security`, `bundle-size`, `correctness`, ...) and the file name equals the rule id. Export the rule with `defineRule`:

    ```typescript
    import { defineRule } from "../../define-rule.js";
    import type { EsTreeNode, RuleContext } from "../../types.js";

    export default defineRule({
      meta: {
        id: "no-forbidden-function",
        category: "Correctness", // must be one of RULE_CATEGORIES
        defaultSeverity: "warning", // "error" | "warning" | "off"
        confidence: "medium",
        frameworks: ["vue", "nuxt"], // ["nuxt"] for rules that only run on Nuxt projects
        fixable: false,
        since: "2.0.0",
        help: "Short remediation shown next to the finding",
        agentGuidance: "One to three sentences telling an AI agent how to fix it correctly",
      },
      create: (context: RuleContext) => ({
        CallExpression(node: EsTreeNode) {
          if (node.callee.name === "forbiddenFunction") {
            context.report({ node, message: "Avoid using forbiddenFunction()!" });
          }
        },
      }),
    });
    ```

    Code shared by several rules of a category goes in `rules/<category-slug>/helpers.ts` or `plugin/helpers.ts`.

2.  **Regenerate the rule barrel**: run `npm run rules:generate` in `packages/vue-doctor`. oxlint loads the plugin from one bundle, so rules must be statically imported; this script rewrites `src/plugin/rules/index.ts` (the list of all rule files). `tests/registry.test.ts` fails when the barrel is out of date. Nothing else needs editing: the plugin rule map, oxlint config, category and help lookups all come from the registry (`src/plugin/registry.ts`). Also run `npm run rules:table` to refresh `docs/rules/table.md` (`tests/rules-table.test.ts` fails when it is stale).

    **False-positive benchmark:** before promoting a rule to `"error"`, check it against real apps with `npm run benchmark -- --compare` (see [`benchmarks/README.md`](benchmarks/README.md)).

    **Severity policy:** `defaultSeverity: "error"` is only allowed for Security rules with `confidence: "high"` and Correctness rules that reliably indicate a bug; everything else must be `"warning"`. `tests/registry.test.ts` enforces this.

3.  **Add Tests**: add a test in `packages/vue-doctor/tests/rules/` (see `ecosystem.test.ts` for an ESLint `RuleTester` example that imports the rule's default export), or extend a fixture used by `tests/run-oxlint.test.ts`. If the rule fires on `tests/fixtures/basic-vue`, update `tests/snapshots/basic-vue-rule-counts.json`.

4.  **Template rules** (eslint-plugin-vue): add an entry to `src/plugin/template-rules.ts`; they have metadata only.

5.  **Verify**: run `npm run test` to ensure your new rule works as expected and doesn't break anything else.

## Pull Request Process

1.  Fork the repository and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  Ensure the test suite passes.
4.  Update the documentation (RULES.md) if you've added or changed a rule.
5.  Submit your Pull Request!

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.
