import type { EsTreeNode } from "../../types.js";
import {
  type A11yElement,
  ancestors,
  defineAccessibilityRule,
  descendants,
  isAriaHidden,
  isComponentRoot,
  isInteractive,
  isVisuallyRemoved,
  ROOT_ELEMENT_NOTE,
  staticText,
} from "./helpers.js";

/** Native elements without an interactive role of their own. */
const NON_INTERACTIVE_ELEMENTS: ReadonlySet<string> = new Set(
  (
    "div span p li ul ol dl dt dd img section article header footer aside nav main h1 h2 h3 h4 h5 h6 " +
    "td th tr table tbody thead tfoot figure figcaption i b strong em small blockquote pre code"
  ).split(" "),
);

const KEY_EVENTS = ["keydown", "keyup", "keypress"];

/** Class names of the backdrop behind a dialog or drawer: clicking it is a mouse shortcut for Escape. */
const BACKDROP_CLASS =
  /(?:^|[-_])(?:overlay|backdrop|mask|scrim|curtain|underlay|dimmer)(?:$|[-_])|^(?:drawer|modal|dialog|sidebar|menu|popup|popover)[-_]?(?:bg|background)$/;

/** `@click.stop` with no value, `@click="$event.stopPropagation()"`, `(e) => e.stopPropagation()`. */
const onlyStopsEvent = (handler: EsTreeNode | null): boolean => {
  if (!handler) return true;
  let body = handler;
  // vue-eslint-parser wraps inline handlers (`@click="a(); b()"`) in a VOnExpression of statements.
  if (body.type === "VOnExpression") {
    if (body.body.length !== 1) return body.body.length === 0;
    body = body.body[0];
  }
  if (body.type === "ArrowFunctionExpression" || body.type === "FunctionExpression") {
    body = body.body?.type === "BlockStatement" && body.body.body.length === 1 ? body.body.body[0] : body.body;
  }
  if (body?.type === "ExpressionStatement") body = body.expression;
  if (body?.type !== "CallExpression") return false;
  const callee = body.callee;
  return (
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    (callee.property?.name === "stopPropagation" || callee.property?.name === "preventDefault")
  );
};

/** A backdrop class, or an empty element stretched over its container (`<div class="fixed inset-0 bg-black/50" />`). */
const isBackdrop = (element: A11yElement): boolean => {
  const classes = staticText(element, "class")?.split(/\s+/) ?? [];
  if (classes.some((name) => BACKDROP_CLASS.test(name))) return true;
  const empty = element.children().every((child) => child.type === "text" && child.text.trim() === "");
  return empty && classes.includes("inset-0");
};

/** `selectedIndex`, `activeIdx`, `highlightedIndex`: the cursor of a list navigated with the arrow keys. */
const KEYBOARD_CURSOR = /^(?:selected|active|highlight(?:ed)?|focus(?:ed)?|hover(?:ed)?|current|keyboard)\w*(?:index|idx)$/i;

const referencesKeyboardCursor = (node: unknown): boolean => {
  if (!node || typeof node !== "object") return false;
  const candidate = node as EsTreeNode;
  if (candidate.type === "Identifier" && KEYBOARD_CURSOR.test(candidate.name)) return true;
  if (candidate.type === "MemberExpression" && !candidate.computed && KEYBOARD_CURSOR.test(candidate.property?.name ?? "")) return true;
  return Object.entries(candidate).some(
    ([key, value]) => key !== "parent" && key !== "loc" && key !== "range" && typeof value === "object" && referencesKeyboardCursor(value),
  );
};

/**
 * A list item highlighted by a keyboard cursor (`:class="{ active: i === selectedIndex }"`): the list
 * (or its search input) handles the arrow keys and Enter, so the item is keyboard-operable.
 */
const isKeyboardNavigatedItem = (element: A11yElement): boolean =>
  ["class", ":class", "aria-selected", "data-active"].some((name) => {
    const value = element.attributes.get(name);
    return value?.kind === "dynamic" && referencesKeyboardCursor(value.expression);
  });

export default defineAccessibilityRule({
  meta: {
    id: "click-events-have-key-events",
    defaultSeverity: "off",
    confidence: "medium",
    since: "2.5.0",
    help: "Use a `<button>` (or a link) for clickable elements; a `<div @click>` cannot be reached or used with the keyboard",
    agentGuidance:
      "Replace the clickable `<div>`/`<span>`/`<li>`/`<img>` with a native `<button type=\"button\">` (for actions) or an " +
      "`<a href>` / `<RouterLink>` (for navigation), and reset its styles with CSS if needed — native controls are focusable " +
      "and react to Enter and Space by themselves. If the element must stay, add `role=\"button\"`, `tabindex=\"0\"` and a " +
      "`@keydown.enter` / `@keydown.space` handler that calls the same function. Not reported: elements with a `role` or a " +
      "key handler, `@click.self` and backdrop/overlay elements (dismissed with Escape), handlers that only stop the event, " +
      "elements inside a link, button or label, elements that wrap a control, a `<slot>` or `v-html` content (the click " +
      "is delegated), list items highlighted by a keyboard cursor (`:class=\"{ active: i === selectedIndex }\"`), " +
      "components, and elements with `v-bind=\"obj\"` / `v-on=\"obj\"`." +
      ` ${ROOT_ELEMENT_NOTE}`,
  },
  check: (element, report) => {
    if (!element.native || !NON_INTERACTIVE_ELEMENTS.has(element.name) || isComponentRoot(element)) return;
    const click = element.events.get("click");
    if (!click || onlyStopsEvent(click.handler) || click.modifiers.includes("self")) return;
    if (element.spread || element.eventSpread || KEY_EVENTS.some((name) => element.events.has(name))) return;
    if (element.attributes.has("role") || isAriaHidden(element) || isVisuallyRemoved(element) || isBackdrop(element)) return;
    if (element.contentBinding || isKeyboardNavigatedItem(element)) return;
    // Delegation: the keyboard user operates the control inside, whose click bubbles up here.
    for (const descendant of descendants(element)) {
      if (isInteractive(descendant) || descendant.contentBinding || (descendant.name === "slot" && !descendant.native)) return;
    }
    for (const ancestor of ancestors(element)) if (isInteractive(ancestor) || ancestor.attributes.has("role")) return;
    report(`\`<${element.name}>\` with a click handler but no keyboard handler or role — keyboard users cannot activate it`);
  },
});
