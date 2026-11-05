# `vue-doctor/reactivity/no-ref-from-prop`

> Remove the ref and derive inline: `const value = computed(() => transform(props.propName))`

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Remove the ref and derive inline: `const value = computed(() => transform(props.propName))`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not copy a prop into a `ref()` that is never updated again; the copy goes stale when the prop changes. Use `computed(() => props.x)` for derived values, or emit an event to the parent when the value must be edited. Copies that are written later (an editable draft, a ref re-synced by `watch(() => props.x, ...)`) and `initial*`/`default*` seed props are not reported.

---

*Rule source: [`vue-doctor/reactivity/no-ref-from-prop`](https://github.com/remylagerweij/vue-doctor)*
