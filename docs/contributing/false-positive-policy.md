# False-positive policy

A false positive is a correctness bug in Vue Doctor, not a matter of taste. A finding that is wrong on working code costs the user trust, and the cost is paid on every scan. We treat reports about it like any other bug.

## Reporting a false positive

Open an issue with:

- the rule ID (for example `vue-doctor/correctness/no-prevent-default`),
- the smallest code sample that triggers it,
- why the code is correct,
- your Vue Doctor version (`vue-doctor --version`).

A public repository and commit where it happens is even better. A fix always comes with a new valid case in the rule's `.cases.ts` file that reproduces the report.

## What the benchmark is for

The [false-positive benchmark](https://github.com/remylagerweij/vue-doctor/tree/main/benchmarks) scans 25 pinned public Vue and Nuxt repositories and records findings per rule. We use the numbers in three ways:

- **Guard.** A pull request that changes the rules fails CI when a rule's total rises beyond the tolerance (10 findings or 10% of its baseline, whichever is larger). A rise is either a real improvement in detection or new noise; the author reads the findings and says which.
- **Ranking.** Rules that fire often, on many repositories, with low or medium confidence are reviewed first. Counts alone prove nothing; the findings behind them are sampled and classified as true or false positives.
- **Promotion.** A rule only becomes an `error` when its false-positive rate on the benchmark is effectively zero.

## Demoting and retiring a rule

| Step | When | Effect |
| --- | --- | --- |
| Fix | A false positive has a precise cause | The rule is narrowed and the report becomes a valid case |
| Lower confidence or severity | The rule is useful but imprecise | Metadata change; an `error` becomes a `warning` |
| Off by default | Sampled findings are mostly false positives, or the advice depends on the project | `defaultSeverity: "off"`; users can still enable it in config |
| Retire | The rule cannot be made precise, or the platform made it obsolete | The rule is removed; its ID stays known and warns instead of failing |

Demoting or retiring is a user-facing change: add a changeset, update the rule page, and keep the old ID resolving (see `REMOVED_RULES` in `src/plugin/rule-ids.ts`). Every retirement is recorded on the [rule retirements](./rule-retirements) page with the reason and the benchmark evidence.
