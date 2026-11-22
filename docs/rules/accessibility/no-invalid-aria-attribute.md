# `vue-doctor/accessibility/no-invalid-aria-attribute`

> Use only `aria-*` attributes defined by WAI-ARIA; fix the spelling (`aria-labelledby`, not `aria-labeledby`)

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/no-invalid-aria-attribute": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Use only `aria-*` attributes defined by WAI-ARIA; fix the spelling (`aria-labelledby`, not `aria-labeledby`)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Rename the attribute to the WAI-ARIA state or property that was meant — the finding suggests the closest one (common slips: `aria-labeledby` → `aria-labelledby`, `aria-describeby` → `aria-describedby`, `aria-role` → `role`). Browsers ignore unknown `aria-*` attributes, so the element currently has no label, description or state. If the attribute is not ARIA at all, use a `data-*` attribute instead. Native HTML and SVG elements are checked, static and bound (`:aria-x`).

---

*Rule source: [`vue-doctor/accessibility/no-invalid-aria-attribute`](https://github.com/remylagerweij/vue-doctor)*
