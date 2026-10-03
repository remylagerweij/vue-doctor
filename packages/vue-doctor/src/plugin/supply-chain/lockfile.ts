/**
 * Minimal, self-contained lockfile reading for the supply-chain rules. It extracts only what they
 * need per locked package: the name, where it was resolved from and whether it runs an install
 * script. Everything is best-effort: an unreadable lockfile yields `null`, never an exception.
 *
 * Supported: npm (`package-lock.json` / `npm-shrinkwrap.json`, lockfile v1 to v3), pnpm
 * (`pnpm-lock.yaml`, line based) and Yarn classic (`yarn.lock`, line based). Yarn Berry and Bun only
 * get detected (their locks carry no download URL or install-script flag worth reading).
 */

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/** Lockfile file names and the package manager that writes them. */
export const LOCKFILE_MANAGERS: Readonly<Record<string, PackageManager>> = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "yarn.lock": "yarn",
  "pnpm-lock.yaml": "pnpm",
  "bun.lock": "bun",
  "bun.lockb": "bun",
};

/** The registry every npm-compatible client uses without configuration. */
export const DEFAULT_REGISTRY_HOSTS: readonly string[] = ["registry.npmjs.org", "registry.yarnpkg.com"];

export interface LockedPackage {
  name: string;
  /** Absolute URL the package was downloaded from; `null` when the lockfile has none (or it is a local path). */
  resolved: string | null;
  /** The package runs `preinstall` / `install` / `postinstall`. Only npm v2/v3 and pnpm record it. */
  hasInstallScript: boolean;
  /** Top-level entry of the lockfile tree (npm: `node_modules/<name>`); transitive copies are `false`. */
  topLevel: boolean;
}

/** Names of the lockfiles among a directory's file names, in a stable order. */
export const findLockfileNames = (fileNames: readonly string[]): string[] =>
  Object.keys(LOCKFILE_MANAGERS).filter((lockfile) => fileNames.includes(lockfile));

/** Distinct package managers behind a set of lockfile names. */
export const getLockfileManagers = (lockfileNames: readonly string[]): PackageManager[] => [
  ...new Set(lockfileNames.map((name) => LOCKFILE_MANAGERS[name])),
];

const isRemoteUrl = (value: string): boolean => /^(?:https?|git\+[a-z]+|git|ssh):\/\//i.test(value);

/** Host of a URL-ish value (`https://host/x`, `git+ssh://git@host/x`), lowercase; `null` if none. */
export const getUrlHost = (value: string): string | null => {
  if (!isRemoteUrl(value)) return null;
  try {
    return new URL(value.replace(/^git\+/i, "")).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
};

const normalizeResolved = (value: unknown): string | null =>
  typeof value === "string" && isRemoteUrl(value) ? value : null;

const NODE_MODULES_SEGMENT = "node_modules/";

const parseNpmLockfile = (content: string): LockedPackage[] | null => {
  let lock: {
    packages?: Record<string, Record<string, unknown>>;
    dependencies?: Record<string, Record<string, unknown>>;
  };
  try {
    lock = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof lock !== "object" || lock === null) return null;

  const packages: LockedPackage[] = [];
  if (lock.packages && typeof lock.packages === "object") {
    for (const [key, entry] of Object.entries(lock.packages)) {
      const nameStart = key.lastIndexOf(NODE_MODULES_SEGMENT);
      // "" is the root project; keys without node_modules are workspace folders (symlinked, never downloaded).
      if (nameStart === -1 || entry?.link === true) continue;
      packages.push({
        name: key.slice(nameStart + NODE_MODULES_SEGMENT.length),
        resolved: normalizeResolved(entry?.resolved),
        hasInstallScript: entry?.hasInstallScript === true,
        topLevel: nameStart === 0 && key.indexOf(NODE_MODULES_SEGMENT, NODE_MODULES_SEGMENT.length) === -1,
      });
    }
    return packages;
  }

  // Lockfile v1: a nested `dependencies` tree; it records no install scripts.
  const walk = (dependencies: Record<string, Record<string, unknown>>, topLevel: boolean): void => {
    for (const [name, entry] of Object.entries(dependencies)) {
      packages.push({ name, resolved: normalizeResolved(entry?.resolved), hasInstallScript: false, topLevel });
      if (entry?.dependencies && typeof entry.dependencies === "object") {
        walk(entry.dependencies as Record<string, Record<string, unknown>>, false);
      }
    }
  };
  if (lock.dependencies && typeof lock.dependencies === "object") {
    walk(lock.dependencies, true);
    return packages;
  }
  return lock.packages === undefined ? null : packages;
};

// `/@scope/name@1.0.0:` (pnpm 6), `@scope/name@1.0.0:`, `'name@1.0.0(peer@2.0.0)':` (pnpm 9)
const PNPM_PACKAGE_KEY = /^ {2}['"]?\/?((?:@[^/@\s'"]+\/)?[^@\s'"/]+)@[^\s'"]*['"]?:\s*$/;
// Pnpm 5 wrote `/name/1.0.0:` and `/@scope/name/1.0.0:`.
const PNPM_LEGACY_PACKAGE_KEY = /^ {2}\/((?:@[^/\s]+\/)?[^/\s]+)\/[^/\s]+:\s*$/;
const PNPM_TARBALL = /tarball:\s*['"]?([^\s,'"}]+)/;

const parsePnpmLockfile = (content: string): LockedPackage[] | null => {
  const lines = content.split(/\r?\n/);
  const packagesStart = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (packagesStart === -1) return /^lockfileVersion:/m.test(content) ? [] : null;

  const packages: LockedPackage[] = [];
  let current: LockedPackage | null = null;
  for (const line of lines.slice(packagesStart + 1)) {
    if (/^\S/.test(line)) break; // next top-level section (`snapshots:`, `importers:`)
    const key = PNPM_PACKAGE_KEY.exec(line) ?? PNPM_LEGACY_PACKAGE_KEY.exec(line);
    if (key) {
      current = { name: key[1], resolved: null, hasInstallScript: false, topLevel: true };
      packages.push(current);
    } else if (current) {
      const tarball = /^\s+resolution:/.test(line) ? PNPM_TARBALL.exec(line) : null;
      if (tarball) current.resolved = normalizeResolved(tarball[1]);
      if (/^\s+requiresBuild:\s*true\s*$/.test(line)) current.hasInstallScript = true;
    }
  }
  return packages;
};

// Yarn classic entry header: `"@scope/name@^1.0.0", "@scope/name@^1.1.0":` or `name@^1.0.0:`
const YARN_ENTRY_HEADER = /^(?:"?((?:@[^/@\s"]+\/)?[^@\s"]+)@)[^\n]*:\s*$/;
const YARN_RESOLVED = /^\s+resolved\s+"?([^"\s]+)"?\s*$/;

const parseYarnLockfile = (content: string): LockedPackage[] | null => {
  // Yarn Berry (v2+) is YAML with a `__metadata` block and carries no URLs.
  if (/^__metadata:/m.test(content)) return [];
  const packages: LockedPackage[] = [];
  let current: LockedPackage | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const header = /^\S/.test(line) ? YARN_ENTRY_HEADER.exec(line) : null;
    if (header) {
      current = { name: header[1], resolved: null, hasInstallScript: false, topLevel: true };
      packages.push(current);
      continue;
    }
    const resolved = current ? YARN_RESOLVED.exec(line) : null;
    if (current && resolved) current.resolved = normalizeResolved(resolved[1]);
  }
  return packages.length > 0 || /^# yarn lockfile v1/m.test(content) ? packages : null;
};

/**
 * Packages of a lockfile, or `null` when the file cannot be read as that lockfile type (or the type
 * has no readable content, such as Bun's).
 */
export const parseLockfile = (lockfileName: string, content: string): LockedPackage[] | null => {
  switch (LOCKFILE_MANAGERS[lockfileName]) {
    case "npm":
      return parseNpmLockfile(content);
    case "pnpm":
      return parsePnpmLockfile(content);
    case "yarn":
      return parseYarnLockfile(content);
    default:
      return null;
  }
};

/**
 * Registry hosts the project is configured to use: the default registry plus every `registry=` and
 * `@scope:registry=` of `.npmrc` files and `npmRegistryServer` / `npmScopes` entries of `.yarnrc.yml`.
 */
export const readRegistryHosts = (configFiles: readonly { name: string; content: string }[]): string[] => {
  const hosts = new Set(DEFAULT_REGISTRY_HOSTS);
  for (const { name, content } of configFiles) {
    for (const line of content.split(/\r?\n/)) {
      const value = name.endsWith(".yml")
        ? /^\s*npmRegistryServer:\s*['"]?([^'"\s]+)/.exec(line)?.[1]
        : /^\s*(?:@[^:=\s]+:)?registry\s*=\s*['"]?([^'"\s]+)/.exec(line)?.[1];
      const host = value ? getUrlHost(value.startsWith("//") ? `https:${value}` : value) : null;
      if (host) hosts.add(host);
    }
  }
  return [...hosts];
};

/** Locked packages downloaded from a host that is not one of the configured registries. */
export const findNonRegistryPackages = (
  packages: readonly LockedPackage[],
  registryHosts: readonly string[],
): LockedPackage[] =>
  packages.filter((entry) => {
    if (!entry.resolved) return false;
    const host = getUrlHost(entry.resolved);
    return host !== null && !registryHosts.includes(host);
  });

const isPinnedToCommit = (spec: string): boolean => /#[0-9a-f]{40}$/i.test(spec);

/**
 * How a `package.json` dependency spec bypasses the registry: `git`, `http` (plain, unencrypted),
 * `tarball` (https URL) or `null` for registry versions, ranges, tags, `npm:` aliases, `file:`,
 * `link:`, `workspace:` and `catalog:`. A git spec pinned to a full commit hash is immutable and
 * returns `null`.
 */
export const classifyDependencySpec = (spec: string): "git" | "http" | "tarball" | null => {
  const value = spec.trim();
  if (/^http:\/\//i.test(value)) return "http";
  if (/^https?:\/\//i.test(value)) {
    // `git+https://` is handled below; a bare https URL ending in .git is a repository, anything else a tarball.
    return /\.git(?:#|$)/i.test(value) ? (isPinnedToCommit(value) ? null : "git") : "tarball";
  }
  const isGit =
    /^(?:git\+[a-z]+:\/\/|git:\/\/|git@|github:|gitlab:|bitbucket:|gist:)/i.test(value) ||
    // `user/repo` and `user/repo#ref` GitHub shorthand
    /^[\w.-]+\/[\w.-]+(?:#.*)?$/.test(value);
  if (!isGit) return null;
  return isPinnedToCommit(value) ? null : "git";
};
