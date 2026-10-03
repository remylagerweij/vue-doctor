import { defineFsRule } from "../../define-fs-rule.js";
import { classifyDependencySpec } from "../../supply-chain/lockfile.js";
import { findKeyLine, readManifest } from "../../supply-chain/project.js";

const DESCRIPTIONS = {
  git: "a git repository without a pinned commit — whatever the branch or tag points at on install day is what you get",
  http: "a plain http:// URL — the download is not encrypted and can be replaced in transit",
  tarball: "a tarball URL — it bypasses the registry and its integrity and provenance checks",
} as const;

/** Decision: git specs pinned to a full 40-character commit hash are immutable and stay silent. */
export default defineFsRule({
  meta: {
    id: "no-remote-dependency-spec",
    category: "Supply Chain",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-829", "CWE-494"],
    owasp: "A08:2021",
    fixable: false,
    since: "2.0.0",
    help: "Depend on a version published to the registry; if you need a fork, publish it (scoped) or pin the git dependency to a full commit hash",
    agentGuidance:
      "For each flagged dependency in package.json, replace the git/tarball/http spec with a version range from the registry when the package is published there. If it is an unpublished fork, either publish it under a scope or pin the git spec to a full 40-character commit hash (`github:user/repo#<sha>`). Never switch an `http://` URL to a different host; use `https://` or the registry. Re-run the install command so the lockfile follows.",
  },
  check: (context) => {
    const manifest = readManifest(context);
    if (!manifest) return;

    for (const [name, { spec }] of manifest.dependencies) {
      const kind = classifyDependencySpec(spec);
      if (!kind) continue;
      context.report({
        file: "package.json",
        line: findKeyLine(manifest.content, name),
        message: `"${name}" is installed from ${DESCRIPTIONS[kind]}`,
      });
    }
  },
});
