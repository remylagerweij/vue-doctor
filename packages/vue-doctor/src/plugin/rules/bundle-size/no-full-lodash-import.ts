import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-full-lodash-import",
    category: "Bundle Size",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Import the specific function: `import debounce from 'lodash/debounce'` — saves ~70kb",
    agentGuidance: "Import the single function (`import debounce from 'lodash/debounce'`) or switch to `lodash-es`/native code instead of importing the full library.",
  },
  create: (context: RuleContext) => ({
    ImportDeclaration(node: EsTreeNode) {
      if (node.source?.value === "lodash" && node.specifiers?.length > 0) {
        context.report({
          node,
          message: 'Full lodash import adds ~70kb — import specific function: import debounce from "lodash/debounce"',
        });
      }
    },
  }),
});
