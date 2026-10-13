import Module from "node:module";
import { describe, expect, it } from "vitest";
import { loadTypescriptParser } from "../src/utils/load-typescript-parser.js";

const moduleInternals = Module as unknown as { _resolveFilename: unknown };

describe("loadTypescriptParser", () => {
  it("parses TypeScript although the repository root hoists TypeScript 7", () => {
    const parser = loadTypescriptParser();
    const result = parser.parseForESLint("const count: number = 1;\nexport type Id = string;\n", {
      range: true,
      loc: true,
      tokens: true,
      comment: true,
    });

    expect(result.ast.body.map((node) => node.type)).toEqual(["VariableDeclaration", "ExportNamedDeclaration"]);
  });

  it("restores module resolution after loading", () => {
    const before = moduleInternals._resolveFilename;
    loadTypescriptParser();

    expect(moduleInternals._resolveFilename).toBe(before);
  });
});
