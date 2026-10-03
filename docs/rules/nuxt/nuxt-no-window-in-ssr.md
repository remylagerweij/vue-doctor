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


## Why it matters

Guard browser globals with `if (import.meta.client)` or access them inside `onMounted()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Browser globals do not exist during SSR. Guard access with `if (import.meta.client)` or move it into `onMounted()`.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-window-in-ssr`](https://github.com/remylagerweij/vue-doctor)*
