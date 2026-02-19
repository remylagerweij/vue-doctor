import type { RuleContext, RuleVisitors, Rule } from "../types.js";

export const piniaNoDestructure: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct destructuring of Pinia stores, which breaks reactivity.",
      recommended: true,
    },
  },
  create(context: RuleContext): RuleVisitors {
    return {
      VariableDeclarator(node: any) {
        if (!node.init || node.init.type !== "CallExpression") return;

        let calleeName = "";
        if (node.init.callee.type === "Identifier") {
          calleeName = node.init.callee.name;
        }

        // Extremely common convention: function name ends with 'Store' or starts with 'use' and ends with 'Store'
        if (
          calleeName.startsWith("use") &&
          calleeName.toLowerCase().endsWith("store")
        ) {
          if (node.id.type === "ObjectPattern") {
            context.report({
              node: node.id,
              message: "Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead (e.g., `const { count } = storeToRefs(useMyStore())`).",
            });
          }
        }
      },
    };
  },
};

export const routerNoStringPush: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Encourage route objects over raw strings when using Vue Router for better maintainability.",
      recommended: true,
    },
  },
  create(context: RuleContext): RuleVisitors {
    return {
      CallExpression(node: any) {
        if (node.callee.type !== "MemberExpression") return;

        const property = node.callee.property;
        if (property.type !== "Identifier" || !["push", "replace"].includes(property.name)) {
          return;
        }

        const object = node.callee.object;
        let isRouterObject = false;

        // Check for router.push or this.$router.push
        if (object.type === "Identifier" && object.name === "router") {
          isRouterObject = true;
        } else if (
          object.type === "MemberExpression" &&
          object.object.type === "ThisExpression" &&
          object.property.type === "Identifier" &&
          object.property.name === "$router"
        ) {
          isRouterObject = true;
        }

        if (isRouterObject && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
            context.report({
              node: firstArg,
              message: "Pass a route object (e.g. `{ name: 'RouteName' }` or `{ path: '...' }`) instead of a raw string to router.push/replace. This is more robust against refactoring.",
            });
          } else if (firstArg.type === "TemplateLiteral") {
            context.report({
              node: firstArg,
              message: "Pass a route object (e.g. `{ name: 'RouteName' }` or `{ path: '...' }`) instead of a raw string to router.push/replace. This is more robust against refactoring.",
            });
          }
        }
      },
    };
  },
};

export const piniaNoWatchStore: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Discourage watching entire Pinia stores for performance reasons.",
      recommended: true,
    },
  },
  create(context: RuleContext): RuleVisitors {
    return {
      CallExpression(node: any) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "watch") return;

        if (node.arguments.length > 0) {
          const watchSource = node.arguments[0];

          let sourceName = "";
          if (watchSource.type === "Identifier") {
            sourceName = watchSource.name;
          } else if (watchSource.type === "ArrowFunctionExpression" && watchSource.body.type === "Identifier") {
            sourceName = watchSource.body.name;
          }

          if (sourceName.toLowerCase().endsWith("store")) {
             context.report({
              node: watchSource,
              message: "Watching an entire Pinia store object is extremely expensive. Use `<store>.$subscribe()` or watch specific primitive getters instead.",
             });
          }
        }
      },
    };
  },
};

export const routerNoAsyncGuardWithoutNext: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure async navigation guards correctly resolve routing.",
      recommended: true,
    },
  },
  create(context: RuleContext): RuleVisitors {
    return {
      CallExpression(node: any) {
        if (node.callee.type !== "MemberExpression") return;
        const property = node.callee.property;

        if (property.type !== "Identifier" || !["beforeEach", "beforeResolve"].includes(property.name)) {
          return;
        }

        const object = node.callee.object;
        let isRouterObject = false;

        if (object.type === "Identifier" && object.name === "router") {
          isRouterObject = true;
        }

        if (isRouterObject && node.arguments.length > 0) {
          const callback = node.arguments[0];
          if (callback.async && (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression")) {
             // Basic AST heuristic: if it's async and doesn't have a 'next' param, it MUST have a ReturnStatement inside its block.
             if (callback.params.length < 3) {
                 const body = callback.body;
                 if (body.type === "BlockStatement") {
                     const hasReturn = body.body.some((statement: any) => statement.type === "ReturnStatement" ||
                         (statement.type === "IfStatement" && statement.consequent && statement.consequent.type === "BlockStatement" && statement.consequent.body.some((s: any) => s.type === "ReturnStatement")));

                     if (!hasReturn) {
                         context.report({
                             node: callback,
                             message: "Async beforeEach/beforeResolve navigation guards must explicitly return a RouteLocationRaw or boolean to resolve the navigation hook."
                         });
                     }
                 }
             }
          }
        }
      },
    };
  },
};
