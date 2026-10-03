import { findEnclosingFunction, getFilename, isSetupFunction } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-this-in-setup",
    category: "Correctness",
    defaultSeverity: "error",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use refs, props and composables instead of `this` in `<script setup>`",
    agentGuidance: "`this` does not exist in `<script setup>` or inside `setup()`. Use the refs, props and composables returned/declared in the setup scope instead.",
  },
  create: (context: RuleContext) => ({
    ThisExpression(node: EsTreeNode) {
      // Arrow functions inherit `this`, every other function binds its own (Options API
      // methods, computed getters, ...), so only the nearest non-arrow function matters.
      const owner = findEnclosingFunction(node, { skipArrows: true });
      const isInSetupHook = owner !== null && isSetupFunction(owner);
      const isInScriptSetup = owner === null && getFilename(context).endsWith(".vue");
      if (!isInSetupHook && !isInScriptSetup) return;

      context.report({
        node,
        message: '"this" is not available in <script setup> or setup() — use refs and composables instead',
      });
    },
  }),
});
