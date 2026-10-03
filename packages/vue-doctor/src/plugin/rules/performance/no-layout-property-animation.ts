import { LAYOUT_PROPERTIES } from "../../constants.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-layout-property-animation",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `transform: translateX()` or `scale()` instead — they run on the compositor and skip layout/paint",
    agentGuidance: "Animate compositor-friendly properties only. Replace animated width/height/top/left/margin with `transform: translate()/scale()` and `opacity`.",
  },
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (node.key?.type !== "Identifier") return;
      const propertyName = node.key.name;

      if (
        (propertyName === "transition" || propertyName === "animation") &&
        node.value?.type === "Literal" &&
        typeof node.value.value === "string"
      ) {
        // Compare whole tokens (`width`, `padding-top`, `max-height`), not substrings: a keyframe
        // name such as `bright-pulse` must not match `right`.
        const tokens = node.value.value.toLowerCase().split(/[\s,]+/);
        for (const layoutProp of LAYOUT_PROPERTIES) {
          const kebabName = layoutProp.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
          if (tokens.some((token: string) => token === kebabName || token.endsWith(`-${kebabName}`))) {
            context.report({
              node,
              message: `Animating layout property "${layoutProp}" causes expensive reflows — use transform or opacity instead`,
            });
            break;
          }
        }
      }
    },
  }),
});
