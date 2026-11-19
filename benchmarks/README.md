# False-positive benchmark

Vue Doctor is run against 25 pinned, public Vue and Nuxt repositories so that rule changes can be judged on real code instead of fixtures. A false positive is a correctness bug (see the [false-positive policy](../docs/contributing/false-positive-policy.md)). 70 of the 85 own rules are medium or low confidence, so this benchmark is the main guard on precision.

The repositories are listed in [`repos.json`](./repos.json) with their commit, licence and optional scanned sub-directory:

- Nuxt apps and templates: nuxt.com, Elk, Nuxt movies, Nuxt UI, NocoDB (`packages/nc-gui`), Atidone, the Nuxt UI dashboard template, Vitesse Nuxt.
- Vite apps: Hoppscotch (`packages/hoppscotch-common`), n8n (`packages/frontend/editor-ui`), Uptime Kuma, Koel, Misskey (`packages/frontend`), Vikunja (`frontend`), Vue Vben Admin, SoybeanAdmin, Slidev.
- Libraries: Element Plus, PrimeVue (`packages/primevue`), shadcn-vue (`apps/v4`), VueUse, Vuetify.
- Docs tooling: VitePress.
- Other stacks: Quasar, vue-element-admin (Vue 2, Vue CLI).

Vue Doctor only scans these repositories; no code is copied into this one. NocoDB and n8n are source-available (Sustainable Use License) and are listed as such.

Each repository is pinned to a commit SHA, so counts only change when Vue Doctor changes or when a SHA is bumped on purpose (the comparison reports that).

## Running it

```bash
npm ci && npm run build
npm run benchmark --workspace=@remylagerweij/vue-doctor -- --compare
```

The script (`packages/vue-doctor/scripts/benchmark/benchmark.mjs`) shallow-fetches each pinned commit into `$BENCHMARK_DIR` (default: `<os tmpdir>/vue-doctor-benchmark`, outside this repository and reused between runs), runs the built CLI with `--format json --no-cache --offline`, and prints per-repo totals, per-rule counts and the wall-clock time. It needs `git` and network access to github.com. A first run takes a few minutes (mostly fetching); a cached run about 75 seconds on a laptop.

A scan that crashes, exits with a usage error or exceeds 20 minutes is recorded under `failures`, printed, and makes the run exit 2. The other repositories still run.

| Option | Effect |
| --- | --- |
| `--repo <id>` | Only run this repo (repeatable) |
| `--compare` | Print the per-rule delta against the committed [`results.json`](./results.json) and fail on a regression |
| `--baseline <file>` | Compare against another results file (implies a comparison) |
| `--no-gate` | With a comparison: print it but never fail |
| `--max-increase <n>` | Gate: findings a rule may rise by (default 10) |
| `--max-increase-percent <n>` | Gate: share of the baseline total a rule may rise by (default 10) |
| `--write` | Update `benchmarks/results.json` |
| `--output <file>` | Write the results to another file |
| `--dead-code` | Also run dead-code analysis (see below) |
| `--summary` | Append the markdown tables to `$GITHUB_STEP_SUMMARY` |

Exit codes: `0` ok, `1` regression, `2` a scan failed or bad arguments.

### The regression gate

Only repositories that are comparable take part: present in both runs, with the same pinned SHA and the same scanned directory. With `allowed = max(10, ceil(0.10 * before))` (the defaults of `--max-increase` / `--max-increase-percent`), three checks run:

1. **Total**: a rule fails when `after - before > allowed`, with both summed over the comparable repositories.
2. **Per repository**: the same tolerance applied to every (repository, rule) pair, so +60 in one repository cannot be hidden by -60 in another.
3. **Dropped to zero**: a rule with at least 20 findings in the baseline (summed over the comparable repositories) that now has none fails, because that is what an analyzer that went silent looks like. A rule that was intentionally removed or renamed trips this too; refresh the baseline in the same pull request.

So a rule with a baseline of 0 (a new rule, or a renamed one) may produce up to 10 findings, and a rule with a baseline of 1000 may rise by 100. Other decreases and vanished small rules never fail. Repositories whose SHA moved, new repositories and `knip/*` rules in a dead-code mismatch are skipped, with a note. When a rise is intended (a rule now detects more, a SHA bump, a rule rename), read the new findings, then refresh the baseline in the same pull request.

`repos.json` is validated before anything runs: `id` must match `^[\w.-]+$` (and not be `.` or `..`), `url` must be an `https://github.com/<owner>/<repo>.git` URL and `sha` 40 hex characters. A failing `git fetch` is retried twice (after 2 s and 5 s) before the repository is recorded as failed; scans are never retried.

### Dead code is optional

Knip needs the dependencies installed to resolve imports, which is slow and the least reproducible step (registry availability, platform-specific packages). The default run therefore passes `--no-dead-code`, which still covers every lint and template rule, and `knip/*` findings are absent from the committed results. `--dead-code` installs each repo with its own lockfile (`pnpm`/`yarn` via corepack, or `npm ci`, always with `--ignore-scripts`) and includes the `knip/*` rules. Do not compare a run with dead code against a baseline without it.

## Using it when changing rules

1. Run `--compare` on your branch. Rule changes show up as a per-rule delta.
2. Look at the findings behind a rule you change: run Vue Doctor on a checkout in `$BENCHMARK_DIR` (for example `node packages/vue-doctor/dist/cli.js <dir> --no-cache --verbose`) and classify each one as a true or false positive.
3. Promote a rule to `error` only when the false-positive rate is effectively zero. Otherwise fix the rule first and re-run to see the counts drop.
4. Paste the delta table into the PR description. To refresh the baseline: `--write`, commit.

## Tracking over time

`results.json` records the date, Vue Doctor version, Node/platform, and per repo the pinned SHA, directory, duration, totals and per-rule counts; the git history of that file is the trend. Timings depend on the machine and are only indicative.

The [`Benchmark` workflow](../.github/workflows/benchmark.yml) runs weekly, on demand, and on pull requests that touch `packages/vue-doctor/src/plugin/**`, `src/utils/**`, `src/core/**`, `src/scan.ts`, the package's `package.json`, the root `package-lock.json` (so an oxlint, eslint-plugin-vue or knip bump is gated) or the benchmark files. It fails on a regression, writes the tables and the delta to the job summary, and uploads `benchmark-results.json` as an artifact. It never commits or pushes; copy the artifact over `results.json` to refresh the baseline.
