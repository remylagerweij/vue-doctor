---
description: Run the local test suites for Vue Doctor
---

# Build and Run Tests

Follow these steps to safely build the Vue Doctor project and execute its test suite to ensure all rules and analyzers pass as expected.

// turbo-all
1. Navigate to the root of the workspace.
2. Run the build script using `npm run build`.
3. Run the test script using `npm run test`.
4. Review the test output. If any tests fail, identify the failing assertions and debug appropriately using Vitest or `console.log` within the test files.
