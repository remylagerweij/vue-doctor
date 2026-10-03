import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRuleIdReporter } from "../src/plugin/rule-ids.js";
import type { Diagnostic } from "../src/types.js";
import {
  applySuppressions,
  countForeignDirectives,
  defuseForeignDirectives,
} from "../src/utils/suppressions.js";

let directory: string;

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-suppressions-"));
});

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

const diagnostic = (
  filePath: string,
  rule: string,
  line: number,
  column = 1,
  plugin = "vue-doctor",
): Diagnostic => ({
  filePath,
  plugin,
  rule,
  severity: "warning",
  message: `${rule} problem`,
  help: "",
  line,
  column,
  category: "Test",
});

let fileCounter = 0;
/** Writes `source` to a temp file and returns how many of the given findings survive. */
const survivors = (
  source: string,
  findings: Array<[rule: string, line: number, column?: number]>,
  extension = "ts",
): string[] => {
  const fileName = `case-${fileCounter++}.${extension}`;
  fs.writeFileSync(path.join(directory, fileName), source);
  const { diagnostics } = applySuppressions(
    findings.map(([rule, line, column]) => diagnostic(fileName, rule, line, column)),
    directory,
  );
  return diagnostics.map((entry) => `${entry.rule}@${entry.line}`);
};

describe("vue-doctor-disable-next-line", () => {
  it("suppresses every rule on the next line", () => {
    const source = "// vue-doctor-disable-next-line\nbad();\nbad();\n";
    expect(survivors(source, [["no-eval", 2], ["no-moment", 2], ["no-eval", 3]])).toEqual([
      "no-eval@3",
    ]);
  });

  it("suppresses only the listed rules", () => {
    const source = "// vue-doctor-disable-next-line no-eval, no-moment\nbad();\n";
    expect(
      survivors(source, [["no-eval", 2], ["no-moment", 2], ["no-unsafe-html-sink", 2]]),
    ).toEqual(["no-unsafe-html-sink@2"]);
  });

  it("works in block comments", () => {
    const source = "/* vue-doctor-disable-next-line no-eval */\nbad();\n";
    expect(survivors(source, [["no-eval", 2], ["no-moment", 2]])).toEqual(["no-moment@2"]);
  });

  it("works in JSDoc style block comments", () => {
    const source = "/** vue-doctor-disable-next-line */\nbad();\n";
    expect(survivors(source, [["no-eval", 2]])).toEqual([]);
  });

  it("works in HTML comments inside .vue templates", () => {
    const source = [
      "<template>",
      "  <!-- vue-doctor-disable-next-line vue/no-template-target-blank -->",
      '  <div v-html="a"></div>',
      '  <div v-html="b"></div>',
      "</template>",
      "",
    ].join("\n");
    expect(
      survivors(source, [["vue/no-template-target-blank", 3], ["vue/no-template-target-blank", 4]], "vue"),
    ).toEqual(["vue/no-template-target-blank@4"]);
  });

  it("does not suppress the directive line itself or lines further away", () => {
    const source = "// vue-doctor-disable-next-line\nok();\nbad();\n";
    expect(survivors(source, [["no-eval", 1], ["no-eval", 3]])).toEqual([
      "no-eval@1",
      "no-eval@3",
    ]);
  });
});

describe("vue-doctor-disable-line", () => {
  it("suppresses findings on the same line only", () => {
    const source = "bad(); // vue-doctor-disable-line\nbad();\n";
    expect(survivors(source, [["no-eval", 1], ["no-eval", 2]])).toEqual(["no-eval@2"]);
  });

  it("accepts a rule list and an HTML comment", () => {
    const source = '<div v-html="x"></div> <!-- vue-doctor-disable-line vue/no-template-target-blank -->\n';
    expect(
      survivors(source, [["vue/no-template-target-blank", 1], ["vue/valid-v-bind", 1]], "vue"),
    ).toEqual(["vue/valid-v-bind@1"]);
  });
});

describe("vue-doctor-disable / vue-doctor-enable", () => {
  const source = [
    "bad();", // 1
    "// vue-doctor-disable", // 2
    "bad();", // 3
    "bad();", // 4
    "// vue-doctor-enable", // 5
    "bad();", // 6
    "",
  ].join("\n");

  it("suppresses everything between disable and enable", () => {
    expect(survivors(source, [["no-eval", 1], ["no-eval", 3], ["no-eval", 4], ["no-eval", 6]])).toEqual([
      "no-eval@1",
      "no-eval@6",
    ]);
  });

  it("keeps suppressing until the end of the file without enable", () => {
    expect(survivors("// vue-doctor-disable\nbad();\nbad();\n", [["no-eval", 2], ["no-eval", 3]])).toEqual(
      [],
    );
  });

  it("supports rule lists and enabling only some rules", () => {
    const ranged = [
      "/* vue-doctor-disable no-eval, no-moment */", // 1
      "bad();", // 2
      "/* vue-doctor-enable no-eval */", // 3
      "bad();", // 4
      "",
    ].join("\n");
    expect(
      survivors(ranged, [["no-eval", 2], ["no-moment", 2], ["no-eval", 4], ["no-moment", 4], ["no-unsafe-html-sink", 4]]),
    ).toEqual(["no-eval@4", "no-unsafe-html-sink@4"]);
  });

  it("lets a specific enable carve a rule out of a disable-all range", () => {
    const ranged = "// vue-doctor-disable\n// vue-doctor-enable no-eval\nbad();\n";
    expect(survivors(ranged, [["no-eval", 3], ["no-moment", 3]])).toEqual(["no-eval@3"]);
  });

  it("works with HTML comments in templates", () => {
    const template = [
      "<template>",
      "  <!-- vue-doctor-disable vue/no-template-target-blank -->",
      '  <div v-html="a"></div>',
      "  <!-- vue-doctor-enable vue/no-template-target-blank -->",
      '  <div v-html="b"></div>',
      "</template>",
      "",
    ].join("\n");
    expect(
      survivors(template, [["vue/no-template-target-blank", 3], ["vue/no-template-target-blank", 5]], "vue"),
    ).toEqual(["vue/no-template-target-blank@5"]);
  });

  it("uses the column on the directive's own line", () => {
    const inline = "before(); /* vue-doctor-disable */ after();\n";
    expect(survivors(inline, [["no-eval", 1, 1], ["no-eval", 1, 36]])).toEqual(["no-eval@1"]);
  });
});

describe("vue-doctor-disable-file", () => {
  it("suppresses all rules anywhere in the file, even from the bottom", () => {
    const source = "bad();\nbad();\n// vue-doctor-disable-file\n";
    expect(survivors(source, [["no-eval", 1], ["no-moment", 2]])).toEqual([]);
  });

  it("suppresses only listed rules", () => {
    const source = "/* vue-doctor-disable-file no-eval */\nbad();\n";
    expect(survivors(source, [["no-eval", 2], ["no-moment", 2]])).toEqual(["no-moment@2"]);
  });

  it("works in a .vue template HTML comment", () => {
    const source = "<template>\n  <!-- vue-doctor-disable-file vue/no-template-target-blank -->\n  <div v-html=\"a\"/>\n</template>\n";
    expect(survivors(source, [["vue/no-template-target-blank", 3]], "vue")).toEqual([]);
  });
});

describe("rule name matching", () => {
  const source = "// vue-doctor-disable-next-line RULE\nbad();\n";
  const withRule = (rule: string): string => source.replace("RULE", rule);

  // Canonical IDs are exact; the 1.x forms (bare, `vue-doctor/<rule>`) are deprecated aliases for the own rule.
  it.each([
    ["vue-doctor/security/no-unsafe-html-sink"],
    ["VUE-DOCTOR/SECURITY/NO-UNSAFE-HTML-SINK"],
    ["vue-doctor/no-unsafe-html-sink"],
    ["no-unsafe-html-sink"],
  ])("matches %s against the own rule", (written) => {
    expect(survivors(withRule(written), [["no-unsafe-html-sink", 2]])).toEqual([]);
  });

  it.each([["vue/no-template-target-blank"], ["no-template-target-blank"]])("matches %s against the template rule", (written) => {
    expect(survivors(withRule(written), [["vue/no-template-target-blank", 2]])).toEqual([]);
  });

  // `no-v-html` (the placeholder rule and eslint-plugin-vue's `vue/no-v-html`) was replaced by `no-unsafe-html-sink`.
  it.each([["no-v-html"], ["vue-doctor/no-v-html"], ["vue-doctor/security/no-v-html"], ["vue/no-v-html"]])(
    "keeps the removed spelling %s working as an alias of no-unsafe-html-sink",
    (written) => {
      expect(survivors(withRule(written), [["no-unsafe-html-sink", 2]])).toEqual([]);
    },
  );

  it("keeps the own rule and the template rule apart for namespaced IDs", () => {
    expect(survivors(withRule("vue/no-unsafe-html-sink"), [["no-unsafe-html-sink", 2]])).toEqual(["no-unsafe-html-sink@2"]);
    expect(survivors(withRule("vue-doctor/no-template-target-blank"), [["vue/no-template-target-blank", 2]])).toEqual([
      "vue/no-template-target-blank@2",
    ]);
  });

  it("supports group keys and ignores wrong categories", () => {
    expect(survivors(withRule("vue-doctor/security/*"), [["no-unsafe-html-sink", 2], ["no-moment", 2]])).toEqual(["no-moment@2"]);
    expect(survivors(withRule("vue-doctor/bundle-size/no-unsafe-html-sink"), [["no-unsafe-html-sink", 2]])).toEqual([
      "no-unsafe-html-sink@2",
    ]);
  });

  it("warns once per distinct deprecated ID, naming the replacement", () => {
    const warnings: string[] = [];
    const reporter = createRuleIdReporter((message) => warnings.push(message));
    fs.writeFileSync(
      path.join(directory, "deprecated.ts"),
      "// vue-doctor-disable-next-line no-eval, vue-doctor/no-moment\nbad();\n// vue-doctor-disable-next-line no-eval\nbad();\n// vue-doctor-disable-next-line vue-doctor/security/no-eval\nbad();\n",
    );
    const { suppressed } = applySuppressions(
      [diagnostic("deprecated.ts", "no-eval", 2), diagnostic("deprecated.ts", "no-eval", 4), diagnostic("deprecated.ts", "no-eval", 6)],
      directory,
      reporter,
    );
    expect(suppressed.count).toBe(3);
    expect(warnings).toEqual([
      'Rule ID "no-eval" is deprecated; use "vue-doctor/security/no-eval".',
      'Rule ID "vue-doctor/no-moment" is deprecated; use "vue-doctor/bundle-size/no-moment".',
    ]);
  });

  it("matches camelCase rule names", () => {
    expect(
      survivors(withRule("vue-doctor/no-missing-await-nextTick"), [["no-missing-await-nextTick", 2]]),
    ).toEqual([]);
  });

  it("does not match other rules or partial names", () => {
    expect(survivors(withRule("no-unsafe-html-sink"), [["no-unsafe-html-sin", 2], ["no-unsafe-html-sink-extra", 2]])).toEqual([
      "no-unsafe-html-sin@2",
      "no-unsafe-html-sink-extra@2",
    ]);
  });

  it("accepts whitespace-separated rule lists", () => {
    expect(survivors(withRule("no-eval no-moment"), [["no-eval", 2], ["no-moment", 2]])).toEqual([]);
  });
});

describe("-- reason suffix", () => {
  it("is ignored for line comments", () => {
    const source = "// vue-doctor-disable-next-line no-eval -- legacy code, tracked in LAG-1\nbad();\n";
    expect(survivors(source, [["no-eval", 2], ["no-moment", 2]])).toEqual(["no-moment@2"]);
  });

  it("is ignored for block and HTML comments", () => {
    expect(
      survivors("/* vue-doctor-disable-next-line no-eval -- why */\nbad();\n", [["no-eval", 2]]),
    ).toEqual([]);
    expect(
      survivors("<!-- vue-doctor-disable-next-line vue/no-template-target-blank -- sanitized -->\n<div/>\n", [["vue/no-template-target-blank", 2]], "vue"),
    ).toEqual([]);
  });

  it("means all rules when only a reason is given", () => {
    expect(survivors("// vue-doctor-disable-next-line -- because\nbad();\n", [["no-eval", 2]])).toEqual([]);
  });
});

describe("invalid or non-matching comments", () => {
  it.each([
    ["unknown directive", "// vue-doctor-disable-nextline\nbad();\n"],
    ["misspelled keyword", "// vue-doctor-disabled\nbad();\n"],
    ["not a comment", "const text = 'vue-doctor-disable-next-line';\nbad();\n"],
    ["wrong prefix", "// vue_doctor-disable-next-line\nbad();\n"],
    ["eslint-disable", "// eslint-disable-next-line\nbad();\n"],
    ["oxlint-disable", "// oxlint-disable-next-line no-eval\nbad();\n"],
    ["eslint block disable", "/* eslint-disable */\nbad();\n"],
    ["trailing identifier characters", "// vue-doctor-disable-line-x\nbad();\n"],
  ])("does not suppress for %s", (_name, source) => {
    expect(survivors(source, [["no-eval", 1], ["no-eval", 2]])).toEqual(["no-eval@1", "no-eval@2"]);
  });

  it("never suppresses a finding when the file cannot be read", () => {
    const { diagnostics, suppressed } = applySuppressions(
      [diagnostic("does-not-exist.ts", "no-eval", 1)],
      directory,
    );
    expect(diagnostics).toHaveLength(1);
    expect(suppressed.count).toBe(0);
  });
});

describe("applySuppressions result", () => {
  it("counts suppressed findings per rule and foreign directives in files with findings", () => {
    fs.writeFileSync(
      path.join(directory, "counted.ts"),
      [
        "// eslint-disable-next-line no-eval",
        "/* oxlint-disable */",
        "// vue-doctor-disable-next-line no-eval",
        "eval(1); // eslint-disable-line",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(directory, "other.ts"), "// eslint-disable\n");
    fs.writeFileSync(path.join(directory, "no-findings.ts"), "// eslint-disable\n");

    const result = applySuppressions(
      [
        diagnostic("counted.ts", "no-eval", 4),
        diagnostic("counted.ts", "no-eval", 1),
        diagnostic("other.ts", "no-eval", 2),
      ],
      directory,
    );

    expect(result.suppressed).toEqual({ count: 1, byRule: { "vue-doctor/security/no-eval": 1 } });
    expect(result.diagnostics.map((entry) => `${entry.filePath}:${entry.line}`)).toEqual([
      "counted.ts:1",
      "other.ts:2",
    ]);
    // 3 in counted.ts + 1 in other.ts; no-findings.ts has no findings so it is not read.
    expect(result.foreignDirectives).toBe(4);
  });

  it("reads each file with findings at most once", () => {
    fs.writeFileSync(path.join(directory, "once.ts"), "// vue-doctor-disable-file no-eval\n");
    const readSpy: string[] = [];
    const original = fs.readFileSync;
    fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      readSpy.push(String(args[0]));
      return original(...args);
    }) as typeof fs.readFileSync;
    try {
      const result = applySuppressions(
        Array.from({ length: 5 }, (_, index) => diagnostic("once.ts", "no-eval", index + 1)),
        directory,
      );
      expect(result.suppressed.count).toBe(5);
    } finally {
      fs.readFileSync = original;
    }
    expect(readSpy.filter((file) => file.endsWith("once.ts"))).toHaveLength(1);
  });

  it("counts findings of different analyzers under their canonical IDs", () => {
    fs.writeFileSync(
      path.join(directory, "multi.vue"),
      "<template>\n  <!-- vue-doctor-disable-next-line vue-doctor/security/no-unsafe-html-sink, vue/no-template-target-blank -->\n  <div v-html=\"a\"/>\n</template>\n",
    );
    const result = applySuppressions(
      [
        diagnostic("multi.vue", "no-unsafe-html-sink", 3),
        diagnostic("multi.vue", "vue/no-template-target-blank", 3, 1, "eslint-plugin-vue"),
      ],
      directory,
    );
    expect(result.suppressed.count).toBe(2);
    expect(result.suppressed.byRule).toEqual({ "vue-doctor/security/no-unsafe-html-sink": 1, "vue/no-template-target-blank": 1 });
  });
});

describe("foreign directives", () => {
  it("counts eslint/oxlint disable and enable comments", () => {
    const source = [
      "/* eslint-disable */",
      "// eslint-disable-next-line x",
      "foo(); // oxlint-disable-line",
      "// oxlint-enable",
      "<!-- eslint-disable -->",
      "const notAComment = 'eslint-disable';",
      "",
    ].join("\n");
    expect(countForeignDirectives(source)).toBe(5);
  });

  it("defuses them without changing the text length", () => {
    const source = "/* eslint-disable */\nfoo(); // oxlint-disable-line\n";
    const defused = defuseForeignDirectives(source);
    expect(defused).toHaveLength(source.length);
    expect(countForeignDirectives(defused)).toBe(0);
    expect(defused).toBe("/* eslint_disable */\nfoo(); // oxlint_disable-line\n");
  });
});
