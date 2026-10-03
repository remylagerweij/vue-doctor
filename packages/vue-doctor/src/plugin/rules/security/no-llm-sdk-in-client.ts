import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import { findLlmApiHost, findLlmSdkPackage } from "../../secrets/llm-providers.js";
import { classifyFile } from "../../secrets/visitors.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

// Functions that send an HTTP request, called by name (`fetch(url)`, `useFetch(url)`) ...
const REQUEST_FUNCTIONS: ReadonlySet<string> = new Set(["fetch", "$fetch", "ofetch", "useFetch", "useLazyFetch", "axios", "ky"]);
// ... or as a method of an HTTP client (`axios.post(url)`, `ky.get(url)`, `$fetch.raw(url)`, `axios.create({ baseURL })`).
const HTTP_CLIENTS: ReadonlySet<string> = new Set(["axios", "ky", "$fetch", "ofetch"]);
// `window.fetch(url)`, `globalThis.fetch(url)`.
const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(["window", "globalThis", "self"]);
// Object keys that hold the target of a request: `axios({ url })`, `axios.create({ baseURL })`.
const URL_KEYS: ReadonlySet<string> = new Set(["url", "baseURL", "baseUrl"]);

const TRANSPARENT_WRAPPERS: ReadonlySet<string> = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

const unwrap = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type) && current.expression) current = current.expression;
  return current;
};

const isRequestCallee = (callee: EsTreeNode): boolean => {
  if (callee.type === "Identifier") return REQUEST_FUNCTIONS.has(callee.name);
  if (callee.type !== "MemberExpression" || callee.object?.type !== "Identifier") return false;
  const objectName: string = callee.object.name;
  if (HTTP_CLIENTS.has(objectName)) return true;
  return GLOBAL_OBJECTS.has(objectName) && !callee.computed && callee.property?.name === "fetch";
};

const getKeyName = (property: EsTreeNode): string | null => {
  if (property.type !== "Property" || property.computed) return null;
  if (property.key?.type === "Identifier") return property.key.name;
  if (property.key?.type === "Literal" && typeof property.key.value === "string") return property.key.value;
  return null;
};

/** The provider SDK package behind an import specifier, so a finding names what was imported. */
const importedPackage = (specifier: unknown): string | null =>
  typeof specifier === "string" ? findLlmSdkPackage(specifier) : null;

/** A type-only import or re-export is erased at build time and never reaches the browser. */
const isTypeOnlyImport = (node: EsTreeNode): boolean => {
  if (node.importKind === "type") return true;
  const specifiers: EsTreeNode[] = node.specifiers ?? [];
  return specifiers.length > 0 && specifiers.every((specifier) => specifier.importKind === "type");
};

const isTypeOnlyExport = (node: EsTreeNode): boolean => {
  if (node.exportKind === "type") return true;
  const specifiers: EsTreeNode[] = node.specifiers ?? [];
  return node.type === "ExportNamedDeclaration" && specifiers.length > 0 && specifiers.every((specifier) => specifier.exportKind === "type");
};

export default defineRule({
  meta: {
    id: "no-llm-sdk-in-client",
    category: "Security",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-522", "CWE-200"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "Call the LLM provider from a server route (Nuxt `server/api/*` or your backend) and keep its API key in a non-public environment variable or `runtimeConfig`",
    agentGuidance:
      "Code that runs in the browser must not call an LLM provider directly: the API key it needs ships to every visitor, who can then spend your quota. Move the provider SDK (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `@ai-sdk/<provider>`, ...) or the request to `api.openai.com` / `api.anthropic.com` / ... into a server route (Nuxt `server/api/chat.post.ts`, or a backend), read the key there from `process.env` or the non-public part of `runtimeConfig`, and have the client call that route (`$fetch('/api/chat')`, or `useChat` from `@ai-sdk/vue`). Remove `dangerouslyAllowBrowser: true`. If a key was already shipped, revoke and rotate it. Type-only imports (`import type`) are fine.",
  },
  create: (context: RuleContext): RuleVisitors => {
    // Server code, build config and tests may use provider SDKs; only code shipped to the browser is judged.
    if (classifyFile(getFilename(context)) !== "client") return {};

    // String constants seen so far, so `fetch(OPENAI_URL)` is resolved like `fetch("https://api.openai.com/...")`.
    const stringConstants = new Map<string, string>();

    // The leading literal text of a URL expression: enough to read the host, even when a path is appended.
    const staticPrefix = (node: EsTreeNode | undefined): string | null => {
      if (!node) return null;
      const expression = unwrap(node);
      if (expression.type === "Literal") return typeof expression.value === "string" ? expression.value : null;
      if (expression.type === "TemplateLiteral") return expression.quasis?.[0]?.value?.cooked ?? null;
      if (expression.type === "BinaryExpression" && expression.operator === "+") return staticPrefix(expression.left);
      if (expression.type === "Identifier") return stringConstants.get(expression.name) ?? null;
      return null;
    };

    const reportSdk = (node: EsTreeNode, packageName: string): void => {
      context.report({
        node,
        message: `"${packageName}" is an LLM provider SDK imported in client code — its API key would ship to every visitor; call the provider from a server route instead`,
      });
    };

    const checkSource = (node: EsTreeNode, source: unknown): void => {
      const packageName = importedPackage(source);
      if (packageName) reportSdk(node, packageName);
    };

    const checkRequestTarget = (target: EsTreeNode | undefined): void => {
      if (!target) return;
      const prefix = staticPrefix(target);
      const host = prefix === null ? null : findLlmApiHost(prefix);
      if (host) {
        context.report({
          node: target,
          message: `Request to ${host} from client code — the provider API key would ship to every visitor; send it through your own server route (e.g. "/api/chat")`,
        });
      }
    };

    const checkRequestOptions = (options: EsTreeNode): void => {
      for (const property of options.properties ?? []) {
        const key = getKeyName(property);
        if (key !== null && URL_KEYS.has(key)) checkRequestTarget(property.value);
      }
    };

    return {
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type !== "Identifier" || !node.init) return;
        const value = staticPrefix(node.init);
        if (value !== null) stringConstants.set(node.id.name, value);
      },
      ImportDeclaration(node: EsTreeNode) {
        if (isTypeOnlyImport(node)) return;
        checkSource(node, node.source?.value);
      },
      ExportNamedDeclaration(node: EsTreeNode) {
        if (!node.source || isTypeOnlyExport(node)) return;
        checkSource(node, node.source.value);
      },
      ExportAllDeclaration(node: EsTreeNode) {
        if (!node.source || isTypeOnlyExport(node)) return;
        checkSource(node, node.source.value);
      },
      // `await import("openai")`
      ImportExpression(node: EsTreeNode) {
        if (node.source?.type === "Literal") checkSource(node, node.source.value);
      },
      CallExpression(node: EsTreeNode) {
        const callee = unwrap(node.callee);
        // `require("openai")`
        if (callee.type === "Identifier" && callee.name === "require" && node.arguments?.[0]?.type === "Literal") {
          checkSource(node, node.arguments[0].value);
          return;
        }
        if (!isRequestCallee(callee)) return;
        const first: EsTreeNode | undefined = node.arguments?.[0];
        if (!first) return;
        if (unwrap(first).type === "ObjectExpression") checkRequestOptions(unwrap(first));
        else checkRequestTarget(first);
      },
      NewExpression(node: EsTreeNode) {
        // `new Request("https://api.openai.com/...")`
        if (node.callee?.type === "Identifier" && node.callee.name === "Request") checkRequestTarget(node.arguments?.[0]);
      },
      Property(node: EsTreeNode) {
        // `new OpenAI({ apiKey, dangerouslyAllowBrowser: true })`: the SDK's own opt-in to expose the key.
        if (getKeyName(node) !== "dangerouslyAllowBrowser") return;
        const value = unwrap(node.value);
        if (value.type === "Literal" && value.value === true) {
          context.report({
            node,
            message: "`dangerouslyAllowBrowser: true` puts the LLM provider API key in the browser, where every visitor can read and reuse it — call the provider from a server route",
          });
        }
      },
    };
  },
});
