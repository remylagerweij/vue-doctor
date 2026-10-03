import fs from "node:fs";
import type { PackageJson } from "../types.js";

interface CachedPackageJson {
  mtimeMs: number;
  size: number;
  value: PackageJson;
}

const packageJsonCache = new Map<string, CachedPackageJson>();

/**
 * Reads and parses a `package.json` (`{}` when it does not exist). Within a process the parsed
 * result is reused, but only while the file's modification time and size are unchanged, so a
 * manifest edited between two `diagnose()` calls (or by a test) is always re-read. Callers must
 * treat the result as read-only. Invalid JSON throws and is never cached.
 */
export const readPackageJson = (packageJsonPath: string): PackageJson => {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(packageJsonPath);
  } catch {
    packageJsonCache.delete(packageJsonPath);
    return {};
  }

  const cached = packageJsonCache.get(packageJsonPath);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.value;

  const value = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson;
  packageJsonCache.set(packageJsonPath, { mtimeMs: stats.mtimeMs, size: stats.size, value });
  return value;
};

/** Forgets every cached manifest (for tests and long-lived hosts). */
export const clearPackageJsonCache = (): void => packageJsonCache.clear();
