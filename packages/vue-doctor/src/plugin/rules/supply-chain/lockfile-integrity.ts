import { defineFsRule } from "../../define-fs-rule.js";
import { findNonRegistryPackages, getLockfileManagers, getUrlHost } from "../../supply-chain/lockfile.js";
import {
  DEPENDENCY_SECTIONS,
  findLockfiles,
  findKeyLine,
  readConfiguredRegistryHosts,
  readLockfiles,
  readManifest,
} from "../../supply-chain/project.js";

/** Packages named in a message before it says "and N more". */
const MAX_NAMES_IN_MESSAGE = 3;

const listNames = (names: readonly string[]): string => {
  const shown = names.slice(0, MAX_NAMES_IN_MESSAGE).join(", ");
  return names.length > MAX_NAMES_IN_MESSAGE ? `${shown} and ${names.length - MAX_NAMES_IN_MESSAGE} more` : shown;
};

/**
 * Decision: the lockfile is what makes an install reproducible and verified, so this rule covers
 * its three failure modes in one place: no lockfile for a project with dependencies (looked up in
 * the project and in the monorepo root above it), lockfiles of several package managers side by
 * side (they drift apart and CI installs something other than what developers run), and packages
 * downloaded from a host that is not the configured registry (default registry.npmjs.org, plus
 * `.npmrc` / `.yarnrc.yml` registries), which bypasses the registry's integrity and provenance.
 * Findings about a lockfile outside the project directory point at `package.json`.
 */
export default defineFsRule({
  meta: {
    id: "lockfile-integrity",
    category: "Supply Chain",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-494", "CWE-829"],
    owasp: "A08:2021",
    fixable: false,
    since: "2.0.0",
    help: "Commit exactly one lockfile that belongs to your package manager and make sure every package in it is resolved from your registry",
    agentGuidance:
      "Missing lockfile: run the project's install command (`npm install`, `pnpm install` or `yarn install`) and commit the generated lockfile. Several lockfiles: keep the one of the package manager the project uses (check the `packageManager` field and the CI install step), delete the others and untrack them. Packages from another host: find out why they are there (a private mirror should be listed in `.npmrc`; otherwise reinstall from the default registry) and regenerate the lockfile; do not edit URLs in the lockfile by hand and do not rewrite hosts to make the finding disappear.",
  },
  check: (context) => {
    const manifest = readManifest(context);
    if (!manifest) return;

    const location = findLockfiles(context);
    if (!location) {
      if (manifest.dependencies.size === 0) return;
      const section = DEPENDENCY_SECTIONS.find((name) =>
        [...manifest.dependencies.values()].some((entry) => entry.section === name),
      );
      context.report({
        file: "package.json",
        line: findKeyLine(manifest.content, section ?? "dependencies"),
        message:
          "package.json declares dependencies but there is no lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock) in the project or its monorepo root — installs are not reproducible and nothing pins or verifies what gets installed",
      });
      return;
    }

    // A lockfile outside the project directory is reported at the project's package.json.
    const fileOf = (file: string): string => (location.directory === "" ? file : "package.json");

    const managers = getLockfileManagers(location.lockfiles);
    if (managers.length > 1) {
      context.report({
        file: fileOf(location.lockfiles[0]),
        message: `Lockfiles of ${managers.length} package managers exist side by side (${location.lockfiles.join(", ")}) — they drift apart, so CI and developers can install different versions; keep only one`,
      });
    }

    const registryHosts = readConfiguredRegistryHosts(context, location);
    for (const lockfile of readLockfiles(context, location)) {
      const foreign = findNonRegistryPackages(lockfile.packages, registryHosts);
      if (foreign.length === 0) continue;
      const hosts = [...new Set(foreign.map((entry) => getUrlHost(entry.resolved ?? "") ?? ""))].sort();
      const names = [...new Set(foreign.map((entry) => entry.name))].sort();
      context.report({
        file: fileOf(lockfile.file),
        message: `${lockfile.file} resolves ${names.length} package${names.length === 1 ? "" : "s"} (${listNames(names)}) from ${listNames(hosts)} instead of the configured registry — they skip the registry's integrity and provenance guarantees`,
      });
    }
  },
});
