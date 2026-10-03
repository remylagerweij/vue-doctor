# `vue-doctor/performance/no-scale-from-zero`

> Use `initial=&#123;&#123; scale: 0.95, opacity: 0 &#125;&#125;` — elements should deflate like a balloon, not vanish into a point

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `initial=&#123;&#123; scale: 0.95, opacity: 0 &#125;&#125;` — elements should deflate like a balloon, not vanish into a point

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Start scale animations from a value close to 1 such as 0.95 combined with opacity, instead of 0, so the element does not collapse to a point.

---

*Rule source: [`vue-doctor/performance/no-scale-from-zero`](https://github.com/remylagerweij/vue-doctor)*
