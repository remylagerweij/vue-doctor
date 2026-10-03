import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_CATEGORIES, type RuleMeta } from "../src/plugin/define-rule.js";
import { RULE_REGISTRY, getCanonicalRuleId, categorySlug } from "../src/plugin/registry.js";
import { renderRulesTable } from "./generate-rules-table.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageDir, "../..");
const docsDir = path.resolve(repoRoot, "docs");

// 1. Generate rules table
const rulesTablePath = path.join(docsDir, "rules", "table.md");
fs.writeFileSync(rulesTablePath, renderRulesTable(RULE_REGISTRY), "utf8");
console.log(`Generated ${path.relative(repoRoot, rulesTablePath)}`);

// 2. Generate rule pages in docs/rules/<category>/<rule>.md
const rulesByCat = new Map<string, RuleMeta[]>();
for (const cat of RULE_CATEGORIES) {
  rulesByCat.set(cat, []);
}

for (const meta of RULE_REGISTRY) {
  const cat = meta.category;
  const list = rulesByCat.get(cat) ?? [];
  list.push(meta);
  rulesByCat.set(cat, list);

  const slug = categorySlug(meta.category);
  const dir = path.join(docsDir, "rules", slug);
  fs.mkdirSync(dir, { recursive: true });

  const canonicalId = getCanonicalRuleId(meta);
  const fileName = `${meta.id.replaceAll("/", "-")}.md`;
  const filePath = path.join(dir, fileName);

  const secRows: string[] = [];
  if (meta.cwe && meta.cwe.length > 0) {
    secRows.push(`| **CWE** | ${meta.cwe.join(", ")} |`);
  }
  if (meta.owasp) {
    secRows.push(`| **OWASP** | ${meta.owasp} |`);
  }

  const content = `# \`${canonicalId}\`

> ${meta.help}

| Property | Value |
|---|---|
| **Category** | ${meta.category} |
| **Default Severity** | \`${meta.defaultSeverity}\` |
| **Confidence** | ${meta.confidence} |
| **Fixable** | ${meta.fixable ? "Yes (`--fix`)" : "No"} |
| **Engine** | \`${meta.engine}\` |
| **Since** | v${meta.since} |
| **Frameworks** | ${meta.frameworks.join(", ")} |
${secRows.join("\n")}

## Why it matters

${meta.help}

## How to fix

${meta.fixable ? "This rule is automatically fixable. Run `npx @remylagerweij/vue-doctor@latest . --fix` to apply the codemod." : "Review the finding and update the code according to best practices below."}

## Agent Guidance

${meta.agentGuidance}

---

*Rule source: [\`${canonicalId}\`](https://github.com/remylagerweij/vue-doctor)*
`;

  const escapedContent = content.replaceAll("{{", "&#123;&#123;").replaceAll("}}", "&#125;&#125;");
  fs.writeFileSync(filePath, escapedContent, "utf8");
}
console.log(`Generated ${RULE_REGISTRY.length} individual rule pages.`);

// 3. Update docs/.vitepress/config.ts sidebar with rules
const vitepressConfigPath = path.join(docsDir, ".vitepress", "config.ts");
if (fs.existsSync(vitepressConfigPath)) {
  const ruleSidebarGroups = RULE_CATEGORIES.map((cat) => {
    const rules = rulesByCat.get(cat) ?? [];
    if (rules.length === 0) return null;
    const slug = categorySlug(cat);
    return {
      text: cat,
      collapsed: true,
      items: rules.map((r) => ({
        text: r.id,
        link: `/rules/${slug}/${r.id.replaceAll("/", "-")}`,
      })),
    };
  }).filter(Boolean);

  const rulesSidebarJson = JSON.stringify(
    [
      { text: "Overview", link: "/rules/" },
      ...ruleSidebarGroups,
    ],
    null,
    2,
  );

  let vpConfig = fs.readFileSync(vitepressConfigPath, "utf8");
  const sidebarPattern = /"\/rules\/":\s*\[[\s\S]*?\],(?=\s*"\/reference\/":)/;
  if (sidebarPattern.test(vpConfig)) {
    vpConfig = vpConfig.replace(sidebarPattern, `"/rules/": ${rulesSidebarJson},`);
    fs.writeFileSync(vitepressConfigPath, vpConfig, "utf8");
    console.log("Updated VitePress rules sidebar.");
  }
}

// 4. Generate docs/reference/cli.md
const cliMdPath = path.join(docsDir, "reference", "cli.md");
fs.mkdirSync(path.dirname(cliMdPath), { recursive: true });
const cliContent = `# CLI Reference

The \`vue-doctor\` command-line interface diagnoses, scores, and fixes Vue.js and Nuxt applications.

## Global Usage

\`\`\`bash
npx @remylagerweij/vue-doctor@latest [directory] [options]
\`\`\`

## Commands

| Command | Description |
|---|---|
| \`vue-doctor [directory]\` | Default command: scan and diagnose project(s) |
| \`vue-doctor ci <subcommand>\` | CI runner, PR feedback, and workflow management |
| \`vue-doctor baseline [directory]\` | Record current findings into a baseline file |
| \`vue-doctor init [directory]\` | Interactive wizard to set up configuration and CI |
| \`vue-doctor rules\` | List all registered diagnostic rules and severities |
| \`vue-doctor explain <ruleId>\` | View full rule documentation and agent guidance |
| \`vue-doctor agents install\` | Install AI agent instructions (Claude, Cursor, Copilot, etc.) |
| \`vue-doctor mcp\` | Launch Model Context Protocol (MCP) server over stdio |

---

## Scan Options

- \`--format <format>\`: Output format. Choices: \`text\`, \`json\`, \`jsonl\`, \`sarif\`, \`github\`, \`markdown\`, \`html\`. Default: \`text\`.
- \`--json\`: Alias for \`--format json\`.
- \`--score\`: Print only the numeric health score (0–100) and exit.
- \`--output <file>\`: Write formatted output to file instead of stdout.
- \`--diff [branch]\`: Only scan files changed compared to git base branch or working tree.
- \`--fix\`: Automatically apply deterministic codemods to source files.
- \`--dry-run\`: Show unified diff of fixes without writing to disk.
- \`--fail-on <severity>\`: Gate threshold (\`none\`, \`error\`, \`warning\`). Default: \`none\`.
- \`--gate <scope>\`: Gate scope (\`all\` or \`new\`). Default: \`all\`.
- \`--min-score <score>\`: Fail gate if score is below this threshold (0–100).
- \`--strict\`: Exit with code 3 if any analyzer fails or is skipped.
- \`--baseline <file>\`: Path to baseline file to suppress known issues.
- \`--audit\`: Enable OSV.dev dependency vulnerability checks.
- \`--offline\`: Guarantee zero network calls.
- \`--no-lint\`: Skip AST and template lint checks.
- \`--no-dead-code\`: Skip Knip dead code analysis.
- \`--no-cache\`: Disable content-hash cache in \`node_modules/.cache/vue-doctor\`.

---

## Exit Codes

| Code | Name | Description |
|---|---|---|
| \`0\` | **OK** | Scan finished and all gates passed. |
| \`1\` | **Gate Breached** | Findings exceeded \`--fail-on\` or score fell below \`--min-score\`. |
| \`2\` | **Usage Error** | Invalid command syntax, missing dependencies, or bad config. |
| \`3\` | **Analyzer Failure** | An analyzer failed or was skipped with \`--strict\` enabled. |
`;

fs.writeFileSync(cliMdPath, cliContent, "utf8");
console.log(`Generated ${path.relative(repoRoot, cliMdPath)}`);

// 5. Generate docs/reference/config.md
const configMdPath = path.join(docsDir, "reference", "config.md");
const configContent = `# Configuration Reference

Vue Doctor is configured using \`vue-doctor.config.ts\` in the root of your project or workspace.

## TypeScript Configuration (\`defineConfig\`)

\`\`\`typescript
import { defineConfig } from "@remylagerweij/vue-doctor";

export default defineConfig({
  // Gate settings for CI
  gate: {
    failOn: "error", // "none" | "error" | "warning"
    scope: "new",    // "new" (vs baseline/base branch) | "all"
    minScore: 80,    // Minimum overall score required
    strict: false,   // Exit 3 if an analyzer fails
  },

  // Analyzers
  lint: true,
  deadCode: true,
  cache: true,

  // Rule overrides
  rules: {
    "vue-doctor/security/no-eval": "error",
    "vue-doctor/bundle-size/no-moment": "warn",
    "vue-doctor/architecture/no-giant-component": "off",
  },

  // Ignore settings
  ignore: {
    rules: ["vue-doctor/bundle-size/no-lodash"],
    paths: [
      "dist/**",
      "coverage/**",
      "legacy/**",
      "**/*.generated.ts"
    ],
  },

  // Dependency audit (OSV.dev)
  audit: {
    enabled: false,
    severity: "moderate", // "low" | "moderate" | "high" | "critical"
  },

  // Baseline file
  baseline: "vue-doctor-baseline.json",

  // Diff scanning default
  diff: true,
});
\`\`\`

## JSON Schema Validation

The configuration file is validated against the official JSON Schema:
\`https://remylagerweij.github.io/vue-doctor/schema/vue-doctor.schema.json\`
`;

fs.writeFileSync(configMdPath, configContent, "utf8");
console.log(`Generated ${path.relative(repoRoot, configMdPath)}`);

// 6. Generate llms.txt and llms-full.txt in docs/public/
const publicDir = path.join(docsDir, "public");
fs.mkdirSync(publicDir, { recursive: true });

const totalRules = RULE_REGISTRY.length;
const defaultOnRules = RULE_REGISTRY.filter((r) => r.defaultSeverity !== "off").length;

const llmsTxt = `# Vue Doctor

> Vue Doctor is a diagnostic tool and linter for Vue.js and Nuxt applications. It performs static analysis (oxlint), template checks (eslint-plugin-vue), dead code detection (Knip), and dependency audits (OSV.dev) to produce a 0–100 health score with actionable recommendations.

## Quick Start
- Scan changed files: \`npx @remylagerweij/vue-doctor@latest . --scope changed --format json\`
- Full scan: \`npx @remylagerweij/vue-doctor@latest .\`
- Get health score: \`npx @remylagerweij/vue-doctor@latest . --score\`
- List rules: \`npx @remylagerweij/vue-doctor@latest rules\`
- Explain a rule: \`npx @remylagerweij/vue-doctor@latest explain <ruleId>\`
- Automatic codemods: \`npx @remylagerweij/vue-doctor@latest . --fix\`
- Stdio MCP server: \`npx @remylagerweij/vue-doctor@latest mcp\`

## Documentation
- Full Documentation: https://remylagerweij.github.io/vue-doctor/
- Rules Catalog: https://remylagerweij.github.io/vue-doctor/rules/
- CLI Reference: https://remylagerweij.github.io/vue-doctor/reference/cli
- Config Reference: https://remylagerweij.github.io/vue-doctor/reference/config
- Full Text for LLMs: https://remylagerweij.github.io/vue-doctor/llms-full.txt
`;
fs.writeFileSync(path.join(publicDir, "llms.txt"), llmsTxt, "utf8");

const llmsFull = `${llmsTxt}

---

# All Rules (${totalRules} registered, ${defaultOnRules} on by default)

${RULE_REGISTRY.map((meta) => `## ${getCanonicalRuleId(meta)}
- Category: ${meta.category}
- Default Severity: ${meta.defaultSeverity}
- Confidence: ${meta.confidence}
- Fixable: ${meta.fixable ? "Yes" : "No"}
- Help: ${meta.help}
- Agent Guidance: ${meta.agentGuidance}
- Docs: https://remylagerweij.github.io/vue-doctor/rules/${categorySlug(meta.category)}/${meta.id.replaceAll("/", "-")}
`).join("\n")}
`;
fs.writeFileSync(path.join(publicDir, "llms-full.txt"), llmsFull, "utf8");
console.log("Generated llms.txt and llms-full.txt in docs/public/");

// 7. Update rule counts in README.md and AGENTS.md
const updateFileCounts = (file: string) => {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  // Update e.g. "59 custom rules (54 on by default) + 20 eslint-plugin-vue rules = 79 registered rules"
  const oxlintCount = RULE_REGISTRY.filter((r) => r.engine !== "eslint-template").length;
  const templateCount = RULE_REGISTRY.filter((r) => r.engine === "eslint-template").length;
  // "on by default" qualifies the custom rules, so count only those.
  const defaultOn = RULE_REGISTRY.filter((r) => r.engine !== "eslint-template" && r.defaultSeverity !== "off").length;

  const countPattern = /\d+\s+custom rules.*=\s*\d+\s+registered rules/i;
  const newCounts = `${oxlintCount} custom rules (${defaultOn} on by default) + ${templateCount} eslint-plugin-vue rules = ${totalRules} registered rules`;
  if (countPattern.test(text)) {
    text = text.replace(countPattern, newCounts);
    fs.writeFileSync(file, text, "utf8");
    console.log(`Updated rule counts in ${path.relative(repoRoot, file)}`);
  }
};

updateFileCounts(path.join(repoRoot, "README.md"));
updateFileCounts(path.join(repoRoot, "AGENTS.md"));
