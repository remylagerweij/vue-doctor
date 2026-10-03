# `vue-doctor/nuxt/nuxt-no-a-element`

> Use `<NuxtLink>` — enables client-side navigation and prefetching

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | nuxt |


## Why it matters

Use `<NuxtLink>` — enables client-side navigation and prefetching

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace internal `<a href>` links with `<NuxtLink to="...">`; keep plain `<a>` only for external URLs.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-a-element`](https://github.com/remylagerweij/vue-doctor)*
