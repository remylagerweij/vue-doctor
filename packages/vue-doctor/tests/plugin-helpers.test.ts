import { describe, expect, it } from "vitest";
import { getFilename } from "../src/plugin/helpers.js";
import type { RuleContext } from "../src/plugin/types.js";

const createContext = (overrides: Partial<RuleContext> = {}): RuleContext => ({
  report: () => {},
  ...overrides,
});

describe("getFilename", () => {
  it("returns context.filename when present", () => {
    expect(getFilename(createContext({ filename: "/project/server/api/users.ts" }))).toBe(
      "/project/server/api/users.ts",
    );
  });

  it("normalises Windows backslashes to forward slashes", () => {
    expect(getFilename(createContext({ filename: "C:\\project\\server\\api\\users.ts" }))).toBe(
      "C:/project/server/api/users.ts",
    );
  });

  it("falls back to the legacy getFilename() only when filename is undefined", () => {
    expect(getFilename(createContext({ getFilename: () => "src\\App.vue" }))).toBe("src/App.vue");
    expect(
      getFilename(createContext({ filename: "src/New.vue", getFilename: () => "src/Legacy.vue" })),
    ).toBe("src/New.vue");
  });

  it("throws a descriptive error when no filename is available", () => {
    expect(() => getFilename(createContext())).toThrow(/did not provide a filename/);
  });

  it("throws when the filename is empty", () => {
    expect(() => getFilename(createContext({ filename: "" }))).toThrow(/context\.filename/);
    expect(() => getFilename(createContext({ getFilename: () => "" }))).toThrow(/context\.filename/);
  });
});
