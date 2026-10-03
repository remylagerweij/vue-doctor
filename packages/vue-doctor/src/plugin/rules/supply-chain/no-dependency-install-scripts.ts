import { defineFsRule } from "../../define-fs-rule.js";
import { findKeyLine, findLockfiles, readLockfiles, readManifest } from "../../supply-chain/project.js";

/**
 * Decision: only direct dependencies are reported (the ones the team chose and can review); the
 * information comes from the lockfile (`hasInstallScript` in npm lockfiles v2/v3, `requiresBuild`
 * in pnpm). Install scripts of well-known native packages (esbuild, sharp) are legitimate, which is
 * why this is a low-confidence warning: the point is to know which dependencies run code at install.
 */
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
    help: "Review dependencies that run code at install time; install with --ignore-scripts and allow-list the ones that need it (pnpm `onlyBuiltDependencies`)",
    agentGuidance:
      "Do not remove the dependency just because it has an install script: many native packages need one. Check that the package is the one intended (name, publisher, download count), then restrict install scripts: in pnpm add it to `onlyBuiltDependencies` and nothing else; with npm use `--ignore-scripts` in CI and rebuild only what is needed (`npm rebuild <pkg>`). Report the list to the user rather than silently changing install behaviour.",
  },
  check: (context) => {
    const manifest = readManifest(context);
    if (!manifest || manifest.dependencies.size === 0) return;
    const location = findLockfiles(context);
    if (!location) return;

    const withScripts = new Set<string>();
    for (const lockfile of readLockfiles(context, location)) {
      for (const entry of lockfile.packages) {
        if (entry.hasInstallScript && entry.topLevel && manifest.dependencies.has(entry.name)) {
          withScripts.add(entry.name);
        }
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
