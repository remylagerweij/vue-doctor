# `vue-doctor/security/no-unsafe-html-sink`

> Sanitize the HTML with DOMPurify (`el.innerHTML = DOMPurify.sanitize(html)`), or render text with `&#123;&#123; &#125;&#125;` / `textContent`

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-79 |
| **OWASP** | A03:2021 |

## Why it matters

Sanitize the HTML with DOMPurify (`el.innerHTML = DOMPurify.sanitize(html)`), or render text with `&#123;&#123; &#125;&#125;` / `textContent`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not assign unsanitised strings to `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `document.write` or `h(tag, { innerHTML })`. Prefer text: `el.textContent = value`, or `&#123;&#123; value &#125;&#125;` in templates. If HTML is really required, sanitize it right at the sink, for example `el.innerHTML = DOMPurify.sanitize(html)`, so the sanitizer call is visible next to the sink. Literal strings and values passed through a sanitizer call are not reported.

---

*Rule source: [`vue-doctor/security/no-unsafe-html-sink`](https://github.com/remylagerweij/vue-doctor)*
