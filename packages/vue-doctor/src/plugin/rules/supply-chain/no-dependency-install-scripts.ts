import { defineFsRule } from "../../define-fs-rule.js";
import { hasOnlyTrivialInstallScripts, readInstallScriptPolicy } from "../../supply-chain/install-scripts.js";
import { findKeyLine, findLockfiles, readLockfiles, readManifest } from "../../supply-chain/project.js";

// Direct dependencies only, from the lockfile; reviewed (allow-listed) and do-nothing scripts are skipped.
export default defineFsRule({
  meta: {
    id: "no-dependency-install-scripts",
    category: "Supply Chain",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-829"],
    owasp: "A08:2021",
    fixable: false,
    since: "2.0.0",
    help: "Review dependencies that run code at install time and record the decision: npm `allowScripts` (`npm approve-scripts`), pnpm `onlyBuiltDependencies`, Bun `trustedDependencies`",
    agentGuidance:
      "Do not remove the dependency just because it has an install script: many native packages need one. Check that the package is the one intended (name, publisher, download count), then record the review in the package manager's allowlist, which silences the finding: npm 11 `allowScripts` in package.json (`npm approve-scripts <pkg>`), pnpm `onlyBuiltDependencies`, Bun `trustedDependencies`. Scripts that only `echo` or `exit 0` are not reported. Report the list to the user rather than silently changing install behaviour.",
  },
  check: (context) => {
    const manifest = readManifest(context);
    if (!manifest || manifest.dependencies.size === 0) return;
    const location = findLockfiles(context);
    if (!location) return;

    const policy = readInstallScriptPolicy(context, location);
    if (policy.allowlistOnly) return;

    const withScripts = new Set<string>();
    for (const lockfile of readLockfiles(context, location)) {
      for (const entry of lockfile.packages) {
        if (!entry.hasInstallScript || !entry.topLevel || !manifest.dependencies.has(entry.name)) continue;
        if (policy.reviewed.has(entry.name) || hasOnlyTrivialInstallScripts(context, location, entry.name)) continue;
        withScripts.add(entry.name);
      }
    }

    for (const name of [...withScripts].sort()) {
      context.report({
        file: "package.json",
        line: findKeyLine(manifest.content, name),
        message: `Direct dependency "${name}" runs an install script (preinstall, install or postinstall) when it is installed — it executes code on every developer machine and CI runner`,
      });
    }
  },
});
