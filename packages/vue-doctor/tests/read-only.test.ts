import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diagnose } from "../src/index.js";
import { ruleIdOf } from "../src/plugin/rule-ids.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");
// Inside the package so `npx eslint` and friends resolve the workspace's node_modules.
const SCRATCH_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", ".tmp-read-only");

const DIRECTIVES_VUE = `<script setup lang="ts">
// eslint-disable-next-line vue-doctor/no-moment
import moment from "moment";
// vue-doctor-disable-next-line no-moment -- fixture for suppression comments
import momentAgain from "moment";
</script>

<template>
  <!-- eslint-disable-next-line vue-doctor/security/no-unsafe-html-sink -->
  <div>{{ moment }}{{ momentAgain }}</div>
</template>
`;

const TEMPLATE_DIRECTIVES_VUE = `<script setup>
const html = "<b>hi</b>";
</script>

<template>
  <!-- eslint-disable-next-line vue-doctor/security/no-unsafe-html-sink -->
  <div v-html="html" />
  <!-- vue-doctor-disable-next-line vue-doctor/security/no-unsafe-html-sink -- trusted, sanitized upstream -->
  <div v-html="html" />
</template>
`;

const DIRECTIVES_TS = `/* oxlint-disable */
import moment from "moment";
// vue-doctor-disable-next-line vue-doctor/no-moment
import momentAgain from "moment";
export { moment, momentAgain };
`;

interface FileSnapshot {
  kind: "file" | "directory";
  hash?: string;
  mtimeMs: number;
  size: number;
}

const snapshotDirectory = (root: string): Map<string, FileSnapshot> => {
  const snapshot = new Map<string, FileSnapshot>();
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const key = path.relative(root, fullPath).replace(/\\/g, "/");
      const stats = fs.statSync(fullPath);
      if (entry.isDirectory()) {
        snapshot.set(key, { kind: "directory", mtimeMs: stats.mtimeMs, size: 0 });
        walk(fullPath);
      } else {
        const hash = createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
        snapshot.set(key, { kind: "file", hash, mtimeMs: stats.mtimeMs, size: stats.size });
      }
    }
  };
  walk(root);
  return snapshot;
};

const setReadOnly = (root: string, readOnly: boolean): void => {
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else fs.chmodSync(fullPath, readOnly ? 0o444 : 0o644);
    }
    // Windows ignores directory permission bits; on POSIX this also blocks creating files.
    if (process.platform !== "win32") fs.chmodSync(directory, readOnly ? 0o555 : 0o755);
  };
  walk(root);
};

const countMirrorDirectories = (): number =>
  fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("vue-doctor-mirror-")).length;

let projectDirectory: string;

beforeAll(() => {
  fs.mkdirSync(SCRATCH_DIRECTORY, { recursive: true });
  projectDirectory = fs.mkdtempSync(path.join(SCRATCH_DIRECTORY, "project-"));
  fs.cpSync(BASIC_VUE_DIRECTORY, projectDirectory, { recursive: true });
  fs.writeFileSync(path.join(projectDirectory, "directives.vue"), DIRECTIVES_VUE);
  fs.writeFileSync(path.join(projectDirectory, "directives.ts"), DIRECTIVES_TS);
  fs.writeFileSync(path.join(projectDirectory, "template-directives.vue"), TEMPLATE_DIRECTIVES_VUE);
});

afterAll(() => {
  if (projectDirectory) setReadOnly(projectDirectory, false);
  fs.rmSync(SCRATCH_DIRECTORY, { recursive: true, force: true });
});

describe("read-only scanning", () => {
  it("never modifies, creates or touches anything inside the project", async () => {
    setReadOnly(projectDirectory, true);
    const before = snapshotDirectory(projectDirectory);
    const mirrorsBefore = countMirrorDirectories();

    const result = await diagnose(projectDirectory);

    const after = snapshotDirectory(projectDirectory);
    expect(after).toEqual(before);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    expect(countMirrorDirectories()).toBe(mirrorsBefore);
    // The scan still did its job on the read-only copy.
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.foreignDirectives).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("also leaves the project untouched in diff mode", async () => {
    const before = snapshotDirectory(projectDirectory);
    await diagnose(projectDirectory, {
      includePaths: ["directives.vue", "directives.ts"],
      deadCode: false,
    });
    expect(snapshotDirectory(projectDirectory)).toEqual(before);
  }, 60_000);
});

describe("inline directives", () => {
  it("does not let eslint-disable/oxlint-disable hide findings, but vue-doctor-disable does", async () => {
    const result = await diagnose(projectDirectory, { deadCode: false });
    const inFile = (file: string) =>
      result.diagnostics.filter((diagnostic) => diagnostic.filePath.replace(/\\/g, "/") === file);

    const vueFindings = inFile("directives.vue").map((d) => `${ruleIdOf(d)}@${d.line}`);
    // An eslint-disable-next-line comment (line 2) does not hide the import on line 3...
    expect(vueFindings).toContain("vue-doctor/bundle-size/no-moment@3");
    // ...while vue-doctor-disable-next-line (line 4) hides the import on line 5.
    expect(vueFindings).not.toContain("vue-doctor/bundle-size/no-moment@5");

    const tsFindings = inFile("directives.ts").map((d) => `${ruleIdOf(d)}@${d.line}`);
    expect(tsFindings).toContain("vue-doctor/bundle-size/no-moment@2");
    expect(tsFindings).not.toContain("vue-doctor/bundle-size/no-moment@4");

    expect(result.suppressed.byRule["vue-doctor/bundle-size/no-moment"]).toBe(2);
    expect(result.foreignDirectives).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("applies the same rules to template (eslint-plugin-vue) findings", async () => {
    const result = await diagnose(projectDirectory, { lint: false, templateLint: true, deadCode: false });
    const findings = result.diagnostics
      .filter((diagnostic) => diagnostic.filePath.replace(/\\/g, "/") === "template-directives.vue")
      .map((d) => `${d.rule}@${d.line}`);
    // eslint-disable-next-line is ignored (allowInlineConfig: false)...
    expect(findings).toContain("security/no-unsafe-html-sink@7");
    // ...vue-doctor-disable-next-line in an HTML comment suppresses.
    expect(findings).not.toContain("security/no-unsafe-html-sink@9");
    expect(result.suppressed.byRule["vue-doctor/security/no-unsafe-html-sink"]).toBe(1);
  }, 60_000);

  it("keeps reporting findings in files without directives", async () => {
    const result = await diagnose(projectDirectory, { deadCode: false });
    const files = new Set(result.diagnostics.map((d) => d.filePath.replace(/\\/g, "/")));
    expect(files.has("security-issues.vue")).toBe(true);
  }, 60_000);
});
