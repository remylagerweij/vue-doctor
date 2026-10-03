import { defineRule } from "../../define-rule.js";
import { JAVASCRIPT_URL_MESSAGE, findJavascriptUrlLiterals, isJavascriptUrl } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

/** Methods that test or compare a string: `url.startsWith("javascript:")` is a blocklist, not a URL. */
const STRING_TEST_METHODS: ReadonlySet<string> = new Set([
  "startsWith", "endsWith", "includes", "indexOf", "lastIndexOf", "test", "match", "replace", "replaceAll", "split", "has", "add", "get",
]);
const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(["===", "!==", "==", "!="]);

export default defineRule({
  meta: {
    id: "no-javascript-url",
    category: "Security",
    // Warning, not error: `javascript:void(0)` placeholders are common and mostly harmless, but they
    // are still an XSS vector the moment anything is appended, and they break a strict CSP.
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-79"],
    owasp: "A03:2021",
    fixable: false,
    since: "2.0.0",
    help: "Replace the `javascript:` URL with a `<button @click>` handler, or a real URL",
    agentGuidance:
      "Remove `javascript:` URLs. For a placeholder link (`href=\"javascript:void(0)\"`) use `<button type=\"button\" @click=\"...\">` " +
      "(or `<a href=\"#\" @click.prevent=\"...\">`); for navigation use a real URL or `<RouterLink :to>`. " +
      "Never build a URL from a `javascript:` prefix plus a variable. Comparisons such as `url.startsWith(\"javascript:\")` are not reported.",
  },
  create: (context: RuleContext) => {
    // Literals used to test or compare (blocklists such as `["javascript:", "data:"]`) rather than as a URL.
    const exempt = new WeakSet<EsTreeNode>();
    const exemptAll = (nodes: Iterable<EsTreeNode | null | undefined>): void => {
      for (const node of nodes) if (node) exempt.add(node);
    };

    const report = (node: EsTreeNode): void => {
      if (exempt.has(node)) return;
      context.report({ node, message: `\`javascript:\` URL — ${JAVASCRIPT_URL_MESSAGE}` });
    };

    return {
      BinaryExpression(node: EsTreeNode) {
        if (COMPARISON_OPERATORS.has(node.operator)) exemptAll([node.left, node.right]);
        // `"javascript:" + code`: the literal alone is a bare scheme, the concatenation gives it a body.
        const left: EsTreeNode = node.left;
        if (
          node.operator === "+" &&
          left.type === "Literal" &&
          typeof left.value === "string" &&
          !isJavascriptUrl(left.value) &&
          findJavascriptUrlLiterals(left, true).length > 0
        ) {
          report(left);
        }
      },
      SwitchCase(node: EsTreeNode) {
        exemptAll([node.test]);
      },
      ArrayExpression(node: EsTreeNode) {
        exemptAll(node.elements);
      },
      CallExpression(node: EsTreeNode) {
        const method = node.callee?.type === "MemberExpression" && !node.callee.computed ? node.callee.property?.name : undefined;
        if (method && STRING_TEST_METHODS.has(method)) exemptAll(node.arguments);
      },
      Literal(node: EsTreeNode) {
        if (findJavascriptUrlLiterals(node).length > 0) report(node);
      },
      TemplateLiteral(node: EsTreeNode) {
        if (findJavascriptUrlLiterals(node).length > 0) report(node);
      },
    };
  },
});
