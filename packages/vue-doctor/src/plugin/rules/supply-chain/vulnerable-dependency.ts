import { defineAuditRule } from "../../define-audit-rule.js";

/**
 * Decision: reported as a `warning`, never an `error`. The 2.0 severity policy reserves `error` for
 * Security and Correctness rules, and a vulnerable *installed* version is not necessarily
 * exploitable in this project (the vulnerable code path may be unused, or only reachable in
 * development). The finding states the highest severity OSV reports, so teams that want to gate
 * on it set `"vue-doctor/supply-chain/vulnerable-dependency": "error"` in `rules`.
 * Opt-in (`--audit` or `audit.enabled`): it needs the network and is skipped with `--offline`.
 */
export default defineAuditRule({
  meta: {
    id: "vulnerable-dependency",
    category: "Supply Chain",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-1395"],
    owasp: "A06:2021",
    fixable: false,
    since: "2.0.0",
    help: "Upgrade the dependency to a fixed version (see the advisory), or replace it; run your package manager's update, then re-run the audit",
    agentGuidance:
      "Upgrade the named package to the fixed version in the message using the project's package manager (npm/pnpm/yarn/bun update or install name@version), and regenerate the lockfile through the package manager, never by editing it by hand. For a transitive dependency, upgrade the direct dependency that pulls it in, or add an `overrides`/`resolutions` entry only when no newer parent exists. Run the tests afterwards. If no fixed version exists, say so instead of silencing the finding.",
  },
});
