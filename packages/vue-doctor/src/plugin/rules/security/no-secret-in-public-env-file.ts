import { defineFsRule } from "../../define-fs-rule.js";
import { isEnvFileName, parseEnvFile } from "../../env-file.js";
import { getPublicEnvPrefix, looksLikeSecretName, matchesSecretValueFormat } from "../../secret-heuristics.js";

export default defineFsRule({
  meta: {
    id: "no-secret-in-public-env-file",
    category: "Security",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-540"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "`VITE_*`, `NUXT_PUBLIC_*` and `PUBLIC_*` variables are inlined into the browser bundle; rename secrets without the public prefix and read them on the server",
    agentGuidance:
      "In the `.env*` file, rename the variable so it no longer starts with `VITE_`, `VUE_APP_`, `NUXT_PUBLIC_` or `PUBLIC_`, and read it only on the server (for Nuxt, a top-level `runtimeConfig` key filled from `NUXT_<NAME>`). Update every place that reads the old name. Rotate the secret, since public variables end up in the shipped JavaScript. Do not print or copy the value. Publishable and anon keys can stay public.",
  },
  check: (context) => {
    // Every `.env*` file of the project, ignored ones included: a git-ignored `.env` is still bundled at build time.
    const candidates = new Set<string>(context.readDirectory("").filter(isEnvFileName));
    for (const file of context.projectFiles) {
      if (isEnvFileName(file.slice(file.lastIndexOf("/") + 1))) candidates.add(file);
    }

    for (const file of [...candidates].sort()) {
      const content = context.readFile(file);
      if (content === null) continue;
      for (const entry of parseEnvFile(content)) {
        if (!getPublicEnvPrefix(entry.name)) continue;
        if (looksLikeSecretName(entry.name)) {
          context.report({
            file,
            line: entry.line,
            column: entry.column,
            message: `${entry.name} looks like a secret but its public prefix inlines it into the browser bundle — rename it without the prefix and read it on the server`,
          });
        } else if (matchesSecretValueFormat(entry.value)) {
          context.report({
            file,
            line: entry.line,
            column: entry.column,
            message: `${entry.name} holds a value in the format of a secret but its public prefix inlines it into the browser bundle`,
          });
        }
      }
    }
  },
});
