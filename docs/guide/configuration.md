# Configuration

Vue Doctor works without configuration.

Put one config file in the project root: `vue-doctor.config.ts` (or `.mts`, `.js`, `.mjs`, `.json`), or a `vueDoctor` key in `package.json`. Parent directories are never searched.

```ts
// vue-doctor.config.ts
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  extends: ["vue-doctor/recommended"], // or "vue-doctor/strict", "vue-doctor/security"
  rules: {
    "vue-doctor/architecture/no-giant-component": "off",
    "vue-doctor/security/no-unsafe-html-sink": "error",
  },
  ignore: { files: ["src/legacy/**"], rules: ["vue-doctor/correctness/no-prevent-default"] },
  gate: { failOn: "error", scope: "new", minScore: 70 },
  deadCode: true,
});
```

```json
{
  "$schema": "./node_modules/@remylagerweij/vue-doctor/schema/vue-doctor.schema.json",
  "ignore": { "files": ["src/legacy/**"] }
}
```

- `rules` sets a severity (`"off"`, `"warn"`, `"error"`) per rule. Rule IDs are `vue-doctor/<category>/<rule>`, `vue/<rule>` and `knip/<type>` (see [Rules](/rules/)); the 1.x forms still work but are deprecated.
- A rule that documents options takes them next to the severity: `["warn", { ... }]` (see [Rule options](#rule-options)).
- `gate`, `lint`, `deadCode`, `verbose` and `diff` are defaults; command-line flags win.
- The config is validated: unknown keys and invalid values exit with code 2 and say what is wrong.
- `.ts`/`.js` configs are executed. Use JSON when scanning untrusted code.

## Test files

Rules about shipped code do not run on test files: Nuxt rendering rules (`nuxt-no-window-in-ssr` and the other `vue-doctor/nuxt/*` rules except `security-headers` and `no-secret-in-public-runtime-config`), every `performance` and `bundle-size` rule, `no-direct-dom-manipulation`, `no-prevent-default`, the component-structure rules (`no-async-setup-without-suspense`, `prefer-defineProps-destructure`, `require-defineprops-types`, `require-emits-declaration`, `no-giant-component`, `no-nested-component-definition`), `router-no-string-push` and `server-no-console-in-handler`. Each rule's page says whether it checks test files. Security rules always run on them.

A test file is, relative to the project root: `*.spec.*`, `*.test.*`, `*.cy.*` and `*.e2e.*` scripts (and `*.spec.vue` / `*.test.vue`), anything under a `test/`, `tests/`, `__tests__/`, `__mocks__/`, `__fixtures__/`, `e2e/` or `cypress/` directory, and `vitest`, `playwright`, `cypress` and `jest` config files (including variants such as `vitest.component.config.ts`).

## Nuxt projects

Run `nuxi prepare` (or any `nuxi dev`/`build`) before scanning a fresh checkout. Knip reads Nuxt's auto-imports and path aliases from the generated `.nuxt/` directory; without it every page, component and composable looks unused. When a Nuxt project has no `.nuxt/`, Vue Doctor still reports duplicate exports but leaves out unused files, exports and types, and lists the dead-code analyzer as incomplete with a reminder to run `nuxi prepare`. That partial result is never cached.

Rules read `ssr` and the `ssr` of each `routeRules` entry from `nuxt.config` (statically: only literal keys and values count), so `nuxt-no-window-in-ssr` does not report pages that Nuxt never renders on the server.

See the [configuration reference](/reference/config) for every key. For one-off exceptions prefer [inline suppression comments](/guide/suppressions).

## Rule options

Some rules accept options, listed under "Options" on their rule page. Give them next to the severity, on a single rule ID (not a `/*` group):

```json
{
  "rules": {
    "vue-doctor/server/require-input-validation": ["warn", { "validators": ["parseBody", "parseQuery"] }],
    "vue-doctor/server/auth-missing": ["warn", { "authFunctions": ["ensureAdmin"] }]
  }
}
```

- An unknown option name or a value of the wrong type is a config error (exit code 2). Options given to a rule that takes none are ignored with a warning.
- On Nuxt projects the server rules also learn from the project itself, and receive that as the same options: `server/utils` functions that read the session and throw a 401/403 become `authFunctions`, and the session cookie's SameSite from `nuxt.config` becomes `sessionCookieSameSite`. Lists you configure are added to what is found; other values you configure win.
