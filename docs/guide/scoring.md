# Scoring

Every scan produces an overall score from 0 to 100, a sub-score per category and hints that show which fix helps most. The formula is versioned: the JSON report carries `scoreVersion` (currently `2`), and the version changes whenever the same findings would score differently.

## Formula (version 2)

```
base    = 100 - 1.5 × (rules with an error) - 0.75 × (rules with a warning)   // rounded, at least 0
overall = min(base, cap)
```

- A rule counts **once**, however many findings it has. Fixing 40 of 41 occurrences of a rule does not change the score; fixing the last one does.
- A rule that has both error and warning findings counts in both groups.
- Only findings that are reported count: suppressed findings and findings hidden by config (`rules: "off"`, `ignore`) do not. Baseline findings still count; use `--gate new` to gate on new findings only.

## Labels

| Score | Label |
|-------|-------|
| 100 | Perfect |
| 75-99 | Great |
| 50-74 | Needs work |
| 0-49 | Critical |

## Security caps

Security findings can keep a project that is otherwise clean from scoring well. A cap applies only if it lowers the score, and the strictest cap wins:

| Cap | Triggered by |
|-----|--------------|
| 30 | An `error` finding of a rule flagged `critical` in its metadata (exposed secrets: `vue-doctor/security/no-hardcoded-secret`) |
| 50 | An `error` finding of a Security rule with `high` confidence (for example `vue-doctor/security/no-eval`) |

Caps follow rule metadata, not a fixed list, and only look at errors: a Security rule that reports warnings never caps the score. `no-hardcoded-secret` (provider-format credentials in client code) is a high-confidence `error` by default, so a leaked key caps the score at 30. Its heuristic companion `no-secret-named-literal` (secret-named variables, and committed provider keys in server code) is a medium-confidence warning and does not cap unless you raise it to `error` with the `rules` config.

The text output says when a cap applied, and the JSON report has `score.rawScore` (before the cap) and `score.cap` (`{ value, reason, ruleId }` or `null`).

## Category sub-scores

The same penalty model is applied to the findings of each category (Security, Performance, Reactivity, ...), without caps. Only categories with findings appear, worst first, in the text output and in `score.categories` of the JSON report. The overall score is not an average of them.

```
  Security     97  1 error
  Performance  98  2 warnings
```

## Impact hints

For every rule with findings, Vue Doctor computes the exact change of the overall score if all its findings were fixed, caps included. Fixing the rule that causes a cap therefore shows the full jump (for example `+49`), while fixing a warning under a cap shows nothing because the score would not move.

The text output shows the top three:

```
  Fixing vue-doctor/security/no-eval gains +49
```

The JSON report lists every rule with a positive gain in `score.impact`, largest first: `[{ "ruleId": "vue-doctor/security/no-eval", "gain": 49 }]`.

## Gates and `--score`

`--min-score` and the `gate.minScore` config compare against the **overall score after caps**, per project. `--score` prints only that integer.
