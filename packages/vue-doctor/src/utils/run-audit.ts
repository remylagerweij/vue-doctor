import fs from "node:fs";
import path from "node:path";
import { AUDIT_RULES, PLUGIN_NAME, toDiagnosticRule } from "../plugin/registry.js";
import type { PackageJson, Diagnostic } from "../types.js";
import { findLockfile, parseLockfile, type LockedPackage } from "./lockfiles.js";
import { compareSeverity, compareVersions, queryAdvisories, type OsvOptions, type PackageAdvisory } from "./osv.js";
import { readPackageJson } from "./read-package-json.js";

/**
 * The "audit" analyzer: reads the project's lockfile and asks OSV.dev which of the installed
 * dependency versions have known vulnerabilities (see utils/osv.ts). Opt-in (`--audit` or
 * `audit.enabled`) and never run with `--offline`; `diagnose()` enforces both before calling it.
 * Reads only the lockfile and package.json and writes nothing in the project.
 */

/** Advisories named in one message before it says "and N more". */
const MAX_ADVISORIES_IN_MESSAGE = 3;

const RULE_META = AUDIT_RULES.find((rule) => rule.ruleMeta.id === "vulnerable-dependency")!.ruleMeta;

const BINARY_BUN_LOCKFILE_REASON =
  "bun.lockb is Bun's binary lockfile and cannot be read; switch to the text lockfile (`bun install --save-text-lockfile`, default since Bun 1.2) or audit with `bun audit`";

const toPosixPath = (filePath: string): string => filePath.split(path.sep).join("/");

const declaredDependencyNames = (directory: string): string[] => {
  try {
    const manifest = readPackageJson(path.join(directory, "package.json")) as PackageJson & {
      optionalDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ];
  } catch {
    return [];
  }
};

/** `GHSA-xxxx-xxxx-xxxx (CVE-2021-1234)`: the advisory's own ID with its CVE alias, when it has one. */
const describeAdvisoryId = (advisory: PackageAdvisory): string => {
  const cve = advisory.aliases.find((alias) => alias.startsWith("CVE-"));
  return cve && cve !== advisory.id ? `${advisory.id} (${cve})` : advisory.id;
};

export const formatVulnerabilityMessage = (pkg: LockedPackage, advisories: readonly PackageAdvisory[]): string => {
  const worst = advisories[0];
  const named = advisories.slice(0, MAX_ADVISORIES_IN_MESSAGE).map(describeAdvisoryId).join(", ");
  const more = advisories.length - MAX_ADVISORIES_IN_MESSAGE;
  const count = advisories.length === 1 ? "1 known vulnerability" : `${advisories.length} known vulnerabilities`;
  const summary = worst.summary ? `: ${worst.summary}` : "";

  // The version that resolves all of them is the highest of the per-advisory fixes.
  const fixes = advisories.map((advisory) => advisory.fixedVersion);
  const fixed = fixes.every((version) => version !== undefined)
    ? (fixes as string[]).sort(compareVersions).at(-1)
    : undefined;
  const remedy = fixed ? `fixed in ${fixed}` : "no fixed version is known";

  return `${pkg.name}@${pkg.version} (${pkg.direct ? "direct" : "transitive"} dependency) has ${count}, highest severity ${worst.severity} — ${named}${more > 0 ? ` and ${more} more` : ""}${summary}; ${remedy}`;
};

export type AuditOptions = OsvOptions;

/**
 * Audits one project. Resolves to its findings (reported on the lockfile); throws an `Error` with a
 * user-readable reason when the audit cannot run (no lockfile, unreadable lockfile, OSV unreachable),
 * which `diagnose()` reports as a skipped analyzer.
 */
export const runAudit = async (directory: string, options: AuditOptions = {}): Promise<Diagnostic[]> => {
  const lockfile = findLockfile(directory);
  if (!lockfile) {
    throw new Error("no lockfile found (package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml, yarn.lock or bun.lock)");
  }
  if (lockfile.binary) throw new Error(BINARY_BUN_LOCKFILE_REASON);

  const lockfileName = path.basename(lockfile.filePath);
  let parsed;
  try {
    // A workspace's own manifest and the monorepo root's both declare direct dependencies.
    const names = new Set([
      ...declaredDependencyNames(directory),
      ...declaredDependencyNames(path.dirname(lockfile.filePath)),
    ]);
    parsed = parseLockfile(lockfile.kind, fs.readFileSync(lockfile.filePath, "utf-8"), names);
  } catch (error) {
    throw new Error(`could not read ${lockfileName}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (parsed.packages.length === 0) return [];

  const advisoriesByPackage = await queryAdvisories(parsed.packages, options);

  const relativeLockfile = toPosixPath(path.relative(directory, lockfile.filePath));
  const findings: Array<{ diagnostic: Diagnostic; worst: PackageAdvisory["severity"] }> = [];
  for (const pkg of parsed.packages) {
    const advisories = advisoriesByPackage.get(`${pkg.name}@${pkg.version}`);
    if (!advisories || advisories.length === 0) continue;
    findings.push({
      worst: advisories[0].severity,
      diagnostic: {
        filePath: relativeLockfile,
        plugin: PLUGIN_NAME,
        rule: toDiagnosticRule(RULE_META),
        severity: RULE_META.defaultSeverity as "error" | "warning",
        message: formatVulnerabilityMessage(pkg, advisories),
        help: RULE_META.help,
        line: parsed.lineOf(pkg),
        column: 1,
        category: RULE_META.category,
      },
    });
  }

  // Worst first, then by package, so output never depends on lockfile order.
  return findings
    .sort((a, b) => compareSeverity(b.worst, a.worst) || a.diagnostic.message.localeCompare(b.diagnostic.message))
    .map(({ diagnostic }) => diagnostic);
};
