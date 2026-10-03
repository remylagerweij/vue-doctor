import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { diagnose, NoVueDependencyError } from "../src/index.js";
import { ruleIdOf } from "../src/plugin/rule-ids.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const FIXTURES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures");
const BASIC_VUE_DIRECTORY = path.join(FIXTURES_DIRECTORY, "basic-vue");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");

const ruleCounts = (diagnostics: { plugin: string; rule: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const diagnostic of diagnostics) {
    const key = ruleIdOf(diagnostic);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

describe("diagnose()", () => {
  it("returns project info, scored diagnostics and timings", async () => {
    const result = await diagnose(BASIC_VUE_DIRECTORY);

    expect(result.project.vueVersion).toBeTruthy();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.label).toBe("string");
    expect(result.timings.total).toBeGreaterThan(0);
    expect(Array.isArray(result.skipped)).toBe(true);
  });

  it("reports progress events for every analyzer it runs", async () => {
    const events: string[] = [];
    await diagnose(BASIC_VUE_DIRECTORY, {
      deadCode: false,
      onProgress: (event) => events.push(`${event.type}:${event.analyzer}`),
    });

    expect(events).toContain("start:lint");
    expect(events).toContain("start:template");
    expect(events).not.toContain("start:dead-code");
  });

  it("throws NoVueDependencyError for non-Vue projects unless forced", async () => {
    await expect(diagnose(PACKAGE_DIRECTORY, { lint: false, deadCode: false })).rejects.toBeInstanceOf(
      NoVueDependencyError,
    );
    await expect(
      diagnose(PACKAGE_DIRECTORY, { lint: false, deadCode: false, force: true }),
    ).resolves.toBeDefined();
  });

  it("produces the same findings as the CLI", async () => {
    const apiResult = await diagnose(BASIC_VUE_DIRECTORY);
    const cli = spawnSync(process.execPath, [CLI_PATH, BASIC_VUE_DIRECTORY, "-y", "--json"], {
      encoding: "utf-8",
    });
    const cliReport = JSON.parse(cli.stdout);

    // Report rule IDs are canonical (vue-doctor/<category>/<rule>, vue/<rule>, knip/<type>).
    const findings = (cliReport.projects[0].findings as { ruleId: string }[]).map(({ ruleId }) => ({
      plugin: "",
      rule: ruleId,
    }));

    expect(ruleCounts(findings)).toEqual(ruleCounts(apiResult.diagnostics));
  });
});

describe("package entry point", () => {
  it("has no side effects when imported", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(path.join(PACKAGE_DIRECTORY, "dist", "index.js")).href)});`],
      { encoding: "utf-8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});

describe("diagnose() with a relative directory", () => {
  it("resolves it against the cwd and runs every analyzer", async () => {
    const relative = path.relative(process.cwd(), BASIC_VUE_DIRECTORY);
    const result = await diagnose(relative, { deadCode: false });
    expect(result.skipped).toEqual([]);
    expect(result.project.rootDirectory).toBe(BASIC_VUE_DIRECTORY);
  }, 60_000);
});
