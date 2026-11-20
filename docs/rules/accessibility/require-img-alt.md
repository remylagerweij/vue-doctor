# `vue-doctor/accessibility/require-img-alt`

> Give the image an `alt` text, or `alt=""` when it is purely decorative

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/require-img-alt": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Give the image an `alt` text, or `alt=""` when it is purely decorative

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Add an `alt` attribute that says what the image shows or does (`alt="Company logo"`, or `:alt="product.name"`). For a purely decorative image use an empty `alt=""` so screen readers skip it. For `<input type="image">` the `alt` names the button; for `<area href>` it names the link. Do not start with words like "image of". Only native `<img>`, `<area href>` and `<input type="image">` elements without `v-bind="obj"` are reported; a bound `:alt`, an `aria-label`, `aria-labelledby`, `title`, `role="presentation"` or `aria-hidden="true"` counts as handled. The root element of a component is not reported: attributes and listeners the parent passes fall through to it.

---

*Rule source: [`vue-doctor/accessibility/require-img-alt`](https://github.com/remylagerweij/vue-doctor)*
