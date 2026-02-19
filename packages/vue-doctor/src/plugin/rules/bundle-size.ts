import {
  BARREL_INDEX_SUFFIXES,
  HEAVY_LIBRARIES,
} from "../constants.js";
import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const noBarrelImport: Rule = {
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
};

export const noFullLodashImport: Rule = {
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
};

export const noMoment: Rule = {
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
};

export const preferDynamicImport: Rule = {
  create: (context: RuleContext) => ({
    ImportDeclaration(node: EsTreeNode) {
      const source = node.source?.value;
      if (typeof source !== "string") return;

      if (HEAVY_LIBRARIES.has(source)) {
        context.report({
          node,
          message: `Static import of heavy library "${source}" — use defineAsyncComponent(() => import('${source}')) to lazy load`,
        });
      }
    },
  }),
};

export const noUndeferredThirdParty: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "useHead" &&
        node.arguments?.[0]?.type === "ObjectExpression"
      ) {
        const scriptProp = node.arguments[0].properties?.find(
          (prop: EsTreeNode) =>
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "script",
        );

        if (scriptProp?.value?.type === "ArrayExpression") {
          for (const element of scriptProp.value.elements ?? []) {
            if (element?.type !== "ObjectExpression") continue;

            const hasSrc = element.properties?.some(
              (prop: EsTreeNode) =>
                prop.key?.type === "Identifier" && prop.key.name === "src",
            );
            const hasDefer = element.properties?.some(
              (prop: EsTreeNode) =>
                prop.key?.type === "Identifier" &&
                (prop.key.name === "defer" || prop.key.name === "async"),
            );

            if (hasSrc && !hasDefer) {
              context.report({
                node: element,
                message: 'Third-party script blocks rendering — add defer: true or async: true',
              });
            }
          }
        }
      }
    },
  }),
};
