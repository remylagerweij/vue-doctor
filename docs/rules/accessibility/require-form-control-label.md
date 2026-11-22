# `vue-doctor/accessibility/require-form-control-label`

> Associate a `<label>` with the form control, or give it an `aria-label`

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/require-form-control-label": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
:::

| Property | Value |
|---|---|
| **Category** | Accessibility |
| **Default Severity** | `off` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.5.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Associate a `<label>` with the form control, or give it an `aria-label`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Give the control a visible label: wrap it (`<label>Email <input v-model="email"></label>`) or point a label at its id (`<label for="email">Email</label><input id="email">`). Text next to the control is not a label, and neither is a `<label for>` whose id does not exist. When there is no room for visible text, add `aria-label` (or `aria-labelledby` pointing at existing text). Without a label, screen readers announce only "edit text" or "combo box". Not reported: controls with an `id` (a `<label for>` may point at it, also from another component), a `placeholder` or `title`, controls inside a `<label>` or a field component (`<el-form-item>`, `<UFormField>`, any component with a `label`), controls at the root of their component or in a component that shows no text of its own (the caller labels it), hidden controls (`hidden`, `v-show="false"`, `display: none`), file inputs with a `ref` (opened by an upload button), a bound `:type`, and `v-bind="obj"`.

---

*Rule source: [`vue-doctor/accessibility/require-form-control-label`](https://github.com/remylagerweij/vue-doctor)*
