import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/load-config.js";
import { defineConfig } from "../src/config/define-config.js";
import { createJsonSchema } from "../src/config/schema.js";
import { diagnose } from "../src/index.js";
import type { Diagnostic } from "../src/types.js";
import { filterDiagnostics, matchesRuleKey } from "../src/utils/filter-diagnostics.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");

const temporaryDirectories: string[] = [];
const makeProject = (files: Record<string, string>): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-config-test-"));
  temporaryDirectories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const expectConfigError = async (directory: string, ...fragments: string[]): Promise<ConfigError> => {
  const error = await loadConfig(directory).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConfigError);
  for (const fragment of fragments) expect((error as ConfigError).message).toContain(fragment);
  return error as ConfigError;
};

describe("JSON Schema", () => {
  it("matches the published schema file (run `npm run schema:update` after changing the config)", async () => {
    await expect(`${JSON.stringify(createJsonSchema(), null, 2)}\n`).toMatchFileSnapshot(
      "../schema/vue-doctor.schema.json",
    );
  });

  it("forbids unknown keys", () => {
    const schema = createJsonSchema() as { additionalProperties?: boolean };
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("loadConfig", () => {
  it("returns null when the project has no config", async () => {
    expect(await loadConfig(makeProject({ "package.json": "{}" }))).toBeNull();
  });

  it("loads vue-doctor.config.json", async () => {
    const directory = makeProject({
      "vue-doctor.config.json": JSON.stringify({
        $schema: "./node_modules/@remylagerweij/vue-doctor/schema/vue-doctor.schema.json",
        ignore: { files: ["src/legacy/**"] },
      }),
    });
    const loaded = await loadConfig(directory);
    expect(loaded?.config.ignore?.files).toEqual(["src/legacy/**"]);
    expect(loaded?.filePath).toBe(path.join(directory, "vue-doctor.config.json"));
  });

  it("loads the vueDoctor key from package.json", async () => {
    const directory = makeProject({ "package.json": JSON.stringify({ vueDoctor: { deadCode: false } }) });
    expect((await loadConfig(directory))?.config).toEqual({ deadCode: false });
  });

  it("loads vue-doctor.config.ts with defineConfig from the package", async () => {
    const directory = makeProject({
      "vue-doctor.config.ts": [
        'import { defineConfig } from "@remylagerweij/vue-doctor";',
        'const severity: "off" = "off";',
        'export default defineConfig({ rules: { "no-moment": severity }, gate: { failOn: "error" } });',
      ].join("\n"),
    });
    const loaded = await loadConfig(directory);
    expect(loaded?.config).toEqual({ rules: { "no-moment": "off" }, gate: { failOn: "error" } });
    // From source, the package alias makes jiti transpile all of src/ (users load the built dist).
  }, 120_000);

  it("loads vue-doctor.config.mjs", async () => {
    const directory = makeProject({ "vue-doctor.config.mjs": "export default { verbose: true };" });
    expect((await loadConfig(directory))?.config).toEqual({ verbose: true });
  });

  it("reports unknown keys with a hint for the 1.x `ignore.paths` spelling", async () => {
    const directory = makeProject({
      "vue-doctor.config.json": JSON.stringify({ ignore: { paths: ["x"] }, colour: true }),
    });
    const error = await expectConfigError(
      directory,
      'unknown key "ignore.paths" (use "ignore.files")',
      'unknown key "colour"',
    );
    expect(error.issues).toHaveLength(2);
  });

  it("reports invalid values with their location", async () => {
    const directory = makeProject({
      "vue-doctor.config.json": JSON.stringify({ gate: { minScore: 120 }, rules: { "no-moment": "fatal" } }),
    });
    await expectConfigError(directory, "gate.minScore", "rules.no-moment");
  });

  it("reports invalid JSON instead of silently ignoring it", async () => {
    await expectConfigError(makeProject({ "vue-doctor.config.json": "{ nope" }), "vue-doctor.config.json");
    await expectConfigError(makeProject({ "package.json": "{ nope" }), "package.json");
  });

  it("reports a module config that throws or has no default export", async () => {
    await expectConfigError(makeProject({ "vue-doctor.config.mjs": 'throw new Error("boom");' }), "boom");
    await expectConfigError(makeProject({ "vue-doctor.config.mjs": "export const x = 1;" }), "export default");
  });

  it("refuses ambiguous configs", async () => {
    const directory = makeProject({
      "vue-doctor.config.json": "{}",
      "vue-doctor.config.mjs": "export default {};",
    });
    await expectConfigError(directory, "keep only one");
  });

  it("never reads config from parent directories", async () => {
    const parent = makeProject({ "vue-doctor.config.json": JSON.stringify({ lint: false }) });
    const child = path.join(parent, "app");
    fs.mkdirSync(child);
    expect(await loadConfig(child)).toBeNull();
  });

  it("defineConfig is an identity helper", () => {
    const config = { verbose: true };
    expect(defineConfig(config)).toBe(config);
  });
});

const finding = (overrides: Partial<Diagnostic>): Diagnostic => ({
  filePath: "src/App.vue",
  plugin: "vue-doctor",
  rule: "no-moment",
  severity: "warning",
  message: "",
  help: "",
  line: 1,
  column: 1,
  category: "Bundle Size",
  ...overrides,
});

describe("applying config to findings", () => {
  it("matches the canonical rule ID and the deprecated 1.x spellings", () => {
    // Own rules carry `<category>/<rule>` in `rule`, as run-oxlint reports them.
    const oxlint = finding({ rule: "bundle-size/no-moment" });
    for (const key of [
      "vue-doctor/bundle-size/no-moment",
      "VUE-DOCTOR/BUNDLE-SIZE/NO-MOMENT",
      "no-moment",
      "vue-doctor/no-moment",
    ]) {
      expect(matchesRuleKey(key, oxlint), key).toBe(true);
    }
    expect(matchesRuleKey("other/no-moment", oxlint)).toBe(false);
    expect(matchesRuleKey("vue-doctor/security/no-moment", oxlint)).toBe(false);

    const template = finding({ plugin: "eslint-plugin-vue", rule: "vue/no-template-target-blank" });
    expect(matchesRuleKey("vue/no-template-target-blank", template)).toBe(true);
    expect(matchesRuleKey("no-template-target-blank", template)).toBe(true);
    expect(matchesRuleKey("vue-doctor/no-template-target-blank", template)).toBe(false);
    expect(matchesRuleKey("vue-doctor/security/no-template-target-blank", template)).toBe(false);

    // The removed `vue/no-v-html` selects the replacement rule, for findings of either analyzer.
    const sink = finding({ rule: "security/no-unsafe-html-sink", category: "Security" });
    expect(matchesRuleKey("vue/no-v-html", sink)).toBe(true);
    expect(matchesRuleKey("no-v-html", sink)).toBe(true);

    const deadCode = finding({ plugin: "knip", rule: "files" });
    expect(matchesRuleKey("knip/files", deadCode)).toBe(true);
  });

  it("matches groups with a trailing /*", () => {
    const bundle = finding({ rule: "bundle-size/no-moment" });
    const security = finding({ rule: "security/no-eval", category: "Security" });
    const template = finding({ plugin: "eslint-plugin-vue", rule: "vue/no-template-target-blank" });
    expect(matchesRuleKey("vue-doctor/bundle-size/*", bundle)).toBe(true);
    expect(matchesRuleKey("vue-doctor/bundle-size/*", security)).toBe(false);
    expect(matchesRuleKey("vue-doctor/*", security)).toBe(true);
    expect(matchesRuleKey("vue-doctor/*", template)).toBe(false);
    expect(matchesRuleKey("vue/*", template)).toBe(true);
    expect(
      filterDiagnostics([bundle, security, template], { rules: { "vue-doctor/security/*": "off" } }).map((d) => d.rule),
    ).toEqual(["bundle-size/no-moment", "vue/no-template-target-blank"]);
  });

  it("changes severities, turns rules off, and lets the last matching key win", () => {
    const diagnostics = [finding({}), finding({ rule: "no-deep-watch" }), finding({ rule: "no-eval" })];
    const result = filterDiagnostics(diagnostics, {
      rules: {
        "no-moment": "error",
        "no-deep-watch": "off",
        "vue-doctor/no-eval": "off",
        "vue-doctor/security/no-eval": ["warn", { option: true }],
      },
    });
    expect(result.map((d) => `${d.rule}:${d.severity}`)).toEqual(["no-moment:error", "no-eval:warning"]);
  });

  it("applies presets before rules", () => {
    const diagnostics = [finding({}), finding({ rule: "no-eval", category: "Security" })];
    expect(filterDiagnostics(diagnostics, { extends: ["vue-doctor/strict"] }).map((d) => d.severity)).toEqual([
      "error",
      "error",
    ]);
    expect(filterDiagnostics(diagnostics, { extends: ["vue-doctor/security"] }).map((d) => d.rule)).toEqual([
      "no-eval",
    ]);
    expect(
      filterDiagnostics(diagnostics, {
        extends: ["vue-doctor/strict"],
        rules: { "no-moment": "warn" },
      }).map((d) => d.severity),
    ).toEqual(["warning", "error"]);
  });

  it("drops ignored rules and files", () => {
    const diagnostics = [finding({}), finding({ filePath: "src/legacy/Old.vue", rule: "no-eval" })];
    expect(filterDiagnostics(diagnostics, { ignore: { rules: ["vue-doctor/no-moment"] } })).toHaveLength(1);
    expect(
      filterDiagnostics(diagnostics, { ignore: { files: ["src/legacy/**"] } }).map((d) => d.rule),
    ).toEqual(["no-moment"]);
  });
});

describe("diagnose() with legacy rule IDs", () => {
  const captureWarnings = async (run: () => Promise<unknown>): Promise<string[]> => {
    const lines: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "").trimEnd());
      return true;
    }) as typeof process.stderr.write;
    try {
      await run();
    } finally {
      process.stderr.write = original;
    }
    return lines;
  };

  it("still applies 1.x rule IDs from the config and warns once per distinct ID", async () => {
    let legacy: Awaited<ReturnType<typeof diagnose>> | undefined;
    const warnings = await captureWarnings(async () => {
      legacy = await diagnose(BASIC_VUE_DIRECTORY, {
        cache: false,
        deadCode: false,
        config: {
          rules: { "no-moment": "off", "vue-doctor/no-moment": "off", "vue-doctor/performance/no-deep-watch": "off" },
          ignore: { rules: ["no-moment", "no-such-rule"] },
        },
      });
    });
    const canonical = await diagnose(BASIC_VUE_DIRECTORY, {
      cache: false,
      deadCode: false,
      config: { rules: { "vue-doctor/bundle-size/no-moment": "off", "vue-doctor/performance/no-deep-watch": "off" } },
    });

    expect(legacy?.diagnostics.some((d) => d.rule === "bundle-size/no-moment")).toBe(false);
    expect(legacy?.diagnostics.length).toBe(canonical.diagnostics.length);
    expect(warnings).toEqual([
      'Rule ID "no-moment" is deprecated; use "vue-doctor/bundle-size/no-moment".',
      'Rule ID "vue-doctor/no-moment" is deprecated; use "vue-doctor/bundle-size/no-moment".',
      'Unknown rule ID "no-such-rule" in config "ignore.rules"; it does not match any Vue Doctor rule.',
    ]);
  }, 60_000);

  it("does not warn for canonical IDs and groups", async () => {
    const warnings = await captureWarnings(() =>
      diagnose(BASIC_VUE_DIRECTORY, {
        cache: false,
        deadCode: false,
        config: { rules: { "vue-doctor/security/*": "error", "vue/no-template-target-blank": "off", "knip/files": "off" } },
      }),
    );
    expect(warnings).toEqual([]);
  }, 60_000);
});

describe("diagnose() with config", () => {
  it("honours lint/deadCode from the config", async () => {
    const result = await diagnose(BASIC_VUE_DIRECTORY, { config: { lint: false, deadCode: false } });
    expect(result.diagnostics).toEqual([]);
    expect(result.timings.lint).toBeUndefined();
  }, 60_000);

  it("validates config passed through the API", async () => {
    await expect(
      diagnose(BASIC_VUE_DIRECTORY, { config: { lint: false, deadCode: false, typo: 1 } as never }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
