import fs from "node:fs";
import path from "node:path";
import { findMonorepoRoot } from "./find-monorepo-root.js";

/**
 * Lockfile discovery and parsing: npm (`package-lock.json` v1-v3, `npm-shrinkwrap.json`), pnpm
 * (`pnpm-lock.yaml` v6 and v9), Yarn (classic v1 and Berry) and Bun (`bun.lock`). Everything here
 * is read-only and pure (no network, no process spawning), so it is reusable by any rule that needs
 * to know which package versions are installed. The formats are read with small purpose-built
 * readers instead of a YAML library: only package keys, versions and direct-dependency names are
 * needed, and Vue Doctor ships no YAML dependency.
 */

export type LockfileKind = "npm" | "pnpm" | "yarn" | "bun";

/** One installed package version. A name can appear with several versions. */
export interface LockedPackage {
  name: string;
  version: string;
  /** Declared in the project's package.json (or in the lockfile's own root entry), not just pulled in by another package. */
  direct: boolean;
}

export interface ParsedLockfile {
  kind: LockfileKind;
  /** Unique by `name@version`, in lockfile order. */
  packages: LockedPackage[];
  /** 1-based line of the package's entry in the lockfile; `1` when it cannot be found. */
  lineOf: (pkg: LockedPackage) => number;
}

export interface LockfileLocation {
  kind: LockfileKind;
  /** Absolute path. */
  filePath: string;
  /** Bun's binary `bun.lockb`: found, but not readable without Bun. */
  binary: boolean;
}

/** In order of preference when a directory holds several (it should not). */
const LOCKFILE_NAMES: ReadonlyArray<{ name: string; kind: LockfileKind; binary?: boolean }> = [
  { name: "package-lock.json", kind: "npm" },
  { name: "npm-shrinkwrap.json", kind: "npm" },
  { name: "pnpm-lock.yaml", kind: "pnpm" },
  { name: "yarn.lock", kind: "yarn" },
  { name: "bun.lock", kind: "bun" },
  { name: "bun.lockb", kind: "bun", binary: true },
];

const findLockfileIn = (directory: string): LockfileLocation | null => {
  for (const { name, kind, binary } of LOCKFILE_NAMES) {
    const filePath = path.join(directory, name);
    if (fs.existsSync(filePath)) return { kind, filePath, binary: binary ?? false };
  }
  return null;
};

/**
 * The lockfile that governs a project: the one in its directory, else the one at the root of the
 * monorepo it belongs to (workspaces share a single lockfile there). `null` when there is none.
 */
export const findLockfile = (projectDirectory: string): LockfileLocation | null => {
  const own = findLockfileIn(projectDirectory);
  if (own) return own;
  const monorepoRoot = findMonorepoRoot(projectDirectory);
  return monorepoRoot ? findLockfileIn(monorepoRoot) : null;
};

const SEMVER_START = /^\d+\.\d+\.\d+/;
const isRegistryVersion = (version: string): boolean => SEMVER_START.test(version);

/**
 * Splits `name@spec` (also `@scope/name@spec`) at the separating `@`: the first one after the
 * optional scope prefix, because specs may contain `@` themselves (`npm:alias@1.0.0`, patch URLs).
 */
const splitNameAndSpec = (identifier: string): { name: string; spec: string } | null => {
  const at = identifier.indexOf("@", 1);
  if (at === -1) return null;
  return { name: identifier.slice(0, at), spec: identifier.slice(at + 1) };
};

/** Collects packages unique by `name@version`; the direct flag sticks once any occurrence is direct. */
const createCollector = () => {
  const byKey = new Map<string, LockedPackage>();
  return {
    add: (name: string, version: string, direct: boolean): void => {
      const key = `${name}@${version}`;
      const existing = byKey.get(key);
      if (existing) existing.direct ||= direct;
      else byKey.set(key, { name, version, direct });
    },
    packages: (): LockedPackage[] => [...byKey.values()],
  };
};

const lineOfOffset = (content: string, offset: number): number => {
  let line = 1;
  for (let index = content.indexOf("\n"); index !== -1 && index < offset; index = content.indexOf("\n", index + 1)) {
    line++;
  }
  return line;
};

/** Line of the first occurrence of `needle`, or 1. */
const lineOfText = (content: string, needle: string): number => {
  const offset = content.indexOf(needle);
  return offset === -1 ? 1 : lineOfOffset(content, offset);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dependencyNamesOf = (manifest: unknown): string[] => {
  if (!isRecord(manifest)) return [];
  return ["dependencies", "devDependencies", "optionalDependencies"].flatMap((field) =>
    isRecord(manifest[field]) ? Object.keys(manifest[field]) : [],
  );
};

// ---------------------------------------------------------------------------------------------
// npm

interface NpmLockEntry {
  name?: string;
  version?: string;
  link?: boolean;
  dependencies?: Record<string, NpmLockEntry>;
}

const parseNpm = (content: string, directNames: ReadonlySet<string>): ParsedLockfile => {
  const lock = JSON.parse(content) as unknown;
  if (!isRecord(lock)) throw new Error("not a JSON object");
  const collector = createCollector();

  if (isRecord(lock.packages)) {
    // Lockfile v2/v3: a flat map keyed by install path (`node_modules/a/node_modules/b`).
    const rootNames = new Set([...directNames, ...dependencyNamesOf(lock.packages[""])]);
    for (const [key, raw] of Object.entries(lock.packages)) {
      const marker = key.lastIndexOf("node_modules/");
      if (marker === -1 || !isRecord(raw)) continue; // the root ("") and workspace members
      const entry = raw as NpmLockEntry;
      if (entry.link || typeof entry.version !== "string" || !isRegistryVersion(entry.version)) continue;
      const installedName = key.slice(marker + "node_modules/".length);
      // An aliased install (`"foo": "npm:bar@1"`) records the real package name.
      const name = typeof entry.name === "string" ? entry.name : installedName;
      const isTopLevel = key === `node_modules/${installedName}`;
      collector.add(name, entry.version, isTopLevel && rootNames.has(installedName));
    }
  } else if (isRecord(lock.dependencies)) {
    // Lockfile v1: a tree of nested `dependencies`.
    const visit = (tree: Record<string, NpmLockEntry>, isTopLevel: boolean): void => {
      for (const [installedName, raw] of Object.entries(tree)) {
        if (!isRecord(raw)) continue;
        const entry = raw as NpmLockEntry;
        if (typeof entry.version === "string" && isRegistryVersion(entry.version)) {
          collector.add(entry.name ?? installedName, entry.version, isTopLevel && directNames.has(installedName));
        }
        if (isRecord(entry.dependencies)) visit(entry.dependencies, false);
      }
    };
    visit(lock.dependencies as Record<string, NpmLockEntry>, true);
  }

  return {
    kind: "npm",
    packages: collector.packages(),
    lineOf: (pkg) => {
      const keyed = lineOfText(content, `"node_modules/${pkg.name}"`);
      return keyed !== 1 ? keyed : lineOfText(content, `"${pkg.name}": {`);
    },
  };
};

// ---------------------------------------------------------------------------------------------
// pnpm

const PNPM_KEY_LINE = /^ {2}(?:'([^']+)'|"([^"]+)"|([^\s'"#][^:]*)):(?:\s|$)/;

/** `/foo@1.0.0(peer@2)` (v6) or `foo@1.0.0` (v9) to name and version; `null` for non-registry packages. */
const parsePnpmKey = (rawKey: string): { name: string; version: string } | null => {
  const key = rawKey.replace(/^\//, "").replace(/\(.*$/, "");
  const parts = splitNameAndSpec(key);
  return parts && isRegistryVersion(parts.spec) ? { name: parts.name, version: parts.spec } : null;
};

const parsePnpm = (content: string, directNames: ReadonlySet<string>): ParsedLockfile => {
  const collector = createCollector();
  const lineByKey = new Map<string, number>();
  const lines = content.split(/\r?\n/);
  let section = "";
  lines.forEach((text, index) => {
    if (/^\S/.test(text) && !text.startsWith("#")) {
      section = text.replace(/:.*$/, "");
      return;
    }
    if (section !== "packages") return;
    const match = PNPM_KEY_LINE.exec(text);
    const parsed = match && parsePnpmKey(match[1] ?? match[2] ?? match[3]);
    if (!parsed) return;
    collector.add(parsed.name, parsed.version, directNames.has(parsed.name));
    const key = `${parsed.name}@${parsed.version}`;
    if (!lineByKey.has(key)) lineByKey.set(key, index + 1);
  });
  return {
    kind: "pnpm",
    packages: collector.packages(),
    lineOf: (pkg) => lineByKey.get(`${pkg.name}@${pkg.version}`) ?? 1,
  };
};

// ---------------------------------------------------------------------------------------------
// Yarn (classic v1 and Berry)

const stripQuotes = (text: string): string => text.replace(/^["']|["']$/g, "");

const parseYarn = (content: string, directNames: ReadonlySet<string>): ParsedLockfile => {
  const collector = createCollector();
  const lineByKey = new Map<string, number>();
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const header = lines[index];
    // Entries start at column 0 and end with a colon; `__metadata:` and comments are not packages.
    if (!header || header.startsWith("#") || /^\s/.test(header) || !header.endsWith(":")) continue;
    if (header.startsWith("__metadata")) continue;

    const specs = header.slice(0, -1).split(/,\s*/).map(stripQuotes);
    const first = splitNameAndSpec(specs[0]);
    if (!first) continue;

    let version: string | null = null;
    let resolution: string | null = null;
    for (let next = index + 1; next < lines.length && /^\s/.test(lines[next]); next++) {
      const body = lines[next];
      const versionMatch = /^ {2}version:?\s+"?([^"\s]+)"?\s*$/.exec(body);
      if (versionMatch) version = versionMatch[1];
      const resolutionMatch = /^ {2}resolution:\s+"?([^"\s]+)"?\s*$/.exec(body);
      if (resolutionMatch) resolution = resolutionMatch[1];
    }
    if (!version || !isRegistryVersion(version)) continue;

    let name = first.name;
    if (resolution) {
      // Berry: `name@npm:1.2.3`; anything else (workspace:, patch:, git, portal) is not a registry package.
      const resolved = splitNameAndSpec(resolution);
      if (!resolved || !resolved.spec.startsWith("npm:")) continue;
      name = resolved.name;
    }
    const direct = specs.some((spec) => directNames.has(splitNameAndSpec(spec)?.name ?? ""));
    collector.add(name, version, direct);
    const key = `${name}@${version}`;
    if (!lineByKey.has(key)) lineByKey.set(key, index + 1);
  }

  return {
    kind: "yarn",
    packages: collector.packages(),
    lineOf: (pkg) => lineByKey.get(`${pkg.name}@${pkg.version}`) ?? 1,
  };
};

// ---------------------------------------------------------------------------------------------
// Bun (text `bun.lock`, JSON with comments and trailing commas)

/** Removes comments and trailing commas outside of strings, so `JSON.parse` can read `bun.lock`. */
export const stripJsonc = (source: string): string => {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      let end = index + 1;
      while (end < source.length && source[end] !== '"') end += source[end] === "\\" ? 2 : 1;
      output += source.slice(index, end + 1);
      index = end + 1;
    } else if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index++;
    } else if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === ",") {
      // A comma directly before a closing bracket (whitespace and comments aside) is a trailing comma.
      let lookahead = index + 1;
      while (lookahead < source.length) {
        if (/\s/.test(source[lookahead])) lookahead++;
        else if (source.startsWith("//", lookahead)) {
          const lineEnd = source.indexOf("\n", lookahead);
          lookahead = lineEnd === -1 ? source.length : lineEnd;
        } else if (source.startsWith("/*", lookahead)) {
          const blockEnd = source.indexOf("*/", lookahead + 2);
          lookahead = blockEnd === -1 ? source.length : blockEnd + 2;
        } else break;
      }
      if (source[lookahead] !== "}" && source[lookahead] !== "]") output += char;
      index++;
    } else {
      output += char;
      index++;
    }
  }
  return output;
};

const parseBun = (content: string, directNames: ReadonlySet<string>): ParsedLockfile => {
  const lock = JSON.parse(stripJsonc(content)) as unknown;
  if (!isRecord(lock) || !isRecord(lock.packages)) throw new Error("no packages section");
  const collector = createCollector();
  const rootNames = new Set(directNames);
  if (isRecord(lock.workspaces)) {
    for (const workspace of Object.values(lock.workspaces)) {
      for (const name of dependencyNamesOf(workspace)) rootNames.add(name);
    }
  }

  for (const [key, entry] of Object.entries(lock.packages)) {
    const identifier = Array.isArray(entry) ? entry[0] : null;
    if (typeof identifier !== "string") continue;
    let parts = splitNameAndSpec(identifier);
    // An aliased install is recorded as `alias@npm:real@1.2.3`.
    if (parts?.spec.startsWith("npm:")) parts = splitNameAndSpec(parts.spec.slice("npm:".length));
    if (!parts || !isRegistryVersion(parts.spec)) continue; // workspace:, github:, file:, link:
    collector.add(parts.name, parts.spec, key === parts.name && rootNames.has(parts.name));
  }

  return {
    kind: "bun",
    packages: collector.packages(),
    lineOf: (pkg) => lineOfText(content, `"${pkg.name}@${pkg.version}"`),
  };
};

// ---------------------------------------------------------------------------------------------

/**
 * Reads the installed packages of a lockfile. `directNames` are the dependency names declared in
 * the project's package.json, used to tell direct from transitive packages. Throws when the content
 * is not valid for the format (the audit turns that into a skipped analyzer with the reason).
 */
export const parseLockfile = (
  kind: LockfileKind,
  content: string,
  directNames: Iterable<string> = [],
): ParsedLockfile => {
  const names = new Set(directNames);
  switch (kind) {
    case "npm":
      return parseNpm(content, names);
    case "pnpm":
      return parsePnpm(content, names);
    case "yarn":
      return parseYarn(content, names);
    case "bun":
      return parseBun(content, names);
  }
};
