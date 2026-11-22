# `vue-doctor/accessibility/require-iframe-title`

> Give the `<iframe>` a `title` that describes its content

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/require-iframe-title": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Give the `<iframe>` a `title` that describes its content

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Add a short, unique `title` to the `<iframe>` that says what it contains (`title="Store location map"`, `:title="video.title"`). Screen reader users find and enter frames by this title. An `aria-label` or `aria-labelledby` also works. For an iframe without user-facing content (a tracking or messaging frame), hide it with `aria-hidden="true"` and `tabindex="-1"` instead. The root element of a component is not reported: attributes and listeners the parent passes fall through to it.

---

*Rule source: [`vue-doctor/accessibility/require-iframe-title`](https://github.com/remylagerweij/vue-doctor)*
