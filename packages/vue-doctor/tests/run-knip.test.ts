import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runKnip } from "../src/utils/run-knip.js";

const BASIC_VUE_DIRECTORY = path.resolve(import.meta.dirname, "fixtures", "basic-vue");

const summarize = (diagnostics: { rule: string; filePath: string; message: string }[]): string[] =>
  diagnostics.map((d) => `${d.rule} ${d.filePath} ${d.message}`).sort();

let outsideRepoDirectory = "";

beforeAll(() => {
  outsideRepoDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "run-knip-"));
  fs.cpSync(BASIC_VUE_DIRECTORY, outsideRepoDirectory, { recursive: true });
});

afterAll(() => {
  fs.rmSync(outsideRepoDirectory, { recursive: true, force: true });
});

describe("runKnip", () => {
  it("reports every unused fixture source file as Dead Code with POSIX relative paths", async () => {
    const diagnostics = await runKnip(BASIC_VUE_DIRECTORY);

    expect(diagnostics).toHaveLength(12);
    for (const diagnostic of diagnostics) {
      expect(diagnostic).toMatchObject({
        plugin: "knip",
        rule: "files",
        category: "Dead Code",
        message: "Unused file",
      });
      expect(diagnostic.filePath).not.toContain("\\");
      expect(path.isAbsolute(diagnostic.filePath)).toBe(false);
    }
    expect(diagnostics.map((d) => d.filePath)).toContain("js-perf-issues.ts");
  });

  it("finds the same dead code when the project lives outside the repository", async () => {
    const inRepo = summarize(await runKnip(BASIC_VUE_DIRECTORY));
    const outside = summarize(await runKnip(outsideRepoDirectory));

    expect(inRepo.length).toBeGreaterThan(0);
    expect(outside).toEqual(inRepo);
  });
});
