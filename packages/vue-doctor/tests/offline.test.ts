import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");
const GUARD_URL = pathToFileURL(path.join(PACKAGE_DIRECTORY, "tests", "support", "network-guard.mjs")).href;

const logFiles: string[] = [];
const temporaryProjects: string[] = [];
afterEach(() => {
  for (const file of logFiles.splice(0)) fs.rmSync(file, { force: true });
  for (const directory of temporaryProjects.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

/** Runs node with every outbound network attempt (in this process and its children) recorded and blocked. */
const runGuarded = (args: string[], env: Record<string, string> = {}) => {
  const logFile = path.join(os.tmpdir(), `vue-doctor-network-guard-${process.pid}-${logFiles.length}.log`);
  logFiles.push(logFile);
  const result = spawnSync(process.execPath, args, {
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      CI: "1",
      NODE_OPTIONS: `--import=${GUARD_URL}`,
      NETWORK_GUARD_LOG: logFile,
      ...env,
    },
  });
  const attempts = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf-8").trim().split("\n") : [];
  return { ...result, attempts };
};

describe("network access", () => {
  it("the guard detects network attempts (sanity check)", () => {
    const { attempts } = runGuarded([
      "-e",
      'fetch("http://example.com").catch(() => {}); require("node:https").get("https://example.com").on("error", () => {});',
    ]);
    expect(attempts.some((line) => line.includes("fetch"))).toBe(true);
    expect(attempts.some((line) => line.includes("dns") || line.includes("socket"))).toBe(true);
  });

  it("makes zero network calls with --offline, across all analyzers", () => {
    const result = runGuarded([CLI_PATH, BASIC_VUE_DIRECTORY, "-y", "--json", "--offline"]);
    expect(result.attempts).toEqual([]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as { projects: Array<{ findings: Array<{ category: string }> }> };
    const { findings } = report.projects[0];
    // Every analyzer still ran: lint, template and dead code findings are present.
    const categories = new Set(findings.map((finding) => finding.category));
    expect(categories.has("Dead Code")).toBe(true);
    expect(findings.length).toBeGreaterThan(20);
  }, 120_000);

  it("makes zero network calls by default too", () => {
    const result = runGuarded([CLI_PATH, BASIC_VUE_DIRECTORY, "-y", "--score"]);
    expect(result.attempts).toEqual([]);
    expect(result.status).toBe(0);
  }, 120_000);

  describe("dependency audit", () => {
    const createAuditProject = (): string => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audit-network-"));
      temporaryProjects.push(directory);
      fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "app", dependencies: { vue: "^3.4.0", lodash: "4.17.15" } }));
      fs.writeFileSync(
        path.join(directory, "package-lock.json"),
        JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/lodash": { version: "4.17.15" } } }),
      );
      return directory;
    };
    const auditArgs = ["-y", "--format", "json", "--no-lint", "--no-dead-code", "--no-cache", "--audit"];

    it("makes zero network calls with --audit --offline and says why it skipped", () => {
      const result = runGuarded([CLI_PATH, createAuditProject(), ...auditArgs, "--offline"]);
      expect(result.attempts).toEqual([]);
      const report = JSON.parse(result.stdout) as { projects: Array<{ skipped: Array<{ tool: string; reason: string }> }> };
      expect(report.projects[0].skipped).toEqual([{ tool: "osv.dev", reason: expect.stringContaining("--offline") }]);
    }, 120_000);

    it("makes zero network calls with --audit and VUE_DOCTOR_OFFLINE=1", () => {
      const result = runGuarded([CLI_PATH, createAuditProject(), ...auditArgs], { VUE_DOCTOR_OFFLINE: "1" });
      expect(result.attempts).toEqual([]);
    }, 120_000);

    it("makes zero network calls without --audit even when the project has a lockfile", () => {
      const result = runGuarded([CLI_PATH, createAuditProject(), "-y", "--score", "--no-lint", "--no-dead-code", "--no-cache"]);
      expect(result.attempts).toEqual([]);
    }, 120_000);

    it("with --audit, only asks OSV, and a blocked or failed request skips the audit instead of crashing", () => {
      const result = runGuarded([CLI_PATH, createAuditProject(), ...auditArgs]);
      expect(result.attempts.length).toBeGreaterThan(0);
      expect(result.attempts.every((line) => line.includes("api.osv.dev"))).toBe(true);
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout) as { projects: Array<{ skipped: Array<{ tool: string }> }> };
      expect(report.projects[0].skipped.map((entry) => entry.tool)).toEqual(["osv.dev"]);
    }, 120_000);
  });

  it("honours VUE_DOCTOR_OFFLINE=1 in the API", () => {
    const script = `import(${JSON.stringify(pathToFileURL(path.join(PACKAGE_DIRECTORY, "dist", "index.js")).href)})
      .then((api) => api.diagnose(${JSON.stringify(BASIC_VUE_DIRECTORY)}, { lint: false, deadCode: false }))
      .then((result) => console.log(JSON.stringify({ offline: result.offline })));`;
    const result = runGuarded(["-e", script], { VUE_DOCTOR_OFFLINE: "1" });
    expect(result.attempts).toEqual([]);
    expect(JSON.parse(result.stdout)).toEqual({ offline: true });
  }, 60_000);
});
