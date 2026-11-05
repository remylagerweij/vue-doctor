import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type TypescriptParser = typeof import("@typescript-eslint/parser");
type ResolveFilename = (this: unknown, request: string, ...rest: unknown[]) => string;

/** Binds the parser to our own `typescript`: its deps may be hoisted next to a TypeScript 7, which has no JS API. */
export const loadTypescriptParser = (): TypescriptParser => {
  const typescriptPath = require.resolve("typescript");
  const moduleInternals = Module as unknown as { _resolveFilename: ResolveFilename };
  const resolveFilename = moduleInternals._resolveFilename;
  moduleInternals._resolveFilename = function (request, ...rest) {
    return request === "typescript" ? typescriptPath : resolveFilename.call(this, request, ...rest);
  };
  try {
    return require("@typescript-eslint/parser") as TypescriptParser;
  } finally {
    moduleInternals._resolveFilename = resolveFilename;
  }
};
