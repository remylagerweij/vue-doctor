import { BLUR_VALUE_PATTERN, LARGE_BLUR_THRESHOLD_PX } from "../../constants.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-large-animated-blur",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Keep blur radius under 10px, or apply blur to a smaller element",
    agentGuidance: "Reduce the animated blur radius to 10px or less, or apply the blur to a smaller element. Large animated blurs are expensive on the GPU.",
  },
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (node.key?.type !== "Identifier" || node.key.name !== "filter") return;
      if (node.value?.type !== "Literal" || typeof node.value.value !== "string") return;

      const match = BLUR_VALUE_PATTERN.exec(node.value.value);
      if (match) {
        const blurRadius = parseFloat(match[1]);
        if (blurRadius > LARGE_BLUR_THRESHOLD_PX) {
          context.report({
            node,
            message: `blur(${blurRadius}px) is expensive to animate — keep under ${LARGE_BLUR_THRESHOLD_PX}px or apply to a smaller element`,
          });
        }
      }
    },
  }),
});
