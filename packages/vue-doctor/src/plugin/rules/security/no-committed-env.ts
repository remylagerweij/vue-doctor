import { defineFsRule } from "../../define-fs-rule.js";
import {
  isEnvFileName,
  isEnvTemplateFileName,
  isLocalEnvFileName,
  parseEnvFile,
  type EnvEntry,
} from "../../env-file.js";
import {
  hasCredentialsInUrl,
  isPlaceholderValue,
  looksLikeSecretName,
  matchesSecretValueFormat,
} from "../../secret-heuristics.js";

/** Names listed in a message before it says "and N more". */
const MAX_NAMES_IN_MESSAGE = 3;

const holdsSecret = (entry: EnvEntry): boolean =>
  !isPlaceholderValue(entry.value) &&
  (looksLikeSecretName(entry.name, { context: "private" }) ||
    matchesSecretValueFormat(entry.value) ||
    hasCredentialsInUrl(entry.value));

const listNames = (entries: readonly EnvEntry[]): string => {
  const names = entries.slice(0, MAX_NAMES_IN_MESSAGE).map((entry) => entry.name);
  const more = entries.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
};

/**
 * Decision: a tracked `.env` file is reported when it is a `*.local` file (Vite, Nuxt and Vue CLI
 * git-ignore those by convention, so tracking one is almost always a mistake) or when it defines a
 * non-empty value for a secret-looking name. Committed `.env` / `.env.production` files with plain
 * configuration (URLs, flags) are a common, legitimate pattern, so they stay silent; `.env.example`,
 * `.sample`, `.template`, `.defaults` and similar are meant to be committed and never read.
 */
export default defineFsRule({
  meta: {
    id: "no-committed-env",
    category: "Security",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-538"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "Do not commit `.env` files with secrets: untrack the file, add it to .gitignore, rotate the secrets and commit a `.env.example` without values",
    agentGuidance:
      "Run `git rm --cached <file>` to stop tracking the file (keep it on disk), add `.env` and `.env.*` (with `!.env.example`) to .gitignore, and commit a `.env.example` that lists the variable names without values. Treat every secret in the file as leaked, since it stays in git history: rotate it, and tell the user that history cleaning (git filter-repo) is their decision. Never print the values.",
  },
  check: (context) => {
    // Without git there is no notion of "committed".
    if (!context.isGitRepository) return;

    for (const file of context.trackedFiles) {
      const fileName = file.slice(file.lastIndexOf("/") + 1);
      if (!isEnvFileName(fileName) || isEnvTemplateFileName(fileName)) continue;

      const content = context.readFile(file);
      if (content === null) continue;
      const secrets = parseEnvFile(content).filter(holdsSecret);

      if (isLocalEnvFileName(fileName)) {
        const detail = secrets.length > 0 ? ` and defines secret-looking variables (${listNames(secrets)})` : "";
        context.report({
          file,
          line: secrets[0]?.line ?? 1,
          column: secrets[0]?.column ?? 1,
          message: `${fileName} is tracked by git${detail}; .local env files hold machine-specific values and are never meant to be committed`,
        });
      } else if (secrets.length > 0) {
        context.report({
          file,
          line: secrets[0].line,
          column: secrets[0].column,
          message: `${fileName} is tracked by git and sets values for secret-looking variables (${listNames(secrets)}) — they are in the repository history`,
        });
      }
    }
  },
});
