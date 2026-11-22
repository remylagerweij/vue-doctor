# `vue-doctor/correctness/no-instance-api-after-await`

> Call lifecycle hooks, `provide`/`inject` and instance composables before the first `await`, then use their results after it

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `off` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.5.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


::: tip Opt-in preview rule
This rule is off by default. Enable it by naming it in your config: `rules: { "vue-doctor/correctness/no-instance-api-after-await": "warn" }` (a `/*` group key does not enable it). See [Preview rules](/guide/configuration#preview-rules).
:::

## Why it matters

Call lifecycle hooks, `provide`/`inject` and instance composables before the first `await`, then use their results after it

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Vue only knows which component is running while setup executes synchronously. After an `await` inside an async function (a composable, an `async setup()`, an event handler, a hook callback) the instance is gone: `onMounted`/`onUnmounted` and other hooks never register, `provide` does nothing, `inject`, `useRoute()`, `useRouter()` and `useI18n()` return undefined or throw. Move the call above the first `await` and keep its result in a variable (`const router = useRouter()` at the top of setup, then `router.push()` after the await), or register the hook synchronously and let it read state the async code fills in. Top-level `await` in `<script setup>` is not reported (the compiler restores the instance there), nor are Nuxt plugins, route middleware, `defineNuxtComponent` setup and `definePageMeta` callbacks (Nuxt restores its context).

---

*Rule source: [`vue-doctor/correctness/no-instance-api-after-await`](https://github.com/remylagerweij/vue-doctor)*
