import { defineRule } from "../../define-rule.js";
import { createRequestInputTracker, peel } from "../../request-input.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isLiteralDangerousKey = (node: EsTreeNode): boolean => {
  const expr = peel(node);
  return expr.type === "Literal" && typeof expr.value === "string" && DANGEROUS_KEYS.has(expr.value);
};

const MERGE_FUNCTIONS = new Set(["defu", "merge", "deepmerge", "assign"]);

export default defineRule({
  meta: {
    id: "no-prototype-pollution",
    category: "Security",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-1321"],
    owasp: "A08:2021",
    fixable: false,
    since: "2.0.0",
    help: "Prevent prototype pollution: do not assign user-controlled keys without checking for `__proto__`/`constructor`, and avoid deep-merging untrusted input into existing objects",
    agentGuidance:
      "When assigning to dynamic object properties (`obj[key] = value`) with user-controlled keys, ensure `key !== '__proto__' && key !== 'constructor' && key !== 'prototype'`, " +
      "or use `Object.create(null)` / `Map` for arbitrary key-value storage. When merging untrusted input, avoid merging into shared or existing prototype-bearing objects.",
  },
  create: (context: RuleContext): RuleVisitors => {
    const input = createRequestInputTracker();

    return {
      VariableDeclarator(node: EsTreeNode) {
        input.recordDeclarator(node);
      },

      AssignmentExpression(node: EsTreeNode) {
        input.recordAssignment(node);

        // Check obj[key] = value where key is literal dangerous key or key is user input
        if (node.operator === "=" && node.left?.type === "MemberExpression" && node.left.computed) {
          const property = node.left.property;
          if (isLiteralDangerousKey(property)) {
            context.report({
              node,
              message: `assignment to dangerous prototype key '${property.value}' causes prototype pollution`,
            });
            return;
          }

          if (input.isInput(property)) {
            context.report({
              node,
              message: "computed property assignment with user-controlled key may cause prototype pollution — guard against `__proto__` and `constructor`",
            });
            return;
          }
        }
      },

      CallExpression(node: EsTreeNode) {
        const callee = peel(node.callee);
        let fnName: string | null = null;
        let isObjectAssign = false;

        if (callee.type === "Identifier") {
          fnName = callee.name;
        } else if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
          const receiver = peel(callee.object);
          if (receiver.type === "Identifier" && receiver.name === "Object" && callee.property.name === "assign") {
            isObjectAssign = true;
          } else {
            fnName = callee.property.name;
          }
        }

        const args = node.arguments as EsTreeNode[];
        if (isObjectAssign && args.length >= 2) {
          const target = peel(args[0]);
          const source = peel(args[1]);
          // Object.assign(existingObj, reqBody) where target is not an empty literal {}
          if (target.type !== "ObjectExpression" && input.isInput(source)) {
            context.report({
              node,
              message: "`Object.assign` merges untrusted request input into an existing object — potential prototype pollution; clone to `{}` or validate keys",
            });
          }
        } else if (fnName && MERGE_FUNCTIONS.has(fnName) && args.length >= 2) {
          const target = peel(args[0]);
          const source = peel(args[1]);
          if (target.type !== "ObjectExpression" && input.isInput(source)) {
            context.report({
              node,
              message: `\`${fnName}\` merges untrusted input into an existing object without key sanitization — potential prototype pollution`,
            });
          }
        }
      },
    };
  },
});
