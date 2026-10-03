import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-moment",
    category: "Bundle Size",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Replace with `import { format } from 'date-fns'` (tree-shakeable) or `import dayjs from 'dayjs'` (2kb)",
    agentGuidance: "Replace Moment.js with `date-fns` or `dayjs` (or `Intl`/`Temporal` where possible) and update the call sites accordingly.",
  },
  create: (context: RuleContext) => ({
    ImportDeclaration(node: EsTreeNode) {
      if (node.source?.value === "moment" || node.source?.value === "moment-timezone") {
        context.report({
          node,
          message: "moment.js is 330kb+ — use date-fns (tree-shakeable) or dayjs (2kb) instead",
        });
      }
    },
  }),
});
