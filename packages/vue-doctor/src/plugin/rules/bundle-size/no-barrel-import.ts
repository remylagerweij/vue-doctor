import { BARREL_INDEX_SUFFIXES } from "../../constants.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-barrel-import",
    category: "Bundle Size",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Import from the direct path: `import { Button } from './components/Button'` instead of `./components`",
    agentGuidance: "Import from the module that defines the symbol, for example `./components/Button`, instead of the folder `index` barrel, so unused exports can be tree-shaken.",
  },
  create: (context: RuleContext) => ({
    ImportDeclaration(node: EsTreeNode) {
      const source = node.source?.value;
      if (typeof source !== "string") return;
      if (!source.startsWith(".")) return;

      if (BARREL_INDEX_SUFFIXES.some((suffix) => source.endsWith(suffix)) || source.endsWith("/")) {
        context.report({
          node,
          message: `Barrel import from "${source}" — import directly from the source file to improve tree-shaking`,
        });
      }
    },
  }),
});
