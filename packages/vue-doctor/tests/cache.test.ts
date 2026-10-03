import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAnalysisCache, resolveCacheDirectory } from "../src/core/cache.js";
import { diagnose } from "../src/index.js";
import { ruleIdOf } from "../src/plugin/rule-ids.js";
import type { Diagnostic } from "../src/types.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");

const temporaryDirectories: string[] = [];
const makeDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-cache-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const copyProject = (): string => {
  const directory = makeDirectory();
  fs.cpSync(BASIC_VUE_DIRECTORY, directory, { recursive: true });
  return directory;
};

/** Order-independent view of a result: every finding by rule, file, position and fingerprint. */
const summarize = (diagnostics: Diagnostic[]): string[] =>
  diagnostics.map((d) => `${d.rule}|${d.filePath}|${d.line}:${d.column}|${d.severity}|${d.fingerprint}`).sort();

describe("analysis cache", () => {
  it("returns identical results cold, warm and without cache, and skips unchanged files when warm", async () => {
    const directory = copyProject();
    const uncached = await diagnose(directory, { cache: false });
    expect(uncached.cache).toBeUndefined();

    const cold = await diagnose(directory);
    expect(cold.cache?.hits).toEqual({ lint: 0, template: 0, "dead-code": 0, project: 0 });
    expect(cold.cache?.misses.project).toBe(1);
    expect(cold.cache?.misses.lint).toBeGreaterThan(5);
    expect(cold.cache?.misses["dead-code"]).toBe(1);

    const warm = await diagnose(directory);
    expect(warm.cache?.misses).toEqual({ lint: 0, template: 0, "dead-code": 0, project: 0 });
    expect(warm.cache?.hits.project).toBe(1);
    expect(warm.cache?.hits.lint).toBe(cold.cache?.misses.lint);
    expect(warm.cache?.hits.template).toBe(cold.cache?.misses.template);
    expect(warm.cache?.hits["dead-code"]).toBe(1);
    // No analyzer process ran at all on the warm run.
    expect(warm.timings.total).toBeLessThan(cold.timings.total);

    expect(summarize(cold.diagnostics)).toEqual(summarize(uncached.diagnostics));
    expect(summarize(warm.diagnostics)).toEqual(summarize(uncached.diagnostics));
    expect(warm.score).toBe(uncached.score);
  }, 240_000);

  it("re-analyzes only changed files and picks up their new findings", async () => {
    const directory = copyProject();
    await diagnose(directory, { deadCode: false });

    fs.appendFileSync(path.join(directory, "bundle-issues.vue"), "\n<!-- edited -->\n");
    fs.writeFileSync(path.join(directory, "added.ts"), 'import moment from "moment";\nexport { moment };\n');

    const result = await diagnose(directory, { deadCode: false });
    expect(result.cache?.misses).toEqual({ lint: 2, template: 1, "dead-code": 0, project: 1 });
    expect(result.diagnostics.some((d) => d.filePath === "added.ts" && ruleIdOf(d) === "vue-doctor/bundle-size/no-moment")).toBe(true);
    expect(summarize(result.diagnostics)).toEqual(
      summarize((await diagnose(directory, { deadCode: false, cache: false })).diagnostics),
    );
  }, 240_000);

  it("applies config changes immediately, since config is applied after the cache", async () => {
    const directory = copyProject();
    const before = await diagnose(directory, { deadCode: false });
    expect(before.diagnostics.some((d) => ruleIdOf(d) === "vue-doctor/bundle-size/no-moment")).toBe(true);

    const after = await diagnose(directory, { deadCode: false, config: { rules: { "no-moment": "off" } } });
    expect(after.cache?.misses.lint).toBe(0);
    expect(after.diagnostics.some((d) => ruleIdOf(d) === "vue-doctor/bundle-size/no-moment")).toBe(false);
  }, 240_000);

  it("re-runs dead code analysis when a dependency manifest changes", async () => {
    const directory = copyProject();
    await diagnose(directory, { lint: false });
    const packageJsonPath = path.join(directory, "package.json");
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    fs.writeFileSync(packageJsonPath, JSON.stringify({ ...manifest, description: "changed" }, null, 2));
    expect((await diagnose(directory, { lint: false })).cache?.misses["dead-code"]).toBe(1);
  }, 240_000);
});

describe("cache invalidation", () => {
  const finding: Diagnostic = {
    filePath: "a.ts",
    plugin: "vue-doctor",
    rule: "no-moment",
    severity: "warning",
    message: "",
    help: "",
    line: 1,
    column: 1,
    category: "Bundle Size",
  };

  it("discards an analyzer's entries when its context (tool versions, config, own code) changes", async () => {
    const directory = makeDirectory();
    fs.writeFileSync(path.join(directory, "a.ts"), "export {};\n");
    let runs = 0;
    const analyze = async () => {
      runs += 1;
      return [finding];
    };

    const first = openAnalysisCache(directory, { lint: "v1", template: "t1" });
    await first.analyzeFiles("lint", ["a.ts"], analyze);
    await first.analyzeFiles("template", ["a.ts"], analyze);
    first.save();

    const sameContext = openAnalysisCache(directory, { lint: "v1", template: "t1" });
    expect(await sameContext.analyzeFiles("lint", ["a.ts"], analyze)).toEqual([finding]);
    expect(runs).toBe(2);

    const newLintContext = openAnalysisCache(directory, { lint: "v2", template: "t1" });
    await newLintContext.analyzeFiles("lint", ["a.ts"], analyze);
    await newLintContext.analyzeFiles("template", ["a.ts"], analyze);
    expect(runs).toBe(3);
    expect(newLintContext.stats.hits).toMatchObject({ lint: 0, template: 1 });
  });

  it("survives a corrupt cache file and never throws when it cannot write", async () => {
    const directory = makeDirectory();
    fs.writeFileSync(path.join(directory, "a.ts"), "export {};\n");
    const cacheDirectory = resolveCacheDirectory(directory);
    fs.mkdirSync(cacheDirectory, { recursive: true });
    fs.writeFileSync(path.join(cacheDirectory, "cache.json"), "{ not json");

    const cache = openAnalysisCache(directory, { lint: "v1" });
    expect(await cache.analyzeFiles("lint", ["a.ts"], async () => [finding])).toEqual([finding]);
    // Make the cache path unwritable: a directory where the cache file should go.
    fs.rmSync(path.join(cacheDirectory, "cache.json"));
    fs.mkdirSync(path.join(cacheDirectory, "cache.json"));
    expect(() => cache.save()).not.toThrow();
  });
});

describe("cache location", () => {
  const withEnvironment = <T>(value: string | undefined, run: () => T): T => {
    const previous = process.env.VUE_DOCTOR_CACHE_DIR;
    if (value === undefined) delete process.env.VUE_DOCTOR_CACHE_DIR;
    else process.env.VUE_DOCTOR_CACHE_DIR = value;
    try {
      return run();
    } finally {
      process.env.VUE_DOCTOR_CACHE_DIR = previous;
    }
  };

  it("uses node_modules/.cache/vue-doctor when the project has node_modules", () => {
    const directory = makeDirectory();
    fs.mkdirSync(path.join(directory, "node_modules"));
    expect(withEnvironment(undefined, () => resolveCacheDirectory(directory))).toBe(
      path.join(directory, "node_modules", ".cache", "vue-doctor"),
    );
  });

  it("never writes inside a project without node_modules", () => {
    const directory = makeDirectory();
    const location = withEnvironment(undefined, () => resolveCacheDirectory(directory));
    expect(path.relative(directory, location).startsWith("..")).toBe(true);
  });

  it("honours VUE_DOCTOR_CACHE_DIR with one subdirectory per project", () => {
    const base = makeDirectory();
    const [first, second] = [makeDirectory(), makeDirectory()].map((directory) =>
      withEnvironment(base, () => resolveCacheDirectory(directory)),
    );
    expect(path.dirname(first)).toBe(base);
    expect(first).not.toBe(second);
  });
});
