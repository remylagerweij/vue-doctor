# Baselines & Incremental Adoption

When adopting Vue Doctor in an existing codebase, you might encounter pre-existing issues. Baselines allow you to record all existing findings as "known", ensuring CI gates only fail on **newly introduced** issues.

---

## 1. Recording a Baseline

Run the baseline command from your project root:

```bash
npx @remylagerweij/vue-doctor@latest baseline
```

This performs a full scan and writes `vue-doctor-baseline.json`:

```json
{
  "version": 1,
  "generatedAt": "2026-10-03T10:00:00.000Z",
  "tool": { "name": "vue-doctor", "version": "2.0.0" },
  "fingerprints": [
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "f1d2d2f924e986ac86fdf7b36c94bcdf32beec15defc40e5da87ee773323c27e"
  ]
}
```

Commit `vue-doctor-baseline.json` to your repository:

```bash
git add vue-doctor-baseline.json
git commit -m "chore: record vue-doctor baseline"
```

---

## 2. Using the Baseline in CI

Configure your CI workflow to evaluate only new findings:

```yaml
- name: Run Vue Doctor
  uses: remylagerweij/vue-doctor@v2
  with:
    baseline: vue-doctor-baseline.json
    fail-on: error
    gate: new
```

All issues listed in the baseline will carry status `baseline` and will not trigger a gate failure. Only newly introduced errors will cause the build to fail.

---

## 3. Configuration Reference

You can also specify the baseline in `vue-doctor.config.ts`:

```typescript
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  baseline: "vue-doctor-baseline.json",
  gate: {
    failOn: "error",
    scope: "new",
  },
});
```

---

## 4. Refreshing the Baseline

As you resolve issues, refresh the baseline periodically:

```bash
npx @remylagerweij/vue-doctor@latest baseline
```
