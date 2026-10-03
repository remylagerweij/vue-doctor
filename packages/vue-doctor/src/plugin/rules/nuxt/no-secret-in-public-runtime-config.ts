import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import { looksLikeSecretName, matchesSecretValueFormat } from "../../secret-heuristics.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const NUXT_CONFIG_PATTERN = /(?:^|\/)nuxt\.config\.[cm]?[jt]s$/;
// Everything in app.config is bundled into the client, so it has no private part.
const APP_CONFIG_PATTERN = /(?:^|\/)app\.config\.[cm]?[jt]s$/;

const getKeyName = (property: EsTreeNode): string | null => {
  const key = property.key;
  if (!key || property.computed) return null;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
};

const getStringLiteral = (node: EsTreeNode | undefined): string | null => {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions?.length === 0 && node.quasis?.length === 1) {
    return node.quasis[0].value?.cooked ?? null;
  }
  return null;
};

const findProperty = (object: EsTreeNode, name: string): EsTreeNode | undefined =>
  object.properties?.find((property: EsTreeNode) => property.type === "Property" && getKeyName(property) === name);

export default defineRule({
  meta: {
    id: "no-secret-in-public-runtime-config",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    cwe: ["CWE-200"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "Keep secrets in the top level of `runtimeConfig` (server only); `runtimeConfig.public` and `app.config` are sent to every browser",
    agentGuidance:
      "Move the value out of `runtimeConfig.public` (or `app.config`) to the top level of `runtimeConfig`, which is only available on the server, and read it there with `useRuntimeConfig(event)`. Never expose it to client code. If a real secret was ever configured here, rotate it, because it has already been shipped to browsers. Names that are public by design (publishable or anon keys) are not reported.",
  },
  create: (context: RuleContext): RuleVisitors => {
    const filename = getFilename(context);
    const isNuxtConfig = NUXT_CONFIG_PATTERN.test(filename);
    const isAppConfig = APP_CONFIG_PATTERN.test(filename);
    if (!isNuxtConfig && !isAppConfig) return {};

    const where = isAppConfig ? "app.config" : "runtimeConfig.public";

    // Checks one public object, recursing into nested objects (`public: { stripe: { secretKey } }`).
    const checkPublicObject = (object: EsTreeNode): void => {
      for (const property of object.properties ?? []) {
        if (property.type !== "Property") continue;
        const name = getKeyName(property);
        const value: EsTreeNode | undefined = property.value;
        if (value?.type === "ObjectExpression") {
          // A group named like a secret (`credentials: { ... }`); in app.config `tokens` means design tokens.
          if (isNuxtConfig && name !== null && looksLikeSecretName(name)) {
            context.report({
              node: property,
              message: `"${name}" looks like a secret but is in ${where}, which is exposed to every browser — move it to the server-only runtimeConfig`,
            });
          }
          checkPublicObject(value);
          continue;
        }
        const literal = getStringLiteral(value);
        if (literal !== null && matchesSecretValueFormat(literal)) {
          context.report({
            node: property,
            message: `A value in the format of a secret is set in ${where}${name ? ` ("${name}")` : ""} and ships to every browser`,
          });
        } else if (name !== null && looksLikeSecretName(name)) {
          context.report({
            node: property,
            message: `"${name}" looks like a secret but is in ${where}, which is exposed to every browser — move it to the server-only runtimeConfig`,
          });
        }
      }
    };

    return {
      // `runtimeConfig: { public: { ... } }` anywhere in the config (also in `$production`, `$env`).
      Property(node: EsTreeNode) {
        if (!isNuxtConfig || getKeyName(node) !== "runtimeConfig" || node.value?.type !== "ObjectExpression") return;
        const publicProperty = findProperty(node.value, "public");
        if (publicProperty?.value?.type === "ObjectExpression") checkPublicObject(publicProperty.value);
      },
      // app.config exposes the whole object, so every property counts.
      ExportDefaultDeclaration(node: EsTreeNode) {
        if (!isAppConfig) return;
        let config: EsTreeNode | undefined = node.declaration;
        // `defineAppConfig({ ... })`
        if (config?.type === "CallExpression") config = config.arguments?.[0];
        if (config?.type === "ObjectExpression") checkPublicObject(config);
      },
    };
  },
});
