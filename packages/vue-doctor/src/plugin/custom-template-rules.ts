import type { Rule } from "eslint";
import { getStaticKeyName } from "./helpers.js";
import clickEventsHaveKeyEvents from "./rules/accessibility/click-events-have-key-events.js";
import { fromTemplateElement, type DefinedAccessibilityRule } from "./rules/accessibility/helpers.js";
import noAriaHiddenOnFocusable from "./rules/accessibility/no-aria-hidden-on-focusable.js";
import noInvalidAriaAttribute from "./rules/accessibility/no-invalid-aria-attribute.js";
import noInvalidRole from "./rules/accessibility/no-invalid-role.js";
import noPositiveTabindex from "./rules/accessibility/no-positive-tabindex.js";
import requireButtonName from "./rules/accessibility/require-button-name.js";
import requireFormControlLabel from "./rules/accessibility/require-form-control-label.js";
import requireIframeTitle from "./rules/accessibility/require-iframe-title.js";
import requireImgAlt from "./rules/accessibility/require-img-alt.js";
import requireLinkName from "./rules/accessibility/require-link-name.js";
import roleHasRequiredAriaProps from "./rules/accessibility/role-has-required-aria-props.js";
import { isTestFile } from "./test-files.js";
import { HTML_INJECTION_PROPERTIES, UNSAFE_HTML_MESSAGE, isKnownSafeHtml } from "./rules/security/helpers.js";
import type { EsTreeNode } from "./types.js";
import {
  JAVASCRIPT_PLACEHOLDER_MESSAGE,
  JAVASCRIPT_URL_MESSAGE,
  USER_CONTROLLED_URL_MESSAGE,
  findJavascriptUrlLiterals,
  isJavascriptNoopUrl,
  isJavascriptUrl,
  isStaticJavascriptPlaceholder,
  isUrlAttributeName,
  isUserControlledUrl,
} from "./url-sinks.js";

/**
 * Template-side implementations of Vue Doctor's own rules, run by the ESLint template analyzer
 * (see utils/run-eslint-vue.ts) next to eslint-plugin-vue. A rule here shares its registry entry,
 * and therefore its canonical ID, with the oxlint rule of the same name that covers `<script>`:
 * `vue-doctor/security/no-unsafe-html-sink` reports `v-html` from here and `innerHTML` from there.
 */

/** Name the rules are registered under in the ESLint config (`vue-doctor/<rule>`). */
export const CUSTOM_TEMPLATE_PLUGIN_NAME = "vue-doctor";

interface TemplateParserServices {
  defineTemplateBodyVisitor: (
    templateBodyVisitor: Record<string, (node: EsTreeNode) => void>,
    scriptVisitor?: Record<string, unknown>,
  ) => Record<string, unknown>;
}

const HTML_INJECTION_PROPERTIES_LOWER: ReadonlySet<string> = new Set(
  [...HTML_INJECTION_PROPERTIES].map((name) => name.toLowerCase()),
);

/** `v-bind:innerHTML="x"`, `:innerHTML.prop="x"` and `v-bind="{ innerHTML: x }"` bind HTML like `v-html` does. */
const boundHtmlExpressions = (attribute: EsTreeNode): EsTreeNode[] => {
  const expression: EsTreeNode | null | undefined = attribute.value?.expression;
  if (!expression) return [];
  const argument = attribute.key.argument;
  if (argument) {
    // vue-eslint-parser lower-cases HTML attribute names, so compare the written spelling case-insensitively.
    const written: string = argument.type === "VIdentifier" ? (argument.rawName ?? argument.name) : "";
    return HTML_INJECTION_PROPERTIES_LOWER.has(written.toLowerCase()) ? [expression] : [];
  }
  if (expression.type !== "ObjectExpression") return [];
  return (expression.properties as EsTreeNode[])
    .filter((property) => property.type === "Property" && HTML_INJECTION_PROPERTIES.has(getStaticKeyName(property) ?? ""))
    .map((property) => property.value);
};

const noUnsafeHtmlSink: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow binding unsanitised HTML with v-html / :innerHTML" },
    schema: [],
  },
  create(context) {
    const services = context.sourceCode.parserServices as unknown as Partial<TemplateParserServices>;
    // Without vue-eslint-parser (a plain script file) there is no template to visit.
    if (!services.defineTemplateBodyVisitor) return {};

    return services.defineTemplateBodyVisitor({
      "VAttribute[directive=true]"(attribute: EsTreeNode) {
        const directive: string = attribute.key.name.name;
        // Names are not proof of safety: only literals and direct sanitizer calls pass.
        const unsafe = (expressions: EsTreeNode[]): boolean =>
          expressions.some((expression) => !isKnownSafeHtml(expression));

        if (directive === "html") {
          const expression = attribute.value?.expression;
          if (expression && unsafe([expression])) {
            context.report({ node: attribute as never, message: `\`v-html\` renders unsanitised HTML — ${UNSAFE_HTML_MESSAGE}` });
          }
        } else if (directive === "bind" && unsafe(boundHtmlExpressions(attribute))) {
          context.report({ node: attribute as never, message: `\`v-bind\` of \`innerHTML\` renders unsanitised HTML — ${UNSAFE_HTML_MESSAGE}` });
        }
      },
    }) as Rule.RuleListener;
  },
};

/**
 * Bound URL values on an element: `:href="x"`, `v-bind:src="x"` and `v-bind="{ href: x }"`.
 * `:to` (router-link) is not a URL attribute, so it is never reported.
 */
const boundUrlExpressions = (attribute: EsTreeNode): EsTreeNode[] => {
  const expression: EsTreeNode | null | undefined = attribute.value?.expression;
  if (!expression) return [];
  const argument = attribute.key.argument;
  if (argument) {
    const written: string = argument.type === "VIdentifier" ? (argument.rawName ?? argument.name) : "";
    return isUrlAttributeName(written) ? [expression] : [];
  }
  if (expression.type !== "ObjectExpression") return [];
  return (expression.properties as EsTreeNode[])
    .filter((property) => property.type === "Property" && isUrlAttributeName(getStaticKeyName(property)))
    .map((property) => property.value);
};

/** Template rule that visits every attribute (static and bound) of the template. */
const urlAttributeRule = (
  description: string,
  check: (attribute: EsTreeNode, report: (message: string) => void) => void,
): Rule.RuleModule => ({
  meta: { type: "problem", docs: { description }, schema: [] },
  create(context) {
    const services = context.sourceCode.parserServices as unknown as Partial<TemplateParserServices>;
    if (!services.defineTemplateBodyVisitor) return {};
    return services.defineTemplateBodyVisitor({
      VAttribute(attribute: EsTreeNode) {
        check(attribute, (message) => context.report({ node: attribute as never, message }));
      },
    }) as Rule.RuleListener;
  },
});

const noJavascriptUrl = urlAttributeRule("Disallow javascript: URLs in URL attributes", (attribute, report) => {
  if (!attribute.directive) {
    // `<a href="javascript:void(0)">`
    const name: string = attribute.key.rawName ?? attribute.key.name;
    const value: unknown = attribute.value?.value;
    if (isUrlAttributeName(name) && typeof value === "string" && isJavascriptUrl(value)) {
      report(
        isJavascriptNoopUrl(value)
          ? `\`${name}="${value.trim()}"\` — ${JAVASCRIPT_PLACEHOLDER_MESSAGE}`
          : `\`${name}="javascript:…"\` — ${JAVASCRIPT_URL_MESSAGE}`,
      );
    }
  } else if (attribute.key.name.name === "bind") {
    // `<a :href="'javascript:void(0)'">`, `` :href="`javascript:${code}`" ``
    const literals = boundUrlExpressions(attribute).flatMap((expression) => findJavascriptUrlLiterals(expression));
    if (literals.length > 0) {
      report(
        isStaticJavascriptPlaceholder(literals)
          ? `bound \`javascript:void(0)\` placeholder — ${JAVASCRIPT_PLACEHOLDER_MESSAGE}`
          : `bound \`javascript:\` URL — ${JAVASCRIPT_URL_MESSAGE}`,
      );
    }
  }
});

const noUserControlledUrl = urlAttributeRule("Disallow binding user-controlled values as URLs", (attribute, report) => {
  if (!attribute.directive || attribute.key.name.name !== "bind") return;
  if (boundUrlExpressions(attribute).some((expression) => isUserControlledUrl(expression))) {
    report(`URL attribute bound to a user-controlled value — ${USER_CONTROLLED_URL_MESSAGE}`);
  }
});

/**
 * Accessibility rules check each template element with the same `checkElement` their oxlint side
 * runs on JSX (see rules/accessibility/helpers.ts). Like the oxlint side, they skip test files.
 */
const ACCESSIBILITY_RULES: readonly DefinedAccessibilityRule[] = [
  clickEventsHaveKeyEvents,
  noAriaHiddenOnFocusable,
  noInvalidAriaAttribute,
  noInvalidRole,
  noPositiveTabindex,
  requireButtonName,
  requireFormControlLabel,
  requireIframeTitle,
  requireImgAlt,
  requireLinkName,
  roleHasRequiredAriaProps,
];

const accessibilityTemplateRule = (rule: DefinedAccessibilityRule): Rule.RuleModule => ({
  meta: { type: "suggestion", docs: { description: rule.ruleMeta.help }, schema: [] },
  create(context) {
    const services = context.sourceCode.parserServices as unknown as Partial<TemplateParserServices>;
    if (!services.defineTemplateBodyVisitor || isTestFile(context.filename, context.cwd)) return {};
    return services.defineTemplateBodyVisitor({
      VElement(node: EsTreeNode) {
        rule.checkElement(fromTemplateElement(node), (message) => context.report({ node: node.startTag as never, message }));
      },
    }) as Rule.RuleListener;
  },
});

/** Custom template rules by flat rule name, which is also the name of the oxlint rule they extend. */
export const CUSTOM_TEMPLATE_RULES: Readonly<Record<string, Rule.RuleModule>> = {
  "no-unsafe-html-sink": noUnsafeHtmlSink,
  "no-javascript-url": noJavascriptUrl,
  "no-user-controlled-url": noUserControlledUrl,
  ...Object.fromEntries(ACCESSIBILITY_RULES.map((rule) => [rule.ruleMeta.id, accessibilityTemplateRule(rule)])),
};
