import { ABSTRACT_ARIA_ROLES, ARIA_ROLES } from "../../aria.js";
import { defineAccessibilityRule, staticText } from "./helpers.js";

export default defineAccessibilityRule({
  meta: {
    id: "no-invalid-role",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: "Use a concrete WAI-ARIA role (`button`, `dialog`, `navigation`…); unknown and abstract roles are ignored",
    agentGuidance:
      "Replace the value of `role` with a concrete WAI-ARIA role that describes the element (for example `button`, `link`, " +
      "`dialog`, `tab`, `navigation`), or remove `role` when the native element already has the right semantics (prefer " +
      "`<button>` over `<div role=\"button\">`). Abstract roles such as `widget`, `section`, `input` or `landmark` are not " +
      "allowed in content, and misspelled roles fall back to no role at all. Every token of a space-separated fallback list " +
      "must be valid. Only literal values on native HTML and SVG elements are checked; bound `:role` values are not.",
  },
  check: (element, report) => {
    if ((!element.native && !element.svg) || element.spread) return;
    const value = staticText(element, "role");
    if (!value) return;
    for (const token of value.split(/\s+/)) {
      if (ARIA_ROLES.has(token)) continue;
      report(
        ABSTRACT_ARIA_ROLES.has(token)
          ? `\`role="${token}"\` is an abstract WAI-ARIA role and must not be used in content`
          : `\`role="${token}"\` is not a WAI-ARIA role, so assistive technology ignores it`,
      );
    }
  },
});
