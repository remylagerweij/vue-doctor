import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadConfig, validateConfig } from "../config/load-config.js";
import { applyBaseline, readBaseline, type BaselineSummary } from "./baseline.js";
import { openAnalysisCache, resolveCacheDirectory, type CacheStats } from "./cache.js";
import { computeCacheContexts, computeDeadCodeKey } from "./cache-keys.js";
import { getEnabledFsRules } from "../plugin/registry.js";
import { listProjectFiles } from "../utils/list-project-files.js";
import { computeProjectListingKey, runProjectChecks, snapshotProjectInput } from "../utils/run-project-checks.js";
import { addFingerprints } from "./fingerprint.js";
import { createRuleIdReporter } from "../plugin/rule-ids.js";
import type { CategoryScore, Diagnostic, ProjectInfo, ScoreCap, ScoreImpact, VueDoctorConfig } from "../types.js";
import { logger } from "../utils/logger.js";
import { calculateScore } from "../utils/calculate-score.js";
import { OXLINT_NODE_REQUIREMENT } from "../constants.js";
import { combineDiagnostics, computeVueIncludePaths } from "../utils/combine-diagnostics.js";
import { discoverProject, listNestedWorkspaceDirectories } from "../utils/discover-project.js";
import { resolveNodeForOxlint } from "../utils/resolve-compatible-node.js";
import { runEslintVue } from "../utils/run-eslint-vue.js";
import { runAudit } from "../utils/run-audit.js";
import type { FetchImplementation } from "../utils/osv.js";
import { runKnip, type KnipSession } from "../utils/run-knip.js";
import { isInsideAnyDirectory, listProjectSourceFiles, normalizeRelativePath } from "../utils/list-source-files.js";
import { runOxlint } from "../utils/run-oxlint.js";
import { applySuppressions, type SuppressedSummary } from "../utils/suppressions.js";

export type AnalyzerName = "lint" | "template" | "dead-code" | "project" | "audit";

export type ProgressEvent =
  | { type: "start"; analyzer: AnalyzerName }
  | { type: "done"; analyzer: AnalyzerName; durationMs: number; count: number }
  | { type: "fail"; analyzer: AnalyzerName; durationMs: number; reason: string };

export interface DiagnoseOptions {
  /** Run oxlint with the Vue Doctor plugin. Default: true. */
  lint?: boolean;
  /** Run eslint-plugin-vue template checks. Default: follows `lint`. */
  templateLint?: boolean;
  /**
   * Run the project checks: filesystem rules such as committed `.env` files (see
   * `defineFsRule`). They only read the project; with `includePaths` set, only findings in
   * those files are kept. Default: true.
   */
  projectChecks?: boolean;
  /** Run knip dead-code analysis. Default: true (skipped when `includePaths` is set). */
  deadCode?: boolean;
  /**
   * Run the dependency vulnerability audit: the lockfile's package versions are sent to OSV.dev
   * (see docs/guide/dependency-audit.md). Opt-in, because it is the one feature that uses the
   * network; skipped, with a reason, when `offline` is set. Default: the config's `audit.enabled`, else false.
   */
  audit?: boolean;
  /** HTTP implementation for the audit (default: global `fetch`); lets tests and hosts supply recorded or proxied responses. */
  auditFetch?: FetchImplementation;
  /** Only analyse these files (relative to the project directory). */
  includePaths?: string[];
  /** Scan even when no `vue` dependency is found. */
  force?: boolean;
  /**
   * Guarantee zero network access. Vue Doctor never uses the network by default; features that
   * need it (e.g. the OSV dependency audit) are skipped when this is set. Default: false, or true
   * when the `VUE_DOCTOR_OFFLINE=1` environment variable is set.
   */
  offline?: boolean;
  /**
   * Reuse findings for unchanged files from the content-hash cache (see core/cache.ts).
   * Default: the config's `cache`, else true.
   */
  cache?: boolean;
  /**
   * Use this config instead of loading one from the project directory (`null`: no config).
   * Loading throws `ConfigError` when the project config is invalid.
   */
  config?: VueDoctorConfig | null;
  /**
   * Baseline file (absolute, or relative to the project directory) whose findings get
   * `status: "baseline"`; all others get `status: "new"`. Defaults to the config's `baseline`;
   * `null` disables it. Throws `BaselineError` when the file is missing or invalid.
   */
  baseline?: string | null;
  /**
   * Share one knip run between several projects of the same monorepo (see `createKnipSession`):
   * knip analyses the whole monorepo once and each project takes its own findings from the result.
   * Use one session per scan run, never across runs. Default: each call runs knip for itself.
   */
  knipSession?: KnipSession;
  /** Progress notifications, e.g. to drive spinners. Never called for output. */
  onProgress?: (event: ProgressEvent) => void;
  /** Diagnostic detail for `--debug` (`namespace` like "config" or "lint"); never needed for results. */
  onDebug?: (namespace: string, message: string) => void;
}

export interface SkippedAnalyzer {
  analyzer: AnalyzerName;
  reason: string;
}

export interface DiagnoseResult {
  project: ProjectInfo;
  diagnostics: Diagnostic[];
  /** Findings hidden by `vue-doctor-disable*` comments (never by eslint-disable/oxlint-disable). */
  suppressed: SuppressedSummary;
  /** `eslint-disable` / `oxlint-disable` comments seen in files with findings; they have no effect. */
  foreignDirectives: number;
  /** Overall score (0-100) after caps; the `--min-score` gate compares against this value. */
  score: number;
  label: string;
  /** Version of the score formula (see docs/guide/scoring.md). */
  scoreVersion: number;
  /** Score before caps. */
  rawScore: number;
  /** The security cap that lowered the score; `null` when none applied. */
  scoreCap: ScoreCap | null;
  /** Sub-scores of the categories that have findings, worst first. */
  categoryScores: CategoryScore[];
  /** Overall score gain per rule if all its findings were fixed, largest first. */
  impact: ScoreImpact[];
  skipped: SkippedAnalyzer[];
  /** Milliseconds per analyzer plus `total`. */
  timings: Record<string, number>;
  isDiffMode: boolean;
  includePaths: string[];
  /** Cache hits and misses per analyzer; absent when the cache is disabled. */
  cache?: CacheStats;
  /** Whether the run was restricted to zero network access. */
  offline: boolean;
  /** Present when a baseline was applied. */
  baseline?: BaselineSummary;
}

export class NoVueDependencyError extends Error {
  constructor(directory: string) {
    super(`No Vue dependency found in ${directory}/package.json. Use --force to bypass this check.`);
    this.name = "NoVueDependencyError";
  }
}

const loadBaselineReference = (directory: string, baselineOption: string) => {
  const baselinePath = path.resolve(directory, baselineOption);
  return { baselinePath, fingerprints: readBaseline(baselinePath) };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Runs every analyzer for one project and returns the combined, filtered and scored result.
 * Pure apart from rule-ID warnings (deprecated/unknown IDs in config or suppression comments go to
 * stderr via the logger): it never writes to stdout, never exits the process and never mutates the project.
 */
export const diagnose = async (
  directoryInput: string,
  options: DiagnoseOptions = {},
): Promise<DiagnoseResult> => {
  const startTime = performance.now();
  // Analyzers (ESLint cwd, oxlint tsconfig lookup in temp mirrors) require an absolute root.
  const directory = path.resolve(directoryInput);
  const project = discoverProject(directory);

  if (!project.vueVersion && !options.force) {
    throw new NoVueDependencyError(directory);
  }

  const config =
    options.config === undefined
      ? ((await loadConfig(directory))?.config ?? null)
      : options.config && (await validateConfig(options.config, "options.config"));

  // 1.x rule IDs keep working; each distinct one is reported once per run (also by suppression comments).
  const ruleIdReporter = createRuleIdReporter(logger.warn);
  for (const key of Object.keys(config?.rules ?? {})) ruleIdReporter.check(key, 'config "rules"');
  for (const key of config?.ignore?.rules ?? []) ruleIdReporter.check(key, 'config "ignore.rules"');

  // Read the baseline up front so a missing file fails fast, before any analyzer runs.
  const baselineOption = options.baseline === undefined ? config?.baseline : options.baseline;
  const baselineReference = baselineOption ? loadBaselineReference(directory, baselineOption) : null;

  const offline = options.offline ?? process.env.VUE_DOCTOR_OFFLINE === "1";
  const debug = options.onDebug ?? (() => {});
  debug("config", config ? `resolved ${JSON.stringify(config)}` : "none (defaults)");
  debug(
    "project",
    `${project.projectName} framework=${project.framework} vue=${project.vueVersion ?? "none"} typescript=${project.hasTypeScript} sourceFiles=${project.sourceFileCount}`,
  );
  if (baselineReference) {
    debug("baseline", `${baselineReference.fingerprints.size} fingerprints from ${baselineReference.baselinePath}`);
  }
  if (offline) debug("network", "offline: network features disabled");
  const logCommand =
    (namespace: string) =>
    (argv: string[], cwd: string): void =>
      debug(namespace, `exec ${JSON.stringify(argv)} (cwd: ${cwd})`);
  // A monorepo root that is itself a project leaves the files of its nested workspaces to their own scans.
  const nestedWorkspaces = listNestedWorkspaceDirectories(directory);
  if (nestedWorkspaces.length > 0) {
    debug("project", `leaving ${nestedWorkspaces.length} nested workspaces to their own scans`);
  }
  const isDiffMode = (options.includePaths ?? []).length > 0;
  const includePaths = (options.includePaths ?? []).filter(
    (filePath) => !isInsideAnyDirectory(directory, filePath, nestedWorkspaces),
  );
  const vueIncludePaths = computeVueIncludePaths(includePaths);
  if (isDiffMode) debug("diff", `${includePaths.length} changed files (${vueIncludePaths.length} .vue)`);
  const skipped: SkippedAnalyzer[] = [];
  const timings: Record<string, number> = {};

  const runAnalyzer = async (
    analyzer: AnalyzerName,
    run: () => Promise<Diagnostic[]>,
  ): Promise<Diagnostic[]> => {
    const analyzerStart = performance.now();
    options.onProgress?.({ type: "start", analyzer });
    try {
      const diagnostics = await run();
      const durationMs = Math.round(performance.now() - analyzerStart);
      timings[analyzer] = durationMs;
      options.onProgress?.({ type: "done", analyzer, durationMs, count: diagnostics.length });
      debug(analyzer, `${diagnostics.length} findings in ${durationMs}ms`);
      return diagnostics;
    } catch (error) {
      const durationMs = Math.round(performance.now() - analyzerStart);
      const reason = errorMessage(error);
      timings[analyzer] = durationMs;
      skipped.push({ analyzer, reason });
      options.onProgress?.({ type: "fail", analyzer, durationMs, reason });
      debug(analyzer, `failed after ${durationMs}ms: ${reason}`);
      return [];
    }
  };

  // Explicit options win over the project config.
  const shouldLint = (options.lint ?? config?.lint) !== false;
  const shouldTemplateLint = options.templateLint ?? shouldLint;
  const shouldDeadCode = (options.deadCode ?? config?.deadCode) !== false && !isDiffMode;

  const cacheContexts = (options.cache ?? config?.cache) === false ? null : computeCacheContexts(directory, project);
  const cache = cacheContexts
    ? openAnalysisCache(directory, cacheContexts, (message) => debug("cache", message))
    : null;
  // With the cache, analyzers receive explicit file lists so that unchanged files can be skipped.
  // The project is listed (git ls-files or a directory walk) at most once per run, and only when needed.
  let projectSourceFiles: string[] | null = null;
  const getProjectSourceFiles = (): string[] => (projectSourceFiles ??= listProjectSourceFiles(directory));
  let cacheTargets: string[] | null = null;
  const getCacheTargets = (): string[] => {
    cacheTargets ??= isDiffMode
      ? vueIncludePaths
      : nestedWorkspaces.length > 0
        ? listProjectSourceFiles(directory, nestedWorkspaces)
        : getProjectSourceFiles();
    return cacheTargets;
  };
  // Without nested workspaces the analyzers walk the project themselves; with them, they get the
  // explicit file list that leaves those out (an uncached full scan of a root project).
  const hasNestedWorkspaces = nestedWorkspaces.length > 0;

  const lintPromise = shouldLint
    ? runAnalyzer("lint", async () => {
        const nodeBinaryPath = resolveNodeForOxlint();
        if (!nodeBinaryPath) {
          throw new Error(
            `Lint checks require Node.js ${OXLINT_NODE_REQUIREMENT}. Detected ${process.version}. Install Node 22.12+ or 24+ (https://nodejs.org) or use your version manager (nvm, fnm, volta).`,
          );
        }
        const lint = (paths: string[] | undefined) =>
          runOxlint(directory, project.hasTypeScript, project.framework, paths, nodeBinaryPath, logCommand("lint"));
        if (!cache) return lint(isDiffMode ? vueIncludePaths : hasNestedWorkspaces ? getCacheTargets() : undefined);
        return cache.analyzeFiles("lint", getCacheTargets(), lint);
      })
    : Promise.resolve([]);

  const templatePromise = shouldTemplateLint
    ? runAnalyzer("template", () => {
        if (!cache && !hasNestedWorkspaces) return runEslintVue(directory, isDiffMode ? vueIncludePaths : undefined);
        const vueFiles = getCacheTargets().filter((filePath) => filePath.endsWith(".vue"));
        if (!cache) return runEslintVue(directory, vueFiles);
        return cache.analyzeFiles("template", vueFiles, (paths) => runEslintVue(directory, paths));
      })
    : Promise.resolve([]);

  const deadCodePromise = shouldDeadCode
    ? runAnalyzer("dead-code", () => {
        const deadCode = () => runKnip(directory, logCommand("dead-code"), options.knipSession);
        if (!cache || !cacheContexts) return deadCode();
        // The cached entry is this project's share of the monorepo run; its key covers every file
        // the run reads, so a warm cache skips knip (and the shared run is never started) for all
        // projects. A shared run and a single-workspace run can differ, hence the context suffix.
        const context = `${cacheContexts["dead-code"]}:${options.knipSession ? "shared" : "single"}`;
        const deadCodeKey = computeDeadCodeKey(directory, context, (root) =>
          root === directory ? getProjectSourceFiles() : listProjectSourceFiles(root),
        );
        return cache.analyzeProject(deadCodeKey, deadCode);
      })
    : Promise.resolve([]);

  const fsRules = getEnabledFsRules(project.framework);
  const projectPromise =
    options.projectChecks !== false && fsRules.length > 0
      ? runAnalyzer("project", async () => {
          const listing = listProjectFiles(directory, nestedWorkspaces);
          const run = () => runProjectChecks(directory, project.framework, fsRules, listing);
          const found = cache
            ? await cache.analyzeWithInputs(
                computeProjectListingKey(listing, project.framework),
                (inputKey) => snapshotProjectInput(directory, inputKey),
                run,
              )
            : run().diagnostics;
          // Diff mode: like every other analyzer, report only what is in the changed files.
          if (!isDiffMode) return found;
          const changed = new Set(includePaths.map(normalizeRelativePath));
          return found.filter((diagnostic) => changed.has(normalizeRelativePath(diagnostic.filePath)));
        })
      : Promise.resolve([]);

  const shouldAudit = (options.audit ?? config?.audit?.enabled) === true;
  const auditPromise = shouldAudit
    ? runAnalyzer("audit", async () => {
        // The only analyzer that needs the network; offline always wins, even over an explicit opt-in.
        if (offline) throw new Error("skipped because --offline (or VUE_DOCTOR_OFFLINE=1) forbids the network access OSV.dev needs");
        const found = await runAudit(directory, {
          fetch: options.auditFetch,
          cacheDirectory: cacheContexts ? resolveCacheDirectory(directory) : null,
        });
        // Diff mode: like every other analyzer, report only what is in the changed files.
        if (!isDiffMode) return found;
        const changed = new Set(includePaths.map(normalizeRelativePath));
        return found.filter((diagnostic) => changed.has(normalizeRelativePath(diagnostic.filePath)));
      })
    : Promise.resolve([]);

  const [lintDiagnostics, templateDiagnostics, deadCodeDiagnostics, projectDiagnostics, auditDiagnostics] =
    await Promise.all([lintPromise, templatePromise, deadCodePromise, projectPromise, auditPromise]);
  if (cache) {
    cache.save();
    const { hits, misses } = cache.stats;
    debug(
      "cache",
      `${cache.stats.directory}: lint ${hits.lint} hits/${misses.lint} misses, template ${hits.template}/${misses.template}, dead code ${hits["dead-code"]}/${misses["dead-code"]}, project ${hits.project}/${misses.project}`,
    );
  }

  const combinedDiagnostics = combineDiagnostics(
    [...lintDiagnostics, ...templateDiagnostics, ...projectDiagnostics, ...auditDiagnostics],
    deadCodeDiagnostics,
    directory,
    isDiffMode,
    config,
  );

  const suppression = applySuppressions(combinedDiagnostics, directory, ruleIdReporter);
  let diagnostics = addFingerprints(suppression.diagnostics, directory);

  let baseline: BaselineSummary | undefined;
  if (baselineReference) {
    const { baselinePath, fingerprints } = baselineReference;
    const applied = applyBaseline(diagnostics, fingerprints, baselinePath, isDiffMode);
    diagnostics = applied.diagnostics;
    baseline = applied.summary;
  }

  debug(
    "results",
    `${combinedDiagnostics.length} findings after config, ${suppression.suppressed.count} suppressed, ${diagnostics.length} reported`,
  );
  const {
    score,
    label,
    version: scoreVersion,
    rawScore,
    cap: scoreCap,
    categories: categoryScores,
    impact,
  } = calculateScore(diagnostics);
  timings.total = Math.round(performance.now() - startTime);

  return {
    project,
    diagnostics,
    suppressed: suppression.suppressed,
    foreignDirectives: suppression.foreignDirectives,
    score,
    label,
    scoreVersion,
    rawScore,
    scoreCap,
    categoryScores,
    impact,
    skipped,
    timings,
    isDiffMode,
    includePaths,
    offline,
    ...(cache ? { cache: cache.stats } : {}),
    ...(baseline ? { baseline } : {}),
  };
};
