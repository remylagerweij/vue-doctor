import { describe, expect, it } from "vitest";
import {
  classifyDependencySpec,
  findLockfileNames,
  findNonRegistryPackages,
  getLockfileManagers,
  getUrlHost,
  parseLockfile,
  readRegistryHosts,
} from "../src/plugin/supply-chain/lockfile.js";

describe("lockfile detection", () => {
  it("finds lockfiles among file names and maps them to package managers", () => {
    const names = findLockfileNames(["package.json", "yarn.lock", "package-lock.json", "npm-shrinkwrap.json", "bun.lockb"]);
    expect(names).toEqual(["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "bun.lockb"]);
    expect(getLockfileManagers(names)).toEqual(["npm", "yarn", "bun"]);
    expect(findLockfileNames(["package.json"])).toEqual([]);
  });

  it("extracts the host of URL-like values only", () => {
    expect(getUrlHost("https://Registry.NPMJS.org/vue/-/vue-3.tgz")).toBe("registry.npmjs.org");
    expect(getUrlHost("git+ssh://git@github.com/acme/x.git")).toBe("github.com");
    expect(getUrlHost("file:../lib")).toBeNull();
    expect(getUrlHost("packages/local")).toBeNull();
    expect(getUrlHost("https://")).toBeNull();
  });
});

describe("parseLockfile: npm", () => {
  it("reads packages of lockfile v3, with install scripts, nesting and links", () => {
    const content = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "app" },
        "node_modules/esbuild": { resolved: "https://registry.npmjs.org/esbuild/-/esbuild-1.tgz", hasInstallScript: true },
        "node_modules/@scope/pkg": { resolved: "https://registry.npmjs.org/@scope/pkg/-/pkg-1.tgz" },
        "node_modules/a/node_modules/b": { resolved: "git+ssh://git@github.com/acme/b.git#abc" },
        "node_modules/local": { resolved: "packages/local", link: true },
        "packages/local": {},
        "node_modules/file-dep": { resolved: "file:../x" },
      },
    });
    expect(parseLockfile("package-lock.json", content)).toEqual([
      { name: "esbuild", resolved: "https://registry.npmjs.org/esbuild/-/esbuild-1.tgz", hasInstallScript: true, topLevel: true },
      { name: "@scope/pkg", resolved: "https://registry.npmjs.org/@scope/pkg/-/pkg-1.tgz", hasInstallScript: false, topLevel: true },
      { name: "b", resolved: "git+ssh://git@github.com/acme/b.git#abc", hasInstallScript: false, topLevel: false },
      { name: "file-dep", resolved: null, hasInstallScript: false, topLevel: true },
    ]);
  });

  it("reads the nested dependencies tree of lockfile v1", () => {
    const content = JSON.stringify({
      lockfileVersion: 1,
      dependencies: { a: { resolved: "https://registry.npmjs.org/a.tgz", dependencies: { b: { version: "1.0.0" } } } },
    });
    expect(parseLockfile("npm-shrinkwrap.json", content)).toEqual([
      { name: "a", resolved: "https://registry.npmjs.org/a.tgz", hasInstallScript: false, topLevel: true },
      { name: "b", resolved: null, hasInstallScript: false, topLevel: false },
    ]);
  });

  it("returns null for invalid or unrelated JSON", () => {
    expect(parseLockfile("package-lock.json", "{ not json")).toBeNull();
    expect(parseLockfile("package-lock.json", "null")).toBeNull();
    expect(parseLockfile("package-lock.json", "{}")).toBeNull();
  });
});

describe("parseLockfile: pnpm", () => {
  const lock = [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "  .:",
    "    dependencies: {}",
    "",
    "packages:",
    "",
    "  '@scope/pkg@1.0.0':",
    "    resolution: {tarball: https://files.example.org/pkg-1.0.0.tgz}",
    "    requiresBuild: true",
    "",
    "  vue@3.5.0(typescript@5.0.0):",
    "    resolution: {integrity: sha512-abc}",
    "",
    "  /legacy/1.0.0:",
    "    resolution: {integrity: sha512-def}",
    "",
    "snapshots:",
    "",
    "  vue@3.5.0: {}",
    "",
  ].join("\n");

  it("reads names, tarball URLs and requiresBuild from the packages section", () => {
    expect(parseLockfile("pnpm-lock.yaml", lock)).toEqual([
      { name: "@scope/pkg", resolved: "https://files.example.org/pkg-1.0.0.tgz", hasInstallScript: true, topLevel: true },
      { name: "vue", resolved: null, hasInstallScript: false, topLevel: true },
      { name: "legacy", resolved: null, hasInstallScript: false, topLevel: true },
    ]);
  });

  it("handles a lockfile without a packages section and unrelated text", () => {
    expect(parseLockfile("pnpm-lock.yaml", "lockfileVersion: '9.0'\n")).toEqual([]);
    expect(parseLockfile("pnpm-lock.yaml", "hello")).toBeNull();
  });
});

describe("parseLockfile: yarn and others", () => {
  it("reads yarn classic entries and their resolved URLs", () => {
    const content = [
      "# yarn lockfile v1",
      "",
      '"@scope/pkg@^1.0.0", "@scope/pkg@^1.1.0":',
      '  version "1.1.0"',
      '  resolved "https://registry.yarnpkg.com/@scope/pkg/-/pkg-1.1.0.tgz#abc"',
      "",
      "left-pad@^1.0.0:",
      '  version "1.0.0"',
      '  resolved "https://cdn.example.net/left-pad.tgz#abc"',
      "",
    ].join("\n");
    expect(parseLockfile("yarn.lock", content)).toEqual([
      { name: "@scope/pkg", resolved: "https://registry.yarnpkg.com/@scope/pkg/-/pkg-1.1.0.tgz#abc", hasInstallScript: false, topLevel: true },
      { name: "left-pad", resolved: "https://cdn.example.net/left-pad.tgz#abc", hasInstallScript: false, topLevel: true },
    ]);
  });

  it("treats yarn berry, empty yarn files and bun as having nothing to read", () => {
    expect(parseLockfile("yarn.lock", "__metadata:\n  version: 8\n")).toEqual([]);
    expect(parseLockfile("yarn.lock", "")).toBeNull();
    expect(parseLockfile("bun.lock", "{}")).toBeNull();
    expect(parseLockfile("unknown.lock", "{}")).toBeNull();
  });
});

describe("registry hosts", () => {
  it("includes the default registries and those of .npmrc and .yarnrc.yml", () => {
    const hosts = readRegistryHosts([
      { name: ".npmrc", content: "registry=https://npm.corp.example/\n@acme:registry = 'https://NPM.pkg.github.com'\n//other.example/:_authToken=x\n; comment\n" },
      { name: ".npmrc", content: "registry=//protocol-relative.example/\n" },
      { name: ".yarnrc.yml", content: "npmRegistryServer: \"https://yarn.corp.example\"\n" },
    ]);
    expect(hosts).toEqual([
      "registry.npmjs.org",
      "registry.yarnpkg.com",
      "npm.corp.example",
      "npm.pkg.github.com",
      "protocol-relative.example",
      "yarn.corp.example",
    ]);
  });

  it("finds packages resolved from other hosts", () => {
    const packages = [
      { name: "a", resolved: "https://registry.npmjs.org/a.tgz", hasInstallScript: false, topLevel: true },
      { name: "b", resolved: "https://evil.example/b.tgz", hasInstallScript: false, topLevel: true },
      { name: "c", resolved: null, hasInstallScript: false, topLevel: true },
    ];
    expect(findNonRegistryPackages(packages, ["registry.npmjs.org"]).map((entry) => entry.name)).toEqual(["b"]);
    expect(findNonRegistryPackages(packages, ["registry.npmjs.org", "evil.example"])).toEqual([]);
  });
});

describe("classifyDependencySpec", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  it.each([
    ["^3.5.0", null],
    ["latest", null],
    ["npm:other@^1.0.0", null],
    ["workspace:*", null],
    ["file:../lib", null],
    ["link:../lib", null],
    [`github:acme/x#${SHA}`, null],
    [`git+https://github.com/acme/x.git#${SHA}`, null],
    ["github:acme/x", "git"],
    ["acme/x#main", "git"],
    ["git+ssh://git@github.com/acme/x.git#v1.0.0", "git"],
    ["git@github.com:acme/x.git", "git"],
    ["https://github.com/acme/x.git", "git"],
    ["gitlab:acme/x", "git"],
    ["http://example.com/x.tgz", "http"],
    ["https://example.com/x.tgz", "tarball"],
  ])("%s -> %s", (spec, expected) => {
    expect(classifyDependencySpec(spec)).toBe(expected);
  });
});
