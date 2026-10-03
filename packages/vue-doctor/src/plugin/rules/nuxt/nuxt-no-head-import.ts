import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "nuxt-no-head-import",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `useHead()` composable or `definePageMeta()` instead of importing head utilities",
    agentGuidance: "Remove the import from `@vueuse/head` or `@unhead/vue`; Nuxt auto-imports `useHead()` and `useSeoMeta()`, so call them without an import.",
  },
  create: (context: RuleContext) => ({
    ImportDeclaration(node: EsTreeNode) {
      const source = node.source?.value;
      if (
        typeof source === "string" &&
        (source === "@vueuse/head" || source === "@unhead/vue")
      ) {
        context.report({
          node,
          message: `Importing from "${source}" — use Nuxt's built-in useHead() composable instead`,
        });
      }
    },
  }),
});
