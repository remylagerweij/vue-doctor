import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CODEMODS,
  applyCodemods,
  createUnifiedDiff,
  fixFullLodashImport,
  fixTemplateTargetBlank,
  fixToSortedImmutable,
  toUtf16Column,
  type FixLocation,
} from "../src/fix/codemods.js";
import { planFixes, writeFixes } from "../src/fix/runner.js";
import { RULE_REGISTRY, getCanonicalRuleId } from "../src/plugin/registry.js";
import type { Diagnostic } from "../src/types.js";

const LODASH = "vue-doctor/bundle-size/no-full-lodash-import";
const TO_SORTED = "vue-doctor/performance/js-tosorted-immutable";
const TARGET_BLANK = "vue/no-template-target-blank";

/** 1-based line and UTF-16 column of the `occurrence`-th match of `needle` in `source`. */
const locate = (source: string, needle: string, occurrence = 0): FixLocation => {
  let index = -1;
  for (let count = 0; count <= occurrence; count++) {
    index = source.indexOf(needle, index + 1);
    if (index === -1) throw new Error(`"${needle}" #${occurrence} not found`);
  }
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  return { line, column: index - before.lastIndexOf("\n") };
};

/** Applies a codemod with the given needles reported, and again on its output (idempotence). */
const fixTwice = (
  fix: (source: string, locations: readonly FixLocation[]) => { code: string; fixed: number },
  source: string,
  needles: string[],
) => {
  const locations = needles.map((needle) => locate(source, needle));
  const first = fix(source, locations);
  const second = fix(first.code, locations);
  expect(second.code).toBe(first.code);
  expect(second.fixed).toBe(0);
  return first;
};

describe("fix: registry and codemods agree", () => {
  it("marks exactly the rules with a codemod as fixable", () => {
    const fixable = RULE_REGISTRY.filter((meta) => meta.fixable).map(getCanonicalRuleId).sort();
    expect(fixable).toEqual([...CODEMODS.keys()].sort());
  });

  it("keys every codemod by a canonical registry ID", () => {
    const canonical = new Set(RULE_REGISTRY.map(getCanonicalRuleId));
    for (const [ruleId, codemod] of CODEMODS) {
      expect(canonical.has(ruleId), ruleId).toBe(true);
      expect(codemod.ruleId).toBe(ruleId);
    }
  });

  it("has no codemod for vue/require-v-for-key (a key cannot be guessed)", () => {
    expect(CODEMODS.has("vue/require-v-for-key")).toBe(false);
  });
});

describe("fix: vue-doctor/bundle-size/no-full-lodash-import", () => {
  it("rewrites a reported named import into per-method imports", () => {
    const source = `import { debounce, throttle } from "lodash";\nexport { debounce, throttle };\n`;
    const result = fixTwice(fixFullLodashImport, source, ["import"]);
    expect(result.fixed).toBe(1);
    expect(result.code).toBe(
      `import debounce from "lodash/debounce.js";\nimport throttle from "lodash/throttle.js";\nexport { debounce, throttle };\n`,
    );
  });

  it("keeps aliases, quote style, a missing semicolon and the indentation", () => {
    const source = `<script setup>\n  import {\n    debounce as deb,\n    pick,\n  } from 'lodash'\n</script>\n`;
    const result = fixTwice(fixFullLodashImport, source, ["import"]);
    expect(result.code).toBe(
      `<script setup>\n  import deb from 'lodash/debounce.js'\n  import pick from 'lodash/pick.js'\n</script>\n`,
    );
  });

  it.each([
    ["a default import", `import _ from "lodash";\n`],
    ["a namespace import", `import * as _ from "lodash";\n`],
    ["a default plus named import", `import _, { debounce } from "lodash";\n`],
    ["an inline type specifier", `import { type DebounceSettings, debounce } from "lodash";\n`],
    ["a wrapper method (chain)", `import { chain } from "lodash";\n`],
    ["a non-method export", `import { VERSION } from "lodash";\n`],
    ["a comment inside the braces", `import { debounce /* x */ } from "lodash";\n`],
  ])("leaves %s unchanged even when reported", (_name, source) => {
    const result = fixFullLodashImport(source, [locate(source, "import")]);
    expect(result).toEqual({ code: source, fixed: 0 });
  });

  it("leaves an unreported lodash import alone", () => {
    const source = `import { debounce } from "lodash";\nimport { pick } from "lodash";\n`;
    const result = fixFullLodashImport(source, [locate(source, "import", 1)]);
    expect(result.code).toBe(`import { debounce } from "lodash";\nimport pick from "lodash/pick.js";\n`);
  });

  it("never starts a match in a comment that mentions import", () => {
    const source = `// import helpers below\nimport { debounce } from "lodash";\n`;
    const result = fixFullLodashImport(source, [locate(source, "import {")]);
    expect(result.code).toBe(`// import helpers below\nimport debounce from "lodash/debounce.js";\n`);
  });
});

describe("fix: vue-doctor/performance/js-tosorted-immutable", () => {
  it.each([
    ["an identifier", "const s = [...items].sort((a, b) => a - b);", "const s = items.toSorted((a, b) => a - b);"],
    ["a member chain", "const s = [...this.items].sort();", "const s = this.items.toSorted();"],
    ["a ref value", "const s = [ ...state.list.value ]\n  .sort(compare);", "const s = state.list.value.toSorted(compare);"],
  ])("rewrites a reported spread-sort of %s", (_name, source, expected) => {
    const result = fixTwice(fixToSortedImmutable, source, ["["]);
    expect(result).toEqual({ code: expected, fixed: 1 });
  });

  it.each([
    ["optional chaining", "const s = [...a?.b].sort();"],
    ["a call", "const s = [...getItems()].sort();"],
    ["two spreads", "const s = [...a, ...b].sort();"],
    ["an operator", "const s = [...(a || b)].sort();"],
    ["a computed member", "const s = [...a[0]].sort();"],
    ["a non-null assertion", "const s = [...a!].sort();"],
  ])("leaves a spread of %s unchanged even when reported", (_name, source) => {
    expect(fixToSortedImmutable(source, [locate(source, "[")])).toEqual({ code: source, fixed: 0 });
  });

  it("never rewrites an in-place .sort(), reported or not", () => {
    const source = "items.sort();\nconst first = items.sort()[0];\n";
    expect(fixToSortedImmutable(source, [locate(source, "items"), locate(source, "items", 1)])).toEqual({
      code: source,
      fixed: 0,
    });
  });

  it("only rewrites the reported spread-sort when several are present", () => {
    const source = "const a = [...xs].sort();\nconst b = [...ys].sort();\nconst c = [...xs].sort(); const d = [...ys].sort();\n";
    const result = fixToSortedImmutable(source, [locate(source, "[...ys]", 1)]);
    expect(result.code).toBe(
      "const a = [...xs].sort();\nconst b = [...ys].sort();\nconst c = [...xs].sort(); const d = ys.toSorted();\n",
    );
  });
});

describe("fix: vue/no-template-target-blank", () => {
  it("adds rel after target on a reported link", () => {
    const source = `<template>\n  <a href="https://x.dev" target="_blank">x</a>\n</template>\n`;
    const result = fixTwice(fixTemplateTargetBlank, source, ["target"]);
    expect(result.code).toContain(`<a href="https://x.dev" target="_blank" rel="noopener noreferrer">x</a>`);
  });

  it("handles > inside quoted attribute values, self-closing tags and multi-line tags", () => {
    const source = `<template>\n  <a\n    @click="count > 1 && go()"\n    href="https://x.dev"\n    target="_blank"\n  />\n</template>\n`;
    const result = fixTwice(fixTemplateTargetBlank, source, ["target"]);
    expect(result.code).toBe(
      `<template>\n  <a\n    @click="count > 1 && go()"\n    href="https://x.dev"\n    target="_blank" rel="noopener noreferrer"\n  />\n</template>\n`,
    );
  });

  it.each([
    [`rel="nofollow"`, `rel="nofollow noopener noreferrer"`],
    [`rel='noopener'`, `rel='noopener noreferrer'`],
    [`rel=external`, `rel="external noopener noreferrer"`],
    [`rel`, `rel="noopener noreferrer"`],
  ])("completes an existing %s", (rel, expected) => {
    const source = `<template><a href="https://x.dev" ${rel} target="_blank">x</a></template>`;
    const result = fixTwice(fixTemplateTargetBlank, source, ["target"]);
    expect(result.code).toBe(`<template><a href="https://x.dev" ${expected} target="_blank">x</a></template>`);
  });

  it.each([
    ["a dynamic :rel", `<a href="https://x.dev" :rel="rel" target="_blank">x</a>`],
    ["a dynamic v-bind:rel", `<a href="https://x.dev" v-bind:rel="rel" target="_blank">x</a>`],
    ["an object v-bind", `<a href="https://x.dev" v-bind="attrs" target="_blank">x</a>`],
    ["a complete rel", `<a href="https://x.dev" rel="noopener noreferrer" target="_blank">x</a>`],
    ["a component tag", `<a-button href="https://x.dev" target="_blank">x</a-button>`],
    ["another element", `<router-link to="https://x.dev" target="_blank">x</router-link>`],
  ])("leaves a link with %s unchanged even when reported", (_name, tag) => {
    const source = `<template>\n  ${tag}\n</template>\n`;
    expect(fixTemplateTargetBlank(source, [locate(source, "target")])).toEqual({ code: source, fixed: 0 });
  });

  it("leaves an unreported link alone", () => {
    const source = `<template>\n  <a href="https://a.dev" target="_blank">a</a>\n  <a href="https://b.dev" target="_blank">b</a>\n</template>\n`;
    const result = fixTemplateTargetBlank(source, [locate(source, "target", 1)]);
    expect(result.code).toBe(
      `<template>\n  <a href="https://a.dev" target="_blank">a</a>\n  <a href="https://b.dev" target="_blank" rel="noopener noreferrer">b</a>\n</template>\n`,
    );
  });
});

describe("fix: applyCodemods", () => {
  it("leaves a file untouched when no finding has a codemod", () => {
    const source = `<template><li v-for="item in items">{{ item }}</li></template>\nconst s = [...xs].sort();\n`;
    const result = applyCodemods(source, "src/List.vue", new Map([["vue/require-v-for-key", [{ line: 1, column: 11 }]]]));
    expect(result).toEqual({ code: source, fixedRules: {}, changed: false });
  });

  it("leaves unreported matches of a fixable rule untouched", () => {
    const source = `import { debounce } from "lodash";\nconst s = [...xs].sort();\nitems.sort();\n`;
    const result = applyCodemods(source, "src/a.ts", new Map());
    expect(result.changed).toBe(false);
    expect(result.code).toBe(source);
  });

  it("converts oxlint's UTF-8 byte columns before matching", () => {
    const source = `const label = "日本語😀"; const a = [...xs].sort(); const b = [...ys].sort();\n`;
    const index = source.indexOf("[...ys]");
    const byteColumn = Buffer.byteLength(source.slice(0, index)) + 1;
    expect(toUtf16Column(source, byteColumn, "utf8")).toBe(index + 1);
    const result = applyCodemods(source, "src/a.ts", new Map([[TO_SORTED, [{ line: 1, column: byteColumn }]]]));
    expect(result.code).toBe(`const label = "日本語😀"; const a = [...xs].sort(); const b = ys.toSorted();\n`);
    expect(result.fixedRules).toEqual({ [TO_SORTED]: 1 });
  });

  it("keeps later findings on their lines after an earlier codemod adds lines", () => {
    const source = `import { debounce, pick } from "lodash";\nexport const s = [...xs].sort();\nexport const t = [...ys].sort();\n`;
    const result = applyCodemods(
      source,
      "src/a.ts",
      new Map([
        [LODASH, [{ line: 1, column: 1 }]],
        [TO_SORTED, [{ line: 3, column: 18 }]],
      ]),
    );
    expect(result.code).toBe(
      `import debounce from "lodash/debounce.js";\nimport pick from "lodash/pick.js";\nexport const s = [...xs].sort();\nexport const t = ys.toSorted();\n`,
    );
    expect(result.fixedRules).toEqual({ [LODASH]: 1, [TO_SORTED]: 1 });
  });

  it("applies template codemods to .vue files only", () => {
    const source = `const html = '<a href="https://x.dev" target="_blank">x</a>';\n`;
    const result = applyCodemods(source, "src/a.ts", new Map([[TARGET_BLANK, [locate(source, "target")]]]));
    expect(result.changed).toBe(false);
  });
});

describe("fix: unified diff", () => {
  it("shows only the changed lines with context and correct hunk ranges", () => {
    const original = ["import { a, b } from \"lodash\";", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "[...xs].sort();"].join("\n");
    const modified = ["import a from \"lodash/a.js\";", "import b from \"lodash/b.js\";", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "xs.toSorted();"].join("\n");
    expect(createUnifiedDiff("src/a.ts", original, modified)).toBe(
      [
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,4 +1,5 @@",
        "-import { a, b } from \"lodash\";",
        "+import a from \"lodash/a.js\";",
        "+import b from \"lodash/b.js\";",
        " one",
        " two",
        " three",
        "@@ -8,4 +9,4 @@",
        " seven",
        " eight",
        " nine",
        "-[...xs].sort();",
        "+xs.toSorted();",
      ].join("\n"),
    );
  });

  it("returns an empty string when nothing changed", () => {
    expect(createUnifiedDiff("src/index.ts", "content", "content")).toBe("");
  });
});

describe("fix: planFixes and writeFixes", () => {
  const temporaryDirectories: string[] = [];
  const makeProject = (): string => {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-fix-")));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, "project", "src"), { recursive: true });
    return path.join(directory, "project");
  };
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  const finding = (filePath: string, line: number, column: number): Diagnostic => ({
    filePath,
    plugin: "vue-doctor",
    rule: "performance/js-tosorted-immutable",
    severity: "warning",
    message: "",
    help: "",
    line,
    column,
    category: "Performance",
  });
  const SOURCE = "export const s = [...xs].sort();\n";

  it("plans a fix only for reported files and writes it atomically", () => {
    const project = makeProject();
    fs.writeFileSync(path.join(project, "src", "a.ts"), SOURCE);
    fs.writeFileSync(path.join(project, "src", "b.ts"), SOURCE);
    const plan = planFixes(project, [finding("src/a.ts", 1, 18)]);
    expect(plan.entries.map((entry) => entry.filePath)).toEqual(["src/a.ts"]);
    const { written } = writeFixes(plan.entries);
    expect(written).toHaveLength(1);
    expect(fs.readFileSync(path.join(project, "src", "a.ts"), "utf8")).toBe("export const s = xs.toSorted();\n");
    expect(fs.readFileSync(path.join(project, "src", "b.ts"), "utf8")).toBe(SOURCE);
    expect(fs.readdirSync(path.join(project, "src")).sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("never plans a fix for a file outside the project directory", () => {
    const project = makeProject();
    const outside = path.join(path.dirname(project), "outside.ts");
    fs.writeFileSync(outside, SOURCE);
    fs.symlinkSync(outside, path.join(project, "src", "link.ts"));
    const plan = planFixes(project, [finding("../outside.ts", 1, 18), finding("src/link.ts", 1, 18)]);
    expect(plan.entries).toEqual([]);
    expect(plan.skippedFiles.map((file) => file.reason)).toEqual([
      "outside the project directory",
      "outside the project directory",
    ]);
    expect(fs.readFileSync(outside, "utf8")).toBe(SOURCE);
  });

  it("skips a file that changed on disk after it was analysed", () => {
    const project = makeProject();
    const file = path.join(project, "src", "a.ts");
    fs.writeFileSync(file, SOURCE);
    const plan = planFixes(project, [finding("src/a.ts", 1, 18)]);
    fs.writeFileSync(file, `${SOURCE}// edited\n`);
    expect(writeFixes(plan.entries)).toEqual({ written: [], changedOnDisk: [file] });
    expect(fs.readFileSync(file, "utf8")).toBe(`${SOURCE}// edited\n`);
  });
});
