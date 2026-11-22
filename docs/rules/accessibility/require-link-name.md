# `vue-doctor/accessibility/require-link-name`

> Give the link text, or an `aria-label` when it only shows an icon or image

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/require-link-name": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Give the link text, or an `aria-label` when it only shows an icon or image

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Screen readers announce a link by its text. For an icon-only or image-only link add an `aria-label` that says where it goes (`aria-label="Open settings"`), give the image a meaningful `alt`, or add visually hidden text (`<span class="sr-only">Settings</span>`). Mark the icon itself `aria-hidden="true"`. Reported for `<a href>`, `<RouterLink>` and `<NuxtLink>` (without `custom`) whose content has no text: text, `&#123;&#123; &#125;&#125;`, components, slots, `v-html`/`v-text`, an `<img>` with `alt` and an `<svg>` with a `<title>` all count as a name. The root element of a component is not reported: attributes and listeners the parent passes fall through to it.

---

*Rule source: [`vue-doctor/accessibility/require-link-name`](https://github.com/remylagerweij/vue-doctor)*
