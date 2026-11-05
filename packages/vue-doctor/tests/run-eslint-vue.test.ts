import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/types.js";
import { runEslintVue } from "../src/utils/run-eslint-vue.js";

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "fixtures");
const BASIC_VUE_DIRECTORY = path.join(FIXTURES_DIRECTORY, "basic-vue");

const SOURCE_PATH = path.resolve(import.meta.dirname, "../src/utils/run-eslint-vue.ts");

describe("runEslintVue", () => {
  it("does not spawn a child process", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/child_process|shell:\s*true|\bnpx\b/);
  });

  it("reports template findings on the basic-vue fixture", async () => {
    const diagnostics = await runEslintVue(BASIC_VUE_DIRECTORY);

    expect(diagnostics.length).toBeGreaterThan(0);
    const unsafeHtmlSink = diagnostics.find((diagnostic) => diagnostic.rule === "security/no-unsafe-html-sink");
    expect(unsafeHtmlSink).toMatchObject({
      filePath: "security-issues.vue",
      plugin: "vue-doctor",
      severity: "warning",
      category: "Security",
    });
    expect(unsafeHtmlSink?.line).toBeGreaterThan(0);
    expect(unsafeHtmlSink?.help).toContain("DOMPurify");
  });

  it("reports vue/no-template-target-blank for links without rel", async () => {
    const diagnostics = await runEslintVue(BASIC_VUE_DIRECTORY);
    const issues = diagnostics.filter((diagnostic) => diagnostic.rule === "vue/no-template-target-blank");

    expect(issues.map((issue) => issue.filePath)).toEqual(["template-issues.vue"]);
    expect(issues[0]).toMatchObject({ severity: "warning", category: "Security" });
    expect(issues[0].help).toContain("noopener noreferrer");
  });

  it("ignores <q-*> component names in template casing when framework is quasar", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-quasar-"));
    try {
      fs.writeFileSync(path.join(dir, "Button.vue"), "<template><q-btn label='test' /></template>\n");
      const diagnostics = await runEslintVue(dir, undefined, "quasar");
      expect(diagnostics.filter((d) => d.rule === "vue/component-name-in-template-casing")).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns project-relative paths with forward slashes", async () => {
    const diagnostics = await runEslintVue(BASIC_VUE_DIRECTORY);

    for (const diagnostic of diagnostics) {
      expect(path.isAbsolute(diagnostic.filePath)).toBe(false);
      expect(diagnostic.filePath).not.toContain("\\");
      expect(diagnostic.filePath.endsWith(".vue")).toBe(true);
    }
  });

  it("only lints the given .vue files in diff mode", async () => {
    const diagnostics = await runEslintVue(BASIC_VUE_DIRECTORY, [
      "security-issues.vue",
      "js-perf-issues.ts",
    ]);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(new Set(diagnostics.map((diagnostic) => diagnostic.filePath))).toEqual(
      new Set(["security-issues.vue"]),
    );
  });

  it("returns nothing when diff mode has no .vue files", async () => {
    expect(await runEslintVue(BASIC_VUE_DIRECTORY, ["js-perf-issues.ts"])).toEqual([]);
    expect(await runEslintVue(BASIC_VUE_DIRECTORY, ["missing.vue"])).toEqual([]);
  });

  describe("in a temporary project", () => {
    let projectDirectory: string;

    const write = (relativePath: string, content: string): void => {
      const absolutePath = path.join(projectDirectory, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
    };

    const BAD_TEMPLATE = `<template><div v-html="html"></div></template>\n`;

    beforeAll(() => {
      projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-eslint-"));
      write("src/App.vue", BAD_TEMPLATE);
      write("src/[id].vue", BAD_TEMPLATE);
      write("node_modules/dep/Dep.vue", BAD_TEMPLATE);
      write("dist/Built.vue", BAD_TEMPLATE);
      write("generated/Gen.vue", BAD_TEMPLATE);
      write("ignored-file.vue", BAD_TEMPLATE);
      write(".gitignore", "# comment\ngenerated/\n/ignored-file.vue\n");
      // A project config that would break the run if it were loaded.
      write("eslint.config.js", "throw new Error('project config must not be loaded');\n");
      // Template findings must survive a script the default parser cannot read.
      write(
        "src/Typed.vue",
        `<script setup lang="ts">\nconst html: string = "x";\n</script>\n${BAD_TEMPLATE}`,
      );
      write("src/Broken.vue", `<script>\nconst = ;\n</script>\n${BAD_TEMPLATE}`);
    });

    afterAll(() => {
      fs.rmSync(projectDirectory, { recursive: true, force: true });
    });

    it("ignores node_modules, dist and .gitignore entries and the project's eslint config", async () => {
      const diagnostics = await runEslintVue(projectDirectory);
      const files = [...new Set(diagnostics.map((diagnostic) => diagnostic.filePath))].sort();

      expect(files).toEqual(["src/App.vue", "src/Broken.vue", "src/Typed.vue", "src/[id].vue"]);
    });

    it("treats diff-mode paths literally, including bracketed file names", async () => {
      const diagnostics = await runEslintVue(projectDirectory, ["src/[id].vue"]);

      expect(diagnostics.map((diagnostic) => diagnostic.filePath)).toEqual(["src/[id].vue"]);
    });

    it("does not execute shell syntax in file names", async () => {
      const marker = path.join(projectDirectory, "pwned");
      const malicious = `src/x; echo hi > ${JSON.stringify(marker)}.vue`;

      await expect(runEslintVue(projectDirectory, [malicious])).resolves.toEqual([]);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it("keeps template findings when the script cannot be parsed", async () => {
      const diagnostics = await runEslintVue(projectDirectory, ["src/Broken.vue", "src/App.vue"]);

      expect(diagnostics.map((diagnostic) => diagnostic.filePath).sort()).toEqual([
        "src/App.vue",
        "src/Broken.vue",
      ]);
      expect(diagnostics.every((diagnostic) => diagnostic.rule === "security/no-unsafe-html-sink")).toBe(true);
    });
  });

  describe("with <script lang=\"ts\">", () => {
    let projectDirectory: string;

    const write = (relativePath: string, content: string): void => {
      fs.writeFileSync(path.join(projectDirectory, relativePath), content);
    };

    const rulesIn = (diagnostics: Diagnostic[], filePath: string): string[] =>
      diagnostics.filter((diagnostic) => diagnostic.filePath === filePath).map((diagnostic) => diagnostic.rule);

    let diagnostics: Diagnostic[];

    beforeAll(async () => {
      projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-eslint-ts-"));
      write(
        "DeclaredEmits.vue",
        `<template>
  <button @click="$emit('change', 1)">a</button>
  <button @click="$emit('update:open', false)">b</button>
</template>

<script setup lang="ts">
const emit = defineEmits<{ (e: "change", value: number): void; (e: "update:open", value: boolean): void }>();
</script>
`,
      );
      write(
        "UndeclaredEmit.vue",
        `<template><button @click="$emit('closed', id as string)">x</button></template>

<script setup lang="ts">
defineProps<{ id: unknown }>();
defineEmits<{ (e: "change", value: number): void }>();
</script>
`,
      );
      write(
        "ScriptRules.vue",
        `<script setup lang="ts">
import { computed, ref } from "vue";
const props = defineProps<{ items: string[] }>();
const count = ref<number>(0);
const doubled = computed((): number => {
  count.value++;
  return count.value * 2;
});
function reset(): void {
  props.items = [];
}
</script>

<template><p>{{ doubled }}</p></template>
`,
      );
      write(
        "Unparsable.vue",
        `<template><button @click="$emit('closed')">x</button><div v-html="html"></div></template>

<script setup lang="ts">
const html: string = ;
</script>
`,
      );
      diagnostics = await runEslintVue(projectDirectory);
    });

    afterAll(() => {
      fs.rmSync(projectDirectory, { recursive: true, force: true });
    });

    it("sees a typed defineEmits after the template", () => {
      expect(rulesIn(diagnostics, "DeclaredEmits.vue")).toEqual([]);
    });

    it("reports an undeclared event emitted from a TypeScript template expression", () => {
      const findings = diagnostics.filter((diagnostic) => diagnostic.filePath === "UndeclaredEmit.vue");

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ rule: "vue/require-explicit-emits", line: 1 });
      expect(findings[0].message).toContain('"closed"');
    });

    it("runs rules that read the script", () => {
      expect(rulesIn(diagnostics, "ScriptRules.vue").sort()).toEqual([
        "vue/no-mutating-props",
        "vue/no-side-effects-in-computed-properties",
      ]);
    });

    it("keeps template-only rules and turns script-dependent rules off when the script cannot be parsed", () => {
      expect(rulesIn(diagnostics, "Unparsable.vue")).toEqual(["security/no-unsafe-html-sink"]);
    });
  });
});
