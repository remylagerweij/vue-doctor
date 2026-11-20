# `vue-doctor/accessibility/role-has-required-aria-props`

> Add the state the role requires: `aria-checked` for checkbox/radio/switch, `aria-valuenow` for slider, `aria-expanded` for combobox

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/role-has-required-aria-props": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
:::

| Property | Value |
|---|---|
| **Category** | Accessibility |
| **Default Severity** | `off` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.5.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Add the state the role requires: `aria-checked` for checkbox/radio/switch, `aria-valuenow` for slider, `aria-expanded` for combobox

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

A custom widget must expose its state, or assistive technology cannot tell whether it is checked, expanded or at what value. Bind the required attribute to the component state: `role="checkbox" :aria-checked="checked"`, `role="switch" :aria-checked="enabled"`, `role="slider" :aria-valuenow="value"` (with `aria-valuemin` / `aria-valuemax`), `role="combobox" :aria-expanded="open"`. Better still, use the native control (`<input type="checkbox">`, `<input type="range">`), which has the state built in. Only literal roles on native elements without `v-bind="obj"` are checked. The root element of a component is not reported: attributes and listeners the parent passes fall through to it.

---

*Rule source: [`vue-doctor/accessibility/role-has-required-aria-props`](https://github.com/remylagerweij/vue-doctor)*
