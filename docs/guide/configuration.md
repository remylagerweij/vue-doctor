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

See the [configuration reference](/reference/config) for every key. For one-off exceptions prefer [inline suppression comments](/guide/suppressions).
