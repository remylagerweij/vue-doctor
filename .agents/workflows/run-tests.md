---
description: Run the local test suites for Vue Doctor
---

# Build and Run Tests

Follow these steps to safely build the Vue Doctor project and execute its test suite to ensure all rules and analyzers pass as expected.

## 1. Typecheck and Build

Run typechecks and compile the package:

```bash
npm run typecheck
npm run build
```

## 2. Run Test Suite

Run all Vitest test suites:

```bash
npm run test
```

## 3. Updating Snapshots (If Applicable)

If you added new rules or modified diagnostic messages and fixture snapshot tests fail:

```bash
npm run snapshot:update
```

Review the git diff on updated snapshot files to ensure only intended changes are included.
