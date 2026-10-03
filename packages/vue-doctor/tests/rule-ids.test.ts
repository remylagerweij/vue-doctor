import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without type declarations
import { listRuleFiles } from "../scripts/generate-rules.mjs";
import plugin from "../src/plugin/index.js";
import { AUDIT_RULES, FS_RULES, OXLINT_RULES, RULE_REGISTRY, getCanonicalRuleId, getRuleMeta } from "../src/plugin/registry.js";
import { createRuleIdReporter, resolveRuleKey, ruleIdOf } from "../src/plugin/rule-ids.js";

describe("canonical rule IDs", () => {
  it("are unique across the registry", () => {
    const ids = RULE_REGISTRY.map(getCanonicalRuleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("follow the directory layout: vue-doctor/<category folder>/<file name>", () => {
    const expected = (listRuleFiles() as string[]).map((file) => {
      const [folder, name] = file.split("/");
      return `vue-doctor/${folder}/${path.basename(name, ".ts")}`;
    });
    expect([...OXLINT_RULES, ...FS_RULES, ...AUDIT_RULES].map((rule) => getCanonicalRuleId(rule.ruleMeta)).sort()).toEqual(expected.sort());
  });

  it("keeps template rules under vue/ and never lets two spellings collide", () => {
    for (const meta of RULE_REGISTRY.filter((rule) => rule.engine === "eslint-template")) {
      expect(getCanonicalRuleId(meta)).toBe(meta.id);
      expect(meta.id.startsWith("vue/")).toBe(true);
    }
  });

  it("keeps the oxlint plugin rule names flat", () => {
    for (const name of Object.keys(plugin.rules)) expect(name).not.toContain("/");
  });

  it("resolves from a diagnostic, whatever shape the rule has", () => {
    expect(ruleIdOf({ plugin: "vue-doctor", rule: "security/no-eval" })).toBe("vue-doctor/security/no-eval");
    expect(ruleIdOf({ plugin: "vue-doctor", rule: "no-eval" })).toBe("vue-doctor/security/no-eval");
    expect(ruleIdOf({ plugin: "eslint-plugin-vue", rule: "vue/no-template-target-blank" })).toBe("vue/no-template-target-blank");
    expect(ruleIdOf({ plugin: "knip", rule: "files" })).toBe("knip/files");
    expect(getRuleMeta("vue-doctor", "security/no-eval")).toBe(getRuleMeta("vue-doctor", "no-eval"));
  });
});

describe("resolveRuleKey", () => {
  const eval_ = "vue-doctor/security/no-eval";

  it("accepts the canonical ID without a deprecation", () => {
    const resolution = resolveRuleKey(eval_);
    expect(resolution).toMatchObject({ deprecated: false, known: true });
    expect(resolution.matches(eval_)).toBe(true);
    expect(resolution.matches("vue-doctor/security/no-unsafe-html-sink")).toBe(false);
  });

  it.each([["no-eval"], ["vue-doctor/no-eval"], ["  No-Eval "]])("resolves the 1.x form %j as a deprecated alias", (key) => {
    const resolution = resolveRuleKey(key);
    expect(resolution).toMatchObject({ deprecated: true, known: true, replacements: [eval_] });
    expect(resolution.matches(eval_)).toBe(true);
  });

  it.each([["no-secrets-in-client-code"], ["vue-doctor/no-secrets-in-client-code"], ["vue-doctor/security/no-secrets-in-client-code"]])(
    "resolves the renamed secrets rule %j to both of its replacements, as deprecated",
    (key) => {
      const resolution = resolveRuleKey(key);
      const replacements = ["vue-doctor/security/no-hardcoded-secret", "vue-doctor/security/no-secret-named-literal"];
      expect(resolution).toMatchObject({ deprecated: true, known: true });
      expect([...resolution.replacements].sort()).toEqual(replacements);
      for (const id of replacements) expect(resolution.matches(id)).toBe(true);
    },
  );

  it.each([["no-v-html"], ["vue-doctor/no-v-html"], ["vue-doctor/security/no-v-html"], ["vue/no-v-html"]])(
    "resolves the removed rule %s to no-unsafe-html-sink as a deprecated alias",
    (key) => {
      const resolution = resolveRuleKey(key);
      expect(resolution).toMatchObject({ deprecated: true, known: true, replacements: ["vue-doctor/security/no-unsafe-html-sink"] });
      expect(resolution.matches("vue-doctor/security/no-unsafe-html-sink")).toBe(true);
    },
  );

  it("resolves a bare name to every rule that spells it that way", () => {
    const resolution = resolveRuleKey("no-template-target-blank");
    expect(resolution.replacements).toEqual(["vue/no-template-target-blank"]);
    expect(resolution.matches("vue/no-template-target-blank")).toBe(true);
  });

  it("does not accept a wrong category or a template ID under the own plugin", () => {
    expect(resolveRuleKey("vue-doctor/performance/no-eval").known).toBe(false);
    expect(resolveRuleKey("vue-doctor/vue/no-template-target-blank").known).toBe(false);
  });

  it("supports group keys", () => {
    expect(resolveRuleKey("vue-doctor/security/*").matches(eval_)).toBe(true);
    expect(resolveRuleKey("vue-doctor/security/*").matches("vue-doctor/bundle-size/no-moment")).toBe(false);
    expect(resolveRuleKey("vue-doctor/nope/*").known).toBe(false);
    expect(resolveRuleKey("knip/*").known).toBe(true);
  });
});

describe("createRuleIdReporter", () => {
  it("warns once per distinct deprecated ID, naming the replacement", () => {
    const warnings: string[] = [];
    const reporter = createRuleIdReporter((message) => warnings.push(message));
    reporter.check("no-eval");
    reporter.check("NO-EVAL");
    reporter.check("vue-doctor/security/no-eval");
    reporter.check("vue-doctor/no-eval");
    reporter.check("vue/no-v-html");
    expect(warnings).toEqual([
      'Rule ID "no-eval" is deprecated; use "vue-doctor/security/no-eval".',
      'Rule ID "vue-doctor/no-eval" is deprecated; use "vue-doctor/security/no-eval".',
      'Rule ID "vue/no-v-html" is deprecated; use "vue-doctor/security/no-unsafe-html-sink".',
    ]);
  });

  it("warns about unknown IDs only when told where they were written", () => {
    const warnings: string[] = [];
    const reporter = createRuleIdReporter((message) => warnings.push(message));
    reporter.check("not-a-rule");
    expect(warnings).toEqual([]);
    reporter.check("not-a-rule", 'config "rules"');
    reporter.check("not-a-rule", 'config "rules"');
    expect(warnings).toEqual(['Unknown rule ID "not-a-rule" in config "rules"; it does not match any Vue Doctor rule.']);
  });
});
