import type { FsRuleContext } from "../define-fs-rule.js";
import type { LockfileLocation } from "./project.js";

const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"] as const;

// `echo 'no-op'`, `true`, `:`, `exit 0`; anything with substitution, pipes or redirects is real work.
const TRIVIAL_COMMAND = /^(?:echo(?:\s+[^`$|<>&;]*)?|true|:|exit(?:\s+0)?)$/;

const joinPath = (directory: string, name: string): string => (directory === "" ? name : `${directory}/${name}`);

const readJson = (context: Pick<FsRuleContext, "readFile">, file: string): Record<string, unknown> | null => {
  const content = context.readFile(file);
  if (content === null) return null;
  try {
    const json: unknown = JSON.parse(content);
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const isTrivialScript = (script: string): boolean =>
  script
    .split(/&&|\|\||;/)
    .map((part) => part.trim())
    .every((part) => part === "" || TRIVIAL_COMMAND.test(part));

/** Whether the installed dependency only declares do-nothing install scripts; unknown counts as real work. */
export const hasOnlyTrivialInstallScripts = (context: FsRuleContext, location: LockfileLocation, name: string): boolean => {
  for (const directory of new Set(["", location.directory])) {
    const packageDirectory = joinPath(directory, `node_modules/${name}`);
    const manifest = readJson(context, `${packageDirectory}/package.json`);
    if (!manifest) continue;
    const scripts = (manifest.scripts ?? {}) as Record<string, unknown>;
    const declared = INSTALL_SCRIPTS.map((hook) => scripts[hook]).filter((script) => script !== undefined);
    if (declared.length === 0) return false;
    if (scripts.install === undefined && context.readFile(`${packageDirectory}/binding.gyp`) !== null) return false;
    return declared.every((script) => typeof script === "string" && isTrivialScript(script));
  }
  return false;
};

/** `name`, `name@1.2.3`, `@scope/name@1.2.3 || 1.2.4` → the package name. */
const policyKeyName = (key: string): string => {
  const at = key.indexOf("@", key.startsWith("@") ? 1 : 0);
  return (at === -1 ? key : key.slice(0, at)).trim();
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Items of a top-level YAML list (`key:` followed by `- item` lines). */
const readYamlList = (content: string, key: string): string[] | null => {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}\\s*:\\s*$`).test(line));
  if (start === -1) return null;
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^\s+-\s*["']?([^"'#\s]+)["']?/.exec(line);
    if (item) items.push(item[1]);
    else if (line.trim() !== "" && !line.trim().startsWith("#")) break;
  }
  return items;
};

export interface InstallScriptPolicy {
  /** Dependencies whose install scripts were reviewed (allowed or denied) in the package manager's config. */
  reviewed: ReadonlySet<string>;
  /** pnpm `onlyBuiltDependencies` is set, so no other dependency runs its install scripts. */
  allowlistOnly: boolean;
}

/** npm `allowScripts`/`allow-scripts`, pnpm `*BuiltDependencies`, Bun `trustedDependencies`, Yarn `built: false`. */
export const readInstallScriptPolicy = (context: FsRuleContext, location: LockfileLocation): InstallScriptPolicy => {
  const reviewed = new Set<string>();
  let allowlistOnly = false;
  for (const directory of new Set(["", location.directory])) {
    const manifest = readJson(context, joinPath(directory, "package.json"));
    const allowScripts = manifest?.allowScripts;
    if (typeof allowScripts === "object" && allowScripts !== null) {
      for (const key of Object.keys(allowScripts)) reviewed.add(policyKeyName(key));
    }
    const pnpm = (manifest?.pnpm ?? {}) as Record<string, unknown>;
    if (Array.isArray(pnpm.onlyBuiltDependencies)) allowlistOnly = true;
    for (const name of [
      ...stringList(pnpm.onlyBuiltDependencies),
      ...stringList(pnpm.neverBuiltDependencies),
      ...stringList(pnpm.ignoredBuiltDependencies),
      ...stringList(manifest?.trustedDependencies),
    ]) {
      reviewed.add(name);
    }
    const dependenciesMeta = (manifest?.dependenciesMeta ?? {}) as Record<string, { built?: unknown }>;
    for (const [key, meta] of Object.entries(dependenciesMeta)) {
      if (meta?.built === false) reviewed.add(policyKeyName(key));
    }

    const workspace = context.readFile(joinPath(directory, "pnpm-workspace.yaml"));
    if (workspace !== null) {
      const onlyBuilt = readYamlList(workspace, "onlyBuiltDependencies");
      if (onlyBuilt) allowlistOnly = true;
      for (const key of ["onlyBuiltDependencies", "neverBuiltDependencies", "ignoredBuiltDependencies"]) {
        for (const name of readYamlList(workspace, key) ?? []) reviewed.add(name);
      }
    }

    const npmrc = context.readFile(joinPath(directory, ".npmrc"));
    const allowed = npmrc === null ? null : /^\s*allow-scripts\s*=\s*(.+)$/m.exec(npmrc);
    for (const key of allowed?.[1].split(",") ?? []) if (key.trim()) reviewed.add(policyKeyName(key.trim()));
  }
  return { reviewed, allowlistOnly };
};
