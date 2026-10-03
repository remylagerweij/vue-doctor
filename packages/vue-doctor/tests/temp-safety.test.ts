import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diagnose } from "../src/index.js";
import { createPrivateTempDirectory } from "../src/utils/private-temp.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");
// Inside the package so analyzers resolve the workspace's node_modules like for the original fixture.
const SCRATCH_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", ".tmp-temp-safety");

const ruleCounts = (diagnostics: { rule: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const diagnostic of diagnostics) counts[diagnostic.rule] = (counts[diagnostic.rule] ?? 0) + 1;
  return counts;
};

const listVueDoctorTempEntries = (): string[] =>
  fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("vue-doctor-"));

const copies: string[] = [];
const TEMP_ENV_KEYS = ["TMPDIR", "TMP", "TEMP"] as const;
const originalTempEnv = Object.fromEntries(TEMP_ENV_KEYS.map((key) => [key, process.env[key]]));
let isolatedTempDirectory = "";

beforeAll(() => {
  // Point os.tmpdir() at a private directory so temp dirs of other processes cannot skew the counts.
  isolatedTempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "temp-safety-root-"));
  for (const key of TEMP_ENV_KEYS) process.env[key] = isolatedTempDirectory;
  fs.rmSync(SCRATCH_DIRECTORY, { recursive: true, force: true });
  for (const name of ["copy-a", "copy-b", "copy-c"]) {
    const target = path.join(SCRATCH_DIRECTORY, name);
    fs.cpSync(BASIC_VUE_DIRECTORY, target, { recursive: true });
    copies.push(target);
  }
});

afterAll(() => {
  for (const key of TEMP_ENV_KEYS) {
    if (originalTempEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalTempEnv[key];
  }
  fs.rmSync(isolatedTempDirectory, { recursive: true, force: true });
  fs.rmSync(SCRATCH_DIRECTORY, { recursive: true, force: true });
});

describe("temp file safety", () => {
  it("runs concurrent diagnose() calls with the same results as sequential runs", async () => {
    const sequential = await diagnose(BASIC_VUE_DIRECTORY);
    expect(sequential.skipped).toEqual([]);
    const expected = ruleCounts(sequential.diagnostics);

    const directories = [...copies, BASIC_VUE_DIRECTORY, BASIC_VUE_DIRECTORY];
    const results = await Promise.all(directories.map((directory) => diagnose(directory)));

    for (const result of results) {
      expect(result.skipped).toEqual([]);
      expect(ruleCounts(result.diagnostics)).toEqual(expected);
    }
    // Six full scans (one sequential, five concurrent) share the CPU with other test files.
  }, 180_000);

  it("leaves no vue-doctor-* entries in the OS temp directory", async () => {
    const before = listVueDoctorTempEntries();
    await Promise.all([diagnose(BASIC_VUE_DIRECTORY), diagnose(copies[0]!)]);
    expect(listVueDoctorTempEntries().sort()).toEqual(before.sort());
  });

  it("does not replace console.log/console.error while diagnose() runs", async () => {
    const { log, error, warn, info } = console;
    const pending = diagnose(BASIC_VUE_DIRECTORY);
    // Analyzers are in flight here; knip runs in a child process so the host console is untouched.
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    await pending;
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    expect(console.warn).toBe(warn);
    expect(console.info).toBe(info);
  });

  it("creates private temp directories with unique names and owner-only files", () => {
    const first = createPrivateTempDirectory("test");
    const second = createPrivateTempDirectory("test");
    try {
      expect(first.directory).not.toBe(second.directory);
      expect(path.basename(first.directory)).toMatch(/^vue-doctor-test-/);
      const file = first.writeFile("nested/config.json", "{}");
      expect(fs.readFileSync(file, "utf-8")).toBe("{}");
      // Exclusive create: never overwrite an existing entry.
      expect(() => first.writeFile("nested/config.json", "{}")).toThrow();
      if (process.platform !== "win32") {
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        expect(fs.statSync(first.directory).mode & 0o777).toBe(0o700);
      }
    } finally {
      first.dispose();
      second.dispose();
    }
    expect(fs.existsSync(first.directory)).toBe(false);
  });
});
