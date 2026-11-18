# `vue-doctor/bundle-size/no-full-lodash-import`

> Import the specific function: `import debounce from 'lodash/debounce'` — saves ~70kb

| Property | Value |
|---|---|
| **Category** | Bundle Size |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | Yes (`--fix`) |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Import the specific function: `import debounce from 'lodash/debounce'` — saves ~70kb

## How to fix

This rule is automatically fixable. Run `npx @remylagerweij/vue-doctor@latest . --fix` to apply the codemod.

## Agent Guidance

Import the single function (`import debounce from 'lodash/debounce'`) or switch to `lodash-es`/native code instead of importing the full library.

---

*Rule source: [`vue-doctor/bundle-size/no-full-lodash-import`](https://github.com/remylagerweij/vue-doctor)*
