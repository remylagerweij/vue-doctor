# `vue-doctor/reactivity/no-unowned-watcher`

> Create the watcher synchronously in setup, or keep its stop handle (`const stop = watch(...)`) and call `stop()` when it is no longer needed

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `off` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.5.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


::: tip Opt-in preview rule
This rule is off by default. Enable it by naming it in your config: `rules: { "vue-doctor/reactivity/no-unowned-watcher": "warn" }` (a `/*` group key does not enable it). See [Preview rules](/guide/configuration#preview-rules).
:::

## Why it matters

Create the watcher synchronously in setup, or keep its stop handle (`const stop = watch(...)`) and call `stop()` when it is no longer needed

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

A `watch`/`watchEffect` created synchronously in setup belongs to the component and stops when it unmounts. One created after an `await` or inside a timer, promise, event-listener or watch callback belongs to nothing: it keeps running after the component is gone (a memory leak and stale side effects), and a new one is added every time that code runs. Create the watcher in setup and let it react to state the async code sets, or keep the handle (`const stop = watch(...)`) and call `stop()` in `onUnmounted`, or create it inside an `effectScope().run()` you dispose. Only code that runs for a component is checked (a `.vue` file, a composable `useX`, a component `setup()`); watchers in app bootstrap code (`main.ts`, plugins, module top level), watchers whose handle is kept and `{ once: true }` watchers are not reported.

---

*Rule source: [`vue-doctor/reactivity/no-unowned-watcher`](https://github.com/remylagerweij/vue-doctor)*
