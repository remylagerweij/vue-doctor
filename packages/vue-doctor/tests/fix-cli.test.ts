import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");

const temporaryDirectories: string[] = [];
const copyFixture = (): string => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-fix-cli-")));
  temporaryDirectories.push(directory);
  fs.cpSync(BASIC_VUE_DIRECTORY, directory, { recursive: true });
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const runCli = (args: string[]) =>
  spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });

const hashTree = (root: string): Record<string, string> => {
  const hashes: Record<string, string> = {};
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(entry.parentPath, entry.name);
    if (fullPath.includes(`${path.sep}.git${path.sep}`)) continue;
    hashes[path.relative(root, fullPath)] = createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
  }
  return hashes;
};

const read = (directory: string, file: string): string => fs.readFileSync(path.join(directory, file), "utf8");

/** Flags that keep a run fast and independent of the user's cache. */
const FAST = ["-y", "--no-dead-code", "--no-cache"];

interface JsonReport {
  projects: Array<{ findings: Array<{ ruleId: string; location: { path: string } }> }>;
}

const ruleIds = (stdout: string): string[] =>
  (JSON.parse(stdout) as JsonReport).projects[0].findings.map((finding) => finding.ruleId);

describe("vue-doctor --fix (built CLI)", () => {
  it("prints diffs of the reported findings only and writes nothing with --dry-run", () => {
    const directory = copyFixture();
    const before = hashTree(directory);

    const result = runCli([directory, ...FAST, "--fix", "--dry-run"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("--- a/template-issues.vue");
    expect(result.stdout).toContain('+    <a href="https://example.com" target="_blank" rel="noopener noreferrer">External</a>');
    // Sorting findings have no codemod; the default lodash import is not fixable.
    expect(result.stdout).not.toContain("toSorted");
    expect(result.stdout).not.toContain("js-perf-issues");
    expect(result.stdout).not.toContain("lodash/");
    expect(result.stdout).not.toContain(":key");
    expect(result.stderr).toContain("No files were changed.");
    expect(hashTree(directory)).toEqual(before);
  });

  it("fixes the reported findings, then reports on the fixed code, and is idempotent", () => {
    const directory = copyFixture();
    const untouched = read(directory, "bundle-issues.vue");

    const result = runCli([directory, ...FAST, "--fix", "--json"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("Fixed 1 finding in 1 file");
    const jsPerf = read(directory, "js-perf-issues.ts");
    expect(jsPerf).toContain("items.sort(); // Wait");
    expect(jsPerf).toContain("items.sort()[0];");
    expect(read(directory, "template-issues.vue")).toContain('target="_blank" rel="noopener noreferrer"');
    expect(read(directory, "bundle-issues.vue")).toBe(untouched);

    const remaining = ruleIds(result.stdout);
    expect(remaining).toContain("vue-doctor/performance/js-tosorted-immutable");
    expect(remaining).not.toContain("vue/no-template-target-blank");
    expect(remaining).toContain("vue-doctor/bundle-size/no-full-lodash-import");
    expect(remaining).toContain("vue/require-v-for-key");

    const fixedTree = hashTree(directory);
    const again = runCli([directory, ...FAST, "--fix", "--score"]);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stderr).toContain("No fixable findings.");
    expect(hashTree(directory)).toEqual(fixedTree);
  });

  it("leaves findings hidden by a suppression comment unfixed", () => {
    const directory = copyFixture();
    const file = path.join(directory, "template-issues.vue");
    const suppressed = fs
      .readFileSync(file, "utf8")
      .replace("<a href=", "<!-- vue-doctor-disable-next-line vue/no-template-target-blank -->\n    <a href=");
    fs.writeFileSync(file, suppressed);

    const result = runCli([directory, ...FAST, "--fix", "--score"]);

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(suppressed);
  });

  it("never rewrites [...x].sort() to toSorted, whatever x is", () => {
    const directory = copyFixture();
    const file = path.join(directory, "sorted-set.ts");
    const source = "const tags = getTags();\nexport const sorted = [...tags].sort();\nexport const letters = (word: string) => [...word].sort();\n";
    fs.writeFileSync(file, source);

    const result = runCli([directory, ...FAST, "--fix"]);

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
    expect(read(directory, "js-perf-issues.ts")).toContain("\n[...items].sort();\n");
    expect(read(directory, "js-perf-issues.vue")).toContain("[...items].sort((a, b) => a - b)");
    expect(read(directory, "architecture-issues.vue")).toContain("[...filtered.value].sort(");
  });

  it("only fixes changed files with --diff", () => {
    const directory = copyFixture();
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
        cwd: directory,
        stdio: "pipe",
      });
    git("init", "--quiet");
    git("add", "-A");
    git("commit", "--quiet", "-m", "initial");
    fs.appendFileSync(path.join(directory, "template-issues.vue"), "<!-- changed -->\n");
    const bundle = read(directory, "bundle-issues.vue");
    const architecture = read(directory, "architecture-issues.vue");

    const result = runCli([directory, ...FAST, "--fix", "--diff", "--score"]);

    expect(result.status, result.stderr).toBe(0);
    expect(read(directory, "template-issues.vue")).toContain('target="_blank" rel="noopener noreferrer"');
    expect(read(directory, "bundle-issues.vue")).toBe(bundle);
    expect(read(directory, "architecture-issues.vue")).toBe(architecture);
  });

  it("rejects --fix with --no-lint as a usage error", () => {
    const directory = copyFixture();
    const before = hashTree(directory);
    const result = runCli([directory, ...FAST, "--fix", "--no-lint"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--fix cannot be combined with --no-lint");
    expect(hashTree(directory)).toEqual(before);
  });

  it("writes nothing when the project has no Vue dependency", () => {
    const directory = copyFixture();
    const packageJson = path.join(directory, "package.json");
    fs.writeFileSync(packageJson, JSON.stringify({ name: "not-vue", private: true }));
    const before = hashTree(directory);
    const result = runCli([directory, ...FAST, "--fix"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("No Vue dependency found");
    expect(hashTree(directory)).toEqual(before);
  });
});
