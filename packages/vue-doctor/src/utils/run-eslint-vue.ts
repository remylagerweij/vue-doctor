import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ERROR_PREVIEW_LENGTH_CHARS } from "../constants.js";
import type { Diagnostic } from "../types.js";

interface EslintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
}

interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
}

const TEMPLATE_RULES: Record<string, [number, string]> = {
  "vue/require-v-for-key": [2, "Correctness"],
  "vue/no-use-v-if-with-v-for": [2, "Performance"],
  "vue/no-template-shadow": [1, "Correctness"],
  "vue/valid-v-slot": [2, "Correctness"],
  "vue/no-v-html": [1, "Security"],
  "vue/require-explicit-emits": [1, "Correctness"],
  "vue/component-name-in-template-casing": [1, "Architecture"],
  "vue/no-unused-vars": [1, "Dead Code"],
  "vue/no-mutating-props": [2, "Reactivity"],
  "vue/no-computed-properties-in-data": [2, "Reactivity"],
  "vue/no-side-effects-in-computed-properties": [2, "Reactivity"],
  "vue/no-async-in-computed-properties": [2, "Reactivity"],
  "vue/return-in-computed-property": [2, "Correctness"],
  "vue/no-ref-as-operand": [2, "Reactivity"],
  "vue/valid-v-bind": [2, "Correctness"],
  "vue/valid-v-on": [2, "Correctness"],
  "vue/valid-v-model": [2, "Correctness"],
  "vue/no-dupe-keys": [2, "Correctness"],
  "vue/no-duplicate-attributes": [2, "Correctness"],
};

const RULE_HELP_MAP: Record<string, string> = {
  "vue/require-v-for-key": "Add a unique `:key` attribute to every `v-for` iteration element",
  "vue/no-use-v-if-with-v-for": "Move `v-if` to a wrapper element or use `computed` to filter the list",
  "vue/no-template-shadow": "Rename the variable to avoid shadowing a component property",
  "vue/valid-v-slot": "Use `v-slot` only on `<template>` elements or component direct children",
  "vue/no-v-html": "Sanitize content with DOMPurify or use text interpolation `{{ }}`",
  "vue/require-explicit-emits": "Define emits with `defineEmits()` for better documentation and type checking",
  "vue/component-name-in-template-casing": "Use PascalCase for component names in templates: `<MyComponent>`",
  "vue/no-unused-vars": "Remove the unused variable or prefix with `_` to indicate intentional",
  "vue/no-mutating-props": "Never modify a prop directly — emit an event to the parent instead",
  "vue/no-computed-properties-in-data": "Move the reference into `computed` or `setup()` instead of `data()`",
  "vue/no-side-effects-in-computed-properties": "Computed properties must be pure — move side effects to `watch` or methods",
  "vue/no-async-in-computed-properties": "Use `watchEffect` or an async composable instead of async computed",
  "vue/return-in-computed-property": "Every computed property must return a value",
  "vue/no-ref-as-operand": "Use `.value` to access the ref value in expressions",
  "vue/valid-v-bind": "Fix the `v-bind` / `:` directive syntax",
  "vue/valid-v-on": "Fix the `v-on` / `@` directive syntax",
  "vue/valid-v-model": "Fix the `v-model` directive — it must bind to a writable expression",
  "vue/no-dupe-keys": "Remove the duplicate key — properties and computed names must be unique",
  "vue/no-duplicate-attributes": "Remove the duplicate attribute from the template tag",
};

const buildEslintConfig = (): object => {
  const rules: Record<string, any> = {};
  for (const [ruleName, [severity]] of Object.entries(TEMPLATE_RULES)) {
    rules[ruleName] = severity === 2 ? "error" : "warn";
  }

  return {
    parser: "vue-eslint-parser",
    plugins: ["vue"],
    rules,
    env: {
      browser: true,
      es2021: true,
    },
  };
};

const getCategoryForRule = (ruleId: string): string =>
  TEMPLATE_RULES[ruleId]?.[1] ?? "Template";

export const runEslintVue = async (
  rootDirectory: string,
  includePaths?: string[],
): Promise<Diagnostic[]> => {
  const configPath = path.join(os.tmpdir(), `vue-doctor-eslintrc-${process.pid}.json`);

  try {
    const config = buildEslintConfig();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const args = [
      "npx",
      "eslint",
      "--no-eslintrc",
      "--config", configPath,
      "--format", "json",
      "--ext", ".vue",
      "--no-error-on-unmatched-pattern",
    ];

    if (includePaths && includePaths.length > 0) {
      args.push(...includePaths.filter((f) => f.endsWith(".vue")));
    } else {
      args.push(".");
    }

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(args[0], args.slice(1), {
        cwd: rootDirectory,
        shell: true,
      });

      const stdoutBuffers: Buffer[] = [];
      const stderrBuffers: Buffer[] = [];

      child.stdout.on("data", (buffer: Buffer) => stdoutBuffers.push(buffer));
      child.stderr.on("data", (buffer: Buffer) => stderrBuffers.push(buffer));

      child.on("error", (error) => reject(new Error(`eslint failed: ${error.message}`)));
      child.on("close", () => {
        const output = Buffer.concat(stdoutBuffers).toString("utf-8").trim();
        resolve(output);
      });
    });

    if (!stdout) return [];

    let results: EslintResult[];
    try {
      results = JSON.parse(stdout) as EslintResult[];
    } catch {
      return [];
    }

    const diagnostics: Diagnostic[] = [];

    for (const result of results) {
      const relativePath = path.relative(rootDirectory, result.filePath);

      for (const msg of result.messages) {
        if (!msg.ruleId) continue;

        diagnostics.push({
          filePath: relativePath,
          plugin: "eslint-plugin-vue",
          rule: msg.ruleId,
          severity: msg.severity === 2 ? "error" : "warning",
          message: msg.message,
          help: RULE_HELP_MAP[msg.ruleId] ?? "",
          line: msg.line,
          column: msg.column,
          category: getCategoryForRule(msg.ruleId),
        });
      }
    }

    return diagnostics;
  } finally {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  }
};
