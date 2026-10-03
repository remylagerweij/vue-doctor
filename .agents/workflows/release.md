---
description: Release a new version of Vue Doctor and move the GitHub Action tag
---

# Release Workflow

Follow these steps to release a new version of `@remylagerweij/vue-doctor` to npm and update the moving GitHub Action tag.

## 1. Ensure Clean Working Directory & Passing Tests

```bash
git status
npm run typecheck
npm run test
npm run docs:build
```

## 2. Prepare Version Bump with Changesets

If you have pending changesets:
```bash
npm run version
```
This consumes changesets from `.changeset/`, updates `package.json` version numbers, and updates `CHANGELOG.md`.

## 3. Commit and Tag Release

Commit the version bump and create a git release tag:

```bash
git add .
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

## 4. Publish to npm with Provenance

Build the production artifacts and publish to npm:

```bash
npm run build
npm run release
```

*Note: In GitHub Actions CI, publishing is automatically handled when changes are merged to `main` with provenance enabled.*

## 5. Move the Major Action Tag

For major versions (e.g. `v2`), update the floating tag so users referencing `uses: remylagerweij/vue-doctor@v2` automatically receive the latest stable patch/minor update:

```bash
git tag -fa v2 -m "Release vX.Y.Z"
git push origin v2 --force
git push origin --tags
```
