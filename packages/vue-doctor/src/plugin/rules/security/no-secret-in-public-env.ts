import { defineRule } from "../../define-rule.js";
import { isPublicEnvName, looksLikeSecretName } from "../../secret-heuristics.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

/** The name read by `obj.NAME` or `obj["NAME"]`. */
const getPropertyName = (node: EsTreeNode): string | null => {
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed && node.property?.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return null;
};

const isImportMetaEnv = (node: EsTreeNode | undefined): boolean =>
  node?.type === "MemberExpression" &&
  node.object?.type === "MetaProperty" &&
  node.object.meta?.name === "import" &&
  node.object.property?.name === "meta" &&
  getPropertyName(node) === "env";

const isProcessEnv = (node: EsTreeNode | undefined): boolean =>
  node?.type === "MemberExpression" &&
  node.object?.type === "Identifier" &&
  node.object.name === "process" &&
  getPropertyName(node) === "env";

const isUseRuntimeConfigCall = (node: EsTreeNode | undefined): boolean =>
  node?.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "useRuntimeConfig";

export default defineRule({
  meta: {
    id: "no-secret-in-public-env",
    category: "Security",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-540"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "Variables with a `VITE_` / `NUXT_PUBLIC_` prefix are inlined into the browser bundle; keep secrets in server-only variables",
    agentGuidance:
      "Do not read a secret through a public variable (`import.meta.env.VITE_*`, `process.env.NUXT_PUBLIC_*`, `useRuntimeConfig().public.*`): its value is shipped to every visitor. Rename it without the public prefix, read it only on the server (a `server/` route or a backend), and call that from the client. Rotate the secret, since it has already been exposed. Publishable and anon keys are fine in public variables.",
  },
  create: (context: RuleContext): RuleVisitors => {
    // Variables bound to `useRuntimeConfig()` and to its `.public` part, so `config.public.x` and `pub.x` are seen.
    const runtimeConfigNames = new Set<string>();
    const publicConfigNames = new Set<string>();

    const isRuntimeConfig = (node: EsTreeNode | undefined): boolean =>
      isUseRuntimeConfigCall(node) || (node?.type === "Identifier" && runtimeConfigNames.has(node.name));

    const isPublicConfig = (node: EsTreeNode | undefined): boolean =>
      (node?.type === "MemberExpression" && getPropertyName(node) === "public" && isRuntimeConfig(node.object)) ||
      (node?.type === "Identifier" && publicConfigNames.has(node.name));

    const reportRead = (node: EsTreeNode, name: string, source: string): void => {
      context.report({
        node,
        message: `"${name}" looks like a secret but is read from ${source}, which is exposed to every browser — keep it server-only`,
      });
    };

    return {
      VariableDeclarator(node: EsTreeNode) {
        const init: EsTreeNode | undefined = node.init;
        if (node.id?.type === "Identifier") {
          if (isRuntimeConfig(init)) runtimeConfigNames.add(node.id.name);
          if (isPublicConfig(init)) publicConfigNames.add(node.id.name);
          return;
        }
        if (node.id?.type !== "ObjectPattern") return;

        // `const { apiSecret } = useRuntimeConfig().public` and
        // `const { public: { apiSecret } } = useRuntimeConfig()`
        const reportPattern = (pattern: EsTreeNode): void => {
          for (const property of pattern.properties ?? []) {
            if (property.type !== "Property" || property.computed || property.key?.type !== "Identifier") continue;
            if (looksLikeSecretName(property.key.name)) reportRead(property, property.key.name, "the public runtime config");
          }
        };
        // `const { VITE_STRIPE_SECRET_KEY } = import.meta.env`
        if (isImportMetaEnv(init) || isProcessEnv(init)) {
          for (const property of node.id.properties ?? []) {
            if (property.type !== "Property" || property.computed || property.key?.type !== "Identifier") continue;
            const name: string = property.key.name;
            if (isPublicEnvName(name) && looksLikeSecretName(name)) {
              reportRead(property, name, isImportMetaEnv(init) ? "import.meta.env" : "process.env");
            }
          }
        }
        if (isPublicConfig(init)) reportPattern(node.id);
        if (isRuntimeConfig(init)) {
          for (const property of node.id.properties ?? []) {
            if (
              property.type === "Property" &&
              property.key?.type === "Identifier" &&
              property.key.name === "public" &&
              property.value?.type === "ObjectPattern"
            ) {
              reportPattern(property.value);
            }
          }
        }
      },
      MemberExpression(node: EsTreeNode) {
        const name = getPropertyName(node);
        if (name === null) return;
        if (isImportMetaEnv(node.object) || isProcessEnv(node.object)) {
          if (isPublicEnvName(name) && looksLikeSecretName(name)) {
            reportRead(node, name, isImportMetaEnv(node.object) ? "import.meta.env" : "process.env");
          }
          return;
        }
        if (isPublicConfig(node.object) && looksLikeSecretName(name)) {
          reportRead(node, name, "the public runtime config");
        }
      },
    };
  },
});
