---
layout: home

hero:
  name: Vue Doctor
  text: A health check for Vue and Nuxt apps
  tagline: Scan your codebase for performance, security and correctness issues and get a 0-100 score with actionable recommendations.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: CLI reference
      link: /reference/cli

features:
  - title: Three analysis passes
    details: A custom oxlint plugin for Vue rules, eslint-plugin-vue for templates, and Knip for dead code, all run in parallel.
  - title: Built for CI
    details: Stable exit codes, --fail-on, --gate and --min-score flags, and a report-only stdout that is safe to pipe.
  - title: Read-only by design
    details: Vue Doctor never modifies your project files. Suppress findings with vue-doctor-disable comments.
---

## Quick start

```bash
npx vue-doctor@latest
```

Run it from the root of a Vue 3 or Nuxt project. See [Getting started](/guide/getting-started) for what happens next.
