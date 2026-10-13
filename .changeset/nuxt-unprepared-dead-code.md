---
"@remylagerweij/vue-doctor": patch
---

Dead-code analysis no longer reports every page, component and server route of a Nuxt project as unused when `.nuxt/` is missing (a fresh checkout before `nuxi prepare`). Knip needs Nuxt's generated types to see auto-imports and aliases, so in that case unused files, exports and types are left out, the dead-code analyzer is listed as incomplete with a reminder to run `nuxi prepare`, and the partial result is not cached. The dead-code cache key now covers the generated `.nuxt/` files knip reads, so a scan after `nuxi prepare` analyses again instead of reusing the result from before.
