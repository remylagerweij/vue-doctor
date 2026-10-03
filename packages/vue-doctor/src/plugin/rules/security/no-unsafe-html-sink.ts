import { defineRule } from "../../define-rule.js";
import { getStaticKeyName } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { HTML_INJECTION_PROPERTIES, UNSAFE_HTML_MESSAGE, isKnownSafeHtml, isTrustedInitializer } from "./helpers.js";

/** Render-function factories whose props object can carry `innerHTML` (Vue 3 `h`, Vue 2 `createElement`, compiled `_c`). */
const RENDER_FUNCTIONS: ReadonlySet<string> = new Set([
  "h",
  "createElement",
  "$createElement",
  "createVNode",
  "createElementVNode",
  "createBlock",
  "createElementBlock",
  "_c",
  "jsx",
  "jsxs",
  "_jsx",
  "_jsxs",
]);

/** Vue 2 render-function data objects that nest DOM properties (`{ domProps: { innerHTML } }`). */
const NESTED_PROP_OBJECTS: ReadonlySet<string> = new Set(["domProps", "props", "attrs"]);

/** Flat Vue 2 JSX spellings of `domProps.innerHTML`. */
const JSX_HTML_ATTRIBUTES: ReadonlySet<string> = new Set([
  "innerHTML",
  "outerHTML",
  "v-html",
  "domPropsInnerHTML",
  "domPropsOuterHTML",
]);

/** Methods that parse their first (`insertAdjacentHTML`: second) argument as HTML. */
const HTML_PARSING_METHODS: ReadonlyMap<string, number> = new Map([
  ["insertAdjacentHTML", 1],
  ["setHTMLUnsafe", 0],
  ["parseHTMLUnsafe", 0],
  ["createContextualFragment", 0],
]);

const memberPropertyName = (member: EsTreeNode): string | null => {
  if (member.type !== "MemberExpression") return null;
  if (!member.computed) return member.property?.type === "Identifier" ? member.property.name : null;
  return member.property?.type === "Literal" && typeof member.property.value === "string" ? member.property.value : null;
};

const isDocumentObject = (node: EsTreeNode | undefined): boolean =>
  Boolean(node) &&
  ((node!.type === "Identifier" && node!.name === "document") ||
    (node!.type === "MemberExpression" && !node!.computed && node!.property?.name === "document"));

export default defineRule({
  meta: {
    id: "no-unsafe-html-sink",
    category: "Security",
    // Warning, not error: the sink is certain, but whether the value is attacker-controlled is not
    // (trusted CMS or markdown output is common), so a finding is "review this", not "this is a bug".
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-79"],
    owasp: "A03:2021",
    fixable: false,
    since: "2.0.0",
    help: "Sanitize the HTML with DOMPurify (`el.innerHTML = DOMPurify.sanitize(html)`), or render text with `{{ }}` / `textContent`",
    agentGuidance:
      "Do not assign unsanitised strings to `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `document.write` or `h(tag, { innerHTML })`. " +
      "Prefer text: `el.textContent = value`, or `{{ value }}` in templates. If HTML is really required, sanitize it right at the sink, " +
      "for example `el.innerHTML = DOMPurify.sanitize(html)`, so the sanitizer call is visible next to the sink. " +
      "Literal strings and values passed through a sanitizer call are not reported.",
  },
  create: (context: RuleContext) => {
    // `const` bindings initialised with a sanitizer call (or `computed(() => sanitize(...))`).
    const trustedNames = new Set<string>();

    const report = (node: EsTreeNode, sink: string): void => {
      context.report({ node, message: `${sink} — ${UNSAFE_HTML_MESSAGE}` });
    };

    const checkRenderProps = (properties: EsTreeNode[], depth: number): void => {
      for (const property of properties) {
        if (property.type !== "Property") continue;
        const name = getStaticKeyName(property);
        if (!name) continue;
        if (HTML_INJECTION_PROPERTIES.has(name) || name === "domPropsInnerHTML" || name === "domPropsOuterHTML") {
          if (!isKnownSafeHtml(property.value, trustedNames)) report(property, `\`${name}\` in a render function`);
        } else if (depth === 0 && NESTED_PROP_OBJECTS.has(name) && property.value?.type === "ObjectExpression") {
          checkRenderProps(property.value.properties, depth + 1);
        }
      }
    };

    return {
      VariableDeclaration(node: EsTreeNode) {
        if (node.kind !== "const") return;
        for (const declarator of node.declarations as EsTreeNode[]) {
          if (declarator.id?.type === "Identifier" && isTrustedInitializer(declarator.init, trustedNames)) {
            trustedNames.add(declarator.id.name);
          }
        }
      },

      AssignmentExpression(node: EsTreeNode) {
        if (node.operator !== "=" && node.operator !== "+=") return;
        const property = memberPropertyName(node.left);
        if (!property || !HTML_INJECTION_PROPERTIES.has(property)) return;
        if (!isKnownSafeHtml(node.right, trustedNames)) report(node, `\`${property}\` is assigned unsanitised HTML`);
      },

      CallExpression(node: EsTreeNode) {
        const callee = node.callee;
        if (!callee) return;

        const method = memberPropertyName(callee);
        const argumentIndex = method ? HTML_PARSING_METHODS.get(method) : undefined;
        if (method && argumentIndex !== undefined) {
          const argument = node.arguments?.[argumentIndex];
          if (argument && !isKnownSafeHtml(argument, trustedNames)) report(node, `\`${method}()\` receives unsanitised HTML`);
          return;
        }

        if ((method === "write" || method === "writeln") && isDocumentObject(callee.object)) {
          if ((node.arguments as EsTreeNode[]).some((argument) => !isKnownSafeHtml(argument, trustedNames))) {
            report(node, `\`document.${method}()\` writes unsanitised HTML`);
          }
          return;
        }

        const name = callee.type === "Identifier" ? callee.name : method;
        if (name && RENDER_FUNCTIONS.has(name)) {
          for (const argument of node.arguments as EsTreeNode[]) {
            if (argument.type === "ObjectExpression") checkRenderProps(argument.properties, 0);
          }
        }
      },

      JSXAttribute(node: EsTreeNode) {
        if (node.name?.type !== "JSXIdentifier") return;
        const name: string = node.name.name;
        const container = node.value?.type === "JSXExpressionContainer" ? node.value.expression : null;
        if (!container) return; // Boolean or string-literal attribute: no dynamic markup.

        if (name === "dangerouslySetInnerHTML") {
          if (container.type !== "ObjectExpression") return report(node, "`dangerouslySetInnerHTML`");
          const html = (container.properties as EsTreeNode[]).find(
            (property) => property.type === "Property" && getStaticKeyName(property) === "__html",
          );
          if (html && !isKnownSafeHtml(html.value, trustedNames)) report(node, "`dangerouslySetInnerHTML`");
          return;
        }
        if (JSX_HTML_ATTRIBUTES.has(name) && !isKnownSafeHtml(container, trustedNames)) {
          report(node, `JSX \`${name}\` receives unsanitised HTML`);
        }
      },
    };
  },
});
