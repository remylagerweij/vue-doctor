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
- `gate`, `lint`, `deadCode`, `verbose` and `diff` are defaults; command-line flags win.
- The config is validated: unknown keys and invalid values exit with code 2 and say what is wrong.
- `.ts`/`.js` configs are executed. Use JSON when scanning untrusted code.

## Test files

Rules about shipped code do not run on test files: Nuxt rendering rules (`nuxt-no-window-in-ssr` and the other `vue-doctor/nuxt/*` rules except `security-headers` and `no-secret-in-public-runtime-config`), every `performance` and `bundle-size` rule, `no-direct-dom-manipulation`, `no-prevent-default`, the component-structure rules (`no-async-setup-without-suspense`, `prefer-defineProps-destructure`, `require-defineprops-types`, `require-emits-declaration`, `no-giant-component`, `no-nested-component-definition`), `router-no-string-push` and `server-no-console-in-handler`. Each rule's page says whether it checks test files. Security rules always run on them.

A test file is, relative to the project root: `*.spec.*`, `*.test.*`, `*.cy.*` and `*.e2e.*` scripts (and `*.spec.vue` / `*.test.vue`), anything under a `test/`, `tests/`, `__tests__/`, `__mocks__/`, `__fixtures__/`, `e2e/` or `cypress/` directory, and `vitest`, `playwright`, `cypress` and `jest` config files (including variants such as `vitest.component.config.ts`).

See the [configuration reference](/reference/config) for every key. For one-off exceptions prefer [inline suppression comments](/guide/suppressions).
