import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnoseResult } from "../src/core/diagnose.js";
import { runCliInProcess } from "./support/run-cli-in-process.js";

const diagnoseMock = vi.hoisted(() => ({ diagnose: vi.fn() }));
vi.mock("../src/core/diagnose.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/core/diagnose.js")>()),
  diagnose: diagnoseMock.diagnose,
}));

const temporaryDirectories: string[] = [];
const makeProject = (config?: object): string => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-baseline-cmd-")));
  temporaryDirectories.push(directory);
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "p", dependencies: { vue: "3" } }));
  if (config) fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify(config));
  return directory;
};

const resultWith = (overrides: Partial<DiagnoseResult>): DiagnoseResult => ({ diagnostics: [], skipped: [], ...overrides }) as DiagnoseResult;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  diagnoseMock.diagnose.mockReset();
});

describe("vue-doctor baseline (diagnose mocked)", () => {
  it("does not write a baseline and exits 3 when an analyzer did not run", async () => {
    const directory = makeProject();
    diagnoseMock.diagnose.mockResolvedValue(
      resultWith({
        skipped: [
          { analyzer: "dead-code", reason: "knip crashed" },
          { analyzer: "lint", reason: "no oxlint" },
        ],
      }),
    );

    const run = await runCliInProcess(["baseline", directory, "-y"]);

    expect(run.exitCode).toBe(3);
    expect(run.stderr).toContain("dead-code did not run: knip crashed");
    expect(run.stderr).toContain("lint did not run: no oxlint");
    expect(run.stderr).toContain("Baseline not written");
    expect(fs.existsSync(path.join(directory, "vue-doctor-baseline.json"))).toBe(false);
  });

  it("records without applying an existing baseline and writes where the config's `baseline` points", async () => {
    const directory = makeProject({ baseline: "config/known.json" });
    fs.mkdirSync(path.join(directory, "config"));
    diagnoseMock.diagnose.mockResolvedValue(resultWith({}));

    const run = await runCliInProcess(["baseline", directory, "-y"]);

    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("Wrote 0 findings to");
    expect(fs.existsSync(path.join(directory, "config", "known.json"))).toBe(true);
    expect(diagnoseMock.diagnose.mock.calls[0][1]).toMatchObject({ baseline: null });
  });

  it("exits 2 with the error message when diagnose throws", async () => {
    const directory = makeProject();
    diagnoseMock.diagnose.mockRejectedValue(new Error("boom"));

    const run = await runCliInProcess(["baseline", directory, "-y"]);

    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("boom");
  });

  it("exits 2 for an invalid project config", async () => {
    const directory = makeProject({ gate: { failOn: "nope" } });
    const run = await runCliInProcess(["baseline", directory, "-y"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("Invalid Vue Doctor config");
    expect(diagnoseMock.diagnose).not.toHaveBeenCalled();
  });
});
