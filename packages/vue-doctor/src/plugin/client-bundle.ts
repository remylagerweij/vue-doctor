import fs from "node:fs";
import path from "node:path";

/** Nuxt source directories whose files are bundled for the browser (relative to `srcDir`). */
const CLIENT_DIRECTORIES: ReadonlySet<string> = new Set([
  "components",
  "pages",
  "layouts",
  "composables",
  "plugins",
  "middleware",
  "stores",
  "utils",
]);

const CLIENT_ROOT_FILES: ReadonlySet<string> = new Set(["app.vue", "error.vue"]);

/** Directories whose code runs in Node only: Nitro, command-line scripts, shared server code, tests. */
const NODE_DIRECTORIES: ReadonlySet<string> = new Set([
  "server",
  "scripts",
  "bin",
  "shared",
  "modules",
  "test",
  "tests",
  "e2e",
  "__tests__",
]);

const NODE_ONLY_FILE = /\.(?:server|test|spec)\.(?:[cm]?[jt]sx?|vue)$/;

const NUXT_CONFIG_FILES = ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs", "nuxt.config.cjs"];

const nuxtRootByDirectory = new Map<string, string | null>();
const directoryExists = new Map<string, boolean>();

const isDirectory = (directory: string): boolean => {
  let exists = directoryExists.get(directory);
  if (exists === undefined) {
    try {
      exists = fs.statSync(directory).isDirectory();
    } catch {
      exists = false;
    }
    directoryExists.set(directory, exists);
  }
  return exists;
};

const findNuxtRoot = (directory: string): string | null => {
  if (nuxtRootByDirectory.has(directory)) return nuxtRootByDirectory.get(directory) ?? null;
  let root: string | null = null;
  if (NUXT_CONFIG_FILES.some((name) => fs.existsSync(path.join(directory, name)))) {
    root = directory;
  } else {
    const parent = path.dirname(directory);
    root = parent === directory ? null : findNuxtRoot(parent);
  }
  nuxtRootByDirectory.set(directory, root);
  return root;
};

const isClientRelativePath = (segments: string[]): boolean =>
  segments.length === 1 ? CLIENT_ROOT_FILES.has(segments[0]) : CLIENT_DIRECTORIES.has(segments[0]);

// Relative to the Nuxt root: `app/` is the Nuxt 4 srcDir, `src/` a common Nuxt 3 one, else the root itself.
const isClientInNuxtRoot = (root: string, filename: string): boolean => {
  const segments = path.relative(root, filename).split(path.sep);
  if (segments[0] === "app" && segments.length > 1) return isClientRelativePath(segments.slice(1));
  if (isDirectory(path.join(root, "app"))) return false;
  if (segments[0] === "src" && segments.length > 1) return isClientRelativePath(segments.slice(1));
  return isClientRelativePath(segments);
};

// Without a nuxt.config: SFCs are client code; else the nearest client directory decides, unless a Node one sits below `app/`/`src/`.
const lastIndexWhere = (items: readonly string[], predicate: (item: string) => boolean): number => {
  for (let index = items.length - 1; index >= 0; index--) if (predicate(items[index])) return index;
  return -1;
};

const isClientByPath = (filename: string): boolean => {
  const segments = filename.split("/");
  const basename = segments.pop() ?? "";
  if (CLIENT_ROOT_FILES.has(basename) || basename.endsWith(".vue")) return true;
  const clientIndex = lastIndexWhere(segments, (segment) => CLIENT_DIRECTORIES.has(segment));
  if (clientIndex < 0) return false;
  const sourceRoot = lastIndexWhere(segments.slice(0, clientIndex), (segment) => segment === "app" || segment === "src");
  const from = sourceRoot >= 0 ? sourceRoot + 1 : clientIndex - 1;
  return !segments.slice(Math.max(from, 0), clientIndex).some((segment) => NODE_DIRECTORIES.has(segment));
};

/** Whether a file of a Nuxt app ends up in the client bundle (srcDir components, pages, plugins, `app.vue`...). */
export const isNuxtClientFile = (filename: string): boolean => {
  if (NODE_ONLY_FILE.test(filename)) return false;
  const root = path.isAbsolute(filename) ? findNuxtRoot(path.dirname(filename)) : null;
  return root ? isClientInNuxtRoot(root, filename) : isClientByPath(filename);
};
