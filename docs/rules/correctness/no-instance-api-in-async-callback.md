# `vue-doctor/correctness/no-instance-api-in-async-callback`

> Register hooks and call `provide`/`inject` synchronously in setup; inside the callback, only use what setup already obtained

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
This rule is off by default. Enable it by naming it in your config: `rules: { "vue-doctor/correctness/no-instance-api-in-async-callback": "warn" }` (a `/*` group key does not enable it). See [Preview rules](/guide/configuration#preview-rules).
:::

## Why it matters

Register hooks and call `provide`/`inject` synchronously in setup; inside the callback, only use what setup already obtained

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Callbacks passed to `setTimeout`, `setInterval`, `requestAnimationFrame`, `nextTick`, `.then()/.catch()/.finally()`, `addEventListener` or a (non-immediate) `watch` run after setup has returned, when no component is active. Lifecycle hooks registered there never fire, `provide` does nothing and `inject`, `useRoute()`, `useRouter()` and `useI18n()` return undefined. Call the API synchronously in setup and keep the result (`const route = useRoute()`; `onUnmounted(() => clearTimeout(timer))`), then use that value inside the callback. Hooks called inside another hook's callback (`onMounted(() => onUnmounted(...))`) are fine and not reported.

---

*Rule source: [`vue-doctor/correctness/no-instance-api-in-async-callback`](https://github.com/remylagerweij/vue-doctor)*
