---
description: Upgrade Oxlint dependency and verify custom JS plugin compatibility
---

# Upgrade Oxlint

Follow these steps to safely bump the Oxlint version used by Vue Doctor.

## 1. Check Upstream Oxlint Releases

Inspect the latest Oxlint release notes for breaking changes to the JS plugin API, CLI arguments, or AST structure:
- https://github.com/oxc-project/oxc/releases

## 2. Update Version in package.json

Update `oxlint` in both root `package.json` and `packages/vue-doctor/package.json`:

```json
"dependencies": {
  "oxlint": "^x.y.z"
}
```

Then run `npm install`.

## 3. Verify Plugin API & Run Tests

Verify that our custom plugin runner and all rule cases pass against the new Oxlint binary:

```bash
npm run build
npm run test
```

## 4. Run Fixture Scans

Verify that scanning the fixtures works as expected and yields expected diagnostic results:

```bash
node packages/vue-doctor/dist/cli.js tests/fixtures/bad-project
```

## 5. Update Snapshots & Create Changeset

If minor formatting or line/column calculation differences occur upstream:
```bash
npm run snapshot:update
npm run changeset
```
