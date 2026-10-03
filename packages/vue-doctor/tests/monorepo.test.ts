import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/index.js";
import { resolveScanConcurrency } from "../src/scan.js";
import { discoverProject, listNestedWorkspaceDirectories } from "../src/utils/discover-project.js";
import { mapWithConcurrency } from "../src/utils/map-with-concurrency.js";
import { createKnipSession, runKnip } from "../src/utils/run-knip.js";
import { selectProjects } from "../src/utils/select-projects.js";
import { createMonorepo } from "./support/monorepo.js";

vi.setConfig({ testTimeout: 120_000 });

const CLI_PATH = path.resolve(import.meta.dirname, "..", "dist", "cli.js");

// Analyzers create vue-doctor-* temp directories; other test files count those in os.tmpdir(), so this
// file works in a private one.
const TEMP_ENV_KEYS = ["TMPDIR", "TMP", "TEMP"] as const;
const originalTempEnv = Object.fromEntries(TEMP_ENV_KEYS.map((key) => [key, process.env[key]]));
let isolatedTempDirectory = "";

beforeAll(() => {
  isolatedTempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "monorepo-test-root-"));
  for (const key of TEMP_ENV_KEYS) process.env[key] = isolatedTempDirectory;
});

afterAll(() => {
  for (const key of TEMP_ENV_KEYS) {
    if (originalTempEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalTempEnv[key];
  }
  fs.rmSync(isolatedTempDirectory, { recursive: true, force: true });
});

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const monorepo = (options: Parameters<typeof createMonorepo>[0] = {}): string => {
  const root = createMonorepo(options);
  directories.push(root);
  // The workspaces share the root lockfile; without one the supply-chain rule would add a finding per project.
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  return root;
};

const summarize = (diagnostics: { filePath: string; rule: string; message: string }[]): string[] =>
  diagnostics.map((d) => `${d.rule} ${d.filePath} ${d.message}`).sort();

/** Records every spawned knip worker process. */
const recordKnipRuns = () => {
  const commands: string[][] = [];
  return { commands, onCommand: (argv: string[]) => commands.push(argv) };
};

describe("one knip run per monorepo", () => {
  it("starts knip once for all projects and splits the findings per project like separate runs", async () => {
    const root = monorepo({ rootApp: true });
    const projects = [root, path.join(root, "packages", "app-a"), path.join(root, "packages", "app-b")];

    const separate = [];
    for (const project of projects) separate.push(summarize(await runKnip(project)));

    const session = createKnipSession();
    const runs = recordKnipRuns();
    const shared = await Promise.all(projects.map((project) => runKnip(project, runs.onCommand, session)));

    expect(runs.commands).toHaveLength(1);
    expect(shared.map(summarize)).toEqual(separate);
    expect(separate.map((findings) => findings.length)).toEqual([2, 2, 2]);
    // Every project only sees its own files, relative to itself.
    expect(shared[1].map((d) => d.filePath).sort()).toEqual(["src/Linka.vue", "src/unused-a.ts"]);
  });

  it("leaves the files of nested workspaces out of the root project's dead-code findings", async () => {
    const root = monorepo({ rootApp: true });
    const findings = await runKnip(root);
    expect(findings.map((d) => d.filePath).sort()).toEqual(["src/Linkroot.vue", "src/unused-root.ts"]);
  });

  it("runs the shared analysis through diagnose() once and skips it entirely on a warm cache", async () => {
    const root = monorepo({ rootApp: true });
    const projects = [root, path.join(root, "packages", "app-a"), path.join(root, "packages", "app-b")];
    const analyzeAll = async () => {
      const knipCommands: string[] = [];
      const session = createKnipSession();
      const results = await Promise.all(
        projects.map((project) =>
          diagnose(project, {
            lint: false,
            templateLint: false,
            config: null,
            knipSession: session,
            onDebug: (namespace, message) => {
              if (namespace === "dead-code" && message.startsWith("exec ")) knipCommands.push(message);
            },
          }),
        ),
      );
      return { knipCommands, results };
    };

    const cold = await analyzeAll();
    expect(cold.knipCommands).toHaveLength(1);
    expect(cold.results.map((result) => result.cache?.misses["dead-code"])).toEqual([1, 1, 1]);
    for (const result of cold.results) expect(result.diagnostics).toHaveLength(2);

    const warm = await analyzeAll();
    expect(warm.knipCommands).toHaveLength(0);
    expect(warm.results.map((result) => result.cache?.hits["dead-code"])).toEqual([1, 1, 1]);
    expect(warm.results.map((result) => summarize(result.diagnostics))).toEqual(
      cold.results.map((result) => summarize(result.diagnostics)),
    );
  });
});

describe("root project of a monorepo", () => {
  it("is selected next to its workspaces when its package.json depends on Vue", async () => {
    const root = monorepo({ rootApp: true });
    expect(await selectProjects(root, undefined, true)).toEqual([
      root,
      path.join(root, "packages", "app-a"),
      path.join(root, "packages", "app-b"),
    ]);
    expect(await selectProjects(root, "mono-root", true)).toEqual([root]);
    expect(await selectProjects(root, "app-b", true)).toEqual([path.join(root, "packages", "app-b")]);
  });

  it("is not a project when it has no Vue dependency itself", async () => {
    const root = monorepo();
    expect(await selectProjects(root, undefined, true)).toEqual([
      path.join(root, "packages", "app-a"),
      path.join(root, "packages", "app-b"),
    ]);
  });

  it("does not count the files of nested workspaces as its own", () => {
    const root = monorepo({ rootApp: true });
    expect(listNestedWorkspaceDirectories(root).sort()).toEqual([
      path.join(root, "packages", "app-a"),
      path.join(root, "packages", "app-b"),
    ]);
    // index.ts, used.ts, unused-root.ts, Linkroot.vue
    expect(discoverProject(root).sourceFileCount).toBe(4);
    expect(discoverProject(path.join(root, "packages", "app-a")).sourceFileCount).toBe(4);
    expect(listNestedWorkspaceDirectories(path.join(root, "packages", "app-a"))).toEqual([]);
  });

  it("keeps the files of non-Vue workspaces, which are not projects of their own", async () => {
    const root = monorepo({ rootApp: true, toolsWorkspace: true });
    expect(await selectProjects(root, undefined, true)).toHaveLength(3);
    expect(listNestedWorkspaceDirectories(root).map((directory) => path.basename(directory)).sort()).toEqual(["app-a", "app-b"]);
    // index.ts, used.ts, unused-root.ts, Linkroot.vue, plus tools/src/index.ts and tools/src/unused-tools.ts
    expect(discoverProject(root).sourceFileCount).toBe(6);

    const rootFindings = (await runKnip(root)).map((d) => d.filePath).sort();
    expect(rootFindings).toContain("packages/tools/src/unused-tools.ts");
    expect(rootFindings.some((file) => file.startsWith("packages/app-"))).toBe(false);
    const appFindings = (await runKnip(path.join(root, "packages", "app-a"))).map((d) => d.filePath);
    expect(appFindings.some((file) => file.includes("tools"))).toBe(false);
  });

  it.each([true, false])("is linted without the files of nested workspaces (cache: %s)", async (cache) => {
    const root = monorepo({ rootApp: true });
    const result = await diagnose(root, { cache, config: null, deadCode: false });

    const files = new Set(result.diagnostics.map((diagnostic) => diagnostic.filePath));
    expect(files.has("src/Linkroot.vue")).toBe(true);
    expect([...files].filter((file) => file.startsWith("packages/"))).toEqual([]);
    expect(result.project.sourceFileCount).toBe(4);
  });
});

describe("vue-doctor CLI on a monorepo", () => {
  it("scans the root app and every workspace, with roots relative to the scanned directory", () => {
    const root = monorepo({ rootApp: true });
    // Runs elsewhere than the scanned directory: roots must not depend on the working directory.
    const run = spawnSync(
      process.execPath,
      [CLI_PATH, root, "--yes", "--format", "json", "--no-timestamp", "--no-cache", "--quiet"],
      { cwd: isolatedTempDirectory, encoding: "utf-8", env: { ...process.env, NO_COLOR: "1" } },
    );
    expect(run.status).toBe(0);

    const report = JSON.parse(run.stdout) as {
      projects: Array<{ name: string; root: string; findings: Array<{ file: string; ruleId: string }> }>;
    };
    expect(report.projects.map((project) => [project.name, project.root])).toEqual([
      ["@mono/app-a", "packages/app-a"],
      ["@mono/app-b", "packages/app-b"],
      ["mono-root", "."],
    ]);
    for (const project of report.projects) {
      expect(project.findings.filter((finding) => finding.ruleId.startsWith("knip/"))).toHaveLength(2);
      expect(project.findings.some((finding) => finding.file.startsWith("packages/"))).toBe(false);
    }
  });

  it("prints each project's output in a fixed order, not interleaved", () => {
    const root = monorepo({ rootApp: true });
    const run = spawnSync(process.execPath, [CLI_PATH, root, "--yes", "--no-cache"], {
      cwd: isolatedTempDirectory,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    expect(run.status).toBe(0);

    const output = `${run.stderr}\n${run.stdout}`;
    expect([...output.matchAll(/Vue Doctor v/g)]).toHaveLength(3);
    const positions = ["mono-root ·", "@mono/app-a ·", "@mono/app-b ·"].map((name) => output.indexOf(name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps the order of the items while limiting how many callbacks run at once", async () => {
    let running = 0;
    let peak = 0;
    const delays = [30, 5, 20, 1, 10];
    const results = await mapWithConcurrency(delays, 2, async (delay, index) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running--;
      return index;
    });
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("stops starting new work after a failure and rejects with the first error", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (item) => {
        started.push(item);
        if (item === 1) throw new Error("boom");
        await new Promise((resolve) => setTimeout(resolve, 10));
        return item;
      }),
    ).rejects.toThrow("boom");
    expect(started.length).toBeLessThan(6);
  });

  it("handles an empty list and a non-positive limit", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async (item) => item * 2)).toEqual([2, 4]);
  });
});

describe("resolveScanConcurrency", () => {
  it("uses half the CPUs, at least 1, at most 4 and never more than the projects", () => {
    expect(resolveScanConcurrency(10, 8)).toBe(4);
    expect(resolveScanConcurrency(10, 4)).toBe(2);
    expect(resolveScanConcurrency(10, 1)).toBe(1);
    expect(resolveScanConcurrency(10, 64)).toBe(4);
    expect(resolveScanConcurrency(2, 16)).toBe(2);
    expect(resolveScanConcurrency(1, 16)).toBe(1);
  });
});
