import { describe, expect, it } from "vitest";
import { DOCS_BASE_URL } from "../src/constants.js";
import { docsUrl } from "../src/utils/docs-url.js";

describe("docsUrl", () => {
  it("returns the base URL without a trailing slash for an empty path", () => {
    expect(docsUrl()).toBe(DOCS_BASE_URL);
    expect(docsUrl("")).toBe(DOCS_BASE_URL);
    expect(docsUrl("/")).toBe(DOCS_BASE_URL);
  });

  it("joins paths with or without a leading slash", () => {
    expect(docsUrl("rules/no-moment")).toBe(`${DOCS_BASE_URL}/rules/no-moment`);
    expect(docsUrl("/rules/no-moment")).toBe(`${DOCS_BASE_URL}/rules/no-moment`);
  });

  it("collapses duplicate slashes and keeps a trailing slash", () => {
    expect(docsUrl("//rules///no-moment")).toBe(`${DOCS_BASE_URL}/rules/no-moment`);
    expect(docsUrl("guide/")).toBe(`${DOCS_BASE_URL}/guide/`);
  });

  it("tolerates a trailing slash on the base URL", () => {
    expect(docsUrl("guide", "https://example.com/docs/")).toBe("https://example.com/docs/guide");
  });

  it("preserves query and hash suffixes", () => {
    expect(docsUrl("/guide/ci#exit-codes")).toBe(`${DOCS_BASE_URL}/guide/ci#exit-codes`);
    expect(docsUrl("search?q=a/b")).toBe(`${DOCS_BASE_URL}/search?q=a/b`);
  });

  it("does not let .. segments escape the docs root", () => {
    expect(docsUrl("../../etc")).toBe(`${DOCS_BASE_URL}/etc`);
    expect(docsUrl("a/../b/./c")).toBe(`${DOCS_BASE_URL}/b/c`);
  });
});
