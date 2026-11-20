# `vue-doctor/accessibility/no-positive-tabindex`

> Use `tabindex="0"` (or none) instead of a positive `tabindex`, and order focus through the DOM order

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/no-positive-tabindex": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Use `tabindex="0"` (or none) instead of a positive `tabindex`, and order focus through the DOM order

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace the positive `tabindex` with `tabindex="0"` (focusable in document order), or remove it from elements that are focusable already (links, buttons, form controls). If the focus order is wrong, reorder the elements in the template and position them with CSS instead. A positive value moves the element ahead of everything else on the page. Only literal values (`tabindex="2"`, `:tabindex="2"`) on native elements are reported.

---

*Rule source: [`vue-doctor/accessibility/no-positive-tabindex`](https://github.com/remylagerweij/vue-doctor)*
