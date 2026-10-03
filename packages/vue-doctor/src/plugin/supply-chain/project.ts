import type { FsRuleContext } from "../define-fs-rule.js";
import { findLockfileNames, parseLockfile, readRegistryHosts, type LockedPackage } from "./lockfile.js";

/** Furthest ancestor directory searched for a monorepo root that holds the lockfile. */
const MAX_ANCESTOR_DEPTH = 6;

export const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

export interface Manifest {
  content: string;
  dependencies: Map<string, { spec: string; section: (typeof DEPENDENCY_SECTIONS)[number] }>;
}

/** The project's `package.json`, or `null` when it is missing or not valid JSON. */
export const readManifest = (context: Pick<FsRuleContext, "readFile">): Manifest | null => {
  const content = context.readFile("package.json");
  if (content === null) return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;

  const dependencies: Manifest["dependencies"] = new Map();
  for (const section of DEPENDENCY_SECTIONS) {
    const entries = json[section];
    if (typeof entries !== "object" || entries === null) continue;
    for (const [name, spec] of Object.entries(entries)) {
      if (typeof spec === "string" && !dependencies.has(name)) dependencies.set(name, { spec, section });
    }
  }
  return { content, dependencies };
};

/** 1-based line of a `"key":` in a JSON text; 1 when absent. */
export const findKeyLine = (jsonText: string, key: string): number => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const index = jsonText.split(/\r?\n/).findIndex((line) => new RegExp(`^\\s*"${escaped}"\\s*:`).test(line));
  return index === -1 ? 1 : index + 1;
};

export interface LockfileLocation {
  /** `""` for the project directory, `".."` etc. for the monorepo root above it. */
  directory: string;
  lockfiles: string[];
}

const joinPath = (directory: string, name: string): string => (directory === "" ? name : `${directory}/${name}`);

const isWorkspaceRoot = (context: FsRuleContext, directory: string, fileNames: readonly string[]): boolean => {
  if (fileNames.includes("pnpm-workspace.yaml")) return true;
  if (!fileNames.includes("package.json")) return false;
  try {
    return Boolean(JSON.parse(context.readFile(joinPath(directory, "package.json")) ?? "null")?.workspaces);
  } catch {
    return false;
  }
};

/**
 * Where the project's lockfiles are: its own directory, else the root of the monorepo it belongs to
 * (a lockfile next to a workspace's `package.json` is the exception, not the rule). `null` when
 * there are none. The ancestors are read through `readDirectory`, so the cache sees them.
 */
export const findLockfiles = (context: FsRuleContext): LockfileLocation | null => {
  const own = findLockfileNames(context.readDirectory(""));
  if (own.length > 0) return { directory: "", lockfiles: own };

  let directory = "";
  for (let depth = 1; depth <= MAX_ANCESTOR_DEPTH; depth++) {
    directory = depth === 1 ? ".." : `${directory}/..`;
    const names = context.readDirectory(directory);
    if (!isWorkspaceRoot(context, directory, names)) continue;
    const lockfiles = findLockfileNames(names);
    return lockfiles.length > 0 ? { directory, lockfiles } : null;
  }
  return null;
};

/** Registry hosts allowed by the `.npmrc` / `.yarnrc.yml` next to the project and its lockfile. */
export const readConfiguredRegistryHosts = (context: FsRuleContext, location: LockfileLocation): string[] => {
  const directories = new Set(["", location.directory]);
  const configFiles: { name: string; content: string }[] = [];
  for (const directory of directories) {
    for (const name of [".npmrc", ".yarnrc.yml"]) {
      const content = context.readFile(joinPath(directory, name));
      if (content !== null) configFiles.push({ name, content });
    }
  }
  return readRegistryHosts(configFiles);
};

export interface ParsedLockfile {
  /** Path relative to the project root. */
  file: string;
  name: string;
  packages: LockedPackage[];
}

/** Every readable lockfile at a location. */
export const readLockfiles = (context: FsRuleContext, location: LockfileLocation): ParsedLockfile[] => {
  const parsed: ParsedLockfile[] = [];
  for (const name of location.lockfiles) {
    const file = joinPath(location.directory, name);
    const content = context.readFile(file);
    const packages = content === null ? null : parseLockfile(name, content);
    if (packages) parsed.push({ file, name, packages });
  }
  return parsed;
};
