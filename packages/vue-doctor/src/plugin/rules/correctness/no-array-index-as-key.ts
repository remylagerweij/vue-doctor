import { INDEX_PARAMETER_NAMES } from "../../constants.js";
import { getStaticKeyName, WALK_STOP, walkAst } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const referencesName = (node: EsTreeNode | null | undefined, name: string): boolean => {
  if (!node) return false;
  let didFindReference = false;
  walkAst(node, (child) => {
    if (child.type !== "Identifier" || child.name !== name) return;
    didFindReference = true;
    return WALK_STOP;
  });
  return didFindReference;
};

// `key: index`, `key: \`row-${index}\``, `key={index}` (JSX) or `h(Comp, { key: index })`.
const isKeyUsingIndex = (node: EsTreeNode, indexName: string): boolean => {
  if (node.type === "Property" && getStaticKeyName(node) === "key") {
    return referencesName(node.value, indexName);
  }
  if (
    node.type === "JSXAttribute" &&
    node.name?.type === "JSXIdentifier" &&
    node.name.name === "key" &&
    node.value?.type === "JSXExpressionContainer"
  ) {
    return referencesName(node.value.expression, indexName);
  }
  return false;
};

export default defineRule({
  meta: {
    id: "no-array-index-as-key",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use a stable unique identifier: `:key=\"item.id\"` — index keys break on reorder/filter",
    agentGuidance: "Use a stable unique id from the data, such as `:key=\"item.id\"`, instead of the loop index; index keys break state on reorder, insert and filter.",
  },
  create: (context: RuleContext) => ({
    // Script-side check: an `.map((item, index) => ...)` callback only matters when the index is
    // actually used as a render `key` (render function / JSX). Template `v-for` keys are not
    // visible to oxlint; a plain `.map` that merely has an index parameter is not a finding.
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type !== "MemberExpression" ||
        node.callee.property?.type !== "Identifier" ||
        node.callee.property.name !== "map"
      ) {
        return;
      }
      const callback = node.arguments?.[0];
      if (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression") return;

      const indexParam = callback.params?.[1];
      if (indexParam?.type !== "Identifier" || !INDEX_PARAMETER_NAMES.has(indexParam.name)) return;

      const indexName = indexParam.name;
      let keyNode: EsTreeNode | null = null;
      walkAst(callback.body, (child) => {
        if (!isKeyUsingIndex(child, indexName)) return;
        keyNode = child;
        return WALK_STOP;
      });
      if (!keyNode) return;

      context.report({
        node: keyNode,
        message: `Avoid using array index "${indexName}" as key — use unique IDs for stable rendering`,
      });
    },
  }),
});
