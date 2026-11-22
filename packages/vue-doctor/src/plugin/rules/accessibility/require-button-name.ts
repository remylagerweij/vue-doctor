import {
  contentName,
  defineAccessibilityRule,
  hasHiddenAttribute,
  hasNamingAttribute,
  isAriaHidden,
  isComponentRoot,
  ROOT_ELEMENT_NOTE,
} from "./helpers.js";

export default defineAccessibilityRule({
  meta: {
    id: "require-button-name",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: "Give the button text, or an `aria-label` when it only shows an icon",
    agentGuidance:
      "Screen readers announce a button by its text. For an icon-only button add an `aria-label` that says what it does " +
      "(`aria-label=\"Close dialog\"`, `:aria-label=\"t('menu.open')\"`) or visually hidden text " +
      "(`<span class=\"sr-only\">Close</span>`), and mark the icon `aria-hidden=\"true\"`. A `title` alone also gives a name. " +
      "Reported only for native `<button>` elements whose content has no text: text, `{{ }}`, components, slots, " +
      "`v-html`/`v-text`, an `<img>` with `alt` and an `<svg>` with a `<title>` all count as a name." +
      ` ${ROOT_ELEMENT_NOTE}`,
  },
  check: (element, report) => {
    if (!element.native || element.name !== "button" || element.spread || element.contentBinding) return;
    if (isComponentRoot(element)) return;
    if (hasNamingAttribute(element) || isAriaHidden(element) || hasHiddenAttribute(element)) return;
    if (contentName(element) === "present") return;
    report("`<button>` has no text or `aria-label` — screen readers announce only \"button\"");
  },
});
