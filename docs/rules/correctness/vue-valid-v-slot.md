# `vue/valid-v-slot`

> Use `v-slot` only on `<template>` elements or component direct children

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `error` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `v-slot` only on `<template>` elements or component direct children

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Use `v-slot` (or `#`) only on `<template>` or on a component's direct slot, with a valid name and at most one default slot.

---

*Rule source: [`vue/valid-v-slot`](https://github.com/remylagerweij/vue-doctor)*
