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

1.  **Identify the Category**: Decide which category your rule belongs to (e.g., `reactivity`, `performance`, `security`, etc.).

2.  **Create the Rule implementation**:
    -   Open `packages/vue-doctor/src/plugin/rules/<category>.ts`.
    -   Export a new `Rule` object.
    -   Implement the `create` function which returns an object with visitor methods for AST nodes.

    *Example:*
    ```typescript
    export const myNewRule: Rule = {
      create: (context: RuleContext) => ({
        CallExpression(node: EsTreeNode) {
          if (node.callee.name === "forbiddenFunction") {
            context.report({
              node,
              message: "Avoid using forbiddenFunction()!",
            });
          }
        },
      }),
    };
    ```

3.  **Register the Rule**:
    -   Open `packages/vue-doctor/src/plugin/index.ts`.
    -   Import your new rule.
    -   Add it to the `rules` object with a descriptive name (kebab-case).

4.  **Add Configuration**:
    -   Open `packages/vue-doctor/src/oxlint-config.ts`.
    -   Add your new rule name to the appropriate category array.

5.  **Add Tests**:
    -   Create a new test file in `packages/vue-doctor/tests/` or add to an existing one.
    -   Use the `runOxlint` function to run your rule against a snippet of code and assert the diagnostics.

6.  **Verify**:
    -   Run `npm run test` to ensure your new rule works as expected and doesn't break anything else.

## Pull Request Process

1.  Fork the repository and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  Ensure the test suite passes.
4.  Update the documentation (RULES.md) if you've added or changed a rule.
5.  Submit your Pull Request!

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.
