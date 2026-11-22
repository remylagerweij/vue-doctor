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

6.  **Fuzz it**: every rule is fuzzed automatically from its `<rule-id>.cases.ts` (your valid and invalid cases are the seed inputs), so good cases also make the fuzzing better. `npm run test` runs a small deterministic smoke subset. The full run is `npm run fuzz` (add `-- --seed 7` to reproduce a run, `-- --rule <rule-id>` to focus on one rule; see `-- --help`). It checks that no rule throws, that no rule is slow (a per-rule, per-file time budget), and that semantics-preserving rewrites (blank lines or comments between statements, indentation, quote style, CRLF, a byte order mark, `lang="ts"` on a `.vue` script) do not change what the rule reports beyond line numbers. It runs weekly and on pull requests that touch `packages/vue-doctor/src/plugin/**`.

    If the fuzzer reports a failure in your rule, fix the rule. If the behaviour is intentional (for example a rule that counts lines is allowed to react to blank lines), or the fix has to wait, add an entry with a written reason to `packages/vue-doctor/tests/fuzz/known-failures.json`: that file is the visible list of known debt, and it should only shrink.

## Pull Request Process

1.  Fork the repository and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  Ensure the test suite passes.
4.  Update the documentation (RULES.md) if you've added or changed a rule.
5.  Submit your Pull Request!

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.
