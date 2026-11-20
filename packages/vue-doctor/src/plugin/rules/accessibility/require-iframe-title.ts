import {
  defineAccessibilityRule,
  hasHiddenAttribute,
  hasNamingAttribute,
  isAriaHidden,
  isComponentRoot,
  ROOT_ELEMENT_NOTE,
} from "./helpers.js";

export default defineAccessibilityRule({
  meta: {
    id: "require-iframe-title",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: "Give the `<iframe>` a `title` that describes its content",
    agentGuidance:
      "Add a short, unique `title` to the `<iframe>` that says what it contains (`title=\"Store location map\"`, " +
      "`:title=\"video.title\"`). Screen reader users find and enter frames by this title. An `aria-label` or `aria-labelledby` " +
      "also works. For an iframe without user-facing content (a tracking or messaging frame), hide it with " +
      "`aria-hidden=\"true\"` and `tabindex=\"-1\"` instead." +
      ` ${ROOT_ELEMENT_NOTE}`,
  },
  check: (element, report) => {
    if (!element.native || element.name !== "iframe" || element.spread || isComponentRoot(element)) return;
    if (hasNamingAttribute(element) || isAriaHidden(element) || hasHiddenAttribute(element)) return;
    report("`<iframe>` has no `title` — screen reader users cannot tell what the frame contains");
  },
});
