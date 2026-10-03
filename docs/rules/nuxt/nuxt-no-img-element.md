# `vue-doctor/nuxt/nuxt-no-img-element`

> Use `<NuxtImg>` from `@nuxt/image` — provides automatic optimization, lazy loading, and responsive images

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

Use `<NuxtImg>` from `@nuxt/image` — provides automatic optimization, lazy loading, and responsive images

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace `<img>` with `<NuxtImg>` (or `<NuxtPicture>`) from `@nuxt/image`; keep the same `src`, `alt`, width and height.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-img-element`](https://github.com/remylagerweij/vue-doctor)*
