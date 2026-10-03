import type { FsRuleCases } from "../../fs-rule-cases.js";

// Lines: vue is on 4, esbuild on 7.
const manifest = JSON.stringify(
  { name: "app", dependencies: { vue: "^3.5.0" }, devDependencies: { esbuild: "^0.25.0" } },
  null,
  2,
);

const npmLock = (packages: Record<string, unknown>): string =>
  JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "app" }, ...packages } }, null, 2);

const pnpmLock = (entry: string): string =>
  `lockfileVersion: '9.0'\n\npackages:\n\n  esbuild@0.25.0:\n    resolution: {integrity: sha512-abc}\n${entry}\nsnapshots:\n  esbuild@0.25.0: {}\n`;

const cases: FsRuleCases = {
  valid: [
    {
      name: "no dependency has an install script",
      files: {
        "package.json": manifest,
        "package-lock.json": npmLock({
          "node_modules/vue": { version: "3.5.0" },
          "node_modules/esbuild": { version: "0.25.0" },
        }),
      },
    },
    {
      name: "an install script of a transitive dependency is not reported",
      files: {
        "package.json": manifest,
        "package-lock.json": npmLock({
          "node_modules/vue": { version: "3.5.0" },
          "node_modules/fsevents": { version: "2.3.3", hasInstallScript: true },
          "node_modules/vue/node_modules/esbuild": { version: "0.1.0", hasInstallScript: true },
        }),
      },
    },
    { name: "no lockfile, nothing to read", files: { "package.json": manifest } },
    {
      name: "pnpm lockfile without requiresBuild",
      files: { "package.json": manifest, "pnpm-lock.yaml": pnpmLock("    hasBin: true\n") },
    },
    {
      name: "lockfile v1 records no install scripts",
      files: {
        "package.json": manifest,
        "package-lock.json": JSON.stringify({ lockfileVersion: 1, dependencies: { esbuild: { version: "0.25.0" } } }),
      },
    },
  ],
  invalid: [
    {
      name: "direct devDependency with hasInstallScript",
      files: {
        "package.json": manifest,
        "package-lock.json": npmLock({
          "node_modules/vue": { version: "3.5.0" },
          "node_modules/esbuild": { version: "0.25.0", hasInstallScript: true },
        }),
      },
      findings: [{ file: "package.json", line: 7 }],
    },
    {
      name: "several direct dependencies",
      files: {
        "package.json": manifest,
        "package-lock.json": npmLock({
          "node_modules/vue": { version: "3.5.0", hasInstallScript: true },
          "node_modules/esbuild": { version: "0.25.0", hasInstallScript: true },
        }),
      },
      findings: [
        { file: "package.json", line: 4 },
        { file: "package.json", line: 7 },
      ],
    },
    {
      name: "pnpm requiresBuild on a direct dependency",
      files: { "package.json": manifest, "pnpm-lock.yaml": pnpmLock("    requiresBuild: true\n") },
      findings: [{ file: "package.json", line: 7 }],
    },
    {
      name: "the lockfile in the monorepo root counts",
      files: {
        "package.json": manifest,
        "../package.json": JSON.stringify({ private: true, workspaces: ["apps/*"] }),
        "../package-lock.json": npmLock({ "node_modules/esbuild": { version: "0.25.0", hasInstallScript: true } }),
      },
      findings: [{ file: "package.json", line: 7 }],
    },
  ],
};

export default cases;
