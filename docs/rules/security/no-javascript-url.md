# `vue-doctor/security/no-javascript-url`

> Replace the `javascript:` URL with a `<button @click>` handler, or a real URL

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-79 |
| **OWASP** | A03:2021 |

## Why it matters

Replace the `javascript:` URL with a `<button @click>` handler, or a real URL

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove `javascript:` URLs. For a placeholder link (`href="javascript:void(0)"`) use `<button type="button" @click="...">` (or `<a href="#" @click.prevent="...">`); for navigation use a real URL or `<RouterLink :to>`. Never build a URL from a `javascript:` prefix plus a variable. Comparisons such as `url.startsWith("javascript:")` are not reported.

---

*Rule source: [`vue-doctor/security/no-javascript-url`](https://github.com/remylagerweij/vue-doctor)*
