import { defineAccessibilityRule, staticText } from "./helpers.js";

export default defineAccessibilityRule({
  meta: {
    id: "no-positive-tabindex",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: 'Use `tabindex="0"` (or none) instead of a positive `tabindex`, and order focus through the DOM order',
    agentGuidance:
      "Replace the positive `tabindex` with `tabindex=\"0\"` (focusable in document order), or remove it from elements that are " +
      "focusable already (links, buttons, form controls). If the focus order is wrong, reorder the elements in the template " +
      "and position them with CSS instead. A positive value moves the element ahead of everything else on the page. " +
      "Only literal values (`tabindex=\"2\"`, `:tabindex=\"2\"`) on native elements are reported.",
  },
  check: (element, report) => {
    if (!element.native) return;
    const value = staticText(element, "tabindex");
    if (value === undefined || !/^\+?\d+$/.test(value) || Number(value) <= 0) return;
    report(`\`tabindex="${value}"\` takes the element out of the natural focus order — use \`tabindex="0"\` or none`);
  },
});
