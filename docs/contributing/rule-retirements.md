# Rule retirements

Rules that were removed or turned off by default, with the reason. Add a row in the same pull request that retires or demotes a rule, and link the [policy](./false-positive-policy). A retired ID keeps resolving: configuration and suppression comments that mention it warn instead of failing.

| Rule | Version | Action | Reason | Evidence |
| --- | --- | --- | --- | --- |
| `vue-doctor/nuxt/nuxt-require-server-route-error-handling` | 2.0.0 | Retired, no replacement | Nitro already turns an unhandled error into a logged, generic 500. Wrapping handlers in try/catch made errors leak or lose their status. See `vue-doctor/server/no-leaky-error-rethrow`. | Review before the benchmark existed |

Rules that were merged or split in 2.0 are listed in [Migrating from v1 to v2](/guide/migration-v2).

## Template for a new entry

- **Rule:** canonical ID.
- **Action:** off by default, or retired (with or without a replacement).
- **Reason:** one sentence on why it cannot be made precise.
- **Evidence:** benchmark run date, total findings, repositories affected, and how many sampled findings were false positives.
