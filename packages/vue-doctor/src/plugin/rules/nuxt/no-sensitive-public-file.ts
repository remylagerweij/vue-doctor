import { defineFsRule } from "../../define-fs-rule.js";
import { isEnvFileName, isEnvTemplateFileName } from "../../env-file.js";

type SensitiveKind = "env" | "key" | "dump" | "source-map" | "backup" | "log" | "system";

const KIND_LABELS: Record<SensitiveKind, string> = {
  env: "an environment file (it usually holds credentials)",
  key: "a private key or certificate bundle",
  dump: "a database file or dump",
  "source-map": "a source map (it publishes your original source code)",
  backup: "a backup or editor leftover (it can contain source or secrets and is served as a download)",
  log: "a log file (it can contain tokens, user data and internal paths)",
  system: "an operating system file (it leaks folder contents)",
};

const KEY_FILE_PATTERN = /\.(?:pem|key|p12|pfx|jks|keystore)$|^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/;
const DUMP_FILE_PATTERN = /\.(?:sql|sqlite|sqlite3|db|dump)$/;
const BACKUP_FILE_PATTERN = /\.(?:bak|old|orig|swp|swo)$|~$/;

/** Kind of sensitive file for a file name, or `null` for an ordinary public asset. */
const classifyFileName = (fileName: string): SensitiveKind | null => {
  const name = fileName.toLowerCase();
  if (isEnvFileName(name) && !isEnvTemplateFileName(name)) return "env";
  // `id_rsa.pub` is the public half and meant to be shared.
  if (KEY_FILE_PATTERN.test(name) && !name.endsWith(".pub")) return "key";
  if (DUMP_FILE_PATTERN.test(name)) return "dump";
  if (name.endsWith(".map")) return "source-map";
  if (BACKUP_FILE_PATTERN.test(name)) return "backup";
  if (name.endsWith(".log")) return "log";
  if (name === ".ds_store" || name === "thumbs.db") return "system";
  return null;
};

/**
 * Decision: one warning-level rule. Everything in `public/` (Vite, Nuxt) and Nuxt 2's `static/` is
 * copied to the web root and downloadable by anyone, whether git tracks it or not, so untracked and
 * not-ignored files count too (git-ignored files are only seen directly inside the folder). The rule
 * lives in the Nuxt category, where severity `error` is not allowed by the severity policy, even
 * though a private key or `.env` here is as bad as a committed secret: the message says so. Source
 * maps are aggregated into one finding because a build output copied there has hundreds of them.
 */
export default defineFsRule({
  meta: {
    id: "no-sensitive-public-file",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-200", "CWE-538"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "Everything in `public/` (and Nuxt's `static/`) is deployed and downloadable by anyone: move secrets, dumps, keys and logs out of it and delete source maps and backups from the folder",
    agentGuidance:
      "Move the flagged file out of `public/` (or `static/`): secrets and keys belong in the server environment or a secret store, never in the web root; delete backups, logs, dumps and OS files (add them to .gitignore). For `.env`, private keys and database dumps, treat the contents as leaked if the site was ever deployed with the file: tell the user to rotate them, and do not print their content. For source maps, build with `sourcemap: false` for production (or upload them to the error tracker and do not copy them to the web root).",
  },
  check: (context) => {
    const roots = context.framework === "nuxt" ? ["public", "static"] : ["public"];
    const found = new Set<string>();
    for (const root of roots) {
      const prefix = `${root}/`;
      for (const file of context.projectFiles) if (file.startsWith(prefix)) found.add(file);
      // Git-ignored files are deployed as well; they are only visible through the directory listing.
      for (const name of context.readDirectory(root)) found.add(prefix + name);
    }

    const sourceMaps: string[] = [];
    for (const file of [...found].sort()) {
      const kind = classifyFileName(file.slice(file.lastIndexOf("/") + 1));
      if (kind === "source-map") sourceMaps.push(file);
      else if (kind) {
        context.report({
          file,
          message: `${file} is ${KIND_LABELS[kind]} and sits in a folder that is deployed to the public web root — anyone can download it`,
        });
      }
    }
    if (sourceMaps.length > 0) {
      const more = sourceMaps.length > 1 ? ` and ${sourceMaps.length - 1} more source map${sourceMaps.length > 2 ? "s" : ""}` : "";
      context.report({
        file: sourceMaps[0],
        message: `${sourceMaps[0]}${more} in the deployed web root publish${sourceMaps.length > 1 ? "" : "es"} your original source code`,
      });
    }

    // A repository inside the web root exposes the whole history at /<folder>/.git/.
    for (const root of roots) {
      if (context.readDirectory(`${root}/.git`).length > 0) {
        context.report({
          file: `${root}/.git`,
          message: `${root}/.git is a git repository inside the deployed web root — anyone can download the full history of the project`,
        });
      }
    }
  },
});
