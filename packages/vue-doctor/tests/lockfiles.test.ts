import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findLockfile, parseLockfile, stripJsonc } from "../src/utils/lockfiles.js";

const temporaryDirectories: string[] = [];
const createDirectory = (files: Record<string, string>): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lockfiles-"));
  temporaryDirectories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
};
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const summarize = (packages: ReturnType<typeof parseLockfile>["packages"]) =>
  packages.map(({ name, version, direct }) => `${name}@${version}${direct ? " (direct)" : ""}`);

describe("npm lockfiles", () => {
  const lockfileV3 = JSON.stringify(
    {
      name: "app",
      lockfileVersion: 3,
      packages: {
        "": { name: "app", dependencies: { vue: "^3.4.0" }, devDependencies: { vitest: "^1.0.0" } },
        "node_modules/vue": { version: "3.4.0" },
        "node_modules/@vue/shared": { version: "3.4.0" },
        "node_modules/lodash": { version: "4.17.20" },
        "node_modules/vitest/node_modules/lodash": { version: "4.17.15" },
        "node_modules/vitest": { version: "1.0.0", dev: true },
        "node_modules/alias": { name: "real-package", version: "2.0.0" },
        "node_modules/linked": { resolved: "../linked", link: true },
        "node_modules/from-git": { version: "github:user/repo" },
        "packages/workspace-member": { version: "1.0.0" },
      },
    },
    null,
    2,
  );

  it("reads v2/v3 packages, skipping the root, links, workspaces and non-registry versions", () => {
    const { packages } = parseLockfile("npm", lockfileV3);
    expect(summarize(packages)).toEqual([
      "vue@3.4.0 (direct)",
      "@vue/shared@3.4.0",
      "lodash@4.17.20",
      "lodash@4.17.15",
      "vitest@1.0.0 (direct)",
      "real-package@2.0.0",
    ]);
  });

  it("marks only top-level installs of declared dependencies as direct, also from package.json names", () => {
    const { packages } = parseLockfile("npm", lockfileV3, ["lodash"]);
    expect(summarize(packages)).toContain("lodash@4.17.20 (direct)");
    // The nested copy under vitest is a transitive install even though the name is declared.
    expect(summarize(packages)).toContain("lodash@4.17.15");
  });

  it("finds the line of an entry", () => {
    const parsed = parseLockfile("npm", lockfileV3);
    const lodash = parsed.packages.find((pkg) => pkg.version === "4.17.20")!;
    expect(lockfileV3.split("\n")[parsed.lineOf(lodash) - 1]).toContain('"node_modules/lodash"');
  });

  it("reads the v1 dependency tree", () => {
    const content = JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        express: { version: "4.17.1", dependencies: { qs: { version: "6.7.0" } } },
        qs: { version: "6.5.2" },
      },
    });
    expect(summarize(parseLockfile("npm", content, ["express"]).packages)).toEqual([
      "express@4.17.1 (direct)",
      "qs@6.7.0",
      "qs@6.5.2",
    ]);
  });

  it("deduplicates repeated name@version entries", () => {
    const content = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "node_modules/a/node_modules/dup": { version: "1.0.0" },
        "node_modules/b/node_modules/dup": { version: "1.0.0" },
      },
    });
    expect(summarize(parseLockfile("npm", content).packages)).toEqual(["dup@1.0.0"]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseLockfile("npm", "{ nope")).toThrow();
    expect(() => parseLockfile("npm", "[]")).toThrow("not a JSON object");
  });
});

describe("pnpm lockfiles", () => {
  const lockfileV6 = [
    "lockfileVersion: '6.0'",
    "",
    "importers:",
    "  .:",
    "    dependencies:",
    "      vue:",
    "        specifier: ^3.4.0",
    "        version: 3.4.0(typescript@5.3.3)",
    "",
    "packages:",
    "",
    "  /@vue/shared@3.4.0:",
    "    resolution: {integrity: sha512-aaa}",
    "    dev: false",
    "",
    "  /vue@3.4.0(typescript@5.3.3):",
    "    resolution: {integrity: sha512-bbb}",
    "    dev: false",
    "",
    "  /lodash@4.17.20:",
    "    resolution: {integrity: sha512-ccc}",
    "    dev: false",
    "",
    "  github.com/user/repo/abc123:",
    "    resolution: {tarball: https://codeload.github.com/user/repo/tar.gz/abc123}",
    "    name: repo",
    "    version: 1.0.0",
    "",
  ].join("\n");

  it("reads v6 keys with leading slash and peer suffixes", () => {
    const { packages } = parseLockfile("pnpm", lockfileV6, ["vue"]);
    expect(summarize(packages)).toEqual(["@vue/shared@3.4.0", "vue@3.4.0 (direct)", "lodash@4.17.20"]);
  });

  it("reads v9 keys, quoted scopes, and ignores the snapshots section", () => {
    const lockfileV9 = [
      "lockfileVersion: '9.0'",
      "packages:",
      "",
      "  '@vue/shared@3.4.0':",
      "    resolution: {integrity: sha512-aaa}",
      "",
      "  minimist@1.2.5:",
      "    resolution: {integrity: sha512-bbb}",
      "",
      "snapshots:",
      "",
      "  '@vue/shared@3.4.0': {}",
      "",
      "  minimist@1.2.5: {}",
      "",
      "  other@9.9.9: {}",
      "",
    ].join("\n");
    const parsed = parseLockfile("pnpm", lockfileV9, ["minimist"]);
    expect(summarize(parsed.packages)).toEqual(["@vue/shared@3.4.0", "minimist@1.2.5 (direct)"]);
    expect(parsed.lineOf(parsed.packages[1])).toBe(7);
  });
});

describe("yarn lockfiles", () => {
  it("reads classic v1 entries with several specifiers", () => {
    const content = [
      "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.",
      "# yarn lockfile v1",
      "",
      "",
      '"@babel/core@^7.0.0", "@babel/core@^7.1.0":',
      '  version "7.2.0"',
      '  resolved "https://registry.yarnpkg.com/@babel/core/-/core-7.2.0.tgz#abc"',
      "",
      "lodash@^4.17.15, lodash@^4.17.20:",
      '  version "4.17.20"',
      '  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.20.tgz#def"',
      "  dependencies:",
      "    other \"^1.0.0\"",
      "",
    ].join("\n");
    const parsed = parseLockfile("yarn", content, ["lodash"]);
    expect(summarize(parsed.packages)).toEqual(["@babel/core@7.2.0", "lodash@4.17.20 (direct)"]);
    expect(parsed.lineOf(parsed.packages[1])).toBe(9);
  });

  it("reads Berry entries and skips workspaces, patches and metadata", () => {
    const content = [
      "# This file is generated by running \"yarn install\" inside your project.",
      "",
      "__metadata:",
      "  version: 8",
      "  cacheKey: 10c0",
      "",
      '"lodash@npm:^4.17.15":',
      "  version: 4.17.20",
      '  resolution: "lodash@npm:4.17.20"',
      "  checksum: 10c0/abc",
      "  languageName: node",
      "  linkType: hard",
      "",
      '"app@workspace:.":',
      "  version: 0.0.0-use.local",
      '  resolution: "app@workspace:."',
      "  languageName: unknown",
      "  linkType: soft",
      "",
      '"typescript@patch:typescript@npm%3A^5.0.0#optional!builtin<compat/typescript>":',
      "  version: 5.3.3",
      '  resolution: "typescript@patch:typescript@npm%3A5.3.3#optional!builtin<compat/typescript>::version=5.3.3&hash=abc"',
      "  linkType: hard",
      "",
      '"alias@npm:real-package@^2.0.0":',
      "  version: 2.1.0",
      '  resolution: "real-package@npm:2.1.0"',
      "",
    ].join("\n");
    expect(summarize(parseLockfile("yarn", content, ["lodash"]).packages)).toEqual([
      "lodash@4.17.20 (direct)",
      "real-package@2.1.0",
    ]);
  });
});

describe("bun lockfiles", () => {
  const bunLock = `{
  "lockfileVersion": 1,
  // comments are allowed in bun.lock
  "workspaces": {
    "": {
      "name": "app",
      "dependencies": { "vue": "^3.4.0" },
    },
  },
  "packages": {
    "vue": ["vue@3.4.0", "", { "dependencies": { "@vue/shared": "3.4.0" } }, "sha512-aaa"],
    "@vue/shared": ["@vue/shared@3.4.0", "", {}, "sha512-bbb"],
    "foo/lodash": ["lodash@4.17.15", "", {}, "sha512-ccc"],
    "app": ["app@workspace:."],
    "aliased": ["aliased@npm:real-package@1.2.3", "", {}, "sha512-ddd"],
    "from-git": ["from-git@github:user/repo#abc123", {}, "abc123"],
  },
}
`;

  it("reads the JSONC lockfile (comments, trailing commas), skipping workspaces and git packages", () => {
    const parsed = parseLockfile("bun", bunLock);
    expect(summarize(parsed.packages)).toEqual([
      "vue@3.4.0 (direct)",
      "@vue/shared@3.4.0",
      "lodash@4.17.15",
      "real-package@1.2.3",
    ]);
    expect(bunLock.split("\n")[parsed.lineOf(parsed.packages[2]) - 1]).toContain('"lodash@4.17.15"');
  });

  it("throws when there is no packages section", () => {
    expect(() => parseLockfile("bun", "{}")).toThrow("no packages section");
  });

  it("strips comments and trailing commas outside strings only", () => {
    const stripped = stripJsonc('{ "a": "x, // not a comment", /* gone */ "b": [1, 2, ], }');
    expect(JSON.parse(stripped)).toEqual({ a: "x, // not a comment", b: [1, 2] });
  });
});

describe("findLockfile", () => {
  it("finds the lockfile of the project, preferring package-lock.json", () => {
    const directory = createDirectory({ "package.json": "{}", "package-lock.json": "{}", "yarn.lock": "" });
    expect(findLockfile(directory)).toEqual({ kind: "npm", filePath: path.join(directory, "package-lock.json"), binary: false });
  });

  it.each([
    ["npm-shrinkwrap.json", "npm"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
  ])("recognizes %s", (name, kind) => {
    const directory = createDirectory({ "package.json": "{}", [name]: "" });
    expect(findLockfile(directory)?.kind).toBe(kind);
  });

  it("flags Bun's binary lockfile", () => {
    const directory = createDirectory({ "package.json": "{}", "bun.lockb": "binary" });
    expect(findLockfile(directory)).toMatchObject({ kind: "bun", binary: true });
  });

  it("falls back to the monorepo root's lockfile for a workspace", () => {
    const root = createDirectory({
      "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "packages/app/package.json": "{}",
    });
    expect(findLockfile(path.join(root, "packages", "app"))).toEqual({
      kind: "pnpm",
      filePath: path.join(root, "pnpm-lock.yaml"),
      binary: false,
    });
  });

  it("returns null without a lockfile", () => {
    expect(findLockfile(createDirectory({ "package.json": "{}" }))).toBeNull();
  });
});
