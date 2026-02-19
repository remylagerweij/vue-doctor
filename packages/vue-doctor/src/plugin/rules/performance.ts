import {
  BLUR_VALUE_PATTERN,
  LARGE_BLUR_THRESHOLD_PX,
  LAYOUT_PROPERTIES,
} from "../constants.js";
import type { EsTreeNode, Rule, RuleContext } from "../types.js";

// Helper to identify rAF or setInterval
const isLoopFunction = (node: EsTreeNode): boolean => {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    (node.callee.name === "requestAnimationFrame" || node.callee.name === "setInterval")
  );
};

export const noLayoutPropertyAnimation: Rule = {
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (node.key?.type !== "Identifier") return;
      const propertyName = node.key.name;

      if (
        (propertyName === "transition" || propertyName === "animation") &&
        node.value?.type === "Literal" &&
        typeof node.value.value === "string"
      ) {
        const transitionValue = node.value.value;
        for (const layoutProp of LAYOUT_PROPERTIES) {
          if (transitionValue.includes(layoutProp)) {
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
};

export const noTransitionAll: Rule = {
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (node.key?.type !== "Identifier") return;

      if (
        (node.key.name === "transition" || node.key.name === "transitionProperty") &&
        node.value?.type === "Literal" &&
        typeof node.value.value === "string" &&
        node.value.value.includes("all")
      ) {
        context.report({
          node,
          message: 'transition: "all" animates every CSS property — list specific properties instead',
        });
      }
    },

    Literal(node: EsTreeNode) {
      if (typeof node.value !== "string") return;
      if (node.value.includes("transition-all") || node.value.includes("transition: all")) {
        context.report({
          node,
          message: 'transition-all animates every CSS property — use transition-colors, transition-opacity, or transition-transform',
        });
      }
    },
  }),
};

export const noGlobalCssVariableAnimation: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "MemberExpression" &&
        node.callee.property?.type === "Identifier" &&
        node.callee.property.name === "setProperty"
      ) {
        context.report({
          node,
          message: "Setting CSS variables directly via DOM API can cause expensive repaints (especially in animation loops) — use Vue reactive :style bindings instead",
        });
      }
    },
  }),
};

export const noLargeAnimatedBlur: Rule = {
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
};

export const noScaleFromZero: Rule = {
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (node.key?.type !== "Identifier") return;
      if (node.key.name !== "scale" && node.key.name !== "transform") return;

      if (node.value?.type === "Literal") {
        if (node.value.value === 0 || node.value.value === "scale(0)") {
          context.report({
            node,
            message: "Scaling from 0 creates a jarring pop-in effect — use scale(0.95) with opacity for a smooth entrance",
          });
        }
      }
    },
  }),
};

export const noPermanentWillChange: Rule = {
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (
        node.key?.type === "Identifier" &&
        node.key.name === "willChange" &&
        node.value?.type === "Literal" &&
        typeof node.value.value === "string" &&
        node.value.value !== "auto"
      ) {
        context.report({
          node,
          message: "Permanent will-change wastes GPU memory — add on animation start and remove on end",
        });
      }
    },
  }),
};

export const noDeepWatch: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type !== "Identifier" ||
        node.callee.name !== "watch"
      ) return;

      // The options object is the 3rd argument: watch(source, callback, options)
      const options = node.arguments?.[2];
      if (options?.type !== "ObjectExpression") return;

      const deepProp = options.properties?.find(
        (prop: EsTreeNode) =>
          prop.type === "Property" &&
          prop.key?.type === "Identifier" &&
          prop.key.name === "deep" &&
          prop.value?.type === "Literal" &&
          prop.value.value === true,
      );

      if (deepProp) {
        context.report({
          node,
          message: "watch() with { deep: true } traverses the entire object tree on every change — watch specific properties or use watchEffect()",
        });
      }
    },
  }),
};
