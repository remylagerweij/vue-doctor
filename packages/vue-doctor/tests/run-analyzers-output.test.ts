import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runKnip } from "../src/utils/run-knip.js";
import { runOxlint } from "../src/utils/run-oxlint.js";
import { createFakeSpawn, type FakeProcessBehavior } from "./support/fake-spawn.js";

// How runOxlint and runKnip treat what the child processes print. The spawned tools are replaced
// by canned output; the real tools are exercised by run-oxlint.test.ts and run-knip.test.ts.
let behavior: FakeProcessBehavior = {};
const spawnMock = vi.hoisted(() => ({ spawn: undefined as unknown as ReturnType<typeof createFakeSpawn> }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => spawnMock.spawn(...(args as [string, string[], unknown])) };
});

let projectDirectory: string;

beforeEach(() => {
  behavior = {};
  spawnMock.spawn = createFakeSpawn(() => behavior);
  // Outside any git repository or monorepo, so runKnip runs the worker on this directory alone.
  projectDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-analyzer-output-")));
  fs.writeFileSync(path.join(projectDirectory, "package.json"), JSON.stringify({ name: "p" }));
});

afterEach(() => {
  fs.rmSync(projectDirectory, { recursive: true, force: true });
});

const oxlintOutput = (diagnostics: object[]): string => JSON.stringify({ diagnostics });
const oxlintDiagnostic = (overrides: object = {}) => ({
  code: "vue-doctor(no-eval)",
  filename: "src/App.vue",
  message: "eval() is dangerous src/App.vue:3:5 extra context",
  help: "",
  severity: "error",
  labels: [{ span: { line: 3, column: 5 } }],
  ...overrides,
});

describe("runOxlint output handling", () => {
  const run = (includePaths?: string[]) => runOxlint(projectDirectory, false, "vite", includePaths);

  it("maps oxlint diagnostics: rule code, location, category, cleaned message and canonical rule id", async () => {
    behavior = { stdout: oxlintOutput([oxlintDiagnostic()]) };
    const [diagnostic] = await run();
    expect(diagnostic).toMatchObject({
      filePath: "src/App.vue",
      plugin: "vue-doctor",
      severity: "error",
      line: 3,
      column: 5,
      category: "Security",
      message: "eval() is dangerous",
    });
    expect(diagnostic.rule).toMatch(/^security\/no-eval$|^vue-doctor\/security\/no-eval$/);
    expect(diagnostic.help).not.toBe("");
  });

  it("keeps the rule name of unknown rules, defaults the category and location, and splits `eslint-plugin-` prefixes", async () => {
    behavior = {
      stdout: oxlintOutput([
        oxlintDiagnostic({ code: "eslint-plugin-custom(some-rule)", message: "plain", labels: [], help: "Do X" }),
        oxlintDiagnostic({ code: "no-parens-code", message: "x" }),
      ]),
    };
    const diagnostics = await run();
    expect(diagnostics[0]).toMatchObject({ plugin: "custom", rule: "some-rule", category: "Other", line: 0, column: 0, help: "Do X", message: "plain" });
    expect(diagnostics[1]).toMatchObject({ plugin: "unknown", rule: "no-parens-code" });
  });

  it("drops diagnostics without a rule code and for files that are not JS/TS/Vue sources", async () => {
    behavior = {
      stdout: oxlintOutput([oxlintDiagnostic({ code: "" }), oxlintDiagnostic({ filename: "styles.css" }), oxlintDiagnostic({ filename: "a.ts" })]),
    };
    expect((await run()).map((diagnostic) => diagnostic.filePath)).toEqual(["a.ts"]);
  });

  it("returns nothing for empty output, and for an empty include list without spawning", async () => {
    behavior = { stdout: "" };
    expect(await run()).toEqual([]);
    spawnMock.spawn.mockClear();
    expect(await run([])).toEqual([]);
    expect(spawnMock.spawn).not.toHaveBeenCalled();
  });

  it("rejects with a preview when the output is not JSON", async () => {
    behavior = { stdout: `Segmentation ${"x".repeat(500)}` };
    const error = await run().then(() => null, (caught: Error) => caught);
    expect(error?.message).toMatch(/^Failed to parse oxlint output: Segmentation x+$/);
    expect(error?.message.length).toBeLessThan(260);
  });

  it("rejects with stderr when oxlint printed nothing on stdout, but tolerates stderr next to output", async () => {
    behavior = { stderr: "bad config" };
    await expect(run()).rejects.toThrow("Failed to run oxlint: bad config");

    behavior = { stdout: oxlintOutput([]), stderr: "warning: slow" };
    expect(await run()).toEqual([]);
  });

  it("rejects when the process cannot be spawned", async () => {
    behavior = { error: new Error("spawn ENOENT") };
    await expect(run()).rejects.toThrow("Failed to run oxlint: spawn ENOENT");
  });

  it("splits long file lists over several processes and reports every command", async () => {
    behavior = { stdout: oxlintOutput([]) };
    const includePaths = Array.from({ length: 400 }, (_, index) => `src/${"nested/".repeat(10)}file-${index}.ts`);
    const commands: string[][] = [];
    await runOxlint(projectDirectory, true, "vite", includePaths, process.execPath, (argv) => commands.push(argv));
    expect(commands.length).toBeGreaterThan(1);
    expect(commands.flat().filter((argument) => argument.endsWith(".ts"))).toHaveLength(400);
    expect(commands[0]).toContain("--tsconfig");
  });

  it("re-lints files with foreign disable comments from a defused copy, never touching the project", async () => {
    const source = "// eslint-disable-next-line\neval('1');\n";
    fs.mkdirSync(path.join(projectDirectory, "src"));
    fs.writeFileSync(path.join(projectDirectory, "src", "hidden.ts"), source);
    let call = 0;
    const cwds: string[] = [];
    spawnMock.spawn = createFakeSpawn(() => ({
      stdout: oxlintOutput([oxlintDiagnostic({ filename: "src/hidden.ts", message: call++ === 0 ? "from project" : "from mirror" })]),
    }));
    const spy = vi.fn((_argv: string[], cwd: string) => cwds.push(cwd));

    const diagnostics = await runOxlint(projectDirectory, true, "vite", undefined, process.execPath, spy);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual(["from mirror"]);
    expect(cwds[0]).toBe(projectDirectory);
    expect(cwds[1]).not.toBe(projectDirectory);
    expect(fs.readFileSync(path.join(projectDirectory, "src", "hidden.ts"), "utf-8")).toBe(source);
    // The mirror lives in the OS temp directory and is removed afterwards.
    expect(fs.existsSync(cwds[1])).toBe(false);
    // TypeScript projects point the mirror run at the project's tsconfig.
    expect(spy.mock.calls[1][0]).toContain(path.join(projectDirectory, "tsconfig.json"));
  });
});

describe("runKnip output handling", () => {
  const worker = (result: object) => ({ stdout: JSON.stringify(result) });

  it("maps files, exports, types and duplicates to Dead Code findings relative to the project", async () => {
    const abs = (name: string) => path.join(projectDirectory, "src", name);
    behavior = worker({
      ok: true,
      issues: [
        { type: "files", filePath: abs("a.ts"), symbol: "" },
        { type: "exports", filePath: abs("b.ts"), symbol: "foo" },
        { type: "types", filePath: abs("c.ts"), symbol: "Bar" },
        { type: "duplicates", filePath: abs("d.ts"), symbol: "Baz|Qux" },
      ],
    });
    const diagnostics = await runKnip(projectDirectory);
    expect(diagnostics.map((diagnostic) => [diagnostic.rule, diagnostic.filePath, diagnostic.message])).toEqual([
      ["files", "src/a.ts", "Unused file"],
      ["exports", "src/b.ts", "Unused export: foo"],
      ["types", "src/c.ts", "Unused type: Bar"],
      ["duplicates", "src/d.ts", "Duplicate export: Baz|Qux"],
    ]);
    expect(diagnostics[0].help).toContain("not imported");
    expect(diagnostics[1].help).toBe("");
    expect(diagnostics.every((diagnostic) => diagnostic.plugin === "knip" && diagnostic.category === "Dead Code")).toBe(true);
  });

  it("rejects with the worker's error message", async () => {
    behavior = worker({ ok: false, error: "knip exploded" });
    await expect(runKnip(projectDirectory)).rejects.toThrow("knip exploded");
  });

  it("falls back to stderr, then to a stdout preview, when the worker output is not JSON", async () => {
    behavior = { stdout: "garbage", stderr: "  node: bad option \n" };
    await expect(runKnip(projectDirectory)).rejects.toThrow("Failed to run knip: node: bad option");

    behavior = { stdout: "y".repeat(800) };
    const error = await runKnip(projectDirectory).then(() => null, (caught: Error) => caught);
    expect(error?.message).toBe(`Failed to run knip: ${"y".repeat(500)}`);
  });

  it("rejects when the worker cannot be spawned", async () => {
    behavior = { error: new Error("EPERM") };
    await expect(runKnip(projectDirectory)).rejects.toThrow("Failed to run knip: EPERM");
  });

  it("reports the worker command to the listener", async () => {
    behavior = worker({ ok: true, issues: [] });
    const commands: Array<[string[], string]> = [];
    await runKnip(projectDirectory, (argv, cwd) => commands.push([argv, cwd]));
    expect(commands).toHaveLength(1);
    expect(commands[0][0][0]).toBe(process.execPath);
    expect(commands[0][0][1]).toMatch(/knip-worker\.js$/);
    expect(commands[0][1]).toBe(projectDirectory);
  });
});
