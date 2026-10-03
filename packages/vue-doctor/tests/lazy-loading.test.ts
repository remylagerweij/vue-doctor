import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const RECORDER_PATH = path.join(PACKAGE_DIRECTORY, "tests", "support", "record-imports.mjs");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");

/** Packages that cost hundreds of milliseconds to load; commands that do not need them must not. */
const HEAVY_PACKAGES = ["eslint", "eslint-plugin-vue", "vue-eslint-parser", "knip", "zod", "jiti", "@clack/prompts"];

let logDirectory: string;

beforeAll(() => {
  logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-lazy-"));
});

afterAll(() => {
  fs.rmSync(logDirectory, { recursive: true, force: true });
});

/** Runs the built CLI and returns the exit status plus every package specifier resolved (in any process). */
const runRecorded = (args: string[]) => {
  const logFile = path.join(logDirectory, `${Math.random().toString(36).slice(2)}.log`);
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      CI: "1",
      IMPORT_RECORDER_LOG: logFile,
      NODE_OPTIONS: `--import ${pathToFileURL(RECORDER_PATH).href}`,
    },
  });
  const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean) : [];
  // "<pid> eslint/use-at-your-own-risk" -> "eslint"; "<pid> @clack/prompts" -> "@clack/prompts".
  const packageName = (specifier: string) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
  const imported = new Set(lines.map((line) => packageName(line.split(" ")[1])));
  return { result, imported };
};

describe("lazy loading of heavy dependencies", () => {
  it("records imports at all (guards the recorder itself)", () => {
    const { imported } = runRecorded(["--version"]);

    expect(imported).toContain("commander");
  });

  it("loads none of the heavy packages for --version", () => {
    const { result, imported } = runRecorded(["--version"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect([...imported].filter((name) => HEAVY_PACKAGES.includes(name))).toEqual([]);
  });

  it("loads none of the heavy packages for --help", () => {
    const { imported } = runRecorded(["--help"]);

    expect([...imported].filter((name) => HEAVY_PACKAGES.includes(name))).toEqual([]);
  });

  it("does not load knip, zod, jiti or prompts for a --no-dead-code scan without a config", () => {
    const { result, imported } = runRecorded([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code", "--no-cache"]);

    expect(result.status).toBe(0);
    // Lint still needs ESLint for the template rules.
    expect(imported).toContain("eslint");
    for (const name of ["knip", "zod", "jiti", "@clack/prompts"]) {
      expect(imported, `${name} was loaded`).not.toContain(name);
    }
  });

  it("starts --version quickly (generous bound; the import check above is the precise one)", () => {
    const started = performance.now();
    const result = spawnSync(process.execPath, [CLI_PATH, "--version"], { encoding: "utf-8" });
    const elapsed = performance.now() - started;

    expect(result.status).toBe(0);
    expect(elapsed).toBeLessThan(5_000);
  });
});
