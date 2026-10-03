import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import { peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const NUXT_CONFIG_PATTERN = /(?:^|\/)nuxt\.config\.[cm]?[jt]s$/;

const getKeyName = (property: EsTreeNode): string | null => {
  const key = property.key;
  if (!key || property.computed) return null;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
};

export default defineRule({
  meta: {
    id: "security-headers",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["nuxt"],
    cwe: ["CWE-693"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "Configure security headers and avoid insecure defaults in `nuxt.config.ts` (e.g. disable devtools in production, protect client sourcemaps)",
    agentGuidance:
      "In `nuxt.config.ts`, ensure devtools are disabled in production (`devtools: { enabled: false }` or omitted), client sourcemaps are restricted or omitted (`sourcemap: { client: false }`), " +
      "and consider adding a security headers module like `nuxt-security` to configure Content-Security-Policy (CSP), HSTS, and X-Content-Type-Options headers.",
  },
  create: (context: RuleContext): RuleVisitors => {
    const filename = getFilename(context);
    if (!NUXT_CONFIG_PATTERN.test(filename)) return {};

    return {
      Property(node: EsTreeNode) {
        const key = getKeyName(node);
        const value = peel(node.value);

        // Check devtools: { enabled: true }
        if (key === "devtools" && value.type === "ObjectExpression") {
          for (const prop of value.properties as EsTreeNode[]) {
            if (prop.type === "Property" && getKeyName(prop) === "enabled") {
              const enabledVal = peel(prop.value);
              if (enabledVal.type === "Literal" && enabledVal.value === true) {
                context.report({
                  node: prop,
                  message: "devtools enabled explicitly in `nuxt.config` — ensure devtools are disabled in production builds",
                });
              }
            }
          }
        }

        // Check sourcemap: { client: true }
        if (key === "sourcemap" && value.type === "ObjectExpression") {
          for (const prop of value.properties as EsTreeNode[]) {
            if (prop.type === "Property" && getKeyName(prop) === "client") {
              const clientVal = peel(prop.value);
              if (clientVal.type === "Literal" && clientVal.value === true) {
                context.report({
                  node: prop,
                  message: "`sourcemap.client: true` exposes full frontend source code in production — consider disabling client source maps for production builds",
                });
              }
            }
          }
        }

        // Check routeRules with overly permissive cors
        if (key === "routeRules" && value.type === "ObjectExpression") {
          for (const ruleProp of value.properties as EsTreeNode[]) {
            if (ruleProp.type !== "Property") continue;
            const ruleVal = peel(ruleProp.value);
            if (ruleVal.type !== "ObjectExpression") continue;
            for (const setting of ruleVal.properties as EsTreeNode[]) {
              if (setting.type === "Property" && getKeyName(setting) === "cors") {
                const corsVal = peel(setting.value);
                if (corsVal.type === "Literal" && corsVal.value === true) {
                  context.report({
                    node: setting,
                    message: "`cors: true` in routeRules creates an open CORS configuration — restrict allowed origins explicitly",
                  });
                }
              }
            }
          }
        }
      },
    };
  },
});
