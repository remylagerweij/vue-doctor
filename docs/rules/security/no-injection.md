# `vue-doctor/security/no-injection`

> Pass values as query parameters (`?` / `$1`) or a tagged `sql` template, and run commands with `execFile`/`spawn` and an argument array, never through a shell string

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-89, CWE-78 |
| **OWASP** | A03:2021 |

## Why it matters

Pass values as query parameters (`?` / `$1`) or a tagged `sql` template, and run commands with `execFile`/`spawn` and an argument array, never through a shell string

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

SQL: do not build the statement with a template literal or `+` around request data. Use placeholders and pass the values separately (`db.query('SELECT * FROM users WHERE id = $1', [id])`, `pool.execute('... WHERE id = ?', [id])`), the tagged template of your client (Prisma `$queryRaw`\`...\``, Drizzle `sql\`...\``, `postgres` sql\`...\``), or the query builder. Identifiers (table or column names) cannot be bound: pick them from a fixed allowlist. Commands: replace `exec(\`cmd ${x}\`)` / `execSync` with `execFile('cmd', [x])` or `spawn('cmd', [x])` and do not set `shell: true`; validate the argument (allowlist or strict schema) as well. If the interpolated value is a constant or an allowlisted identifier, say so in a comment and suppress this finding with `vue-doctor-disable-next-line`.

---

*Rule source: [`vue-doctor/security/no-injection`](https://github.com/remylagerweij/vue-doctor)*
