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

const SSR_UNSAFE_GLOBALS = new Set(["window", "document", "navigator", "localStorage", "sessionStorage"]);

export const nuxtNoWindowInSsr: Rule = {
  create: (context: RuleContext) => ({
    MemberExpression(node: EsTreeNode) {
      if (
        node.object?.type === "Identifier" &&
        SSR_UNSAFE_GLOBALS.has(node.object.name)
      ) {
        context.report({
          node,
          message: `${node.object.name} is not available during SSR — guard with \`if (import.meta.client)\` or use \`onMounted()\``,
        });
      }
    },
  }),
};

export const nuxtRequireSeoMeta: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "useHead"
      ) {
        const arg = node.arguments?.[0];
        if (arg?.type !== "ObjectExpression") return;

        const hasMeta = arg.properties?.some(
          (prop: EsTreeNode) =>
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "meta",
        );

        if (hasMeta) {
          context.report({
            node,
            message: "useHead() with meta tags — prefer useSeoMeta() for type-safe SEO meta management",
          });
        }
      }
    },
  }),
};

export const nuxtNoProcessEnvInClient: Rule = {
  create: (context: RuleContext) => ({
    MemberExpression(node: EsTreeNode) {
      if (
        node.object?.type === "MemberExpression" &&
        node.object.object?.type === "Identifier" &&
        node.object.object.name === "process" &&
        node.object.property?.type === "Identifier" &&
        node.object.property.name === "env"
      ) {
        context.report({
          node,
          message: "process.env in Nuxt — use useRuntimeConfig() for type-safe environment variable access",
        });
      }
    },
  }),
};

export const nuxtRequireServerRouteErrorHandling: Rule = {
  create: (context: RuleContext) => ({
    ExportDefaultDeclaration(node: EsTreeNode) {
      const filename = context.getFilename?.() ?? "";
      if (!filename.includes("server/") && !filename.includes("server\\")) return;

      const decl = node.declaration;
      if (!decl) return;

      // Check for defineEventHandler
      if (
        decl.type === "CallExpression" &&
        decl.callee?.type === "Identifier" &&
        decl.callee.name === "defineEventHandler"
      ) {
        const handler = decl.arguments?.[0];
        if (!handler) return;

        const body =
          handler.type === "ArrowFunctionExpression" || handler.type === "FunctionExpression"
            ? handler.body
            : null;

        if (body?.type === "BlockStatement") {
          const hasTryCatch = body.body?.some(
            (s: EsTreeNode) => s.type === "TryStatement",
          );
          if (!hasTryCatch) {
            context.report({
              node,
              message: "Server route handler without try/catch — wrap in try/catch to handle errors gracefully",
            });
          }
        }
      }
    },
  }),
};
