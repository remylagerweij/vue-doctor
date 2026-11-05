import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeCacheContexts } from "../src/core/cache-keys.js";
import { diagnose } from "../src/index.js";
import { createOxlintConfig, createTemplateRuleConfig } from "../src/plugin/registry.js";
import {
  readProjectLinterConfig,
  resolveEffectiveLinterConfig,
} from "../src/utils/project-linter-config.js";
import { runEslintVue } from "../src/utils/run-eslint-vue.js";

const roots: string[] = [];

const createProject = (files: Record<string, string>): string => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-linter-cfg-")));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("readProjectLinterConfig", () => {
  it("reads vue/* rule options and disables from flat eslint.config.ts without executing it", () => {
    const root = createProject({
      "eslint.config.ts": `
        import { defineConfig } from "eslint/config";
        throw new Error("must not execute");
        const ignored = /\\/*.vue/;
        export default defineConfig([
          ...baseConfigs,
          {
            rules: {
              "vue/component-name-in-template-casing": ["error", "kebab-case", { registeredComponentsOnly: false }] as const,
              "vue/require-explicit-emits": "off" as const,
              "vue/no-unused-vars": ["warn", { ignorePattern: "^_" }],
            },
          },
        ]);
      `,
    });

    const config = readProjectLinterConfig(root);
    expect(config.sources).toEqual(["eslint.config.ts"]);
    expect(config.templateRules).toEqual({
      "vue/component-name-in-template-casing": {
        options: ["kebab-case", { registeredComponentsOnly: false }],
      },
      "vue/require-explicit-emits": "off",
      "vue/no-unused-vars": {
        options: [{ ignorePattern: "^_" }],
      },
    });
  });

  it("reads @nuxt/eslint withNuxt().overrideRules() chains", () => {
    const root = createProject({
      "eslint.config.mjs": `
        import withNuxt from "./.nuxt/eslint.config.mjs";
        export default withNuxt({
          rules: {
            "vue/require-explicit-emits": 0,
          },
        }).overrideRules({
          "vue/component-name-in-template-casing": ["warn", "kebab-case"],
        });
      `,
    });

    const config = readProjectLinterConfig(root);
    expect(config.templateRules).toEqual({
      "vue/require-explicit-emits": "off",
      "vue/component-name-in-template-casing": { options: ["kebab-case"] },
    });
  });

  it("reads @antfu/eslint-config vue.overrides blocks", () => {
    const root = createProject({
      "eslint.config.js": `
        import antfu from "@antfu/eslint-config";
        export default antfu({
          vue: {
            overrides: {
              "vue/component-name-in-template-casing": ["error", "kebab-case"],
              "vue/no-template-shadow": "off",
            },
          },
        });
      `,
    });

    const config = readProjectLinterConfig(root);
    expect(config.templateRules).toEqual({
      "vue/component-name-in-template-casing": { options: ["kebab-case"] },
      "vue/no-template-shadow": "off",
    });
  });

  it("reads legacy .eslintrc.json, package.json#eslintConfig and .oxlintrc.json in precedence order", () => {
    const root = createProject({
      "package.json": JSON.stringify({
        name: "app",
        eslintConfig: {
          rules: {
            "vue/require-explicit-emits": "off",
            "vue/no-template-shadow": "off",
          },
        },
      }),
      ".eslintrc.json": JSON.stringify({
        rules: {
          "vue/no-template-shadow": "warn",
        },
      }),
      ".oxlintrc.json": `{
        // JSONC comment in oxlint config
        "rules": {
          "eslint-plugin-vue/component-name-in-template-casing": ["error", "kebab-case"],
          "vue-doctor/no-giant-component": "off",
          "vue-doctor/bundle-size/no-moment": 0
        }
      }`,
    });

    const config = readProjectLinterConfig(root);
    expect(config.sources).toEqual(["package.json#eslintConfig", ".eslintrc.json", ".oxlintrc.json"]);
    expect(config.templateRules).toEqual({
      "vue/require-explicit-emits": "off",
      "vue/no-template-shadow": { options: [] },
      "vue/component-name-in-template-casing": { options: ["kebab-case"] },
    });
    expect(config.disabledOwnRules.has("no-giant-component")).toBe(true);
    expect(config.disabledOwnRules.has("vue-doctor/architecture/no-giant-component")).toBe(true);
    expect(config.disabledOwnRules.has("no-moment")).toBe(true);
  });

  it("ignores rule overrides scoped only to test files or non-Vue files", () => {
    const root = createProject({
      "eslint.config.js": `
        export default [
          {
            files: ["**/*.test.ts", "tests/**/*.vue", "e2e/**"],
            rules: {
              "vue/require-explicit-emits": "off",
              "vue-doctor/no-giant-component": "off",
            },
          },
          {
            files: ["**/*.ts"],
            rules: {
              "vue/component-name-in-template-casing": "off",
            },
          },
          {
            files: ["src/**/*.vue"],
            rules: {
              "vue/no-unused-vars": ["warn", { ignorePattern: "^_" }],
            },
          },
        ];
      `,
    });

    const config = readProjectLinterConfig(root);
    expect(config.templateRules).toEqual({
      "vue/no-unused-vars": { options: [{ ignorePattern: "^_" }] },
    });
    expect(config.disabledOwnRules.size).toBe(0);
  });

  it("never allows foreign linter configs to disable Security, Supply Chain or Server rules", () => {
    const root = createProject({
      "eslint.config.js": `
        export default [
          {
            rules: {
              "vue/no-template-target-blank": "off",
              "vue-doctor/security/no-eval": "off",
              "vue-doctor/no-unsafe-html-sink": 0,
              "vue-doctor/server/auth-missing": "off",
              "vue-doctor/supply-chain/no-git-dependency": "off",
            },
          },
        ];
      `,
    });

    const config = readProjectLinterConfig(root);
    expect(config.templateRules).toEqual({});
    expect(config.disabledOwnRules.size).toBe(0);

    // Even if passed directly to createTemplateRuleConfig / createOxlintConfig, protected categories stay enabled.
    const templateRules = createTemplateRuleConfig({ "vue/no-template-target-blank": "off" });
    expect(templateRules["vue/no-template-target-blank"]).toBe("warn");

    const oxlintConfig = createOxlintConfig({
      pluginPath: "",
      framework: "nuxt",
      disabledRules: new Set(["no-eval", "auth-missing", "no-giant-component"]),
    });
    expect(oxlintConfig.rules["vue-doctor/no-eval"]).toBe("error");
    expect(oxlintConfig.rules["vue-doctor/auth-missing"]).toBe("warn");
    expect(oxlintConfig.rules["vue-doctor/no-giant-component"]).toBeUndefined();
  });

  it("inherits monorepo root linter config for workspaces and lets workspace config win", () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "mono", workspaces: ["packages/*"] }),
      "eslint.config.mjs": `
        export default [
          {
            rules: {
              "vue/component-name-in-template-casing": ["error", "kebab-case"],
              "vue/require-explicit-emits": "off",
            },
          },
        ];
      `,
      "packages/web/package.json": JSON.stringify({ name: "web", dependencies: { vue: "^3.5.0" } }),
      "packages/web/.eslintrc.json": JSON.stringify({
        rules: {
          "vue/require-explicit-emits": "warn",
        },
      }),
    });

    const webConfig = readProjectLinterConfig(path.join(root, "packages/web"));
    expect(webConfig.templateRules).toEqual({
      "vue/component-name-in-template-casing": { options: ["kebab-case"] },
      "vue/require-explicit-emits": { options: [] },
    });
  });

  it("lets vue-doctor.config.* re-enable rules disabled in the project's linter config", () => {
    const root = createProject({
      "eslint.config.js": `
        export default [{
          rules: {
            "vue/require-explicit-emits": "off",
            "vue-doctor/no-giant-component": "off",
          },
        }];
      `,
    });

    const raw = readProjectLinterConfig(root);
    const effective = resolveEffectiveLinterConfig(raw, {
      rules: {
        "vue/require-explicit-emits": "warn",
        "vue-doctor/architecture/no-giant-component": "warn",
      },
    });

    expect(effective.templateRules["vue/require-explicit-emits"]).toBeUndefined();
    expect(effective.disabledOwnRules.size).toBe(0);
  });
});

describe("runEslintVue and diagnose with project linter configuration", () => {
  it("honours kebab-case component naming from eslint.config.js", async () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "kebab-app", dependencies: { vue: "^3.5.0" } }),
      "eslint.config.js": `
        export default [{
          rules: {
            "vue/component-name-in-template-casing": ["error", "kebab-case", { registeredComponentsOnly: false }],
          },
        }];
      `,
      "src/KebabOk.vue": `<script setup lang="ts">\nimport MyWidget from "./MyWidget.vue";\n</script>\n<template><my-widget /></template>\n`,
      "src/PascalFlagged.vue": `<script setup lang="ts">\nimport MyWidget from "./MyWidget.vue";\n</script>\n<template><MyWidget /></template>\n`,
      "src/MyWidget.vue": `<template><div>ok</div></template>\n`,
    });

    const diagnostics = await runEslintVue(root);
    const casingFindings = diagnostics.filter(
      (diagnostic) => diagnostic.rule === "vue/component-name-in-template-casing",
    );

    expect(casingFindings.map((finding) => finding.filePath)).toEqual(["src/PascalFlagged.vue"]);
  });

  it("falls back cleanly when eslint.config.js contains invalid rule options", async () => {
    const root = createProject({
      "eslint.config.js": `
        export default [{
          rules: {
            "vue/component-name-in-template-casing": ["error", "invalid-casing-mode"],
            "vue/require-explicit-emits": "off",
          },
        }];
      `,
      "src/App.vue": `<template><button @click="$emit('untyped')">x</button><div v-html="raw"></div></template>\n`,
    });

    const diagnostics = await runEslintVue(root);
    expect(diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(["security/no-unsafe-html-sink"]);
  });

  it("invalidates the template cache context when eslint.config.js rule options change", () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "app", dependencies: { vue: "^3.5.0" } }),
    });
    const projectInfo = {
      rootDirectory: root,
      projectName: "app",
      vueVersion: "^3.5.0",
      framework: "vite" as const,
      hasTypeScript: false,
      sourceFileCount: 1,
    };

    const defaultContext = computeCacheContexts(root, projectInfo);
    const kebabContext = computeCacheContexts(root, projectInfo, undefined, undefined, {
      "vue/component-name-in-template-casing": { options: ["kebab-case"] },
    });

    expect(kebabContext.template).not.toBe(defaultContext.template);
  });

  it("respects disabled rules in diagnose() unless re-enabled by vue-doctor config", async () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "app", dependencies: { vue: "^3.5.0" } }),
      "eslint.config.js": `
        export default [{
          rules: {
            "vue/require-explicit-emits": "off",
          },
        }];
      `,
      "src/App.vue": `<template><button @click="$emit('closed')">x</button></template>\n<script setup lang="ts">\ndefineEmits<{ (e: "open"): void }>();\n</script>\n`,
    });

    const defaultResult = await diagnose(root, { cache: false, deadCode: false });
    expect(defaultResult.diagnostics.some((d) => d.rule === "vue/require-explicit-emits")).toBe(false);

    const reEnabledResult = await diagnose(root, {
      cache: false,
      deadCode: false,
      config: { rules: { "vue/require-explicit-emits": "warn" } },
    });
    expect(reEnabledResult.diagnostics.some((d) => d.rule === "vue/require-explicit-emits")).toBe(true);
  }, 60_000);

  it("re-runs cached analyzers when eslint.config.js or .oxlintrc.json changes on disk", async () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "app", dependencies: { vue: "^3.5.0" } }),
      "eslint.config.js": `export default [{ rules: { "vue/require-explicit-emits": "off" } }];\n`,
      "src/App.vue": `<template><button @click="$emit('closed')">x</button></template>\n<script setup lang="ts">\ndefineEmits<{ (e: "open"): void }>();\n</script>\n`,
    });

    const first = await diagnose(root, { deadCode: false });
    expect(first.diagnostics.some((d) => d.rule === "vue/require-explicit-emits")).toBe(false);

    // Warm run with unchanged linter config hits the cache.
    const warm = await diagnose(root, { deadCode: false });
    expect(warm.cache?.misses.template).toBe(0);

    // Editing eslint.config.js invalidates the template cache context automatically.
    fs.writeFileSync(root + "/eslint.config.js", "export default [{ rules: {} }];\n");
    const afterEdit = await diagnose(root, { deadCode: false });
    expect(afterEdit.cache?.misses.template).toBe(1);
    expect(afterEdit.diagnostics.some((d) => d.rule === "vue/require-explicit-emits")).toBe(true);
  }, 60_000);
});
