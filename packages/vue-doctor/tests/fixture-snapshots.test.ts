import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build-report.js";
import { diagnose } from "../src/index.js";
import type { DiagnoseResult } from "../src/index.js";

// Guards against analyzers going silent: the suite once passed while eslint-vue returned nothing and
// knip skipped. Regenerate the snapshots with `npm run snapshot:update` and review the diff.

const FIXTURES_DIRECTORY = path.join(import.meta.dirname, "fixtures");
const SNAPSHOTS_DIRECTORY = path.join(import.meta.dirname, "__snapshots__");
const FIXTURE_NAMES = ["basic-vue", "clean-vue", "nuxt-app"] as const;

type Analyzer = "lint" | "template" | "dead-code";
const ANALYZER_TOOLS: Record<Analyzer, string> = { lint: "oxlint", template: "eslint-plugin-vue", "dead-code": "knip" };

/** Which analyzer produced a finding (by the `plugin` its diagnostics carry). */
const analyzerOf = (plugin: string): Analyzer =>
  plugin === "knip" ? "dead-code" : plugin === "eslint-plugin-vue" ? "template" : "lint";

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const sortedRecord = <T>(entries: Map<string, T>): Record<string, T> =>
  Object.fromEntries([...entries].sort(([left], [right]) => compareText(left, right)));

interface FixtureRun {
  result: DiagnoseResult;
  /** `{ [category]: { [ruleId]: count } }`, sorted and order-independent. */
  counts: Record<string, Record<string, number>>;
  perAnalyzer: Record<Analyzer, number>;
}

const runFixture = async (name: string): Promise<FixtureRun> => {
  const directory = path.join(FIXTURES_DIRECTORY, name);
  // cache: false so every analyzer really runs.
  const result = await diagnose(directory, { cache: false });
  const report = buildReport([{ directory, result }], { version: "0.0.0", generatedAt: null, scanDirectory: directory });

  const byCategory = new Map<string, Map<string, number>>();
  for (const finding of report.projects.flatMap((project) => project.findings)) {
    const rules = byCategory.get(finding.category) ?? new Map<string, number>();
    rules.set(finding.ruleId, (rules.get(finding.ruleId) ?? 0) + 1);
    byCategory.set(finding.category, rules);
  }
  const counts = sortedRecord(new Map([...byCategory].map(([category, rules]) => [category, sortedRecord(rules)])));

  const perAnalyzer: Record<Analyzer, number> = { lint: 0, template: 0, "dead-code": 0 };
  for (const diagnostic of result.diagnostics) perAnalyzer[analyzerOf(diagnostic.plugin)] += 1;
  return { result, counts, perAnalyzer };
};

// Run the three fixtures concurrently; each test awaits its own promise.
const runs = new Map(FIXTURE_NAMES.map((name) => [name, runFixture(name)]));
// Avoid unhandled-rejection noise before the tests attach; failures surface in the tests.
for (const run of runs.values()) run.catch(() => {});

describe("fixture snapshots", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: per-category rule counts match the snapshot`, async () => {
      const { counts } = await runs.get(name)!;
      await expect(`${JSON.stringify(counts, null, 2)}\n`).toMatchFileSnapshot(
        path.join(SNAPSHOTS_DIRECTORY, `${name}.rule-counts.json`),
      );
    });

    it(`${name}: no analyzer was skipped or failed`, async () => {
      const { result } = await runs.get(name)!;
      expect(result.skipped, `Analyzers skipped or failed on ${name}: ${JSON.stringify(result.skipped)}`).toEqual([]);
    });
  }

  for (const analyzer of Object.keys(ANALYZER_TOOLS) as Analyzer[]) {
    it(`basic-vue: the ${analyzer} analyzer (${ANALYZER_TOOLS[analyzer]}) yields findings`, async () => {
      const { perAnalyzer } = await runs.get("basic-vue")!;
      expect(
        perAnalyzer[analyzer],
        `The "${analyzer}" analyzer (${ANALYZER_TOOLS[analyzer]}) returned 0 findings on basic-vue; it has gone silent or was skipped.`,
      ).toBeGreaterThan(0);
    });
  }
});
