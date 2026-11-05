---
"@remylagerweij/vue-doctor": patch
---

Dogfood improvements:
- Support pnpm 9 `catalog:` protocol versions from `pnpm-workspace.yaml` in monorepos.
- Infer Vue version for Nuxt applications that don't list a direct `vue` dependency in `package.json`.
- Prevent plain Vue workspaces in monorepos from erroneously inheriting a sibling workspace's `nuxt` framework.
- Ignore type-only imports (`import type ...`) across import rules (`nuxt-no-head-import`, `no-barrel-import`, `prefer-dynamic-import`, `no-moment`, `no-full-lodash-import`).
- Filter out test files and fixtures from Knip dead file findings.
