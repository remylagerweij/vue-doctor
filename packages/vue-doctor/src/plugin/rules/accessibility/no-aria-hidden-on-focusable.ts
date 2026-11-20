import { type A11yElement, defineAccessibilityRule, hasHref, isAriaHidden, staticText, staticValue } from "./helpers.js";

/** Focusable through the keyboard: natively, or with a non-negative `tabindex`. */
const isKeyboardFocusable = (element: A11yElement): boolean => {
  const tabindex = staticText(element, "tabindex");
  if (element.attributes.has("tabindex")) {
    // A bound tabindex is unknown; `tabindex="-1"` takes the element out of the tab order.
    if (tabindex === undefined) return false;
    return /^\+?\d+$/.test(tabindex);
  }
  if (element.attributes.has("disabled") && staticValue(element, "disabled") !== "false") {
    if (["button", "input", "select", "textarea"].includes(element.name)) return false;
  }
  switch (element.name) {
    case "a":
    case "area":
      return hasHref(element);
    case "button":
    case "select":
    case "textarea":
    case "summary":
      return true;
    case "input":
      return element.attributes.get("type")?.kind !== "dynamic" && staticText(element, "type") !== "hidden";
    default:
      return false;
  }
};

export default defineAccessibilityRule({
  meta: {
    id: "no-aria-hidden-on-focusable",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: 'Do not put `aria-hidden="true"` on an element that can receive keyboard focus',
    agentGuidance:
      "An element with `aria-hidden=\"true\"` is removed from the accessibility tree, but keyboard users can still tab to it — " +
      "screen readers then announce nothing. Either remove `aria-hidden` (when the control is meant to be used), or also " +
      "take it out of the focus order with `tabindex=\"-1\"` (or `disabled`, or `inert` on a hidden container) when it is " +
      "a decorative or duplicated control. Only native focusable elements (links with `href`, buttons, form controls, " +
      "`summary`, elements with `tabindex` 0 or higher) with a literal `aria-hidden=\"true\"` are reported.",
  },
  check: (element, report) => {
    if (!element.native || element.spread || !isAriaHidden(element) || !isKeyboardFocusable(element)) return;
    report(`\`aria-hidden="true"\` on a focusable \`<${element.name}>\` — keyboard users reach it but screen readers announce nothing`);
  },
});
