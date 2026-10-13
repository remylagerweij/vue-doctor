import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { collectNamesBoundWithin, findEnclosingLoop, unwrapExpression } from "./helpers.js";

const isConstantPart = (node: EsTreeNode | null | undefined, loopBoundNames: Set<string>): boolean => {
  const expression = unwrapExpression(node);
  if (!expression) return false;
  if (expression.type === "Literal") return true;
  if (expression.type === "TemplateLiteral") {
    return (expression.expressions ?? []).every((part: EsTreeNode) => isConstantPart(part, loopBoundNames));
  }
  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    return isConstantPart(expression.left, loopBoundNames) && isConstantPart(expression.right, loopBoundNames);
  }
  return expression.type === "Identifier" && expression.name !== "undefined" && !loopBoundNames.has(expression.name);
};

export default defineRule({
  meta: {
    id: "js-hoist-regexp",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Hoist a `new RegExp()` whose pattern does not change out of the loop so it is compiled once",
    agentGuidance:
      "Only reported when every argument is a literal or a value that does not change inside the loop. Move the `new RegExp(...)` above the loop, or to a module-level constant when its arguments are all literals. A pattern built from the loop variable cannot be hoisted and is not reported.",
  },
  create: (context: RuleContext) => {
    const boundNamesByLoop = new WeakMap<EsTreeNode, Set<string>>();

    return {
      NewExpression(node: EsTreeNode) {
        if (node.callee?.type !== "Identifier" || node.callee.name !== "RegExp") return;
        const loop = findEnclosingLoop(node);
        if (!loop) return;

        let loopBoundNames = boundNamesByLoop.get(loop);
        if (!loopBoundNames) {
          loopBoundNames = collectNamesBoundWithin(loop);
          boundNamesByLoop.set(loop, loopBoundNames);
        }
        const names = loopBoundNames;
        const args: EsTreeNode[] = node.arguments ?? [];
        if (args.length === 0 || !args.every((argument) => isConstantPart(argument, names))) return;

        context.report({
          node,
          message: "new RegExp() with a loop-invariant pattern is recompiled on every iteration — hoist it above the loop",
        });
      },
    };
  },
});
