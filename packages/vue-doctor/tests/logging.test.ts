import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger, logger } from "../src/utils/logger.js";
import { getToolVersions } from "../src/utils/tool-versions.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[\d+m/;

const runCli = (args: string[], env: Record<string, string | undefined> = { NO_COLOR: "1" }) => {
  const childEnv: Record<string, string | undefined> = { ...process.env, CI: "1", ...env };
  for (const key of ["NO_COLOR", "FORCE_COLOR", "DEBUG"]) {
    if (!(key in env)) delete childEnv[key];
  }
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf-8", env: childEnv });
};

describe("logger", () => {
  afterEach(() => {
    configureLogger();
    vi.restoreAllMocks();
  });

  const captureStderr = (): string[] => {
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    return lines;
  };

  it("hides status output but keeps warnings and errors when quiet", () => {
    configureLogger({ level: "quiet" });
    const lines = captureStderr();
    logger.log("banner");
    logger.info("info");
    logger.break();
    logger.warn("careful");
    logger.error("broken");
    expect(lines.map((line) => line.replace(new RegExp(ANSI_PATTERN, "g"), ""))).toEqual(["careful", "broken"]);
  });

  it("prints debug lines only for enabled namespaces", () => {
    configureLogger({ debugEnv: "vue-doctor:config,-vue-doctor:noisy" });
    const lines = captureStderr();
    logger.debug("config", "shown");
    logger.debug("lint", "hidden");
    logger.debug("noisy", "excluded");
    expect(lines.join("\n")).toContain("vue-doctor:config shown");
    expect(lines.join("\n")).not.toContain("hidden");
    expect(lines.join("\n")).not.toContain("excluded");
  });

  it("enables every namespace with the debug level", () => {
    configureLogger({ level: "debug" });
    const lines = captureStderr();
    logger.debug("lint", "visible");
    expect(lines.join("\n")).toContain("vue-doctor:lint visible");
  });

  it("reports analyzer versions", () => {
    const versions = getToolVersions();
    for (const name of ["oxlint", "eslint", "eslint-plugin-vue", "knip"]) {
      expect(versions[name]).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});

describe("CLI logging flags", () => {
  it("--quiet prints the report without banner or progress", () => {
    const normal = runCli([BASIC_VUE_DIRECTORY, "-y", "--no-dead-code"]);
    const quiet = runCli([BASIC_VUE_DIRECTORY, "-y", "--no-dead-code", "--quiet"]);
    expect(quiet.status).toBe(0);
    expect(quiet.stdout).toContain("Score:");
    expect(normal.stderr).toContain("lint checks");
    expect(quiet.stderr).not.toContain("lint checks");
    expect(quiet.stderr.length).toBeLessThan(normal.stderr.length);
  }, 120_000);

  it("--debug prints environment, tool versions and argv, resolved config and per-analyzer counts", () => {
    // --no-cache: with a warm cache no analyzer process is spawned, so there would be no argv to log.
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--debug", "--no-cache"]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+$/);
    for (const fragment of [
      "vue-doctor:env vue-doctor",
      "vue-doctor:env tools",
      '"oxlint"',
      "vue-doctor:config",
      "vue-doctor:project",
      "sourceFiles=",
      "vue-doctor:lint exec [",
      "vue-doctor:dead-code exec [",
      "vue-doctor:template",
      "vue-doctor:results",
    ]) {
      expect(result.stderr).toContain(fragment);
    }
  }, 120_000);

  it("--debug reports cache hits and misses", () => {
    // A private cache: other test files scan basic-vue concurrently and would rewrite a shared one
    // between the warm-up and the measured run.
    const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-logging-cache-"));
    try {
      const env = { NO_COLOR: "1", VUE_DOCTOR_CACHE_DIR: cacheDirectory };
      runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code"], env);
      const warm = runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code", "--debug"], env);
      expect(warm.stderr).toMatch(/vue-doctor:cache .*lint \d+ hits\/0 misses/);
    } finally {
      fs.rmSync(cacheDirectory, { recursive: true, force: true });
    }
  }, 120_000);

  it("DEBUG=vue-doctor:config limits debug output to that namespace", () => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code"], {
      NO_COLOR: "1",
      DEBUG: "vue-doctor:config",
    });
    expect(result.stderr).toContain("vue-doctor:config");
    expect(result.stderr).not.toContain("vue-doctor:lint");
  }, 120_000);

  it("rejects --quiet together with --debug", () => {
    expect(runCli([BASIC_VUE_DIRECTORY, "--quiet", "--debug"]).status).toBe(2);
  });

  it("--timings prints per-analyzer timings, and JSON always includes them", () => {
    const text = runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code", "--timings"]);
    // Analyzers run in parallel and are listed in completion order.
    for (const pattern of [/Timings: .*lint \d+ms/, /Timings: .*template \d+ms/, /Timings: .*total \d+ms/]) {
      expect(text.stderr).toMatch(pattern);
    }

    const json = JSON.parse(runCli([BASIC_VUE_DIRECTORY, "-y", "--json", "--no-dead-code"]).stdout);
    expect(json.projects[0].timings.total).toBeTypeOf("number");
    expect(json.projects[0].timings.lint).toBeTypeOf("number");
  }, 120_000);

  it("honours FORCE_COLOR, NO_COLOR and --no-color", () => {
    const args = [BASIC_VUE_DIRECTORY, "-y", "--no-dead-code", "--no-lint"];
    expect(runCli(args, { FORCE_COLOR: "1" }).stdout).toMatch(ANSI_PATTERN);
    expect(runCli(args, { NO_COLOR: "1" }).stdout).not.toMatch(ANSI_PATTERN);
    const noColor = runCli([...args, "--no-color"], { FORCE_COLOR: "1" });
    expect(noColor.status).toBe(0);
    expect(noColor.stdout).not.toMatch(ANSI_PATTERN);
  }, 120_000);

  it("warns prominently, in every output mode, when an analyzer did not run", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-skip-"));
    try {
      fs.cpSync(BASIC_VUE_DIRECTORY, directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "knip.json"), "{ broken");
      for (const mode of ["--score", "--json"]) {
        const result = runCli([directory, "-y", mode]);
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("1 analyzer did not run");
        expect(result.stderr).toContain("dead code checks:");
        expect(result.stderr).toContain("--strict");
      }
      expect(runCli([directory, "-y", "--score", "--strict"]).status).toBe(3);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
