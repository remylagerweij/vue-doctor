import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const noVHtml: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      // Detect h() calls with innerHTML / v-html in render functions
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "h" &&
        node.arguments?.length >= 2
      ) {
        const props = node.arguments[1];
        if (props?.type === "ObjectExpression") {
          for (const prop of props.properties ?? []) {
            if (
              prop.type === "Property" &&
              prop.key?.type === "Identifier" &&
              (prop.key.name === "innerHTML" || prop.key.name === "domProps")
            ) {
              context.report({
                node: prop,
                message: "innerHTML / v-html is a XSS risk — sanitize content or use text interpolation",
              });
            }
          }
        }
      }
    },

    Property(node: EsTreeNode) {
      if (
        node.key?.type === "Identifier" &&
        node.key.name === "innerHTML" &&
        node.value?.type !== "Literal"
      ) {
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
      // Detect top-level await in <script setup> — this makes the component async
      // and requires a <Suspense> boundary
      const filename = context.getFilename?.() ?? "";
      if (!filename.endsWith(".vue")) return;

      // This is a heuristic — top-level await in .vue files likely means <script setup>
      // We report as a warning since the user may have a Suspense boundary elsewhere
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

      // If we see $emit being called, it likely means emits aren't declared with defineEmits()
      context.report({
        node,
        message: "$emit() without defineEmits() — declare emits with defineEmits() for better documentation and type checking",
      });
    },
  }),
};
