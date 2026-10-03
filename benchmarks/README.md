# False-positive benchmark

Vue Doctor is run against a few pinned, public, permissively licensed Nuxt/Vite apps so that rule changes can be judged on real code instead of fixtures. Use it before promoting a rule's severity (for example `warn` to `error`): the policy is that only high-confidence Security/Correctness rules are errors, and a rule that fires dozens of times on mature open-source apps is not high-confidence until you have read those findings.

| Id | Repo | Why |
| --- | --- | --- |
| `nuxt-com` | [nuxt/nuxt.com](https://github.com/nuxt/nuxt.com) | Nuxt 4 app with Nuxt UI and Nuxt Content |
| `elk` | [elk-zone/elk](https://github.com/elk-zone/elk) | Large Nuxt 3 application |
| `vitepress` | [vuejs/vitepress](https://github.com/vuejs/vitepress) | Vite + Vue 3 client and theme code |

Each repo is pinned to a commit SHA in [`repos.json`](./repos.json), so counts only change when Vue Doctor changes (or when you bump a SHA on purpose, which the comparison reports).

## Running it

```bash
npm ci && npm run build
npm run benchmark --workspace=@remylagerweij/vue-doctor -- --compare
```

The script (`packages/vue-doctor/scripts/benchmark/benchmark.mjs`) shallow-fetches each pinned commit into `$BENCHMARK_DIR` (default: `<os tmpdir>/vue-doctor-benchmark`, outside this repository and reused between runs), runs the built CLI with `--format json --no-cache --offline`, and prints per-repo totals, per-rule counts (from `projects[].findings[].ruleId` of the report@2 output) and the wall-clock time. It needs `git` and network access to github.com.

| Option | Effect |
| --- | --- |
| `--repo <id>` | Only run this repo (repeatable) |
| `--compare` | Print the per-rule delta against the committed [`results.json`](./results.json) |
| `--baseline <file>` | Compare against another results file (implies a comparison) |
| `--write` | Update `benchmarks/results.json` |
| `--output <file>` | Write the results to another file |
| `--dead-code` | Also run dead-code analysis (see below) |
| `--summary` | Append the markdown tables to `$GITHUB_STEP_SUMMARY` |

### Dead code is optional

Knip needs the dependencies installed to resolve imports, and installing three large apps is slow and the least reproducible step (registry availability, platform-specific packages). The default run therefore passes `--no-dead-code`, which still covers every lint and template rule, and `knip/*` findings are absent from the committed results. `--dead-code` installs each repo with its own lockfile (`pnpm`/`yarn` via corepack, or `npm ci`, always with `--ignore-scripts`) and includes the `knip/*` rules. Do not compare a run with dead code against a baseline without it; the comparison warns about this.

## Using it when changing rule severity

1. Run `--compare` on your branch. Rule changes show up as a per-rule delta against the committed results.
2. Look at the findings behind a rule you want to promote: run Vue Doctor on a checkout in `$BENCHMARK_DIR` (for example `node packages/vue-doctor/dist/cli.js <dir> --no-cache --verbose`) and classify each one as true or false positive.
3. Promote only when the false-positive rate is effectively zero. Otherwise fix the rule first and re-run the benchmark to see the counts drop.
4. Paste the delta table into the PR description.

## Tracking over time

`results.json` records the date, Vue Doctor version, Node/platform, and per repo the pinned SHA, duration, totals and per-rule counts; git history of that file is the trend. Refresh it deliberately (`--write`, commit) after an intended rule change or SHA bump. Timings depend on the machine and are only indicative.

The scheduled [`Benchmark` workflow](../.github/workflows/benchmark.yml) runs weekly (and on demand) against the default branch, writes the tables and the delta to the job summary, and uploads `benchmark-results.json` as an artifact. It never commits or pushes; copy the artifact over `results.json` when you want to refresh the baseline.
