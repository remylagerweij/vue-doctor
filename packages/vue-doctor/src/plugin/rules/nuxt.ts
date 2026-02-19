import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const nuxtNoImgElement: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "h" &&
        node.arguments?.[0]?.type === "Literal" &&
        node.arguments[0].value === "img"
      ) {
        context.report({
          node,
          message: 'Using <img> in Nuxt — use <NuxtImg> from @nuxt/image for automatic optimization',
        });
      }
    },
  }),
};

export const nuxtNoAElement: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "h" &&
        node.arguments?.[0]?.type === "Literal" &&
        node.arguments[0].value === "a"
      ) {
        context.report({
          node,
          message: 'Using <a> in Nuxt — use <NuxtLink> for client-side navigation and prefetching',
        });
      }
    },
  }),
};

export const nuxtNoHeadImport: Rule = {
  create: (context: RuleContext) => ({
    ImportDeclaration(node: EsTreeNode) {
      const source = node.source?.value;
      if (
        typeof source === "string" &&
        (source === "@vueuse/head" || source === "@unhead/vue")
      ) {
        context.report({
          node,
          message: `Importing from "${source}" — use Nuxt's built-in useHead() composable instead`,
        });
      }
    },
  }),
};

export const nuxtNoClientFetchForServerData: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        (node.callee.name === "onMounted" || node.callee.name === "onBeforeMount")
      ) {
        const callback = node.arguments?.[0];
        if (!callback) return;

        if (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression") {
          const body = callback.body;
          if (body?.type === "BlockStatement") {
            for (const statement of body.body ?? []) {
              if (
                statement.type === "ExpressionStatement" &&
                statement.expression?.type === "AwaitExpression" &&
                statement.expression.argument?.type === "CallExpression"
              ) {
                const call = statement.expression.argument;
                if (
                  call.callee?.type === "Identifier" &&
                  (call.callee.name === "fetch" || call.callee.name === "$fetch")
                ) {
                  context.report({
                    node,
                    message: `fetch() in ${node.callee.name} — use useFetch() or useAsyncData() to fetch data on the server instead`,
                  });
                }
              }
            }
          }
        }
      }
    },
  }),
};

export const nuxtAsyncClientComponent: Rule = {
  create: (context: RuleContext) => ({
    ExportDefaultDeclaration(node: EsTreeNode) {
      const declaration = node.declaration;
      if (!declaration) return;

      if (
        declaration.type === "CallExpression" &&
        declaration.callee?.type === "Identifier" &&
        declaration.callee.name === "defineComponent"
      ) {
        const options = declaration.arguments?.[0];
        if (options?.type !== "ObjectExpression") return;

        const setupProp = options.properties?.find(
          (prop: EsTreeNode) =>
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "setup",
        );

        if (setupProp?.value?.async) {
          context.report({
            node,
            message: "Async setup() in a client component — use useFetch() or useAsyncData() instead of making setup async",
          });
        }
      }
    },
  }),
};
