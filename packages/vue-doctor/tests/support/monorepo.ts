import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** `app-a` and `app-b` are workspaces; with `rootApp` the root is a Vue app of its own (like elk's Nuxt app + `docs`). */
export interface MonorepoOptions {
  rootApp?: boolean;
  /** A third workspace without Vue (`packages/tools`): not a project, so its files belong to the root project. */
  toolsWorkspace?: boolean;
}

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const writeProject = (directory: string, name: string, suffix: string, extra: Record<string, unknown> = {}): void => {
  writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "src/index.ts", dependencies: { vue: "^3.5.0" }, ...extra }, null, 2),
  );
  writeFile(path.join(directory, "src", "index.ts"), `import { used } from "./used";\nconsole.log(used);\n`);
  writeFile(path.join(directory, "src", "used.ts"), `export const used = 1;\n`);
  writeFile(path.join(directory, "src", `unused-${suffix}.ts`), `export const unused = 1;\n`);
  // Reported by the template rules and by oxlint, so every analyzer has a finding per project.
  writeFile(
    path.join(directory, "src", `Link${suffix}.vue`),
    `<template>\n  <a href="https://example.com" target="_blank">link</a>\n</template>\n`,
  );
};

/**
 * Creates a small npm-workspaces monorepo in a fresh temp directory (a git repository, so file
 * listings behave like in real projects) and returns its root. Remove it with `fs.rmSync`.
 */
export const createMonorepo = (options: MonorepoOptions = {}): string => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-monorepo-")));
  writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "mono-root",
        private: true,
        workspaces: ["packages/*"],
        ...(options.rootApp ? { main: "src/index.ts", dependencies: { vue: "^3.5.0" } } : {}),
      },
      null,
      2,
    ),
  );
  if (options.rootApp) {
    writeProject(root, "mono-root", "root", { private: true, workspaces: ["packages/*"] });
  }
  writeProject(path.join(root, "packages", "app-a"), "@mono/app-a", "a");
  writeProject(path.join(root, "packages", "app-b"), "@mono/app-b", "b");
  if (options.toolsWorkspace) {
    const tools = path.join(root, "packages", "tools");
    writeFile(path.join(tools, "package.json"), JSON.stringify({ name: "@mono/tools", version: "1.0.0", main: "src/index.ts" }));
    writeFile(path.join(tools, "src", "index.ts"), "export const tool = 1;\n");
    writeFile(path.join(tools, "src", "unused-tools.ts"), "export const unused = 1;\n");
  }
  spawnSync("git", ["init", "--quiet"], { cwd: root });
  return root;
};
