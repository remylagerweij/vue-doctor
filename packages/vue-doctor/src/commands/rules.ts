import type { Command } from "commander";
import pc from "picocolors";
import { RULE_REGISTRY, getCanonicalRuleId, categorySlug } from "../plugin/registry.js";
import type { RuleMeta } from "../plugin/define-rule.js";
import { docsUrl } from "../utils/docs-url.js";
import { EXIT_CODES } from "../core/gate.js";
import { logger } from "../utils/logger.js";

export interface RuleInfo {
  ruleId: string;
  name: string;
  category: string;
  severity: string;
  confidence: string;
  frameworks: string[];
  fixable: boolean;
  engine: string;
  since: string;
  help: string;
  agentGuidance: string;
  docsUrl: string;
  cwe?: string[];
  owasp?: string;
}

export const ruleDocsUrl = (meta: RuleMeta): string => {
  const cat = categorySlug(meta.category);
  const id = meta.id.replaceAll("/", "-");
  return docsUrl(`rules/${cat}/${id}`);
};

export const toRuleInfo = (meta: RuleMeta): RuleInfo => ({
  ruleId: getCanonicalRuleId(meta),
  name: meta.id,
  category: meta.category,
  severity: meta.defaultSeverity,
  confidence: meta.confidence,
  frameworks: meta.frameworks,
  fixable: meta.fixable,
  engine: meta.engine,
  since: meta.since,
  help: meta.help,
  agentGuidance: meta.agentGuidance,
  docsUrl: ruleDocsUrl(meta),
  cwe: meta.cwe,
  owasp: meta.owasp,
});

export const findRuleMeta = (query: string): RuleMeta | undefined => {
  const normalized = query.trim().toLowerCase();
  return RULE_REGISTRY.find((meta) => {
    const canonical = getCanonicalRuleId(meta).toLowerCase();
    const id = meta.id.toLowerCase();
    const diag = `${categorySlug(meta.category)}/${id}`.toLowerCase();
    return canonical === normalized || id === normalized || diag === normalized;
  });
};

export const registerRulesCommand = (program: Command): void => {
  program
    .command("rules")
    .description("List all Vue Doctor diagnostic rules and metadata")
    .option("--json", "Output rule catalog as JSON", false)
    .option("--category <category>", "Filter rules by category")
    .action((options: { json?: boolean; category?: string }) => {
      let rules = RULE_REGISTRY.map(toRuleInfo);

      if (options.category) {
        const cat = options.category.toLowerCase();
        rules = rules.filter((r) => r.category.toLowerCase() === cat);
      }

      if (options.json) {
        console.log(JSON.stringify(rules, null, 2));
        return;
      }

      console.log(pc.bold(`\nVue Doctor Rules (${rules.length} total)\n`));

      const byCategory = new Map<string, RuleInfo[]>();
      for (const rule of rules) {
        const list = byCategory.get(rule.category) ?? [];
        list.push(rule);
        byCategory.set(rule.category, list);
      }

      for (const [category, catRules] of byCategory) {
        console.log(pc.bold(pc.cyan(`\n● ${category} (${catRules.length})`)));
        for (const r of catRules) {
          const sevColor = r.severity === "error" ? pc.red : pc.yellow;
          const sev = sevColor(r.severity.padEnd(7));
          const fixTag = r.fixable ? pc.green(" [fixable]") : "";
          console.log(`  ${sev} ${pc.bold(r.ruleId)}${fixTag}`);
          console.log(`          ${pc.dim(r.help)}`);
        }
      }
      console.log("");
    });
};

export const registerExplainCommand = (program: Command): void => {
  program
    .command("explain <ruleId>")
    .description("Show documentation, explanation, and agent guidance for a rule")
    .option("--json", "Output explanation as JSON", false)
    .action((ruleIdArg: string, options: { json?: boolean }) => {
      const meta = findRuleMeta(ruleIdArg);
      if (!meta) {
        logger.error(`Rule not found: "${ruleIdArg}". Run \`vue-doctor rules\` to list all rules.`);
        process.exitCode = EXIT_CODES.usageError;
        return;
      }

      const info = toRuleInfo(meta);

      if (options.json) {
        console.log(JSON.stringify(info, null, 2));
        return;
      }

      const sevColor = info.severity === "error" ? pc.red : pc.yellow;

      console.log("");
      console.log(pc.bold(`🩺 Rule: ${info.ruleId}`));
      console.log("─".repeat(Math.min(process.stdout.columns || 80, 80)));
      console.log(`  ${pc.bold("Category:")}    ${info.category}`);
      console.log(`  ${pc.bold("Severity:")}    ${sevColor(info.severity)}`);
      console.log(`  ${pc.bold("Confidence:")}  ${info.confidence}`);
      console.log(`  ${pc.bold("Fixable:")}     ${info.fixable ? pc.green("Yes") : "No"}`);
      console.log(`  ${pc.bold("Since:")}       v${info.since}`);
      console.log(`  ${pc.bold("Engine:")}      ${info.engine}`);
      if (info.cwe && info.cwe.length > 0) {
        console.log(`  ${pc.bold("CWE:")}         ${info.cwe.join(", ")}`);
      }
      if (info.owasp) {
        console.log(`  ${pc.bold("OWASP:")}       ${info.owasp}`);
      }
      console.log(`  ${pc.bold("Docs:")}        ${info.docsUrl}`);
      console.log("");
      console.log(pc.bold("Why it matters & remediation:"));
      console.log(`  ${info.help}`);
      console.log("");
      console.log(pc.bold("🤖 Agent Guidance:"));
      console.log(`  ${info.agentGuidance}`);
      console.log("");
    });
};
