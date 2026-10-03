import type { FsRuleCases } from "../../fs-rule-cases.js";

const manifest = JSON.stringify({ name: "app", dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^7.0.0" } }, null, 2);

const npmLock = (packages: Record<string, unknown>): string =>
  JSON.stringify({ name: "app", lockfileVersion: 3, packages: { "": { name: "app" }, ...packages } }, null, 2);

const registryPackages = {
  "node_modules/vue": { version: "3.5.0", resolved: "https://registry.npmjs.org/vue/-/vue-3.5.0.tgz" },
  "node_modules/vite": { version: "7.0.0", resolved: "https://registry.npmjs.org/vite/-/vite-7.0.0.tgz" },
};

const monorepoRoot = JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] });

const cases: FsRuleCases = {
  valid: [
    {
      name: "one npm lockfile, everything from registry.npmjs.org",
      files: { "package.json": manifest, "package-lock.json": npmLock(registryPackages) },
    },
    {
      name: "a project without dependencies needs no lockfile",
      files: { "package.json": JSON.stringify({ name: "app", scripts: { build: "vite build" } }) },
    },
    {
      name: "a private registry that .npmrc configures",
      files: {
        "package.json": manifest,
        ".npmrc": "registry=https://npm.corp.example/\n",
        "package-lock.json": npmLock({
          "node_modules/vue": { version: "3.5.0", resolved: "https://npm.corp.example/vue/-/vue-3.5.0.tgz" },
        }),
      },
    },
    {
      name: "a scoped registry from .npmrc and workspace links in the lockfile",
      files: {
        "package.json": manifest,
        ".npmrc": "@acme:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${TOKEN}\n",
        "package-lock.json": npmLock({
          ...registryPackages,
          "node_modules/@acme/ui": { version: "1.0.0", resolved: "https://npm.pkg.github.com/download/@acme/ui/1.0.0/abc" },
          "node_modules/local": { resolved: "packages/local", link: true },
          "packages/local": { name: "local" },
        }),
      },
    },
    {
      name: "pnpm lockfile with registry packages (no tarball URLs)",
      files: {
        "package.json": manifest,
        "pnpm-lock.yaml":
          "lockfileVersion: '9.0'\n\npackages:\n\n  vue@3.5.0:\n    resolution: {integrity: sha512-abc}\n\nsnapshots:\n\n  vue@3.5.0: {}\n",
      },
    },
    {
      name: "a workspace without its own lockfile uses the monorepo root's",
      files: {
        "package.json": manifest,
        "../package.json": monorepoRoot,
        "../package-lock.json": npmLock(registryPackages),
      },
    },
    {
      name: "yarn classic lockfile from registry.yarnpkg.com",
      files: {
        "package.json": manifest,
        "yarn.lock":
          '# yarn lockfile v1\n\n\nvue@^3.5.0:\n  version "3.5.0"\n  resolved "https://registry.yarnpkg.com/vue/-/vue-3.5.0.tgz#abc123"\n  integrity sha512-abc\n',
      },
    },
  ],
  invalid: [
    {
      name: "dependencies but no lockfile",
      files: { "package.json": manifest },
      findings: [{ file: "package.json", line: 3 }],
    },
    {
      name: "only devDependencies and no lockfile",
      files: { "package.json": JSON.stringify({ name: "app", devDependencies: { vite: "^7.0.0" } }, null, 2) },
      findings: [{ file: "package.json", line: 3 }],
    },
    {
      name: "a monorepo workspace where the root has no lockfile either",
      files: { "package.json": manifest, "../package.json": monorepoRoot },
      findings: [{ file: "package.json", line: 3 }],
    },
    {
      name: "package-lock.json and yarn.lock side by side",
      files: {
        "package.json": manifest,
        "package-lock.json": npmLock(registryPackages),
        "yarn.lock": "# yarn lockfile v1\n",
      },
      findings: [{ file: "package-lock.json" }],
    },
    {
      name: "three package managers' lockfiles",
      files: {
        "package.json": manifest,
        "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
        "yarn.lock": "# yarn lockfile v1\n",
        "bun.lockb": "",
      },
      findings: [{ file: "yarn.lock" }],
    },
    {
      name: "a package resolved from another host",
      files: {
        "package.json": manifest,
        "package-lock.json": npmLock({
          ...registryPackages,
          "node_modules/evil": { version: "1.0.0", resolved: "https://packages.evil.example/evil-1.0.0.tgz" },
        }),
      },
      findings: [{ file: "package-lock.json" }],
    },
    {
      name: "a http:// resolved URL is not the configured registry",
      files: {
        "package.json": manifest,
        "package-lock.json": npmLock({
          "node_modules/vue": { version: "3.5.0", resolved: "http://mirror.example/vue-3.5.0.tgz" },
        }),
      },
      findings: [{ file: "package-lock.json" }],
    },
    {
      name: "pnpm tarball from a foreign host and a yarn classic URL from another one",
      files: {
        "package.json": manifest,
        "pnpm-lock.yaml":
          "lockfileVersion: '9.0'\n\npackages:\n\n  left-pad@1.0.0:\n    resolution: {tarball: https://files.example.org/left-pad-1.0.0.tgz}\n\nsnapshots:\n  left-pad@1.0.0: {}\n",
        "yarn.lock": 'foo@^1.0.0:\n  version "1.0.0"\n  resolved "https://cdn.example.net/foo-1.0.0.tgz#abc"\n',
      },
      // The two lockfiles also differ in package manager.
      findings: [{ file: "pnpm-lock.yaml" }, { file: "yarn.lock" }, { file: "yarn.lock" }],
    },
    {
      name: "a monorepo root lockfile with a foreign host is reported at the workspace's package.json",
      files: {
        "package.json": manifest,
        "../package.json": monorepoRoot,
        "../package-lock.json": npmLock({
          "node_modules/evil": { version: "1.0.0", resolved: "https://packages.evil.example/evil-1.0.0.tgz" },
        }),
      },
      findings: [{ file: "package.json" }],
    },
  ],
};

export default cases;
