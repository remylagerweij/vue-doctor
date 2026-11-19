import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEAD_RULE_MIN_BASELINE,
  DEFAULT_TOLERANCE,
  compareResults,
  countFindingsByRule,
  findRegressions,
  renderComparison,
  renderRegressions,
  resolveScanDirectory,
  validateRepos,
  withRetries,
  // @ts-expect-error plain .mjs helpers without type declarations
} from "../scripts/benchmark/lib.mjs";
// @ts-expect-error plain .mjs script without type declarations
import { main } from "../scripts/benchmark/benchmark.mjs";

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
    expect(() => resolveScanDirectory("/checkout", "..", path)).toThrow(/escapes/);
  });

  it("accepts a legitimate directory whose name starts with two dots", () => {
    expect(resolveScanDirectory("/checkout", "..hidden", path)).toBe(path.resolve("/checkout", "..hidden"));
    expect(resolveScanDirectory("/checkout", "a/..b/c", path)).toBe(path.resolve("/checkout", "a/..b/c"));
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
      { kind: "total", ruleId: "vue-doctor/a", before: 1000, after: 1101, delta: 101, allowed: 100, isNew: false },
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

  it("flags a rise in one repo even when another repo fell by the same amount", () => {
    const base = { deadCode: false, repos: { one: { sha, rules: { "vue-doctor/a": 100 } }, two: { sha, rules: { "vue-doctor/a": 100 } } } };
    const now = { deadCode: false, repos: { one: { sha, rules: { "vue-doctor/a": 160 } }, two: { sha, rules: { "vue-doctor/a": 40 } } } };
    const rows = findRegressions(base, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "repo", repo: "one", ruleId: "vue-doctor/a", before: 100, after: 160, delta: 60 });
  });

  it("flags a rule with a meaningful baseline that dropped to zero in every comparable repo", () => {
    const base = { deadCode: false, repos: { one: { sha, rules: { "vue-doctor/a": 12 } }, two: { sha, rules: { "vue-doctor/a": 8 } } } };
    const dead = { deadCode: false, repos: { one: { sha, rules: {} }, two: { sha, rules: {} } } };
    expect(findRegressions(base, dead)).toEqual([
      { kind: "dead", ruleId: "vue-doctor/a", before: 20, after: 0, delta: -20, allowed: 0, isNew: false },
    ]);
    // Below the threshold, or still firing somewhere, or a repo that is not comparable: no failure.
    expect(findRegressions(run({ "vue-doctor/a": DEAD_RULE_MIN_BASELINE - 1 }), run({}))).toEqual([]);
    expect(findRegressions(base, { deadCode: false, repos: { one: { sha, rules: {} }, two: { sha, rules: { "vue-doctor/a": 1 } } } })).toEqual([]);
    expect(findRegressions(run({ "vue-doctor/a": 50 }), { deadCode: false, repos: { app: { sha: "b".repeat(40), rules: {} } } })).toEqual([]);
    // knip rules are not judged when dead-code analysis differs.
    expect(findRegressions(run({ "knip/files": 50 }, {}, true), run({}, {}, false))).toEqual([]);
  });

  it("renders the verdict", () => {
    expect(renderRegressions([])).toMatch(/No regression/);
    const table = renderRegressions([
      { kind: "total", ruleId: "vue-doctor/a", before: 0, after: 20, delta: 20, allowed: 10, isNew: true },
      { kind: "dead", ruleId: "vue-doctor/b", before: 30, after: 0, delta: -30, allowed: 0, isNew: false },
    ]);
    expect(table).toContain("| total | all | `vue-doctor/a` (new) | 0 | 20 | +20 | +10 |");
    expect(table).toContain("| dropped to zero | all | `vue-doctor/b` | 30 | 0 | -30 | > 0 |");
  });
});

describe("validateRepos", () => {
  const valid = { id: "my-app_1.x", url: "https://github.com/owner/repo.git", sha: "a".repeat(40) };

  it("accepts well-formed repos, including the committed repos.json", () => {
    expect(validateRepos([valid])).toEqual([valid]);
    expect(() => validateRepos(JSON.parse(fs.readFileSync(reposPath, "utf-8")).repos)).not.toThrow();
  });

  it.each([
    ["an id that traverses", { ...valid, id: ".." }, /invalid id/],
    ["a dot id", { ...valid, id: "." }, /invalid id/],
    ["an id with a slash", { ...valid, id: "a/b" }, /invalid id/],
    ["an empty id", { ...valid, id: "" }, /invalid id/],
    ["a non-github url", { ...valid, url: "https://evil.example/owner/repo.git" }, /invalid url/],
    ["an http url", { ...valid, url: "http://github.com/owner/repo.git" }, /invalid url/],
    ["a url without .git", { ...valid, url: "https://github.com/owner/repo" }, /invalid url/],
    ["a url with dot segments", { ...valid, url: "https://github.com/../repo.git" }, /invalid url/],
    ["a url option injection", { ...valid, url: "https://github.com/o/r.git --upload-pack=x" }, /invalid url/],
    ["a short sha", { ...valid, sha: "abc123" }, /invalid sha/],
    ["an uppercase sha", { ...valid, sha: "A".repeat(40) }, /invalid sha/],
    ["a sha that is a ref", { ...valid, sha: "--all" + "a".repeat(35) }, /invalid sha/],
  ])("rejects %s", (_name, repo, message) => {
    expect(() => validateRepos([repo])).toThrow(message);
  });

  it("rejects duplicate ids and an empty list", () => {
    expect(() => validateRepos([valid, valid])).toThrow(/duplicate id/);
    expect(() => validateRepos([])).toThrow(/non-empty/);
  });
});

describe("withRetries", () => {
  it("retries a failing call up to the limit with the configured pauses, then succeeds", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await withRetries(
      async () => {
        calls++;
        if (calls < 3) throw new Error("network");
        return "ok";
      },
      { retries: 2, delaysMs: [10, 20], sleep: async (ms: number) => void sleeps.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it("rethrows the last error after the retries are used up", async () => {
    let calls = 0;
    await expect(
      withRetries(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { retries: 2, delaysMs: [1], sleep: async () => {} },
      ),
    ).rejects.toThrow("fail 3");
    expect(calls).toBe(3);
  });
});

describe("benchmark main (decision logic, no network)", () => {
  const sha = "c".repeat(40);
  const temporary: string[] = [];
  afterEach(() => {
    for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  /** Sets up a benchmarks directory with one repo and a baseline of `baselineRules`; returns main's deps. */
  const setup = (baselineRules: Record<string, number>, scan: (repo: { id: string }) => Promise<unknown>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vd-benchmark-test-"));
    temporary.push(root);
    const benchmarksDirectory = path.join(root, "benchmarks");
    fs.mkdirSync(benchmarksDirectory);
    fs.writeFileSync(
      path.join(benchmarksDirectory, "repos.json"),
      JSON.stringify({ repos: [{ id: "app", url: "https://github.com/owner/app.git", sha, license: "MIT" }] }),
    );
    fs.writeFileSync(
      path.join(benchmarksDirectory, "results.json"),
      JSON.stringify({ deadCode: false, repos: { app: { sha, rules: baselineRules } } }),
    );
    let output = "";
    const fetched: string[] = [];
    return {
      deps: {
        benchmarksDirectory,
        cacheDirectory: path.join(root, "cache"),
        write: (text: string) => void (output += text),
        fetchRepo: async (repo: { id: string }) => void fetched.push(repo.id),
        analyze: scan,
      },
      output: () => output,
      fetched,
    };
  };

  const report = (rules: Record<string, number>) => ({
    report: {
      projects: [{ findings: Object.entries(rules).flatMap(([ruleId, count]) => Array.from({ length: count }, () => ({ ruleId }))) }],
      summary: { errors: 0, warnings: 0 },
    },
    durationMs: 1,
  });

  it("exits 1 on a regression, and 0 with --no-gate or when nothing regressed", async () => {
    const { deps, output, fetched } = setup({ "vue-doctor/a": 5 }, async () => report({ "vue-doctor/a": 40 }));
    expect(await main(["--compare"], deps)).toBe(1);
    expect(output()).toMatch(/\| total \| all \| `vue-doctor\/a`/);
    expect(fetched).toEqual(["app"]);
    expect(await main(["--compare", "--no-gate"], deps)).toBe(0);
    expect(await main(["--compare", "--max-increase", "100"], deps)).toBe(0);

    const ok = setup({ "vue-doctor/a": 5 }, async () => report({ "vue-doctor/a": 6 }));
    expect(await main(["--compare"], ok.deps)).toBe(0);
    expect(ok.output()).toMatch(/No regression/);
  });

  it("exits 1 when a rule with a meaningful baseline dropped to zero", async () => {
    const { deps, output } = setup({ "vue-doctor/a": 30 }, async () => report({}));
    expect(await main(["--compare"], deps)).toBe(1);
    expect(output()).toMatch(/dropped to zero/);
  });

  it("exits 2 when a scan fails, even with --no-gate, and still reports the failure", async () => {
    const { deps, output } = setup({ "vue-doctor/a": 5 }, async () => {
      throw new Error("vue-doctor exited with code 3.");
    });
    expect(await main(["--compare", "--no-gate"], deps)).toBe(2);
    expect(output()).toMatch(/Failed scans[\s\S]*exited with code 3/);
  });

  it("exits 0 without --compare even when counts rose", async () => {
    const { deps } = setup({ "vue-doctor/a": 0 }, async () => report({ "vue-doctor/a": 500 }));
    expect(await main([], deps)).toBe(0);
  });

  it("rejects an invalid repos.json before fetching anything", async () => {
    const { deps, fetched } = setup({}, async () => report({}));
    fs.writeFileSync(
      path.join(deps.benchmarksDirectory, "repos.json"),
      JSON.stringify({ repos: [{ id: "..", url: "https://github.com/o/r.git", sha }] }),
    );
    await expect(main([], deps)).rejects.toThrow(/invalid id/);
    expect(fetched).toEqual([]);
  });
});
