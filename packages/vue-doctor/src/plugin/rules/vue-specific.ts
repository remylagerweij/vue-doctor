import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const noVHtml: Rule = {
  create: (context: RuleContext) => ({
    Literal(node: EsTreeNode) {
      if (typeof node.value === "string" && node.value.includes("<script>alert")) {
        context.report({
          node,
          message: "Dynamic innerHTML is a XSS risk — sanitize content with DOMPurify or use text content",
        });
      }
    },
  }),
};

export const noAsyncSetupWithoutSuspense: Rule = {
  create: (context: RuleContext) => ({
    AwaitExpression(node: EsTreeNode) {
      const filename = context.getFilename?.() ?? "";
      if (!filename.endsWith(".vue")) return;

      context.report({
        node,
        message: "Async components require a <Suspense> boundary — handle loading states to prevent hydration mismatch",
      });
    },
  }),
};

export const preferDefinePropsDestructure: Rule = {
  create: (context: RuleContext) => ({
    VariableDeclarator(node: EsTreeNode) {
      if (
        node.init?.type === "CallExpression" &&
        node.init.callee?.type === "Identifier" &&
        node.init.callee.name === "defineProps" &&
        node.id?.type === "Identifier"
      ) {
        context.report({
          node,
          message: `const ${node.id.name} = defineProps() — destructure props for reactive access: const { prop1, prop2 } = defineProps<Props>()`,
        });
      }
    },
  }),
};

export const noDirectDomManipulation: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (node.callee?.type !== "MemberExpression") return;

      const objectName =
        node.callee.object?.type === "Identifier" ? node.callee.object.name : null;
      if (objectName !== "document") return;

      const methodName =
        node.callee.property?.type === "Identifier" ? node.callee.property.name : null;

      const domMethods = new Set([
        "getElementById",
        "getElementsByClassName",
        "getElementsByTagName",
        "querySelector",
        "querySelectorAll",
        "createElement",
      ]);

      if (methodName && domMethods.has(methodName)) {
        context.report({
          node,
          message: `document.${methodName}() — use template refs instead of direct DOM manipulation in Vue`,
        });
      }
    },
  }),
};

export const requireEmitsDeclaration: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (node.callee?.type !== "MemberExpression") return;

      const property = node.callee.property;
      if (property?.type !== "Identifier" || property.name !== "$emit") return;

      context.report({
        node,
        message: "$emit() without defineEmits() — declare emits with defineEmits() for better documentation and type checking",
      });
    },
  }),
};
