# `vue-doctor/accessibility/require-button-name`

> Give the button text, or an `aria-label` when it only shows an icon

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/require-button-name": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Give the button text, or an `aria-label` when it only shows an icon

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Screen readers announce a button by its text. For an icon-only button add an `aria-label` that says what it does (`aria-label="Close dialog"`, `:aria-label="t('menu.open')"`) or visually hidden text (`<span class="sr-only">Close</span>`), and mark the icon `aria-hidden="true"`. A `title` alone also gives a name. Reported only for native `<button>` elements whose content has no text: text, `&#123;&#123; &#125;&#125;`, components, slots, `v-html`/`v-text`, an `<img>` with `alt` and an `<svg>` with a `<title>` all count as a name. The root element of a component is not reported: attributes and listeners the parent passes fall through to it.

---

*Rule source: [`vue-doctor/accessibility/require-button-name`](https://github.com/remylagerweij/vue-doctor)*
