import { describe, expect, it } from "vitest";
import { findRuleMeta, toRuleInfo } from "../src/commands/rules.js";

describe("rules and explain commands", () => {
  it("finds rules by canonical ID, short ID, or diagnostic ID", () => {
    const metaByShort = findRuleMeta("no-eval");
    expect(metaByShort).toBeDefined();
    expect(metaByShort?.id).toBe("no-eval");

    const metaByCanonical = findRuleMeta("vue-doctor/security/no-eval");
    expect(metaByCanonical).toBeDefined();
    expect(metaByCanonical?.id).toBe("no-eval");

    const metaByDiag = findRuleMeta("security/no-eval");
    expect(metaByDiag).toBeDefined();
    expect(metaByDiag?.id).toBe("no-eval");
  });

  it("finds template rules", () => {
    const meta = findRuleMeta("vue/require-v-for-key");
    expect(meta).toBeDefined();
    expect(meta?.engine).toBe("eslint-template");
  });

  it("converts rule meta to structured info including docsUrl and agentGuidance", () => {
    const meta = findRuleMeta("no-eval")!;
    const info = toRuleInfo(meta);

    expect(info.ruleId).toBe("vue-doctor/security/no-eval");
    expect(info.category).toBe("Security");
    expect(info.severity).toBe("error");
    expect(info.docsUrl).toContain("https://");
    expect(info.agentGuidance).toBeTruthy();
  });

  it("returns undefined for non-existent rule", () => {
    expect(findRuleMeta("non-existent-rule-xyz")).toBeUndefined();
  });
});
