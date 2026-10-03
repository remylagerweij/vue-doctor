import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { RULES_TABLE_PATH, renderRulesTable } from "../scripts/generate-rules-table.js";
import { RULE_REGISTRY, getCanonicalRuleId } from "../src/plugin/registry.js";

describe("rules table", () => {
  it("is up to date (run `npm run rules:table`)", () => {
    const table = fs.readFileSync(RULES_TABLE_PATH, "utf8").replace(/\r\n/g, "\n");
    expect(table).toBe(renderRulesTable());
  });

  it("lists every registered rule with its default severity", () => {
    const table = renderRulesTable();
    for (const meta of RULE_REGISTRY) {
      expect(table, meta.id).toContain(`| \`${getCanonicalRuleId(meta)}\` | ${meta.category} | ${meta.defaultSeverity} |`);
    }
  });

  it("matches the rule counts in the README (run `npm run docs:gen`)", () => {
    const readme = fs.readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
    const own = RULE_REGISTRY.filter((meta) => meta.engine !== "eslint-template");
    const ownOn = own.filter((meta) => meta.defaultSeverity !== "off");
    const template = RULE_REGISTRY.length - own.length;
    expect(readme).toContain(
      `${own.length} custom rules (${ownOn.length} on by default) + ${template} eslint-plugin-vue rules = ${RULE_REGISTRY.length} registered rules`,
    );
  });

  it("is included in the rules page", () => {
    const index = fs.readFileSync(new URL("../../../docs/rules/index.md", import.meta.url), "utf8");
    expect(index).toContain("<!--@include: ./table.md-->");
  });
});
