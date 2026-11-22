# `vue-doctor/accessibility/no-aria-hidden-on-focusable`

> Do not put `aria-hidden="true"` on an element that can receive keyboard focus

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/no-aria-hidden-on-focusable": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Do not put `aria-hidden="true"` on an element that can receive keyboard focus

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

An element with `aria-hidden="true"` is removed from the accessibility tree, but keyboard users can still tab to it — screen readers then announce nothing. Either remove `aria-hidden` (when the control is meant to be used), or also take it out of the focus order with `tabindex="-1"` (or `disabled`, or `inert` on a hidden container) when it is a decorative or duplicated control. Only native focusable elements (links with `href`, buttons, form controls, `summary`, elements with `tabindex` 0 or higher) with a literal `aria-hidden="true"` are reported.

---

*Rule source: [`vue-doctor/accessibility/no-aria-hidden-on-focusable`](https://github.com/remylagerweij/vue-doctor)*
