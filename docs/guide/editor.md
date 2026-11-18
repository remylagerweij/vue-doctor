# Editor integration

The Vue Doctor CLI is the full tool. The same rules that analyse `<script>` code are also published as a plugin, so
you can see their findings while you type, in an editor that runs [Oxlint](https://oxc.rs) or ESLint.

The plugin is the `@remylagerweij/vue-doctor/eslint-plugin` export of the package. It works with Oxlint's JS plugin
support and with ESLint 9 and 10 flat configs, and it ships two ready-made rule sets:

| Preset | Contents |
|---|---|
| `configs.recommended` | Every script rule that is on by default and applies to any Vue project. |
| `configs.nuxt` | `recommended` plus the Nuxt-only rules, and the setting that tells the rules the project is a Nuxt app. |

Rules and severities match what the CLI enables, so a finding in the editor is a finding in `vue-doctor`.

## What the editor covers, and what it does not

| Covered in the editor | CLI only |
|---|---|
| Script rules (`<script>`, `.js`, `.ts`): security, reactivity, correctness, performance, bundle size, Nuxt, server | Template rules (`vue/*` and the template half of own rules) |
| | Filesystem rules: committed secrets, lockfile integrity, sensitive files in `public/` |
| | Dependency audit (`--audit`) |
| | Dead code (Knip) |
| | The 0-100 score, baselines, gates, reports and `--fix` codemods |

Three script rules are not part of the presets, because the CLI only turns them on when it detects a toolchain
feature of the project (TypeScript, Vue 3.5 props destructure, the `@nuxt/image` module) and an editor setup has no
such detection. Add them by hand when your project qualifies; see [Plugin rule lists](./oxlint-rules#rules-the-presets-leave-out).

Some server rules (`auth-missing`, `csrf-on-mutating-routes`) learn about your project from the CLI: it finds your
`server/utils` auth helpers and session cookie settings and passes them to the rules as options. In the editor they
run with their defaults, so they can be noisier. Set the options yourself, for example
`"vue-doctor/auth-missing": ["warn", { "authFunctions": ["ensureAdmin"] }]`.

## Oxlint

Install `oxlint` and the package, then pick the form of config you use.

```sh
npm install --save-dev oxlint @remylagerweij/vue-doctor
```

### `oxlint.config.ts`

A config file written in TypeScript can import the preset, so the rule list never goes stale:

```ts
import { defineConfig } from "oxlint";
import vueDoctor from "@remylagerweij/vue-doctor/eslint-plugin";

export default defineConfig({
  jsPlugins: ["@remylagerweij/vue-doctor/eslint-plugin"],
  rules: vueDoctor.configs.recommended.rules,
});
```

For a Nuxt project use the `nuxt` preset and pass its settings on:

```ts
export default defineConfig({
  jsPlugins: ["@remylagerweij/vue-doctor/eslint-plugin"],
  rules: vueDoctor.configs.nuxt.rules,
  settings: vueDoctor.configs.nuxt.settings,
});
```

Pass `rules` (and `settings`) rather than the whole preset object: the preset is an ESLint flat config object, and its
`plugins` key means something else to Oxlint.

### `.oxlintrc.json`

Per the Oxlint documentation, `extends` in `.oxlintrc.json` takes file paths and does not support package imports, so
a JSON config lists the rules itself. The full list is generated from the rule registry on
[Plugin rule lists](./oxlint-rules). The shape is:

```json
{
  "jsPlugins": ["@remylagerweij/vue-doctor/eslint-plugin"],
  "rules": {
    "vue-doctor/no-eval": "error",
    "vue-doctor/no-moment": "warn"
  }
}
```

For Nuxt add the Nuxt-only rules from that page and `"settings": { "vue-doctor": { "framework": "nuxt" } }`.

Rule names are the flat names (`vue-doctor/no-eval`), not the `vue-doctor/security/no-eval` IDs the CLI prints.
The plugin path is resolved relative to the config file.

Oxlint also runs its own default rules. If you only want Vue Doctor's findings, turn the built-in categories off:
`"categories": { "correctness": "off" }`.

Then run it:

```sh
npx oxlint -c .oxlintrc.json src
```

```text
src/Bad.vue:2:31: error vue-doctor(no-eval): eval() is a security risk — use safer alternatives
```

Oxlint lints the `<script>` block of `.vue` files. Per its documentation, JS plugins do not yet support custom file
formats and parsers for Vue, which is why template checks stay in the CLI, and JS plugins are in alpha.

### VS Code and other editors

The Oxlint language server reads the same `.oxlintrc.json` / `oxlint.config.ts`, and the Oxlint documentation lists
language server support for JS plugins. Install the Oxc extension (`oxc.oxc-vscode`) or the Oxlint integration of
your editor and keep the config at the project root. Vue Doctor's own tests exercise the command line only; check that
the diagnostics show up in your editor after you set it up, and report an issue if they do not.

## ESLint

In an ESLint flat config the presets are config objects with the plugin already attached. You need
`vue-eslint-parser` for `.vue` files and, for `lang="ts"`, `@typescript-eslint/parser` as its script parser:

```js
// eslint.config.js
import vueParser from "vue-eslint-parser";
import tsParser from "@typescript-eslint/parser";
import vueDoctor from "@remylagerweij/vue-doctor/eslint-plugin";

export default [
  {
    files: ["**/*.vue"],
    languageOptions: { parser: vueParser, parserOptions: { parser: tsParser, sourceType: "module" } },
  },
  { files: ["**/*.{ts,mts}"], languageOptions: { parser: tsParser } },
  { ...vueDoctor.configs.recommended, files: ["**/*.{js,ts,vue}"] }, // or configs.nuxt
];
```

```text
src/Bad.vue
  2:31  error  eval() is a security risk — use safer alternatives  vue-doctor/no-eval
```

The ESLint extension for VS Code, and any editor with ESLint support, picks this up from `eslint.config.js`. Only the
script rules apply here too; `eslint-plugin-vue` and its own presets remain the way to get template rules inside ESLint.

## Using both

The CLI runs its own bundled Oxlint with its own generated config, so the editor setup and `vue-doctor` do not
interfere. The CLI does read your project's ESLint and Oxlint config files to honour rules you turned `off`
(except security, supply-chain and server rules), see [Configuration](./configuration). Keep severity overrides in
`vue-doctor.config.ts` if you want the CLI and the editor to agree. For commit-time checks see
[Pre-commit](./pre-commit).
