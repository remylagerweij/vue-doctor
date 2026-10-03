# Suppressing findings

Vue Doctor has its own suppression comments. `eslint-disable` and `oxlint-disable` comments do **not** hide Vue Doctor findings, and Vue Doctor never modifies your files.

```ts
// vue-doctor-disable-next-line vue-doctor/bundle-size/no-moment -- legacy report page
import moment from "moment";
const html = render(); // vue-doctor-disable-line
/* vue-doctor-disable vue-doctor/bundle-size/no-moment */ /* vue-doctor-enable vue-doctor/bundle-size/no-moment */
// vue-doctor-disable-file no-giant-component
```

| Directive | Scope |
|-----------|-------|
| `vue-doctor-disable-next-line` | The following line |
| `vue-doctor-disable-line` | The line it is on |
| `vue-doctor-disable` / `vue-doctor-enable` | A region |
| `vue-doctor-disable-file` | The whole file |

Add an optional reason after `--`. Without a rule list every rule is suppressed. Rules are written as canonical IDs (`vue-doctor/<category>/<rule>`, `vue/<rule>`; a trailing `/*` selects a group). The 1.x forms `rule` and `vue-doctor/rule` still work, with one deprecation warning per ID per run.

## In templates

In `.vue` templates use HTML comments:

```vue
<!-- vue-doctor-disable-next-line vue-doctor/security/no-unsafe-html-sink -->
<div v-html="trustedHtml" />
```

## In `.env` files

Findings of the project checks that point into a `.env*` file (for example `vue-doctor/security/no-secret-in-public-env-file`) are suppressed with a `#` comment:

```dotenv
# vue-doctor-disable-next-line vue-doctor/security/no-secret-in-public-env-file -- the key is restricted to this origin
VITE_MAPS_SECRET_KEY=...
```

Programmatic results from `diagnose()` include `suppressed: { count, byRule }` and `foreignDirectives` (ESLint/oxlint directives that were ignored).
