import { defineRule } from "../../define-rule.js";
import type { RuleContext, RuleVisitors } from "../../types.js";

// Pinia binds actions to the store, so destructuring them is safe; only state and getters lose
// reactivity. A pattern made up solely of verb-prefixed names (`increment`, `fetchUser`) or `$`
// store methods is therefore treated as destructuring actions and not reported.
const ACTION_NAME_PATTERN =
  /^(\$|(set|add|remove|delete|update|fetch|load|save|reset|clear|toggle|init|login|logout|increment|decrement|open|close|show|hide|create|submit|handle)([A-Z0-9_$]|$))/;

/** True when the pattern has a rest element, a computed key or a key that does not look like an action. */
const hasStateLikeBinding = (pattern: any): boolean =>
  pattern.properties.some((property: any) => {
    if (property.type !== "Property" || property.computed || property.key.type !== "Identifier") return true;
    return !ACTION_NAME_PATTERN.test(property.key.name);
  });

export default defineRule({
  meta: {
    id: "pinia-no-destructure",
    category: "Ecosystem",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.1.0",
    help: "Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead.",
    agentGuidance: "Do not destructure a Pinia store directly. Use `const { count } = storeToRefs(store)` for state and getters, and call actions on the store object.",
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
          if (node.id.type === "ObjectPattern" && hasStateLikeBinding(node.id)) {
            context.report({
              node: node.id,
              message: "Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead (e.g., `const { count } = storeToRefs(useMyStore())`).",
            });
          }
        }
      },
    };
  },
});
