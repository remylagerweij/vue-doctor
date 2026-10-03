import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnose, type ProgressEvent } from "../src/index.js";
import { ruleIdOf } from "../src/plugin/rule-ids.js";
import { createOsvFetch } from "./support/osv-fetch.js";
import { runCliInProcess } from "./support/run-cli-in-process.js";

const RULE_ID = "vue-doctor/supply-chain/vulnerable-dependency";

const temporaryDirectories: string[] = [];
const createProject = (files: Record<string, string>): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dependency-audit-"));
  temporaryDirectories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
};
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const PACKAGE_JSON = JSON.stringify({
  name: "audited-app",
  dependencies: { vue: "^3.4.0", lodash: "^4.17.15" },
  devDependencies: { minimist: "^1.2.0" },
});

const PACKAGE_LOCK = JSON.stringify(
  {
    name: "audited-app",
    lockfileVersion: 3,
    packages: {
      "": { name: "audited-app", dependencies: { vue: "^3.4.0", lodash: "^4.17.15" }, devDependencies: { minimist: "^1.2.0" } },
      "node_modules/lodash": { version: "4.17.15" },
      "node_modules/minimist": { version: "1.2.5", dev: true },
      "node_modules/vue": { version: "3.4.0" },
    },
  },
  null,
  2,
);

/** Analyzers other than the audit are off: these tests are about the audit. */
const auditOnly = { lint: false, templateLint: false, deadCode: false, projectChecks: false, cache: false, force: true } as const;

const findingsOf = (result: Awaited<ReturnType<typeof diagnose>>) =>
  result.diagnostics.filter((diagnostic) => ruleIdOf(diagnostic) === RULE_ID);

describe("dependency audit", () => {
  it("reports vulnerable lockfile entries as supply-chain findings on the lockfile", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const osv = createOsvFetch();
    const result = await diagnose(directory, { ...auditOnly, audit: true, auditFetch: osv.fetch });

    expect(result.skipped).toEqual([]);
    const findings = findingsOf(result);
    expect(findings).toHaveLength(2);
    // Worst first: the critical minimist finding, then lodash.
    expect(findings.map((finding) => finding.message)).toEqual([
      "minimist@1.2.5 (direct dependency) has 1 known vulnerability, highest severity critical — GHSA-xvch-5gv4-984h (CVE-2021-44906): Prototype Pollution in minimist; fixed in 1.2.6",
      "lodash@4.17.15 (direct dependency) has 2 known vulnerabilities, highest severity high — GHSA-35jh-r3h4-6jhm (CVE-2021-23337), GHSA-p6mc-m468-83gw (CVE-2020-8203): Command Injection in lodash; fixed in 4.17.21",
    ]);
    const lodash = findings[1];
    expect(lodash).toMatchObject({
      filePath: "package-lock.json",
      plugin: "vue-doctor",
      rule: "supply-chain/vulnerable-dependency",
      severity: "warning",
      category: "Supply Chain",
      column: 1,
    });
    expect(PACKAGE_LOCK.split("\n")[lodash.line - 1]).toContain('"node_modules/lodash"');
    expect(lodash.fingerprint).toBeTruthy();
    // Warnings lower the score by the usual 0.75 per unique rule; no security cap applies.
    expect(result.score).toBe(99);
    expect(result.scoreCap).toBeNull();
    expect(result.categoryScores.map((entry) => entry.category)).toEqual(["Supply Chain"]);
  });

  it("is off by default: no request, no finding, no skipped analyzer", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const osv = createOsvFetch();
    const result = await diagnose(directory, { ...auditOnly, auditFetch: osv.fetch });
    expect(osv.calls).toEqual([]);
    expect(findingsOf(result)).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("is switched on by the config's audit.enabled, and the CLI-style option wins over it", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const config = { audit: { enabled: true } };
    const enabled = createOsvFetch();
    expect(findingsOf(await diagnose(directory, { ...auditOnly, config, auditFetch: enabled.fetch }))).toHaveLength(2);

    const disabled = createOsvFetch();
    await diagnose(directory, { ...auditOnly, config, audit: false, auditFetch: disabled.fetch });
    expect(disabled.calls).toEqual([]);
  });

  it("is skipped with a reason, and makes no request, when offline", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const osv = createOsvFetch();
    const events: ProgressEvent[] = [];
    const result = await diagnose(directory, {
      ...auditOnly,
      audit: true,
      offline: true,
      auditFetch: osv.fetch,
      onProgress: (event) => events.push(event),
    });
    expect(osv.calls).toEqual([]);
    expect(findingsOf(result)).toEqual([]);
    expect(result.skipped).toEqual([{ analyzer: "audit", reason: expect.stringContaining("--offline") }]);
    expect(events.at(-1)).toMatchObject({ type: "fail", analyzer: "audit" });
  });

  it("honours VUE_DOCTOR_OFFLINE=1", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const osv = createOsvFetch();
    const previous = process.env.VUE_DOCTOR_OFFLINE;
    process.env.VUE_DOCTOR_OFFLINE = "1";
    try {
      const result = await diagnose(directory, { ...auditOnly, audit: true, auditFetch: osv.fetch });
      expect(result.offline).toBe(true);
      expect(result.skipped[0]).toMatchObject({ analyzer: "audit" });
      expect(osv.calls).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.VUE_DOCTOR_OFFLINE;
      else process.env.VUE_DOCTOR_OFFLINE = previous;
    }
  });

  it("never throws when OSV is unreachable: the audit is skipped with the reason", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const result = await diagnose(directory, { ...auditOnly, audit: true, auditFetch: createOsvFetch({ networkDown: true }).fetch });
    expect(findingsOf(result)).toEqual([]);
    expect(result.skipped).toEqual([{ analyzer: "audit", reason: expect.stringContaining("ENOTFOUND") }]);
  });

  it.each([
    ["without a lockfile", { "package.json": PACKAGE_JSON }, "no lockfile found"],
    ["with Bun's binary lockfile", { "package.json": PACKAGE_JSON, "bun.lockb": "binary" }, "bun.lockb is Bun's binary lockfile"],
    ["with an unreadable lockfile", { "package.json": PACKAGE_JSON, "package-lock.json": "{ not json" }, "could not read package-lock.json"],
  ])("is skipped %s", async (_name, files, reason) => {
    const osv = createOsvFetch();
    const result = await diagnose(createProject(files), { ...auditOnly, audit: true, auditFetch: osv.fetch });
    expect(result.skipped).toEqual([{ analyzer: "audit", reason: expect.stringContaining(reason) }]);
    expect(osv.calls).toEqual([]);
  });

  it("reports nothing and asks nothing for an empty lockfile", async () => {
    const osv = createOsvFetch();
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: {} }) });
    const result = await diagnose(directory, { ...auditOnly, audit: true, auditFetch: osv.fetch });
    expect(result.skipped).toEqual([]);
    expect(osv.calls).toEqual([]);
  });

  it("marks transitive dependencies and reads pnpm lockfiles", async () => {
    const directory = createProject({
      "package.json": JSON.stringify({ name: "app", dependencies: { vue: "^3.4.0" } }),
      "pnpm-lock.yaml": ["lockfileVersion: '9.0'", "packages:", "", "  lodash@4.17.20:", "    resolution: {integrity: sha512-x}", ""].join("\n"),
    });
    const result = await diagnose(directory, { ...auditOnly, audit: true, auditFetch: createOsvFetch().fetch });
    const [finding] = findingsOf(result);
    expect(finding).toMatchObject({ filePath: "pnpm-lock.yaml", line: 4 });
    expect(finding.message).toContain("lodash@4.17.20 (transitive dependency) has 1 known vulnerability");
  });

  it("uses the lockfile at the monorepo root for a workspace project", async () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "mono", private: true, workspaces: ["packages/*"] }),
      "package-lock.json": PACKAGE_LOCK,
      "packages/app/package.json": PACKAGE_JSON,
    });
    const result = await diagnose(path.join(root, "packages", "app"), { ...auditOnly, audit: true, auditFetch: createOsvFetch().fetch });
    expect(findingsOf(result).map((finding) => finding.filePath)).toEqual(["../../package-lock.json", "../../package-lock.json"]);
  });

  it("flows through config severities, ignore rules and suppression like other findings", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const run = (config: Record<string, unknown>) =>
      diagnose(directory, { ...auditOnly, audit: true, auditFetch: createOsvFetch().fetch, config });

    const promoted = await run({ rules: { [RULE_ID]: "error" } });
    expect(findingsOf(promoted).map((finding) => finding.severity)).toEqual(["error", "error"]);

    expect(findingsOf(await run({ rules: { "vue-doctor/supply-chain/*": "off" } }))).toEqual([]);
    expect(findingsOf(await run({ ignore: { rules: [RULE_ID] } }))).toEqual([]);
    expect(findingsOf(await run({ ignore: { files: ["package-lock.json"] } }))).toEqual([]);
    // The security preset covers supply-chain findings; the others do not drop them either.
    expect(findingsOf(await run({ extends: ["vue-doctor/security"] }))).toHaveLength(2);
  });

  it("only reports the lockfile in diff mode when it changed", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK, "src/App.vue": "<template><div /></template>" });
    const unchanged = await diagnose(directory, { ...auditOnly, audit: true, auditFetch: createOsvFetch().fetch, includePaths: ["src/App.vue"] });
    expect(findingsOf(unchanged)).toEqual([]);
    const changed = await diagnose(directory, { ...auditOnly, audit: true, auditFetch: createOsvFetch().fetch, includePaths: ["package-lock.json"] });
    expect(findingsOf(changed)).toHaveLength(2);
  });

  it("reuses OSV answers for 24 hours when the analysis cache is on", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const options = { ...auditOnly, cache: true, audit: true } as const;
    const first = createOsvFetch();
    await diagnose(directory, { ...options, auditFetch: first.fetch });
    expect(first.calls.length).toBeGreaterThan(0);
    const second = createOsvFetch();
    const result = await diagnose(directory, { ...options, auditFetch: second.fetch });
    expect(second.calls).toEqual([]);
    expect(findingsOf(result)).toHaveLength(2);
  });

  it("does not write anything into the scanned project", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const before = fs.readdirSync(directory).sort();
    await diagnose(directory, { ...auditOnly, cache: true, audit: true, auditFetch: createOsvFetch().fetch });
    expect(fs.readdirSync(directory).sort()).toEqual(before);
  });
});

describe("--audit on the command line", () => {
  it("requires the opt-in and prints the finding in the report", async () => {
    const directory = createProject({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    const offline = await runCliInProcess([directory, "-y", "--audit", "--offline", "--no-lint", "--no-dead-code", "--format", "json"]);
    const report = JSON.parse(offline.stdout) as { projects: Array<{ skipped: Array<{ tool: string; reason: string }>; findings: unknown[] }> };
    expect(report.projects[0].skipped).toEqual([{ tool: "osv.dev", reason: expect.stringContaining("--offline") }]);
    expect(report.projects[0].findings).toEqual([]);
  });
});
