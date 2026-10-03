# `vue/no-use-v-if-with-v-for`

> Move `v-if` to a wrapper element or use `computed` to filter the list

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Move `v-if` to a wrapper element or use `computed` to filter the list

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not put `v-if` and `v-for` on the same element. Filter the list in a `computed` and iterate the result, or move `v-if` to a wrapping `<template>`.

---

*Rule source: [`vue/no-use-v-if-with-v-for`](https://github.com/remylagerweij/vue-doctor)*
