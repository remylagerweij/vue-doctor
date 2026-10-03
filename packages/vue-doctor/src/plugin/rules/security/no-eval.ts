import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const GLOBAL_OBJECT_NAMES = new Set(["window", "globalThis", "self"]);

export default defineRule({
  meta: {
    id: "no-eval",
    category: "Security",
    defaultSeverity: "error",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-95"],
    owasp: "A03:2021",
    fixable: false,
    since: "1.0.0",
    help: "Replace `eval()` with a safe alternative: `JSON.parse()` for data, or a lookup table of functions for dynamic behaviour",
    agentGuidance: "Remove `eval()`. Use `JSON.parse` for data, a lookup table or function map for dynamic dispatch, and never build code from strings.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      const callee = node.callee;
      // `eval(...)`, plus the explicit global forms `window.eval(...)` and `globalThis.eval(...)`.
      const isEvalCall =
        (callee?.type === "Identifier" && callee.name === "eval") ||
        (callee?.type === "MemberExpression" &&
          !callee.computed &&
          callee.property?.name === "eval" &&
          callee.object?.type === "Identifier" &&
          GLOBAL_OBJECT_NAMES.has(callee.object.name));
      if (isEvalCall) {
        context.report({
          node,
          message: "eval() is a security risk — use safer alternatives",
        });
      }
    },
  }),
});
