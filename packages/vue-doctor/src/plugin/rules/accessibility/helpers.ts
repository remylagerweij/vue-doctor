import { defineRule, type DefinedRule, type RuleMeta } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

/**
 * Accessibility rules check elements, not syntax. Each rule is written once against `A11yElement`,
 * a small view of an element that both Vue templates (vue-eslint-parser `VElement`, run by the
 * template analyzer through custom-template-rules.ts) and JSX / TSX render code (`JSXElement`, run
 * by oxlint) are adapted to. The view keeps what Vue makes uncertain explicit:
 *
 * - `:alt="x"` is a present attribute with a `dynamic` value; `:alt="'logo'"` is `static`.
 * - `v-bind="obj"`, `{...props}` and `:[name]` may bind anything: `spread` is set and rules that
 *   look for a missing attribute stay silent.
 * - Components (`<MyButton>`, `<component :is>`) are not `native`: only elements whose rendered
 *   HTML is certain are checked.
 */

export type AttributeValue =
  /** A literal value: `alt="logo"`, `:tabindex="1"` (as `"1"`), or a valueless attribute (`true`). */
  | { kind: "static"; value: string | true }
  /** A bound expression whose value is unknown: `:alt="image.title"`. */
  | { kind: "dynamic"; expression?: EsTreeNode };

export interface EventBinding {
  modifiers: readonly string[];
  /** The handler expression; `null` for `@click.stop` without a value. */
  handler: EsTreeNode | null;
}

export type A11yChild =
  | { type: "text"; text: string }
  /** `{{ value }}` / `{value}`: content that is only known at runtime. */
  | { type: "expression" }
  | { type: "element"; element: A11yElement };

export interface A11yElement {
  /** Tag name as written, lower-cased for native elements (`img`, `RouterLink`). */
  name: string;
  /** A known HTML element without `is`: what it renders is certain. */
  native: boolean;
  /** An SVG element (`<svg>`, `<title>`, `<use>`). */
  svg: boolean;
  /** Attributes by lower-cased name (`for` for `htmlFor`, `tabindex` for `tabIndex`). */
  attributes: ReadonlyMap<string, AttributeValue>;
  /** Event bindings by lower-cased name: `click`, `keydown`. */
  events: ReadonlyMap<string, EventBinding>;
  /** Attributes that cannot be listed are bound (`v-bind="obj"`, `{...props}`, `:[name]`). */
  spread: boolean;
  /** Listeners that cannot be listed are bound (`v-on="listeners"`). */
  eventSpread: boolean;
  /** Content is set from script: `v-html`, `v-text`, `innerHTML`. */
  contentBinding: boolean;
  children: () => readonly A11yChild[];
  /** The nearest enclosing element, skipping transparent `<template>` wrappers; `null` at the root. */
  parent: () => A11yElement | null;
}

export type ElementCheck = (element: A11yElement, report: (message: string) => void) => void;

const HTML_ELEMENTS: ReadonlySet<string> = new Set(
  (
    "a abbr address area article aside audio b bdi bdo blockquote br button canvas caption cite code col colgroup " +
    "data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 " +
    "h5 h6 header hgroup hr i iframe img input ins kbd label legend li main map mark menu meter nav noscript object " +
    "ol optgroup option output p picture pre progress q rp rt ruby s samp search section select small source span " +
    "strong sub summary sup table tbody td textarea tfoot th thead time tr track u ul var video wbr"
  ).split(" "),
);

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------------------------------------
// Shared predicates
// ---------------------------------------------------------------------------------------------

export const staticValue = (element: A11yElement, name: string): string | true | undefined => {
  const attribute = element.attributes.get(name);
  return attribute?.kind === "static" ? attribute.value : undefined;
};

/** A static string value, trimmed and lower-cased; `undefined` when absent, valueless or bound. */
export const staticText = (element: A11yElement, name: string): string | undefined => {
  const value = staticValue(element, name);
  return typeof value === "string" ? value.trim().toLowerCase() : undefined;
};

/** `aria-hidden="true"` (or `:aria-hidden="true"`): the element is removed from the accessibility tree. */
export const isAriaHidden = (element: A11yElement): boolean => staticText(element, "aria-hidden") === "true";

/** Not rendered at all: the `hidden` attribute. */
export const hasHiddenAttribute = (element: A11yElement): boolean => {
  const value = staticValue(element, "hidden");
  return value === true || (typeof value === "string" && value.trim().toLowerCase() !== "false");
};

/** An attribute that is present with a bound value or a non-empty literal. */
const hasNonEmpty = (element: A11yElement, name: string): boolean => {
  const attribute = element.attributes.get(name);
  if (!attribute) return false;
  return attribute.kind === "dynamic" || (typeof attribute.value === "string" && attribute.value.trim() !== "");
};

/** Named by an attribute: `aria-label`, `aria-labelledby` or `title` (bound or non-empty). */
export const hasNamingAttribute = (element: A11yElement): boolean =>
  hasNonEmpty(element, "aria-label") || hasNonEmpty(element, "aria-labelledby") || hasNonEmpty(element, "title");

/** Whether a bound or static `href` is present. */
export const hasHref = (element: A11yElement): boolean => element.attributes.has("href");

const LINK_COMPONENTS: ReadonlySet<string> = new Set(["routerlink", "router-link", "nuxtlink", "nuxt-link"]);

/** `<RouterLink>` / `<NuxtLink>` without `custom`: always rendered as an `<a href>` around the slot. */
export const isLinkComponent = (element: A11yElement): boolean =>
  !element.native && LINK_COMPONENTS.has(element.name.toLowerCase()) && !element.attributes.has("custom");

const INTERACTIVE_COMPONENT_NAME = /(?:button|btn|link|input|checkbox|radio|switch|select|toggle|menu-?item|tab)$/i;

/**
 * Elements a user can already focus or activate: native controls, links, anything with a
 * `tabindex` or `contenteditable`, and components whose name says they are a control (`BaseButton`,
 * `RouterLink`, `v-checkbox`).
 */
export const isInteractive = (element: A11yElement): boolean => {
  if (!element.native) {
    return isLinkComponent(element) || INTERACTIVE_COMPONENT_NAME.test(element.name);
  }
  if (element.attributes.has("tabindex") || element.attributes.has("contenteditable")) return true;
  switch (element.name) {
    case "a":
    case "area":
      return hasHref(element);
    case "button":
    case "select":
    case "textarea":
    case "summary":
    case "iframe":
    case "label":
      return true;
    case "input":
      return staticText(element, "type") !== "hidden";
    case "audio":
    case "video":
      return element.attributes.has("controls");
    default:
      return false;
  }
};

/**
 * A root element of its component (or of a render function's JSX tree). The parent's attributes
 * and listeners fall through to it (`<IconButton aria-label="Close" @keydown.enter="…">`), so a
 * missing `aria-label`, `alt`, `aria-checked` or key handler may be supplied by every caller.
 */
/** Whether the element carries `inert`, or sits inside an inert subtree: it cannot be focused. */
export const isInert = (element: A11yElement): boolean => {
  for (let current: A11yElement | null = element; current; current = current.parent()) {
    if (current.attributes.has("inert") && staticValue(current, "inert") !== "false") return true;
  }
  return false;
};

/** Appended to the agent guidance of the rules that skip component roots. */
export const ROOT_ELEMENT_NOTE =
  "The root element of a component is not reported: attributes and listeners the parent passes fall through to it.";

export const isComponentRoot = (element: A11yElement): boolean => element.parent() === null;

export function* descendants(element: A11yElement): Generator<A11yElement> {
  for (const child of element.children()) {
    if (child.type !== "element") continue;
    yield child.element;
    yield* descendants(child.element);
  }
}

export function* ancestors(element: A11yElement): Generator<A11yElement> {
  for (let current = element.parent(); current; current = current.parent()) yield current;
}

/** Whether the contents give the element an accessible name. */
export type ContentName = "present" | "empty";

/**
 * Name from content, as the accessible-name algorithm computes it for links and buttons, with every
 * unknown counted as a name: text and `{{ }}` interpolations, components and `<slot>`s (they may
 * render text), `v-html` / `v-text`, descendants with `aria-label` / `title`, `<img>` with a non-empty
 * or bound `alt` (and `<img>` without `alt`, which `require-img-alt` reports) and `<svg>` with a
 * `<title>`. Icons (`<i class="icon">`, a bare `<svg>`) and `aria-hidden` content give no name.
 */
export const contentName = (element: A11yElement): ContentName =>
  element.children().some((child) => childHasName(child)) ? "present" : "empty";

const childHasName = (child: A11yChild): boolean => {
  if (child.type === "text") return child.text.trim() !== "";
  if (child.type === "expression") return true;
  const element = child.element;
  if (isAriaHidden(element) || hasHiddenAttribute(element)) return false;
  if (element.spread || element.contentBinding || hasNamingAttribute(element)) return true;
  if (element.svg) {
    if (element.name === "title" || element.name === "text") return contentName(element) === "present";
    return element.children().some((grandChild) => childHasName(grandChild));
  }
  if (!element.native) return element.name !== "template" || contentName(element) === "present";
  if (element.name === "img" || (element.name === "input" && staticText(element, "type") === "image")) {
    const alt = element.attributes.get("alt");
    // `alt=""` is decorative and gives no name; a missing `alt` is require-img-alt's finding.
    return !alt || alt.kind === "dynamic" || (typeof alt.value === "string" && alt.value.trim() !== "");
  }
  return contentName(element) === "present";
};

/** Elements that never render: hidden, `aria-hidden`, or `display: none` through a common class or inline style. */
const HIDDEN_CLASSES: ReadonlySet<string> = new Set(["hidden", "d-none", "is-hidden", "display-none", "hide"]);

export const isVisuallyRemoved = (element: A11yElement): boolean => {
  if (hasHiddenAttribute(element) || isAriaHidden(element) || staticValue(element, "v-show") === "false") return true;
  const classes = staticText(element, "class")?.split(/\s+/) ?? [];
  if (classes.some((name) => HIDDEN_CLASSES.has(name))) return true;
  const style = staticText(element, "style")?.replace(/\s+/g, "") ?? "";
  return /(?:^|;)display:none/.test(style) || /(?:^|;)visibility:hidden/.test(style);
};

// ---------------------------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------------------------

/** The value of a literal expression, or `undefined` for anything that is only known at runtime. */
const literalValue = (expression: EsTreeNode | null | undefined): string | undefined => {
  if (!expression) return undefined;
  if (expression.type === "Literal") {
    const value: unknown = expression.value;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : undefined;
  }
  if (expression.type === "TemplateLiteral" && expression.expressions.length === 0) {
    return expression.quasis[0]?.value?.cooked ?? undefined;
  }
  return undefined;
};

const toAttributeValue = (expression: EsTreeNode | null | undefined): AttributeValue => {
  const value = literalValue(expression);
  return value === undefined ? { kind: "dynamic", expression: expression ?? undefined } : { kind: "static", value };
};

/**
 * `class` and `style` may be written both statically and bound (`class="row" :class="{ active }"`):
 * the static value stays under its name and the bound one is kept under `:class` / `:style`.
 */
const setAttribute = (attributes: Map<string, AttributeValue>, name: string, value: AttributeValue): void => {
  if (name === "class" || name === "style") {
    const existing = attributes.get(name);
    if (value.kind === "dynamic" && existing?.kind === "static") {
      attributes.set(`:${name}`, value);
      return;
    }
    if (value.kind === "static" && existing?.kind === "dynamic") attributes.set(`:${name}`, existing);
  }
  attributes.set(name, value);
};

/** Custom directives that set an element's content: `v-dompurify-html`, `v-safe-html`, `v-sanitize-html`. */
const CONTENT_DIRECTIVE = /(?:^|-)(?:html|text)$/;

const CONTENT_PROPERTIES: ReadonlySet<string> = new Set(["innerhtml", "textcontent", "innertext", "v-html", "v-text"]);

const TRANSPARENT_WRAPPERS: ReadonlySet<string> = new Set(["template", "transition", "keepalive", "keep-alive"]);

const templateCache = new WeakMap<EsTreeNode, A11yElement>();

/** Adapts a vue-eslint-parser `VElement`. */
export const fromTemplateElement = (node: EsTreeNode): A11yElement => {
  const cached = templateCache.get(node);
  if (cached) return cached;

  const attributes = new Map<string, AttributeValue>();
  const events = new Map<string, EventBinding>();
  let spread = false;
  let eventSpread = false;
  let contentBinding = false;
  let hasIs = false;

  for (const attribute of node.startTag?.attributes ?? []) {
    if (!attribute.directive) {
      const name = String(attribute.key.rawName ?? attribute.key.name).toLowerCase();
      if (name === "is") hasIs = true;
      setAttribute(attributes, name, attribute.value ? { kind: "static", value: String(attribute.value.value) } : { kind: "static", value: true });
      continue;
    }
    const directive: string = attribute.key.name?.name ?? "";
    const argument: EsTreeNode | null = attribute.key.argument;
    const expression: EsTreeNode | null = attribute.value?.expression ?? null;
    if (directive === "bind") {
      if (!argument) {
        // `v-bind="{ alt: x }"` lists its keys; anything else may bind any attribute.
        if (expression?.type === "ObjectExpression") {
          for (const property of expression.properties as EsTreeNode[]) {
            const key = property.type === "Property" && !property.computed ? property.key : null;
            const keyName = key?.type === "Identifier" ? key.name : key?.type === "Literal" ? String(key.value) : null;
            if (!keyName) {
              spread = true;
              continue;
            }
            const lower = keyName.toLowerCase();
            if (/^on[a-z]/i.test(keyName) && keyName.length > 2) events.set(keyName.slice(2).toLowerCase(), { modifiers: [], handler: property.value });
            else setAttribute(attributes, lower, toAttributeValue(property.value));
          }
        } else {
          spread = true;
        }
      } else if (argument.type !== "VIdentifier") {
        spread = true; // `:[name]="value"`
      } else {
        const name = String(argument.rawName ?? argument.name).toLowerCase();
        if (name === "is") hasIs = true;
        if (CONTENT_PROPERTIES.has(name)) contentBinding = true;
        // `<img :alt>` (Vue 3.4 same-name shorthand) binds the variable `alt`.
        setAttribute(attributes, name, expression ? toAttributeValue(expression) : { kind: "dynamic" });
      }
    } else if (directive === "on") {
      if (!argument || argument.type !== "VIdentifier") {
        eventSpread = true;
      } else {
        events.set(String(argument.rawName ?? argument.name).toLowerCase(), {
          modifiers: (attribute.key.modifiers as EsTreeNode[]).map((modifier) => String(modifier.name)),
          handler: expression,
        });
      }
    } else if (directive === "t" || CONTENT_DIRECTIVE.test(directive)) {
      // vue-i18n's `v-t` sets the element's text.
      contentBinding = true;
    } else if (directive === "show") {
      // Kept so that `v-show="false"` (never displayed) counts as visually removed.
      attributes.set("v-show", toAttributeValue(expression));
    } else if (directive === "is") {
      hasIs = true;
    }
  }

  const rawName: string = node.rawName ?? node.name;
  const namespace: string | undefined = node.namespace;
  const svg = namespace === SVG_NAMESPACE;
  const native = !svg && (namespace === undefined || namespace === HTML_NAMESPACE) && HTML_ELEMENTS.has(rawName) && !hasIs;

  let children: A11yChild[] | undefined;
  const element: A11yElement = {
    name: native || svg ? rawName.toLowerCase() : rawName,
    native,
    svg,
    attributes,
    events,
    spread,
    eventSpread,
    contentBinding,
    children: () =>
      (children ??= (node.children as EsTreeNode[]).map((child): A11yChild => {
        if (child.type === "VElement") return { type: "element", element: fromTemplateElement(child) };
        if (child.type === "VExpressionContainer") return { type: "expression" };
        return { type: "text", text: String(child.value ?? "") };
      })),
    parent: () => {
      for (let current = node.parent; current?.type === "VElement"; current = current.parent) {
        // `<template v-if>` wrappers and the SFC's root `<template>` render nothing themselves.
        // `<Transition>` / `<KeepAlive>` render only their child, so attributes fall through it too.
        if (!TRANSPARENT_WRAPPERS.has(String(current.rawName ?? current.name).toLowerCase())) return fromTemplateElement(current);
      }
      return null;
    },
  };
  templateCache.set(node, element);
  return element;
};

const JSX_ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = {
  classname: "class",
  htmlfor: "for",
};

const jsxName = (name: EsTreeNode): string | null => {
  if (name?.type === "JSXIdentifier") return name.name;
  if (name?.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
  return null;
};

const jsxCache = new WeakMap<EsTreeNode, A11yElement>();

const jsxChildren = (children: readonly EsTreeNode[]): A11yChild[] =>
  children.flatMap((child): A11yChild[] => {
    if (child.type === "JSXElement") return [{ type: "element", element: fromJsxElement(child) }];
    if (child.type === "JSXFragment") return jsxChildren(child.children);
    if (child.type === "JSXText") return [{ type: "text", text: String(child.value ?? "") }];
    if (child.type === "JSXExpressionContainer" && child.expression?.type === "JSXEmptyExpression") return [];
    return [{ type: "expression" }];
  });

/** Adapts a `JSXElement` (Vue JSX / TSX render code). */
export const fromJsxElement = (node: EsTreeNode): A11yElement => {
  const cached = jsxCache.get(node);
  if (cached) return cached;

  const attributes = new Map<string, AttributeValue>();
  const events = new Map<string, EventBinding>();
  let spread = false;
  let contentBinding = false;

  for (const attribute of node.openingElement.attributes as EsTreeNode[]) {
    if (attribute.type === "JSXSpreadAttribute") {
      spread = true;
      continue;
    }
    const written = jsxName(attribute.name);
    if (!written) continue;
    const value: EsTreeNode | null = attribute.value;
    if (/^on[A-Z]/.test(written)) {
      events.set(written.slice(2).toLowerCase(), {
        modifiers: [],
        handler: value?.type === "JSXExpressionContainer" ? value.expression : value,
      });
      continue;
    }
    const lower = written.toLowerCase();
    const name = JSX_ATTRIBUTE_ALIASES[lower] ?? lower;
    if (CONTENT_PROPERTIES.has(name) || name === "domPropsInnerHTML".toLowerCase()) contentBinding = true;
    if (value === null) attributes.set(name, { kind: "static", value: true });
    else if (value.type === "Literal") attributes.set(name, { kind: "static", value: String(value.value) });
    else if (value.type === "JSXExpressionContainer") {
      if (value.expression?.type !== "JSXEmptyExpression") attributes.set(name, toAttributeValue(value.expression));
    } else attributes.set(name, { kind: "dynamic" });
  }

  const tag = jsxName(node.openingElement.name) ?? "";
  const native = HTML_ELEMENTS.has(tag) && !attributes.has("is");
  const svg = !native && (tag === "svg" || tag === "title" || tag === "use" || tag === "path" || tag === "g");

  const jsxParent = (): EsTreeNode | null => {
    for (let current = node.parent; current; current = current.parent) {
      if (current.type === "JSXElement") return current;
    }
    return null;
  };

  let children: A11yChild[] | undefined;
  const element: A11yElement = {
    name: tag,
    native,
    svg,
    attributes,
    events,
    spread,
    eventSpread: false,
    contentBinding,
    children: () => (children ??= jsxChildren(node.children)),
    parent: () => {
      const parent = jsxParent();
      return parent ? fromJsxElement(parent) : null;
    },
  };
  jsxCache.set(node, element);
  return element;
};

// ---------------------------------------------------------------------------------------------
// Rule definition
// ---------------------------------------------------------------------------------------------

type AccessibilityRuleMeta = Omit<RuleMeta, "engine" | "category" | "frameworks" | "fixable" | "skipTestFiles">;

/** An accessibility rule: oxlint runs `check` on JSX, the template analyzer on `<template>`. */
export interface DefinedAccessibilityRule extends DefinedRule {
  checkElement: ElementCheck;
}

export const defineAccessibilityRule = ({
  meta,
  check,
}: {
  meta: AccessibilityRuleMeta;
  check: ElementCheck;
}): DefinedAccessibilityRule => ({
  ...defineRule({
    meta: { ...meta, category: "Accessibility", frameworks: ["vue", "nuxt"], fixable: false, skipTestFiles: true },
    create: (context: RuleContext) => ({
      JSXElement(node: EsTreeNode) {
        check(fromJsxElement(node), (message) => context.report({ node: node.openingElement, message }));
      },
    }),
  }),
  checkElement: check,
});
