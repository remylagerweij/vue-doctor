import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyBaseline,
  BaselineError,
  createBaseline,
  readBaseline,
  writeBaseline,
} from "../src/core/baseline.js";
import { addFingerprints } from "../src/core/fingerprint.js";
import { diagnose } from "../src/index.js";
import type { Diagnostic } from "../src/types.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");

const temporaryDirectories: string[] = [];
const makeDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-baseline-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const finding = (overrides: Partial<Diagnostic>): Diagnostic => ({
  filePath: "src/a.ts",
  plugin: "vue-doctor",
  rule: "no-moment",
  severity: "warning",
  message: "Avoid moment",
  help: "",
  line: 1,
  column: 1,
  category: "Bundle Size",
  ...overrides,
});

describe("addFingerprints", () => {
  const fingerprintsFor = (source: string, diagnostics: Diagnostic[]): string[] => {
    const directory = makeDirectory();
    fs.mkdirSync(path.join(directory, "src"));
    fs.writeFileSync(path.join(directory, "src", "a.ts"), source);
    return addFingerprints(diagnostics, directory).map((diagnostic) => diagnostic.fingerprint as string);
  };

  it("keeps fingerprints stable when code moves within the file", () => {
    const before = fingerprintsFor('import moment from "moment";\nconst x = 1;\n', [finding({ line: 1 })]);
    const after = fingerprintsFor(
      '// a new header comment\n\nconst x = 1;\n\n    import moment   from "moment";\n',
      [finding({ line: 5, column: 5 })],
    );
    expect(after).toEqual(before);
  });

  it("changes when the flagged line, the rule or the file changes", () => {
    const [base] = fingerprintsFor('import moment from "moment";\n', [finding({})]);
    const [otherLine] = fingerprintsFor('import moment from "moment/min";\n', [finding({})]);
    const [otherRule] = fingerprintsFor('import moment from "moment";\n', [finding({ rule: "no-barrel-import" })]);
    expect(new Set([base, otherLine, otherRule]).size).toBe(3);
  });

  it("tells identical findings on identical lines apart, independent of input order", () => {
    const source = "const a = 1;\nfoo();\nfoo();\n";
    const forward = fingerprintsFor(source, [finding({ line: 2 }), finding({ line: 3 })]);
    const reversed = fingerprintsFor(source, [finding({ line: 3 }), finding({ line: 2 })]);
    expect(new Set(forward).size).toBe(2);
    expect(reversed).toEqual([forward[1], forward[0]]);
  });

  it("falls back to the message for findings without a readable source line", () => {
    const fingerprints = addFingerprints(
      [finding({ filePath: "missing.ts", line: 0 }), finding({ filePath: "missing.ts", line: 0, message: "other" })],
      makeDirectory(),
    ).map((diagnostic) => diagnostic.fingerprint);
    expect(fingerprints[0]).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprints[0]).not.toBe(fingerprints[1]);
  });
});

describe("baseline files", () => {
  const known = finding({ fingerprint: "aaaaaaaaaaaaaaaa", filePath: "src/b.ts" });
  const other = finding({ fingerprint: "bbbbbbbbbbbbbbbb", filePath: "src/a.ts" });

  it("writes a deterministic, sorted file and reads it back", () => {
    const filePath = path.join(makeDirectory(), "baseline.json");
    writeBaseline(filePath, createBaseline([known, other]));
    const content = fs.readFileSync(filePath, "utf-8");
    expect(JSON.parse(content).findings.map((entry: { file: string }) => entry.file)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(content).not.toMatch(/generated|timestamp|date/i);
    expect(readBaseline(filePath)).toEqual(new Set(["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"]));
  });

  it("rejects missing and malformed files with a clear error", () => {
    const directory = makeDirectory();
    expect(() => readBaseline(path.join(directory, "nope.json"))).toThrow(BaselineError);
    expect(() => readBaseline(path.join(directory, "nope.json"))).toThrow("vue-doctor baseline");
    fs.writeFileSync(path.join(directory, "bad.json"), "{");
    expect(() => readBaseline(path.join(directory, "bad.json"))).toThrow("invalid JSON");
    fs.writeFileSync(path.join(directory, "old.json"), JSON.stringify({ version: 99, findings: [] }));
    expect(() => readBaseline(path.join(directory, "old.json"))).toThrow("version 1");
  });

  it("marks known findings as baseline, others as new, and counts fixed ones", () => {
    const introduced = finding({ fingerprint: "cccccccccccccccc" });
    const fingerprints = new Set(["aaaaaaaaaaaaaaaa", "dddddddddddddddd"]);
    const { diagnostics, summary } = applyBaseline([known, introduced], fingerprints, "/b.json", false);
    expect(diagnostics.map((diagnostic) => diagnostic.status)).toEqual(["baseline", "new"]);
    expect(summary).toEqual({ path: "/b.json", matched: 1, new: 1, fixed: 1 });
    expect(applyBaseline([known], fingerprints, "/b.json", true).summary.fixed).toBeNull();
  });
});

describe("baseline end to end", () => {
  const runCli = (args: string[]) =>
    spawnSync(process.execPath, [CLI_PATH, ...args], {
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });

  const copyProject = (): string => {
    const directory = makeDirectory();
    fs.cpSync(BASIC_VUE_DIRECTORY, directory, { recursive: true });
    // Dead code findings depend on the whole file set; keep this test about lint findings.
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify({ deadCode: false }));
    return directory;
  };

  it("records findings, then only fails on new ones (stable across moved code)", () => {
    const directory = copyProject();
    const written = runCli(["baseline", directory, "-y"]);
    expect(written.status).toBe(0);
    expect(written.stderr).toMatch(/Wrote \d+ findings/);
    const baselinePath = path.join(directory, ".vue-doctor-baseline.json");
    expect(fs.existsSync(baselinePath)).toBe(true);

    const gateArgs = [directory, "-y", "--score", "--baseline", baselinePath, "--gate", "new", "--fail-on", "warning"];
    expect(runCli(gateArgs).status).toBe(0);

    // Shift every line of an existing file down: still nothing new.
    const shifted = path.join(directory, "security-issues.vue");
    fs.writeFileSync(shifted, `<!-- moved -->\n\n${fs.readFileSync(shifted, "utf-8")}`);
    expect(runCli(gateArgs).status).toBe(0);

    // A genuinely new finding fails the gate.
    fs.writeFileSync(path.join(directory, "added.ts"), 'import moment from "moment";\nexport { moment };\n');
    const failing = runCli(gateArgs);
    expect(failing.status).toBe(1);
    expect(failing.stderr).toContain("new error/warning finding");
  }, 180_000);

  it("uses the config's baseline path and exits 2 when the file is missing", () => {
    const directory = copyProject();
    fs.writeFileSync(
      path.join(directory, "vue-doctor.config.json"),
      JSON.stringify({ deadCode: false, baseline: "quality/baseline.json" }),
    );
    const missing = runCli([directory, "-y", "--score"]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("vue-doctor baseline");

    fs.mkdirSync(path.join(directory, "quality"));
    expect(runCli(["baseline", directory, "-y"]).status).toBe(0);
    expect(fs.existsSync(path.join(directory, "quality", "baseline.json"))).toBe(true);
    expect(runCli([directory, "-y", "--score", "--gate", "new", "--fail-on", "error"]).status).toBe(0);
  }, 180_000);

  it("adds fingerprints to diagnose() results and to the JSON report", async () => {
    const result = await diagnose(BASIC_VUE_DIRECTORY, { deadCode: false });
    expect(result.diagnostics.every((diagnostic) => /^[0-9a-f]{16}$/.test(diagnostic.fingerprint ?? ""))).toBe(true);
    expect(new Set(result.diagnostics.map((diagnostic) => diagnostic.fingerprint)).size).toBe(
      result.diagnostics.length,
    );

    const json = JSON.parse(runCli([BASIC_VUE_DIRECTORY, "-y", "--json", "--no-dead-code"]).stdout);
    expect(json.projects[0].findings[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
  }, 120_000);
});
