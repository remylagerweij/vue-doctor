import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOLERANCE,
  compareResults,
  countFindingsByRule,
  findRegressions,
  renderComparison,
  renderRegressions,
  resolveScanDirectory,
  // @ts-expect-error plain .mjs helpers without type declarations
} from "../scripts/benchmark/lib.mjs";

const reposPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../benchmarks/repos.json");

const results = (sha: string, rules: Record<string, number>, deadCode = false) => ({
  deadCode,
  repos: { app: { sha, rules } },
});

describe("benchmark helpers", () => {
  it("counts findings per rule across projects, sorted by rule id", () => {
    const report = {
      projects: [
        { findings: [{ ruleId: "vue/b" }, { ruleId: "vue-doctor/a" }] },
        { findings: [{ ruleId: "vue/b" }] },
      ],
    };
    expect(countFindingsByRule(report)).toEqual({ "vue-doctor/a": 1, "vue/b": 2 });
    expect(Object.keys(countFindingsByRule(report))).toEqual(["vue-doctor/a", "vue/b"]);
  });

  it("reports only changed rules, including rules that appear or disappear", () => {
    const sha = "a".repeat(40);
    const { rows, notes } = compareResults(
      results(sha, { "vue-doctor/a": 3, "vue-doctor/gone": 2, "vue-doctor/same": 1 }),
      results(sha, { "vue-doctor/a": 5, "vue-doctor/new": 1, "vue-doctor/same": 1 }),
    );
    expect(notes).toEqual([]);
    expect(rows).toEqual([
      { repo: "app", ruleId: "vue-doctor/a", before: 3, after: 5, delta: 2 },
      { repo: "app", ruleId: "vue-doctor/gone", before: 2, after: 0, delta: -2 },
      { repo: "app", ruleId: "vue-doctor/new", before: 0, after: 1, delta: 1 },
    ]);
  });

  it("flags SHA changes and dead-code mismatches as not comparable", () => {
    const { notes } = compareResults(results("a".repeat(40), {}, true), results("b".repeat(40), {}, false));
    expect(notes).toHaveLength(2);
    expect(notes.join("\n")).toMatch(/pinned SHA changed/);
    expect(notes.join("\n")).toMatch(/Dead-code/);
  });

  it("renders an explicit message when nothing changed", () => {
    expect(renderComparison({ rows: [], notes: [] })).toMatch(/No per-rule count changed/);
  });

  it("pins every benchmark repo to a full commit SHA", () => {
    const { repos } = JSON.parse(fs.readFileSync(reposPath, "utf-8"));
    expect(repos.length).toBeGreaterThan(0);
    for (const repo of repos) expect(repo.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("keeps repos.json well-formed: unique ids, https GitHub urls, licence, safe sub-directories", () => {
    const { repos } = JSON.parse(fs.readFileSync(reposPath, "utf-8"));
    expect(new Set(repos.map((repo: { id: string }) => repo.id)).size).toBe(repos.length);
    for (const repo of repos) {
      expect(repo.url).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/);
      expect(typeof repo.license).toBe("string");
      expect(() => resolveScanDirectory("/checkout", repo.directory, path)).not.toThrow();
    }
  });

  it("matches the committed results: same repos, SHAs and scanned directories, canonical rule ids", () => {
    const { repos } = JSON.parse(fs.readFileSync(reposPath, "utf-8"));
    const committed = JSON.parse(fs.readFileSync(path.resolve(path.dirname(reposPath), "results.json"), "utf-8"));
    for (const repo of repos) {
      const result = committed.repos[repo.id];
      if (!result) continue; // a repo may be missing only when its scan failed, which results.failures records
      expect(result.sha, repo.id).toBe(repo.sha);
      expect(result.directory ?? "", repo.id).toBe(repo.directory ?? "");
      // `TS/<code>` is a known bug: a TypeScript syntax error in a scanned file surfaces as an unregistered finding
      // (seen in nocodb). It is tolerated here only so the baseline can record it honestly; remove it when fixed.
      for (const ruleId of Object.keys(result.rules)) expect(ruleId, repo.id).toMatch(/^(vue-doctor\/[a-z-]+\/[\w-]+|vue\/[\w-]+|knip\/[\w-]+|TS\/\d+)$/);
    }
  });
});

describe("resolveScanDirectory", () => {
  it("returns the checkout when no directory is set and joins a relative sub-directory", () => {
    expect(resolveScanDirectory("/checkout", undefined, path)).toBe("/checkout");
    expect(resolveScanDirectory("/checkout", ".", path)).toBe("/checkout");
    expect(resolveScanDirectory("/checkout", "packages/app", path)).toBe(path.resolve("/checkout", "packages/app"));
  });

  it("rejects absolute paths and paths that escape the checkout", () => {
    expect(() => resolveScanDirectory("/checkout", "/etc", path)).toThrow(/relative/);
    expect(() => resolveScanDirectory("/checkout", "../other", path)).toThrow(/escapes/);
    expect(() => resolveScanDirectory("/checkout", "a/../../x", path)).toThrow(/escapes/);
  });
});

describe("findRegressions", () => {
  const sha = "a".repeat(40);
  const run = (rules: Record<string, number>, extra: Record<string, unknown> = {}, deadCode = false) => ({
    deadCode,
    repos: { app: { sha, rules, ...extra } },
  });

  it("allows a rise up to the absolute tolerance and flags anything above it", () => {
    const base = run({ "vue-doctor/a": 5, "vue-doctor/b": 5 });
    const now = run({ "vue-doctor/a": 5 + DEFAULT_TOLERANCE.absolute, "vue-doctor/b": 6 + DEFAULT_TOLERANCE.absolute });
    expect(findRegressions(base, now).map((row: { ruleId: string }) => row.ruleId)).toEqual(["vue-doctor/b"]);
  });

  it("scales the tolerance with the baseline total for large rules", () => {
    const base = run({ "vue-doctor/a": 1000 });
    expect(findRegressions(base, run({ "vue-doctor/a": 1100 }))).toEqual([]);
    expect(findRegressions(base, run({ "vue-doctor/a": 1101 }))).toEqual([
      { ruleId: "vue-doctor/a", before: 1000, after: 1101, delta: 101, allowed: 100, isNew: false },
    ]);
  });

  it("treats a new rule as a regression only above the absolute tolerance", () => {
    const base = run({});
    expect(findRegressions(base, run({ "vue-doctor/new": 10 }))).toEqual([]);
    const [row] = findRegressions(base, run({ "vue-doctor/new": 11 }));
    expect(row).toMatchObject({ ruleId: "vue-doctor/new", before: 0, after: 11, isNew: true });
  });

  it("never fails on decreases or on rules that disappeared", () => {
    expect(findRegressions(run({ "vue-doctor/a": 50, "vue-doctor/gone": 9 }), run({ "vue-doctor/a": 10 }))).toEqual([]);
  });

  it("sums a rule over repos so many small rises add up", () => {
    const base = { deadCode: false, repos: { one: { sha, rules: { "vue-doctor/a": 0 } }, two: { sha, rules: { "vue-doctor/a": 0 } } } };
    const now = { deadCode: false, repos: { one: { sha, rules: { "vue-doctor/a": 6 } }, two: { sha, rules: { "vue-doctor/a": 6 } } } };
    expect(findRegressions(base, now)).toHaveLength(1);
  });

  it("skips repos that are new, have a moved SHA or a different scanned directory", () => {
    const base = run({ "vue-doctor/a": 0 });
    const flood = { "vue-doctor/a": 500 };
    expect(findRegressions(base, { deadCode: false, repos: { other: { sha, rules: flood } } })).toEqual([]);
    expect(findRegressions(base, { deadCode: false, repos: { app: { sha: "b".repeat(40), rules: flood } } })).toEqual([]);
    expect(findRegressions(base, run(flood, { directory: "packages/x" }))).toEqual([]);
  });

  it("ignores knip rules when dead-code analysis differs, and honours a custom tolerance", () => {
    const base = run({ "knip/files": 0, "vue-doctor/a": 0 }, {}, false);
    const now = run({ "knip/files": 100, "vue-doctor/a": 3 }, {}, true);
    expect(findRegressions(base, now).map((row: { ruleId: string }) => row.ruleId)).toEqual([]);
    expect(findRegressions(base, now, { absolute: 2, relative: 0 }).map((row: { ruleId: string }) => row.ruleId)).toEqual(["vue-doctor/a"]);
  });

  it("renders the verdict", () => {
    expect(renderRegressions([])).toMatch(/No regression/);
    const table = renderRegressions([{ ruleId: "vue-doctor/a", before: 0, after: 20, delta: 20, allowed: 10, isNew: true }]);
    expect(table).toContain("`vue-doctor/a` (new) | 0 | 20 | +20 | +10");
  });
});
