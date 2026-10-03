import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverProject,
  discoverVueSubprojects,
  getRootPackage,
  hasVueDependency,
  listNestedWorkspaceDirectories,
  listWorkspaceDirectories,
  listWorkspacePackages,
} from "../src/utils/discover-project.js";
import { findMonorepoRoot, isMonorepoRoot } from "../src/utils/find-monorepo-root.js";
import { relativeToSourceRoot } from "../src/utils/find-source-root.js";
import {
  isInsideAnyDirectory,
  listProjectSourceFiles,
  normalizeRelativePath,
} from "../src/utils/list-source-files.js";
import { clearPackageJsonCache, readPackageJson } from "../src/utils/read-package-json.js";
import { selectProjects } from "../src/utils/select-projects.js";

const promptMock = vi.hoisted(() => ({ promptMultiselect: vi.fn() }));
vi.mock("../src/utils/prompts.js", () => promptMock);

const temporaryDirectories: string[] = [];
const makeTree = (files: Record<string, string | object>): string => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-discovery-")));
  temporaryDirectories.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  clearPackageJsonCache();
  promptMock.promptMultiselect.mockReset();
});

describe("readPackageJson", () => {
  it("returns {} for a missing file and throws for invalid JSON without caching it", () => {
    const root = makeTree({ "bad/package.json": "{ nope" });
    expect(readPackageJson(path.join(root, "missing", "package.json"))).toEqual({});
    expect(() => readPackageJson(path.join(root, "bad", "package.json"))).toThrow();
    fs.writeFileSync(path.join(root, "bad", "package.json"), '{"name":"fixed"}');
    expect(readPackageJson(path.join(root, "bad", "package.json")).name).toBe("fixed");
  });

  it("re-reads a manifest when it changes and reuses the parsed value otherwise", () => {
    const root = makeTree({ "package.json": { name: "a" } });
    const file = path.join(root, "package.json");
    const first = readPackageJson(file);
    expect(readPackageJson(file)).toBe(first);
    fs.writeFileSync(file, JSON.stringify({ name: "a-longer-name" }));
    expect(readPackageJson(file).name).toBe("a-longer-name");
  });
});

describe("monorepo detection", () => {
  it("recognises package.json workspaces, pnpm-workspace.yaml and rejects other directories", () => {
    const npm = makeTree({ "package.json": { workspaces: ["packages/*"] } });
    const pnpm = makeTree({ "package.json": {}, "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n" });
    const plain = makeTree({ "package.json": { name: "plain" } });
    const empty = makeTree({});
    const broken = makeTree({ "package.json": "{ nope" });

    expect(isMonorepoRoot(npm)).toBe(true);
    expect(isMonorepoRoot(pnpm)).toBe(true);
    expect(isMonorepoRoot(plain)).toBe(false);
    expect(isMonorepoRoot(empty)).toBe(false);
    expect(isMonorepoRoot(broken)).toBe(false);
  });

  it("finds the closest monorepo root above a directory, or null", () => {
    const root = makeTree({
      "package.json": { workspaces: ["packages/*"] },
      "packages/a/package.json": { name: "a" },
    });
    expect(findMonorepoRoot(path.join(root, "packages", "a"))).toBe(root);
    expect(findMonorepoRoot(root)).not.toBe(root);
  });
});

describe("workspace discovery", () => {
  const monorepo = (extra: Record<string, string | object> = {}, rootManifest: object = {}): string =>
    makeTree({
      "package.json": { name: "root", workspaces: ["packages/*"], ...rootManifest },
      "packages/app/package.json": { name: "@m/app", dependencies: { vue: "^3.5.0" } },
      "packages/lib/package.json": { name: "@m/lib" },
      "packages/nuxt-app/package.json": { name: "@m/nuxt", devDependencies: { nuxt: "^3.0.0", vue: "^3.4.0" } },
      ...extra,
    });

  it("lists every workspace directory and only the Vue ones as packages", () => {
    const root = monorepo();
    expect(listWorkspaceDirectories(root).map((directory) => path.basename(directory)).sort()).toEqual([
      "app",
      "lib",
      "nuxt-app",
    ]);
    expect(listWorkspacePackages(root).map((entry) => entry.name).sort()).toEqual(["@m/app", "@m/nuxt"]);
    expect(listNestedWorkspaceDirectories(root)).toHaveLength(2);
    expect(listNestedWorkspaceDirectories(path.join(root, "packages", "app"))).toEqual([]);
  });

  it("supports exact paths, `/**` patterns, workspaces.packages and pnpm-workspace.yaml", () => {
    const exact = makeTree({
      "package.json": { workspaces: { packages: ["apps/web", "apps/missing", "tools/**"] } },
      "apps/web/package.json": { name: "web", dependencies: { vue: "3" } },
      "tools/x/package.json": { name: "x" },
    });
    expect(listWorkspaceDirectories(exact).map((directory) => path.basename(directory)).sort()).toEqual(["web", "x"]);

    const pnpm = makeTree({
      "package.json": { name: "p" },
      "pnpm-workspace.yaml": "# comment\npackages:\n  - 'apps/*'\n  # another\n  - \"libs/*\"\nother: true\n",
      "apps/a/package.json": { name: "a", dependencies: { vue: "3" } },
      "libs/b/package.json": { name: "b", dependencies: { vue: "3" } },
    });
    expect(listWorkspacePackages(pnpm).map((entry) => entry.name).sort()).toEqual(["a", "b"]);
  });

  it("returns no workspaces without a manifest or without declared workspaces", () => {
    expect(listWorkspaceDirectories(makeTree({}))).toEqual([]);
    expect(listWorkspaceDirectories(makeTree({ "package.json": { name: "x" } }))).toEqual([]);
  });

  it("detects the root as a project when it depends on Vue itself", () => {
    expect(getRootPackage(makeTree({}))).toBeNull();
    expect(getRootPackage(makeTree({ "package.json": { name: "no-vue" } }))).toBeNull();
    const root = makeTree({ "package.json": { dependencies: { nuxt: "3" } } });
    expect(getRootPackage(root)).toEqual({ name: path.basename(root), directory: root });
  });

  it("recognises Vue-ish dependencies", () => {
    expect(hasVueDependency({ dependencies: { vue: "3" } })).toBe(true);
    expect(hasVueDependency({ peerDependencies: { "vue-router": "4" } })).toBe(true);
    expect(hasVueDependency({ devDependencies: { nuxt: "3" } })).toBe(true);
    expect(hasVueDependency({ dependencies: { react: "19" } })).toBe(false);
    expect(hasVueDependency({})).toBe(false);
  });

  it("finds Vue subprojects of a plain directory, skipping dot and node_modules directories", () => {
    const root = makeTree({
      "a/package.json": { name: "a", dependencies: { vue: "3" } },
      "b/package.json": { name: "b" },
      "c/package.json": { dependencies: { vue: "3" } },
      ".hidden/package.json": { dependencies: { vue: "3" } },
      "node_modules/x/package.json": { dependencies: { vue: "3" } },
      "node_modules/package.json": { dependencies: { vue: "3" } },
      "file.txt": "x",
    });
    expect(discoverVueSubprojects(root).map((entry) => entry.name).sort()).toEqual(["a", "c"]);
    expect(discoverVueSubprojects(path.join(root, "nope"))).toEqual([]);
    expect(discoverVueSubprojects(path.join(root, "file.txt"))).toEqual([]);
  });

  it("takes Vue version and framework from workspaces when the root declares none", () => {
    const info = discoverProject(monorepo());
    expect(info.vueVersion).toBe("^3.5.0");
    expect(info.framework).toBe("nuxt");
  });

  it("falls back to the enclosing monorepo root for a workspace without its own Vue dependency", () => {
    const root = monorepo({}, { dependencies: { vue: "^3.2.0" }, devDependencies: { vite: "^5" } });
    const info = discoverProject(path.join(root, "packages", "lib"));
    expect(info.vueVersion).toBe("^3.2.0");
    expect(info.framework).toBe("vite");
  });

  it("falls back to workspace info of the enclosing monorepo", () => {
    const info = discoverProject(path.join(monorepo(), "packages", "lib"));
    expect(info.vueVersion).toBe("^3.5.0");
    expect(info.framework).toBe("nuxt");
  });

  it.each([
    ["nuxt.config.ts", "nuxt"],
    ["quasar.config.js", "quasar"],
    ["vue.config.js", "vuecli"],
    ["vite.config.ts", "vite"],
  ])("detects the framework from %s", (configFile, framework) => {
    const root = makeTree({ "package.json": { name: "x", dependencies: { vue: "3" } }, [configFile]: "export default {}" });
    expect(discoverProject(root).framework).toBe(framework);
  });

  it("detects the framework from dependencies and ignores TypeScript without a tsconfig", () => {
    const root = makeTree({ "package.json": { dependencies: { vue: "3", "@quasar/app-vite": "2" } } });
    const info = discoverProject(root);
    expect(info.framework).toBe("quasar");
    expect(info.hasTypeScript).toBe(false);
    expect(info.projectName).toBe(path.basename(root));
  });

  it("counts the source files git lists, excluding nested workspaces", () => {
    const root = makeTree({
      "package.json": { name: "r", dependencies: { vue: "3" }, workspaces: ["packages/*"] },
      "src/a.ts": "",
      "src/B.vue": "",
      "src/readme.md": "",
      "packages/app/package.json": { name: "app", dependencies: { vue: "3" } },
      "packages/app/src/c.ts": "",
    });
    expect(discoverProject(root).sourceFileCount).toBe(0); // not a git repository: nothing to list
    spawnSync("git", ["init", "--quiet"], { cwd: root });
    expect(discoverProject(root).sourceFileCount).toBe(2);
  });
});

describe("listProjectSourceFiles", () => {
  it("lists lintable files sorted with forward slashes, skipping dot, build and dependency directories", () => {
    const root = makeTree({
      "src/b.ts": "",
      "src/a.vue": "",
      "src/style.css": "",
      "node_modules/pkg/index.js": "",
      "dist/out.js": "",
      ".cache/x.js": "",
      "main.mjs": "",
    });
    expect(listProjectSourceFiles(root)).toEqual(["main.mjs", "src/a.vue", "src/b.ts"]);
  });

  it("leaves out nested workspace directories", () => {
    const root = makeTree({ "src/a.ts": "", "packages/app/src/b.ts": "" });
    expect(listProjectSourceFiles(root, [path.join(root, "packages", "app")])).toEqual(["src/a.ts"]);
    expect(listProjectSourceFiles(root, ["packages/app"])).toEqual(["src/a.ts"]);
  });

  it("normalizes separators and recognises files inside directories", () => {
    expect(normalizeRelativePath("a\\b\\..\\c.ts")).toBe("a/c.ts");
    expect(isInsideAnyDirectory("/p", "x/y.ts", ["/p/x"])).toBe(true);
    expect(isInsideAnyDirectory("/p", "xy/z.ts", ["/p/x"])).toBe(false);
    // The root itself never excludes anything.
    expect(isInsideAnyDirectory("/p", "x/y.ts", ["/p"])).toBe(false);
  });
});

describe("relativeToSourceRoot", () => {
  it("is the POSIX path from the git root, or relative to the cwd outside git", () => {
    const outside = makeTree({});
    const result = relativeToSourceRoot(outside);
    expect(result).not.toContain("\\");
    expect(relativeToSourceRoot(path.resolve(import.meta.dirname, ".."))).toBe("packages/vue-doctor");
  });
});

describe("selectProjects", () => {
  const monorepoWithTwoApps = (extra: Record<string, string | object> = {}): string =>
    makeTree({
      "package.json": { name: "root", workspaces: ["packages/*"] },
      "packages/a/package.json": { name: "@m/a", dependencies: { vue: "3" } },
      "packages/b/package.json": { name: "@m/b", dependencies: { vue: "3" } },
      ...extra,
    });
  const names = (directories: string[]): string[] => directories.map((directory) => path.basename(directory));

  it("returns the directory itself for a plain project", async () => {
    const root = makeTree({ "package.json": { name: "x", dependencies: { vue: "3" } } });
    expect(await selectProjects(root)).toEqual([root]);
  });

  it("selects Vue subprojects of a monorepo without workspaces entries, or the directory when there are none", async () => {
    const noWorkspaces = makeTree({ "package.json": {}, "pnpm-workspace.yaml": "packages:\n  - 'none/*'\n" });
    expect(await selectProjects(noWorkspaces)).toEqual([noWorkspaces]);

    const withSubprojects = makeTree({
      "package.json": {},
      "pnpm-workspace.yaml": "packages:\n",
      "x/package.json": { name: "x", dependencies: { vue: "3" } },
    });
    expect(names(await selectProjects(withSubprojects))).toEqual(["x"]);
  });

  it("filters by package name or directory name and falls back to the directory for unknown names", async () => {
    const root = monorepoWithTwoApps();
    expect(names(await selectProjects(root, "@m/a"))).toEqual(["a"]);
    expect(names(await selectProjects(root, " b , missing "))).toEqual(["b"]);
    expect(await selectProjects(root, "nope")).toEqual([root]);
  });

  it("scans everything without prompting when prompts are skipped, including a root app", async () => {
    const root = monorepoWithTwoApps({ "package.json": { name: "root", workspaces: ["packages/*"], dependencies: { vue: "3" } } });
    expect(names(await selectProjects(root, undefined, true))).toEqual([path.basename(root), "a", "b"]);
    expect(promptMock.promptMultiselect).not.toHaveBeenCalled();
  });

  it("does not prompt when there is only one candidate", async () => {
    const root = makeTree({
      "package.json": { workspaces: ["packages/*"] },
      "packages/a/package.json": { name: "a", dependencies: { vue: "3" } },
    });
    expect(names(await selectProjects(root))).toEqual(["a"]);
    expect(promptMock.promptMultiselect).not.toHaveBeenCalled();
  });

  it("asks which projects to scan and returns the selection, or the directory for an empty selection", async () => {
    const root = monorepoWithTwoApps();
    promptMock.promptMultiselect.mockResolvedValueOnce([path.join(root, "packages", "b")]);
    expect(names(await selectProjects(root))).toEqual(["b"]);
    expect(promptMock.promptMultiselect).toHaveBeenCalledWith("Select Vue projects to scan:", [
      { label: "@m/a", value: path.join(root, "packages", "a") },
      { label: "@m/b", value: path.join(root, "packages", "b") },
    ]);

    promptMock.promptMultiselect.mockResolvedValueOnce([]);
    expect(await selectProjects(root)).toEqual([root]);
  });
});
