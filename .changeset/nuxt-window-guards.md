---
"@remylagerweij/vue-doctor": patch
---

`nuxt-no-window-in-ssr` recognises more code that never runs on the server: `onBeforeMount` and VueUse event helpers, functions that are only called from lifecycle hooks, DOM event listeners or template event handlers (followed through helper chains in the same file), `watch` callbacks without `immediate`, post-flush effects, same-file guard helpers such as `function isBrowser() { return typeof window !== "undefined" }`, and pages whose route has `ssr: false` in the `routeRules` of `nuxt.config` (or a client-only app with `ssr: false`). Functions exported from a module or returned from a composable are still reported, since their callers are in other files.
