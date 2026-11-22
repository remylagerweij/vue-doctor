# `vue-doctor/accessibility/no-invalid-role`

> Use a concrete WAI-ARIA role (`button`, `dialog`, `navigation`…); unknown and abstract roles are ignored

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/no-invalid-role": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Use a concrete WAI-ARIA role (`button`, `dialog`, `navigation`…); unknown and abstract roles are ignored

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace the value of `role` with a concrete WAI-ARIA role that describes the element (for example `button`, `link`, `dialog`, `tab`, `navigation`), or remove `role` when the native element already has the right semantics (prefer `<button>` over `<div role="button">`). Abstract roles such as `widget`, `section`, `input` or `landmark` are not allowed in content, and misspelled roles fall back to no role at all. Every token of a space-separated fallback list must be valid. Only literal values on native HTML and SVG elements are checked; bound `:role` values are not.

---

*Rule source: [`vue-doctor/accessibility/no-invalid-role`](https://github.com/remylagerweij/vue-doctor)*
