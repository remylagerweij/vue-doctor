# `vue-doctor/nuxt/nuxt-no-window-in-ssr`

> Guard browser globals with `if (import.meta.client)` or access them inside `onMounted()`

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Guard browser globals with `if (import.meta.client)` or access them inside `onMounted()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Browser globals do not exist during SSR. Guard access with `if (import.meta.client)` or move it into `onMounted()`. Code that only runs from client-only places is already fine: lifecycle hooks other than setup, template event handlers, DOM event listeners, `watch` callbacks without `immediate`, post-flush effects, `*.client.*` files and pages with `ssr: false` in `routeRules`. A function that is exported or returned from a composable cannot be traced to its callers; guard it inside.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-window-in-ssr`](https://github.com/remylagerweij/vue-doctor)*
