# `vue-doctor/reactivity/no-setup-props-destructure`

> Keep `props` whole in `setup(props)` and read `props.x` where it is used, or use `toRefs(props)` / `toRef(props, 'x')`

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `off` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.5.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


::: tip Opt-in preview rule
This rule is off by default. Enable it by naming it in your config: `rules: { "vue-doctor/reactivity/no-setup-props-destructure": "warn" }` (a `/*` group key does not enable it). See [Preview rules](/guide/configuration#preview-rules).
:::

## Why it matters

Keep `props` whole in `setup(props)` and read `props.x` where it is used, or use `toRefs(props)` / `toRef(props, 'x')`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

In a `setup(props)` function (Options-style component, `defineComponent({ setup })`) `props` is a reactive object. Destructuring it, in the parameter list (`setup({ title })`) or in the setup body (`const { title } = props`), copies the values once: computed properties, watchers and the template never see later prop changes. Use `props.title` where the value is read, or `const { title } = toRefs(props)` and `title.value`. This is about `setup()`; destructuring `defineProps()` in `<script setup>` is reactive since Vue 3.5 and is not reported. Destructuring inside a nested function (a computed getter, a watcher, a handler) re-reads the props each time and is fine. `initialX` / `defaultX` props, seeds copied once on purpose, are not reported.

---

*Rule source: [`vue-doctor/reactivity/no-setup-props-destructure`](https://github.com/remylagerweij/vue-doctor)*
