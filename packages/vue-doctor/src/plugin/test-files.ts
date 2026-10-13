import path from "node:path";

// Matched against the project-relative path, so a checkout under a `test/` directory is not test code.
const TEST_FILE_PATTERNS: readonly RegExp[] = [
  /\.(?:spec|test|cy|e2e)\.[cm]?[jt]sx?$/,
  /\.(?:spec|test)\.vue$/,
  /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|tests?|e2e|cypress)\//,
  /(?:^|\/)(?:vitest|vite\.test|playwright|cypress|jest)(?:\.[\w-]+)*\.config\.[cm]?[jt]s$/,
  /(?:^|\/)vitest\.(?:setup|workspace)\.[cm]?[jt]s$/,
];

export const toProjectRelative = (filename: string, root: string = process.cwd()): string => {
  const normalized = filename.replace(/\\/g, "/");
  if (!path.isAbsolute(filename)) return normalized.replace(/^\.\//, "");
  const relative = path.relative(root, filename).replace(/\\/g, "/");
  return relative.startsWith("../") || relative === ".." || path.isAbsolute(relative) ? normalized : relative;
};

export const isTestFile = (filename: string, root?: string): boolean => {
  const relative = toProjectRelative(filename, root);
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(relative));
};
