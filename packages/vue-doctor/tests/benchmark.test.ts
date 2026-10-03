import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helpers without type declarations
import { compareResults, countFindingsByRule, renderComparison } from "../scripts/benchmark/lib.mjs";

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
});
