import { defineRule } from "../../define-rule.js";
import { WALK_STOP, walkAst } from "../../helpers.js";
import type { RuleContext, RuleVisitors } from "../../types.js";

const GUARD_METHODS = new Set(["beforeEach", "beforeResolve"]);

const isRouterObject = (object: any): boolean =>
  (object.type === "Identifier" && object.name === "router") ||
  (object.type === "MemberExpression" &&
    object.object.type === "ThisExpression" &&
    object.property.type === "Identifier" &&
    object.property.name === "$router");

/** True when `name` is called, or handed to another function (which may call it), inside `body`. */
const usesNext = (body: any, name: string): boolean => {
  let used = false;
  walkAst(body, (child: any) => {
    if (child.type !== "CallExpression") return;
    if (
      (child.callee.type === "Identifier" && child.callee.name === name) ||
      child.arguments.some((argument: any) => argument.type === "Identifier" && argument.name === name)
    ) {
      used = true;
      return WALK_STOP;
    }
  });
  return used;
};

export default defineRule({
  meta: {
    id: "router-no-async-guard-without-next",
    category: "Ecosystem",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.1.0",
    help: "An async beforeEach/beforeResolve guard that declares `next` must call it, otherwise navigation never resolves. Prefer returning a value and dropping `next`.",
    agentGuidance: "In an async `beforeEach`/`beforeResolve` guard, either remove the `next` parameter and return `true`, `false` or a route location, or make sure `next()` is called exactly once on every code path.",
  },
  create(context: RuleContext): RuleVisitors {
    return {
      CallExpression(node: any) {
        if (node.callee.type !== "MemberExpression") return;
        const property = node.callee.property;
        if (property.type !== "Identifier" || !GUARD_METHODS.has(property.name)) return;
        if (!isRouterObject(node.callee.object)) return;

        const callback = node.arguments[0];
        if (!callback || !callback.async) return;
        if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") return;

        // Returning nothing is valid in Vue Router 4, so only a declared-but-never-used `next` hangs navigation.
        const nextParameter = callback.params[2];
        if (!nextParameter || nextParameter.type !== "Identifier") return;
        if (usesNext(callback.body, nextParameter.name)) return;

        context.report({
          node: callback,
          message: `This async ${property.name} guard declares \`${nextParameter.name}\` but never calls it, so navigation never resolves. Call \`${nextParameter.name}()\` or drop the parameter and return a value.`,
        });
      },
    };
  },
});
