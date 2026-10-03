import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Diagnostic } from "../types.js";
import { normalizeRelativePath } from "../utils/list-source-files.js";

/**
 * Content-hash cache of raw analyzer findings, so re-runs (e.g. an AI agent's fix loop) only send
 * changed files to oxlint and ESLint, and skip knip when nothing relevant changed.
 *
 * What is cached are the analyzers' own findings, before config filtering, suppressions,
 * fingerprints and scoring; those are cheap and always recomputed, so config changes apply
 * immediately. Each analyzer has a context key (tool versions, Vue Doctor version, generated
 * analyzer config, ...): when it changes, that analyzer's entries are discarded.
 *
 * The cache is best-effort: unreadable or unwritable cache files never fail a scan.
 */

const CACHE_FORMAT_VERSION = 3;
const CACHE_FILE_NAME = "cache.json";

export type CachedAnalyzer = "lint" | "template";

/** Analyzers that report cache statistics: the per-file ones plus the two whole-project ones. */
export type CacheStatsAnalyzer = CachedAnalyzer | "dead-code" | "project";

/** Everything a project-level run read (see utils/run-project-checks.ts) mapped to a content hash. */
type ProjectInputs = Record<string, string | null>;

interface FileEntry {
  hash: string;
  lint?: Diagnostic[];
  template?: Diagnostic[];
}

interface CacheFile {
  version: typeof CACHE_FORMAT_VERSION;
  contexts: Partial<Record<CacheStatsAnalyzer, string>>;
  files: Record<string, FileEntry>;
  deadCode?: { key: string; diagnostics: Diagnostic[] };
  project?: { listing: string; inputs: ProjectInputs; diagnostics: Diagnostic[] };
}

export interface CacheStats {
  /** Absolute path of the cache directory. */
  directory: string;
  /** Files whose findings came from the cache, per analyzer (`dead-code`: 1 for a whole-project hit). */
  hits: Record<CacheStatsAnalyzer, number>;
  /** Files (or, for dead code, whole-project runs) that had to be analyzed. */
  misses: Record<CacheStatsAnalyzer, number>;
}

export const hashText = (text: string | Buffer): string => createHash("sha1").update(text).digest("hex");

const hashFile = (filePath: string): string | null => {
  try {
    return hashText(fs.readFileSync(filePath));
  } catch {
    return null;
  }
};

const userCacheRoot = (): string => {
  if (process.env.XDG_CACHE_HOME) return process.env.XDG_CACHE_HOME;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA;
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches");
  return path.join(os.homedir(), ".cache");
};

/**
 * `VUE_DOCTOR_CACHE_DIR` (per-project subdirectory), else the project's `node_modules/.cache/vue-doctor`
 * (the convention of ESLint, Babel and friends), else a per-project directory in the user cache, so
 * projects without node_modules are never written to.
 */
export const resolveCacheDirectory = (projectDirectory: string): string => {
  const projectKey = hashText(path.resolve(projectDirectory)).slice(0, 16);
  if (process.env.VUE_DOCTOR_CACHE_DIR) return path.join(process.env.VUE_DOCTOR_CACHE_DIR, projectKey);
  const nodeModules = path.join(projectDirectory, "node_modules");
  if (fs.existsSync(nodeModules)) return path.join(nodeModules, ".cache", "vue-doctor");
  return path.join(userCacheRoot(), "vue-doctor", projectKey);
};

const emptyCache = (): CacheFile => ({ version: CACHE_FORMAT_VERSION, contexts: {}, files: {} });

const readCacheFile = (filePath: string): CacheFile => {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<CacheFile>;
    if (parsed.version !== CACHE_FORMAT_VERSION || !parsed.files || !parsed.contexts) return emptyCache();
    return parsed as CacheFile;
  } catch {
    return emptyCache();
  }
};

export interface AnalysisCache {
  /**
   * Returns cached findings for unchanged files and runs `analyze` on the rest (never with an
   * empty list), then records the fresh findings per file, including files without findings.
   */
  analyzeFiles: (
    analyzer: CachedAnalyzer,
    relativePaths: string[],
    analyze: (relativePaths: string[]) => Promise<Diagnostic[]>,
  ) => Promise<Diagnostic[]>;
  /** Whole-project cache for dead code, keyed by a hash of every input that can change its result. */
  analyzeProject: (key: string, analyze: () => Promise<Diagnostic[]>) => Promise<Diagnostic[]>;
  /**
   * Whole-project cache for the filesystem rules. The result is reused while the file list hash
   * (`listingKey`) is unchanged and every recorded input still has the hash `snapshot` reports
   * for it, so only the files the rules actually read (and the git file list) matter.
   */
  analyzeWithInputs: (
    listingKey: string,
    snapshot: (inputKey: string) => string | null | undefined,
    analyze: () => { diagnostics: Diagnostic[]; inputs: ProjectInputs } | Promise<{ diagnostics: Diagnostic[]; inputs: ProjectInputs }>,
  ) => Promise<Diagnostic[]>;
  stats: CacheStats;
  /** Persists the cache atomically. Never throws. */
  save: () => void;
}

export const openAnalysisCache = (
  projectDirectory: string,
  contexts: Partial<Record<CacheStatsAnalyzer, string>>,
  onDebug: (message: string) => void = () => {},
): AnalysisCache => {
  const directory = resolveCacheDirectory(projectDirectory);
  const cacheFilePath = path.join(directory, CACHE_FILE_NAME);
  const cache = readCacheFile(cacheFilePath);

  // A changed context (tool upgrade, new rule config, ...) invalidates only that analyzer.
  for (const [analyzer, context] of Object.entries(contexts) as Array<[CacheStatsAnalyzer, string]>) {
    if (cache.contexts[analyzer] === context) continue;
    onDebug(`${analyzer}: context changed, discarding its cached results`);
    cache.contexts[analyzer] = context;
    if (analyzer === "dead-code") {
      delete cache.deadCode;
    } else if (analyzer === "project") {
      delete cache.project;
    } else {
      for (const entry of Object.values(cache.files)) delete entry[analyzer];
    }
  }

  const stats: CacheStats = {
    directory,
    hits: { lint: 0, template: 0, "dead-code": 0, project: 0 },
    misses: { lint: 0, template: 0, "dead-code": 0, project: 0 },
  };
  let dirty = false;

  const analyzeFiles: AnalysisCache["analyzeFiles"] = async (analyzer, relativePaths, analyze) => {
    const cached: Diagnostic[] = [];
    const misses: Array<{ relativePath: string; hash: string | null }> = [];

    const uniquePaths = [...new Set(relativePaths.map(normalizeRelativePath))];
    for (const relativePath of uniquePaths) {
      const hash = hashFile(path.join(projectDirectory, relativePath));
      const entry = cache.files[relativePath];
      const findings = entry?.hash === hash ? entry[analyzer] : undefined;
      if (hash !== null && findings) {
        cached.push(...findings);
      } else {
        misses.push({ relativePath, hash });
      }
    }

    stats.hits[analyzer] += uniquePaths.length - misses.length;
    stats.misses[analyzer] += misses.length;
    if (misses.length === 0) return cached;

    const fresh = await analyze(misses.map((miss) => miss.relativePath));
    const freshByFile = new Map<string, Diagnostic[]>();
    for (const diagnostic of fresh) {
      const key = normalizeRelativePath(diagnostic.filePath);
      freshByFile.set(key, [...(freshByFile.get(key) ?? []), diagnostic]);
    }

    for (const { relativePath, hash } of misses) {
      if (hash === null) continue;
      const entry = cache.files[relativePath];
      // A new content hash invalidates the other analyzers' findings for this file too.
      const base: FileEntry = entry?.hash === hash ? entry : { hash };
      cache.files[relativePath] = { ...base, [analyzer]: freshByFile.get(relativePath) ?? [] };
    }
    dirty = true;
    return [...cached, ...fresh];
  };

  const analyzeProject: AnalysisCache["analyzeProject"] = async (key, analyze) => {
    if (cache.deadCode?.key === key) {
      stats.hits["dead-code"] += 1;
      return cache.deadCode.diagnostics;
    }
    stats.misses["dead-code"] += 1;
    const diagnostics = await analyze();
    cache.deadCode = { key, diagnostics };
    dirty = true;
    return diagnostics;
  };

  const analyzeWithInputs: AnalysisCache["analyzeWithInputs"] = async (listingKey, snapshot, analyze) => {
    const entry = cache.project;
    if (
      entry?.listing === listingKey &&
      Object.entries(entry.inputs).every(([inputKey, hash]) => snapshot(inputKey) === hash)
    ) {
      stats.hits.project += 1;
      return entry.diagnostics;
    }
    stats.misses.project += 1;
    const { diagnostics, inputs } = await analyze();
    cache.project = { listing: listingKey, inputs, diagnostics };
    dirty = true;
    return diagnostics;
  };

  const save = (): void => {
    if (!dirty) return;
    // Drop entries for files that no longer exist, so the cache does not grow forever.
    for (const relativePath of Object.keys(cache.files)) {
      if (!fs.existsSync(path.join(projectDirectory, relativePath))) delete cache.files[relativePath];
    }
    const temporaryPath = `${cacheFilePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(temporaryPath, JSON.stringify(cache));
      fs.renameSync(temporaryPath, cacheFilePath);
      dirty = false;
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      onDebug(`could not write ${cacheFilePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return { analyzeFiles, analyzeProject, analyzeWithInputs, stats, save };
};
