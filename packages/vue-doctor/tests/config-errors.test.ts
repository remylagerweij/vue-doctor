import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, validateConfig } from "../src/config/load-config.js";

const temporaryDirectories: string[] = [];
const makeProject = (files: Record<string, string>): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-config-errors-"));
  temporaryDirectories.push(directory);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const loadError = async (directory: string): Promise<ConfigError> => {
  const error = await loadConfig(directory).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConfigError);
  return error as ConfigError;
};

describe("loadConfig error handling", () => {
  it.each([
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"strict"'],
    ["a number", "3"],
  ])("rejects a JSON config that is %s", async (_label, content) => {
    const error = await loadError(makeProject({ "vue-doctor.config.json": content }));
    expect(error.message).toContain("must export default an object");
  });

  it("rejects a module config whose default export is not an object", async () => {
    const error = await loadError(makeProject({ "vue-doctor.config.mjs": "export default 42;" }));
    expect(error.message).toContain("must export default an object");
    expect(error.filePath.endsWith("vue-doctor.config.mjs")).toBe(true);
  });

  it("wraps import failures with the file path", async () => {
    const error = await loadError(makeProject({ "vue-doctor.config.mjs": 'import "./missing-module.mjs";\nexport default {};' }));
    expect(error.message).toContain("failed to load");
    expect(error.message).toContain("vue-doctor.config.mjs");
  });

  it("lists every problem of the package.json `vueDoctor` key under that location", async () => {
    const directory = makeProject({
      "package.json": JSON.stringify({ name: "x", vueDoctor: { "dead-code": false, gate: { "fail-on": "error", minScore: "high" } } }),
    });
    const error = await loadError(directory);
    expect(error.filePath).toBe(`${path.join(directory, "package.json")}#vueDoctor`);
    expect(error.issues).toEqual(
      expect.arrayContaining([
        'unknown key "dead-code" (use "deadCode")',
        'unknown key "gate.fail-on" (use "gate.failOn")',
        expect.stringContaining("gate.minScore"),
      ]),
    );
    expect(error.message.split("\n").slice(1).every((line) => line.startsWith("  - "))).toBe(true);
  });

  it("returns null for a package.json without a vueDoctor key or with an invalid shape", async () => {
    expect(await loadConfig(makeProject({ "package.json": JSON.stringify({ name: "x" }) }))).toBeNull();
    expect(await loadConfig(makeProject({ "package.json": "null" }))).toBeNull();
  });

  it("names the files when several configs exist", async () => {
    const error = await loadError(
      makeProject({ "vue-doctor.config.json": "{}", "vue-doctor.config.mjs": "export default {};", "vue-doctor.config.js": "export default {};" }),
    );
    expect(error.message).toContain("found 3 config files");
    expect(error.message).toContain("vue-doctor.config.js, vue-doctor.config.mjs, vue-doctor.config.json");
  });

  it("formats nested array locations and accepts valid configs through validateConfig", async () => {
    await expect(validateConfig({ ignore: { files: ["a", 1] } }, "inline")).rejects.toThrow(/ignore\.files\.\[1\]|ignore\.files\[1\]/);
    await expect(validateConfig({ verbose: true }, "inline")).resolves.toEqual({ verbose: true });
  });
});
