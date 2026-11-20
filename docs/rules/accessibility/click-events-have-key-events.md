# `vue-doctor/accessibility/click-events-have-key-events`

> Use a `<button>` (or a link) for clickable elements; a `<div @click>` cannot be reached or used with the keyboard

::: tip Opt-in rule
This rule is off by default. Turn it on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/click-events-have-key-events": "warn" }`, or the whole category with `"vue-doctor/accessibility/*": "warn"` ([opt-in rules](/guide/configuration#opt-in-rules)).
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

Use a `<button>` (or a link) for clickable elements; a `<div @click>` cannot be reached or used with the keyboard

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace the clickable `<div>`/`<span>`/`<li>`/`<img>` with a native `<button type="button">` (for actions) or an `<a href>` / `<RouterLink>` (for navigation), and reset its styles with CSS if needed — native controls are focusable and react to Enter and Space by themselves. If the element must stay, add `role="button"`, `tabindex="0"` and a `@keydown.enter` / `@keydown.space` handler that calls the same function. Not reported: elements with a `role` or a key handler, `@click.self` and backdrop/overlay elements (dismissed with Escape), handlers that only stop the event, elements inside a link, button or label, elements that wrap a control, a `<slot>` or `v-html` content (the click is delegated), list items highlighted by a keyboard cursor (`:class="{ active: i === selectedIndex }"`), components, and elements with `v-bind="obj"` / `v-on="obj"`. The root element of a component is not reported: attributes and listeners the parent passes fall through to it.

---

*Rule source: [`vue-doctor/accessibility/click-events-have-key-events`](https://github.com/remylagerweij/vue-doctor)*
