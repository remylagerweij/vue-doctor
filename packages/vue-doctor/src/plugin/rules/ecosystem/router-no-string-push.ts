import { defineRule } from "../../define-rule.js";
import type { RuleContext, RuleVisitors } from "../../types.js";

const MESSAGE =
  "Do not build a route path by string interpolation: params are not encoded and the route cannot be refactored. Pass a route object instead (e.g. `{ name: 'user', params: { id } }`).";

const isRouterObject = (object: any): boolean => {
  if (object.type === "Identifier") return object.name === "router";
  // `this.$router`
  return (
    object.type === "MemberExpression" &&
    object.object.type === "ThisExpression" &&
    object.property.type === "Identifier" &&
    object.property.name === "$router"
  );
};

const isStringLike = (node: any): boolean =>
  (node.type === "Literal" && typeof node.value === "string") || node.type === "TemplateLiteral";

/** A path assembled at runtime: `/user/${id}` or `"/user/" + id`. Static paths like `/login` are fine. */
const isDynamicPath = (node: any): boolean => {
  if (node.type === "TemplateLiteral") return node.expressions.length > 0;
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return isStringLike(node.left) || isStringLike(node.right) || isDynamicPath(node.left);
  }
  return false;
};

export default defineRule({
  meta: {
    id: "router-no-string-push",
    category: "Ecosystem",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.1.0",
    help: "Pass a route object (e.g. `{ name: 'user', params: { id } }`) instead of a path built with string interpolation to router.push/replace.",
    agentGuidance: "Replace a path assembled with a template literal or `+` in `router.push`/`replace` by a route location object, such as `{ name: 'user', params: { id } }`, so params are encoded. Static paths like `'/login'` are fine.",
  },
  create(context: RuleContext): RuleVisitors {
    return {
      CallExpression(node: any) {
        if (node.callee.type !== "MemberExpression") return;

        const property = node.callee.property;
        if (property.type !== "Identifier" || !["push", "replace"].includes(property.name)) return;
        if (!isRouterObject(node.callee.object) || node.arguments.length === 0) return;

        const firstArgument = node.arguments[0];
        if (isDynamicPath(firstArgument)) context.report({ node: firstArgument, message: MESSAGE });
      },
    };
  },
});
