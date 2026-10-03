import { getFilename } from "../helpers.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../types.js";
import { classifySecretName, looksLikeSecretValue } from "./heuristics.js";
import { findProviderSecret } from "./providers.js";

/**
 * Where a file runs, which decides how a hardcoded credential in it is judged:
 * - `client`: shipped to the browser, so a credential there is exposed to every visitor.
 * - `server`: Nitro/server code and build-time config (`nuxt.config`, `vite.config`). Reading
 *   `runtimeConfig` or `process.env` there is fine, but a literal credential is still committed to git
 *   and visible to everyone with repository access, so a provider-format match stays reported (as a
 *   warning), while name-based guesses are skipped because they are mostly configuration.
 * - `test`: specs, stories and mocks, which often hold fake credentials; handled like `server`.
 */
export type FileContext = "client" | "server" | "test";

const SERVER_FILE_PATTERN = /(?:^|\/)server\/|\.server\.[cm]?[jt]sx?$|(?:^|\/)[\w.-]+\.config\.[cm]?[jt]s$/;
const TEST_FILE_PATTERN = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|(?:^|\/)__(?:tests|mocks)__\//;

export const classifyFile = (filename: string): FileContext => {
  if (TEST_FILE_PATTERN.test(filename)) return "test";
  if (SERVER_FILE_PATTERN.test(filename)) return "server";
  return "client";
};

/** What a rule reports: provider-format credentials in client code, or everything else (see `RULE_MODES`). */
export type SecretRuleMode = "provider" | "heuristic";

const stringValue = (node: EsTreeNode | null | undefined): string | undefined => {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value?.cooked ?? undefined;
  return undefined;
};

const propertyName = (key: EsTreeNode, computed: boolean): string | undefined => {
  if (key.type === "Identifier" && !computed) return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return undefined;
};

const targetName = (target: EsTreeNode): string | undefined => {
  if (target.type === "Identifier") return target.name;
  if (target.type === "MemberExpression") return propertyName(target.property, target.computed);
  return undefined;
};

const reportProvider = (
  context: RuleContext,
  node: EsTreeNode,
  description: string,
  fileContext: FileContext,
  name: string | undefined,
): void => {
  const where = name ? ` assigned to "${name}"` : "";
  // Messages name the provider and the variable, never the value.
  const message =
    fileContext === "client"
      ? `Hardcoded ${description}${where} in client code — revoke it and load it from a server-side environment variable`
      : `Hardcoded ${description}${where} committed to source — revoke it and load it from an environment variable or secret store`;
  context.report({ node, message });
};

/**
 * Visitors shared by the two secret rules. `provider` reports provider-format credentials in client
 * code (high confidence); `heuristic` reports secret-named assignments of random-looking values in
 * client code, and provider-format credentials in server/test code (committed, but not shipped).
 */
export const createSecretVisitors = (context: RuleContext, mode: SecretRuleMode): RuleVisitors => {
  const fileContext = classifyFile(getFilename(context));
  const reportsProviders = mode === "provider" ? fileContext === "client" : fileContext !== "client";
  const reportsNames = mode === "heuristic" && fileContext === "client";

  const checkProvider = (node: EsTreeNode, value: string | undefined, name?: string): void => {
    if (value === undefined) return;
    const match = findProviderSecret(value);
    if (match) reportProvider(context, node, match.pattern.description, fileContext, name);
  };

  /** Secret-named assignment of a literal: `apiKey = "..."`, `{ "x-api-key": "..." }`, `(token = "...") =>`. */
  const checkNamed = (node: EsTreeNode, name: string | undefined, valueNode: EsTreeNode | null | undefined): void => {
    if (!reportsNames || !name) return;
    const value = stringValue(valueNode);
    if (value === undefined) return;
    const kind = classifySecretName(name);
    // A provider-format value belongs to the `provider` rule; never report one literal twice.
    if (!kind || findProviderSecret(value) || !looksLikeSecretValue(value, kind)) return;
    context.report({
      node,
      message: `Possible hardcoded secret in "${name}" in client code — load it from a server-side environment variable instead`,
    });
  };

  // Named assignments report the provider match with the name, so the bare literal is skipped for them.
  const named = new WeakSet<EsTreeNode>();
  const checkNamedProvider = (node: EsTreeNode, name: string | undefined, valueNode: EsTreeNode | null | undefined): void => {
    const value = stringValue(valueNode);
    if (!reportsProviders || value === undefined || !valueNode) return;
    const match = findProviderSecret(value);
    if (!match) return;
    named.add(valueNode);
    if (valueNode.type === "TemplateLiteral") named.add(valueNode.quasis[0]);
    reportProvider(context, node, match.pattern.description, fileContext, name);
  };

  const visitors: RuleVisitors = {
    VariableDeclarator(node: EsTreeNode) {
      if (node.id?.type !== "Identifier") return;
      checkNamedProvider(node, node.id.name, node.init);
      checkNamed(node, node.id.name, node.init);
    },
    Property(node: EsTreeNode) {
      if (node.kind !== "init" || node.method) return;
      const name = propertyName(node.key, node.computed);
      checkNamedProvider(node, name, node.value);
      checkNamed(node, name, node.value);
    },
    PropertyDefinition(node: EsTreeNode) {
      const name = propertyName(node.key, node.computed);
      checkNamedProvider(node, name, node.value);
      checkNamed(node, name, node.value);
    },
    AssignmentExpression(node: EsTreeNode) {
      if (node.operator !== "=") return;
      const name = targetName(node.left);
      checkNamedProvider(node, name, node.right);
      checkNamed(node, name, node.right);
    },
    AssignmentPattern(node: EsTreeNode) {
      const name = node.left?.type === "Identifier" ? node.left.name : undefined;
      checkNamedProvider(node, name, node.right);
      checkNamed(node, name, node.right);
    },
    // Every other string (call arguments, array items, template quasis, concatenations).
    Literal(node: EsTreeNode) {
      if (!reportsProviders || named.has(node) || typeof node.value !== "string") return;
      checkProvider(node, node.value);
    },
    TemplateElement(node: EsTreeNode) {
      if (!reportsProviders || named.has(node)) return;
      checkProvider(node, node.value?.cooked ?? node.value?.raw);
    },
  };
  return visitors;
};
