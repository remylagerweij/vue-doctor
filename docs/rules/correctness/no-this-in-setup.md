# `vue-doctor/correctness/no-this-in-setup`

> Use refs, props and composables instead of `this` in `<script setup>`

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `error` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use refs, props and composables instead of `this` in `<script setup>`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

`this` does not exist in `<script setup>` or inside `setup()`. Use the refs, props and composables returned/declared in the setup scope instead.

---

*Rule source: [`vue-doctor/correctness/no-this-in-setup`](https://github.com/remylagerweij/vue-doctor)*
