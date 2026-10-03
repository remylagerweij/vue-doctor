import fs from "node:fs";
import path from "node:path";
import { mapWithConcurrency } from "./map-with-concurrency.js";

/**
 * Client for OSV.dev (https://google.github.io/osv.dev/api/), the open vulnerability database that
 * aggregates GitHub advisories, the npm advisory feed and others. This is the only module of Vue
 * Doctor that talks to the network, and only the opt-in dependency audit calls it (never with
 * `--offline`). The only data sent are package names and versions, as OSV's API requires.
 *
 *   1. `POST /v1/querybatch` (up to 1000 package versions per request) returns the IDs of the
 *      advisories that affect each version.
 *   2. `GET /v1/vulns/{id}` returns the details of each distinct advisory: summary, severity,
 *      aliases (CVE, GHSA) and the fixed versions.
 *
 * Answers are kept for 24 hours in the cache directory (per `name@version` and per advisory), so
 * repeated runs, such as an agent's fix loop, ask OSV about nothing new.
 */

export const OSV_API_URL = "https://api.osv.dev";
/** OSV rejects batches above this many queries. */
export const OSV_BATCH_SIZE = 1000;
const OSV_ECOSYSTEM = "npm";
const REQUEST_TIMEOUT_MS = 20_000;
const DETAIL_CONCURRENCY = 8;
/** Follow-up pages for one package version; OSV paginates only for packages with very many advisories. */
const MAX_QUERY_PAGES = 5;
export const OSV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE_NAME = "osv-cache.json";
const CACHE_FORMAT_VERSION = 1;

export type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

export type VulnerabilitySeverity = "critical" | "high" | "moderate" | "low" | "unknown";

export interface PackageVersion {
  name: string;
  version: string;
}

/** What is kept of an OSV advisory. `affected` lists the fixed versions per package name. */
export interface OsvAdvisory {
  id: string;
  aliases: string[];
  summary: string;
  severity: VulnerabilitySeverity;
  /** CVSS base score when the advisory carries a CVSS v3 vector. */
  score?: number;
  affected: Array<{ name: string; fixed: string[] }>;
}

/** An advisory as it applies to one installed package version. */
export interface PackageAdvisory extends OsvAdvisory {
  /** Lowest version above the installed one that fixes it, when OSV knows one. */
  fixedVersion?: string;
}

export interface OsvOptions {
  /** HTTP implementation; defaults to the global `fetch`. Tests inject a recorded one. */
  fetch?: FetchImplementation;
  /** Directory for the 24h response cache; `null` disables caching. */
  cacheDirectory?: string | null;
  /** Clock, for tests. */
  now?: () => number;
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------------------------
// Severity

const SEVERITY_RANK: Record<VulnerabilitySeverity, number> = { unknown: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export const compareSeverity = (left: VulnerabilitySeverity, right: VulnerabilitySeverity): number =>
  SEVERITY_RANK[left] - SEVERITY_RANK[right];

export const severityFromScore = (score: number): VulnerabilitySeverity => {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "moderate";
  return score > 0 ? "low" : "unknown";
};

const CVSS3_WEIGHTS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

/** CVSS 3.1 round-up to one decimal (specification, appendix A). */
const roundUp = (value: number): number => {
  const integer = Math.round(value * 100_000);
  return integer % 10_000 === 0 ? integer / 100_000 : (Math.floor(integer / 10_000) + 1) / 10;
};

/** Base score of a CVSS v3.x vector such as `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`; `undefined` for other versions or malformed vectors. */
export const cvss3BaseScore = (vector: string): number | undefined => {
  if (!/^CVSS:3\.[01]\//.test(vector)) return undefined;
  const metrics = Object.fromEntries(vector.split("/").slice(1).map((part) => part.split(":") as [string, string]));
  const attackVector = CVSS3_WEIGHTS.AV[metrics.AV as keyof typeof CVSS3_WEIGHTS.AV];
  const complexity = CVSS3_WEIGHTS.AC[metrics.AC as keyof typeof CVSS3_WEIGHTS.AC];
  const userInteraction = CVSS3_WEIGHTS.UI[metrics.UI as keyof typeof CVSS3_WEIGHTS.UI];
  const confidentiality = CVSS3_WEIGHTS.CIA[metrics.C as keyof typeof CVSS3_WEIGHTS.CIA];
  const integrity = CVSS3_WEIGHTS.CIA[metrics.I as keyof typeof CVSS3_WEIGHTS.CIA];
  const availability = CVSS3_WEIGHTS.CIA[metrics.A as keyof typeof CVSS3_WEIGHTS.CIA];
  const scopeChanged = metrics.S === "C";
  if (metrics.S !== "C" && metrics.S !== "U") return undefined;
  const privilegesTable = scopeChanged ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 };
  const privileges = privilegesTable[metrics.PR as keyof typeof privilegesTable];
  if ([attackVector, complexity, userInteraction, confidentiality, integrity, availability, privileges].includes(undefined as never)) {
    return undefined;
  }

  const impactSubScore = 1 - (1 - confidentiality) * (1 - integrity) * (1 - availability);
  const impact = scopeChanged
    ? 7.52 * (impactSubScore - 0.029) - 3.25 * (impactSubScore - 0.02) ** 15
    : 6.42 * impactSubScore;
  if (impact <= 0) return 0;
  const exploitability = 8.22 * attackVector * complexity * privileges * userInteraction;
  return roundUp(Math.min(scopeChanged ? 1.08 * (impact + exploitability) : impact + exploitability, 10));
};

const normalizeSeverityLabel = (label: unknown): VulnerabilitySeverity | undefined => {
  switch (typeof label === "string" ? label.toUpperCase() : "") {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MODERATE":
    case "MEDIUM":
      return "moderate";
    case "LOW":
      return "low";
    default:
      return undefined;
  }
};

// ---------------------------------------------------------------------------------------------
// Versions

const versionParts = (version: string): number[] =>
  version
    .split("-", 1)[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

/** Numeric `major.minor.patch` comparison; pre-release tags are ignored. */
export const compareVersions = (left: string, right: string): number => {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

/** The lowest fixed version above `installed` for this package, or `undefined` when OSV lists none. */
export const lowestFixedVersion = (advisory: OsvAdvisory, name: string, installed: string): string | undefined => {
  const candidates = advisory.affected
    .filter((entry) => entry.name === name)
    .flatMap((entry) => entry.fixed)
    .filter((version) => compareVersions(version, installed) > 0)
    .sort(compareVersions);
  return candidates[0];
};

// ---------------------------------------------------------------------------------------------
// Response parsing (defensive: OSV records vary by source)

interface RawAdvisory {
  id?: unknown;
  aliases?: unknown;
  summary?: unknown;
  details?: unknown;
  severity?: unknown;
  database_specific?: { severity?: unknown };
  affected?: unknown;
}

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const toAdvisory = (raw: RawAdvisory): OsvAdvisory | null => {
  if (typeof raw.id !== "string") return null;

  let score: number | undefined;
  if (Array.isArray(raw.severity)) {
    for (const entry of raw.severity as Array<{ type?: unknown; score?: unknown }>) {
      if (typeof entry.score !== "string") continue;
      const value = cvss3BaseScore(entry.score);
      if (value !== undefined && (score === undefined || value > score)) score = value;
    }
  }
  const severity = score === undefined ? (normalizeSeverityLabel(raw.database_specific?.severity) ?? "unknown") : severityFromScore(score);

  const affected: OsvAdvisory["affected"] = [];
  if (Array.isArray(raw.affected)) {
    for (const entry of raw.affected as Array<{ package?: { name?: unknown; ecosystem?: unknown }; ranges?: unknown }>) {
      if (entry.package?.ecosystem !== OSV_ECOSYSTEM || typeof entry.package.name !== "string") continue;
      const fixed: string[] = [];
      if (Array.isArray(entry.ranges)) {
        for (const range of entry.ranges as Array<{ events?: Array<{ fixed?: unknown }> }>) {
          for (const event of range.events ?? []) if (typeof event.fixed === "string") fixed.push(event.fixed);
        }
      }
      affected.push({ name: entry.package.name, fixed });
    }
  }

  const summary = typeof raw.summary === "string" && raw.summary.trim() !== "" ? raw.summary : typeof raw.details === "string" ? raw.details : "";
  return {
    id: raw.id,
    aliases: stringArray(raw.aliases),
    // Single line and bounded: the text comes from a third party and ends up in reports.
    summary: summary.split(/\r?\n/, 1)[0].slice(0, 200),
    severity,
    ...(score === undefined ? {} : { score }),
    affected,
  };
};

// ---------------------------------------------------------------------------------------------
// Cache

interface OsvCacheFile {
  version: typeof CACHE_FORMAT_VERSION;
  /** `name@version` to advisory IDs. */
  packages: Record<string, { at: number; ids: string[] }>;
  advisories: Record<string, { at: number; advisory: OsvAdvisory }>;
}

const readOsvCache = (filePath: string): OsvCacheFile => {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<OsvCacheFile>;
    if (parsed.version === CACHE_FORMAT_VERSION && parsed.packages && parsed.advisories) return parsed as OsvCacheFile;
  } catch {
    // Missing or corrupt: start empty.
  }
  return { version: CACHE_FORMAT_VERSION, packages: {}, advisories: {} };
};

const writeOsvCache = (filePath: string, cache: OsvCacheFile, now: number): void => {
  try {
    for (const [key, entry] of Object.entries(cache.packages)) if (now - entry.at >= OSV_CACHE_TTL_MS) delete cache.packages[key];
    for (const [key, entry] of Object.entries(cache.advisories)) if (now - entry.at >= OSV_CACHE_TTL_MS) delete cache.advisories[key];
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(cache));
    fs.renameSync(temporaryPath, filePath);
  } catch {
    // The cache is best-effort.
  }
};

// ---------------------------------------------------------------------------------------------
// HTTP

class OsvRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OsvRequestError";
  }
}

const describeFailure = (error: unknown): string => {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "request timed out";
  const cause = error instanceof Error ? (error.cause as { message?: string } | undefined) : undefined;
  return cause?.message ?? (error instanceof Error ? error.message : String(error));
};

const requestJson = async (
  fetchImplementation: FetchImplementation,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> => {
  const attempt = async (): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImplementation(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new OsvRequestError(describeFailure(error), true);
    }
    if (!response.ok) {
      throw new OsvRequestError(`HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    }
    try {
      return await response.json();
    } catch {
      throw new OsvRequestError("invalid JSON response", true);
    }
  };

  try {
    return await attempt();
  } catch (error) {
    // One retry for transient failures (network, timeout, 429, 5xx).
    if (!(error instanceof OsvRequestError) || !error.retryable) throw error;
    return attempt();
  }
};

const post = (fetchImplementation: FetchImplementation, endpoint: string, body: unknown, timeoutMs: number) =>
  requestJson(
    fetchImplementation,
    `${OSV_API_URL}${endpoint}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    timeoutMs,
  );

interface BatchResult {
  vulns?: Array<{ id?: unknown }>;
  next_page_token?: unknown;
}

const idsOf = (result: BatchResult | undefined): string[] =>
  (result?.vulns ?? []).map((vuln) => vuln.id).filter((id): id is string => typeof id === "string");

// ---------------------------------------------------------------------------------------------

const keyOf = ({ name, version }: PackageVersion): string => `${name}@${version}`;

/**
 * Looks up the advisories that affect each package version. Resolves to a map keyed by
 * `name@version` (only versions with advisories are present, worst severity first). Throws an
 * `Error` with a readable message when OSV cannot be reached; callers turn that into a skipped
 * analyzer rather than a crash.
 */
export const queryAdvisories = async (
  packages: readonly PackageVersion[],
  options: OsvOptions = {},
): Promise<Map<string, PackageAdvisory[]>> => {
  const fetchImplementation = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const cachePath = options.cacheDirectory ? path.join(options.cacheDirectory, CACHE_FILE_NAME) : null;
  const cache = cachePath ? readOsvCache(cachePath) : null;
  const isFresh = (at: number): boolean => now() - at < OSV_CACHE_TTL_MS;

  try {
    // 1. Which advisories affect each version? Only versions the cache does not know are asked.
    const idsByPackage = new Map<string, string[]>();
    const unknown: PackageVersion[] = [];
    for (const pkg of packages) {
      const cached = cache?.packages[keyOf(pkg)];
      if (cached && isFresh(cached.at)) idsByPackage.set(keyOf(pkg), cached.ids);
      else unknown.push(pkg);
    }

    for (let start = 0; start < unknown.length; start += OSV_BATCH_SIZE) {
      const chunk = unknown.slice(start, start + OSV_BATCH_SIZE);
      const response = (await post(
        fetchImplementation,
        "/v1/querybatch",
        { queries: chunk.map((pkg) => ({ package: { name: pkg.name, ecosystem: OSV_ECOSYSTEM }, version: pkg.version })) },
        timeoutMs,
      )) as { results?: BatchResult[] };
      if (!Array.isArray(response?.results) || response.results.length !== chunk.length) {
        throw new Error("unexpected response from OSV (querybatch)");
      }

      for (const [index, pkg] of chunk.entries()) {
        const ids = new Set(idsOf(response.results[index]));
        // Packages with very many advisories come back in pages.
        let token = response.results[index].next_page_token;
        for (let page = 0; typeof token === "string" && token !== "" && page < MAX_QUERY_PAGES; page++) {
          const next = (await post(
            fetchImplementation,
            "/v1/query",
            { package: { name: pkg.name, ecosystem: OSV_ECOSYSTEM }, version: pkg.version, page_token: token },
            timeoutMs,
          )) as BatchResult;
          for (const id of idsOf(next)) ids.add(id);
          token = next.next_page_token;
        }
        idsByPackage.set(keyOf(pkg), [...ids].sort());
        if (cache) cache.packages[keyOf(pkg)] = { at: now(), ids: [...ids].sort() };
      }
    }

    // 2. Details of every distinct advisory, fetched once.
    const advisories = new Map<string, OsvAdvisory>();
    const toFetch: string[] = [];
    for (const id of new Set([...idsByPackage.values()].flat())) {
      const cached = cache?.advisories[id];
      if (cached && isFresh(cached.at)) advisories.set(id, cached.advisory);
      else toFetch.push(id);
    }
    const fetched = await mapWithConcurrency(toFetch, DETAIL_CONCURRENCY, async (id) => {
      const raw = await requestJson(fetchImplementation, `${OSV_API_URL}/v1/vulns/${encodeURIComponent(id)}`, { method: "GET" }, timeoutMs);
      return toAdvisory(raw as RawAdvisory) ?? { id, aliases: [], summary: "", severity: "unknown" as const, affected: [] };
    });
    for (const advisory of fetched) {
      advisories.set(advisory.id, advisory);
      if (cache) cache.advisories[advisory.id] = { at: now(), advisory };
    }

    // 3. Join, with the fix that applies to the installed version.
    const result = new Map<string, PackageAdvisory[]>();
    for (const pkg of packages) {
      const ids = idsByPackage.get(keyOf(pkg)) ?? [];
      if (ids.length === 0) continue;
      const applicable = ids
        .map((id) => advisories.get(id))
        .filter((advisory): advisory is OsvAdvisory => advisory !== undefined)
        .map((advisory): PackageAdvisory => ({ ...advisory, fixedVersion: lowestFixedVersion(advisory, pkg.name, pkg.version) }))
        .sort((a, b) => compareSeverity(b.severity, a.severity) || a.id.localeCompare(b.id));
      result.set(keyOf(pkg), applicable);
    }
    return result;
  } catch (error) {
    throw new Error(`OSV query failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally {
    if (cachePath && cache) writeOsvCache(cachePath, cache, now());
  }
};
