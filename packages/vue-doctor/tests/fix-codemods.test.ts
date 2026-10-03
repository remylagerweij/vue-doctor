import { describe, expect, it } from "vitest";
import {
  fixLodashImports,
  fixArraySortMutation,
  fixTargetBlankRel,
  fixVForKey,
  createUnifiedDiff,
} from "../src/fix/codemods.js";

describe("Deterministic codemods", () => {
  describe("lodash per-method imports", () => {
    it("transforms named lodash imports into individual method imports", () => {
      const input = `import { debounce, throttle } from "lodash";`;
      const res = fixLodashImports(input);

      expect(res.fixed).toBe(true);
      expect(res.code).toBe(
        `import debounce from "lodash/debounce.js";\nimport throttle from "lodash/throttle.js";`,
      );
    });

    it("handles import aliases", () => {
      const input = `import { debounce as deb } from "lodash";`;
      const res = fixLodashImports(input);

      expect(res.fixed).toBe(true);
      expect(res.code).toBe(`import deb from "lodash/debounce.js";`);
    });

    it("is idempotent when run repeatedly", () => {
      const input = `import { debounce } from "lodash";`;
      const step1 = fixLodashImports(input);
      const step2 = fixLodashImports(step1.code);

      expect(step2.fixed).toBe(false);
      expect(step2.code).toBe(step1.code);
    });
  });

  describe("array sort mutation (toSorted)", () => {
    it("replaces .sort( with .toSorted(", () => {
      const input = `const sorted = items.sort((a, b) => a - b);`;
      const res = fixArraySortMutation(input);

      expect(res.fixed).toBe(true);
      expect(res.code).toBe(`const sorted = items.toSorted((a, b) => a - b);`);
    });

    it("is idempotent", () => {
      const input = `const sorted = items.toSorted((a, b) => a - b);`;
      const res = fixArraySortMutation(input);

      expect(res.fixed).toBe(false);
      expect(res.code).toBe(input);
    });
  });

  describe("target=_blank rel attribute", () => {
    it("adds rel='noopener noreferrer' when missing", () => {
      const input = `<a href="https://example.com" target="_blank">Link</a>`;
      const res = fixTargetBlankRel(input);

      expect(res.fixed).toBe(true);
      expect(res.code).toContain('rel="noopener noreferrer"');
    });

    it("augments existing incomplete rel attribute", () => {
      const input = `<a href="https://example.com" target="_blank" rel="nofollow">Link</a>`;
      const res = fixTargetBlankRel(input);

      expect(res.fixed).toBe(true);
      expect(res.code).toContain('rel="nofollow noopener noreferrer"');
    });

    it("is idempotent when rel already has both noopener and noreferrer", () => {
      const input = `<a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>`;
      const res = fixTargetBlankRel(input);

      expect(res.fixed).toBe(false);
      expect(res.code).toBe(input);
    });
  });

  describe("v-for missing key", () => {
    it("adds :key attribute when missing on v-for tag", () => {
      const input = `<li v-for="item in items">{{ item.name }}</li>`;
      const res = fixVForKey(input);

      expect(res.fixed).toBe(true);
      expect(res.code).toContain(':key="item.id || item"');
    });

    it("handles (item, index) in items", () => {
      const input = `<div v-for="(user, idx) in users"></div>`;
      const res = fixVForKey(input);

      expect(res.fixed).toBe(true);
      expect(res.code).toContain(':key="user.id || user"');
    });

    it("is idempotent when :key is present", () => {
      const input = `<li v-for="item in items" :key="item.id">{{ item.name }}</li>`;
      const res = fixVForKey(input);

      expect(res.fixed).toBe(false);
      expect(res.code).toBe(input);
    });
  });

  describe("unified diff generation", () => {
    it("generates unified diff showing removed and added lines", () => {
      const orig = `const a = 1;\nimport { debounce } from "lodash";`;
      const mod = `const a = 1;\nimport debounce from "lodash/debounce.js";`;
      const diff = createUnifiedDiff("src/index.ts", orig, mod);

      expect(diff).toContain("--- a/src/index.ts");
      expect(diff).toContain("+++ b/src/index.ts");
      expect(diff).toContain('-import { debounce } from "lodash";');
      expect(diff).toContain('+import debounce from "lodash/debounce.js";');
    });

    it("returns empty string when no changes", () => {
      const diff = createUnifiedDiff("src/index.ts", "content", "content");
      expect(diff).toBe("");
    });
  });
});
