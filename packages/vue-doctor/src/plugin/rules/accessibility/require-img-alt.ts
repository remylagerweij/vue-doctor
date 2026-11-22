import {
  defineAccessibilityRule,
  hasHref,
  hasNamingAttribute,
  isAriaHidden,
  isComponentRoot,
  ROOT_ELEMENT_NOTE,
  staticText,
} from "./helpers.js";

export default defineAccessibilityRule({
  meta: {
    id: "require-img-alt",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: 'Give the image an `alt` text, or `alt=""` when it is purely decorative',
    agentGuidance:
      "Add an `alt` attribute that says what the image shows or does (`alt=\"Company logo\"`, or `:alt=\"product.name\"`). " +
      'For a purely decorative image use an empty `alt=""` so screen readers skip it. For `<input type="image">` the `alt` ' +
      "names the button; for `<area href>` it names the link. Do not start with words like \"image of\". " +
      "Only native `<img>`, `<area href>` and `<input type=\"image\">` elements without `v-bind=\"obj\"` are reported; " +
      "a bound `:alt`, an `aria-label`, `aria-labelledby`, `title`, `role=\"presentation\"` or `aria-hidden=\"true\"` counts as handled." +
      ` ${ROOT_ELEMENT_NOTE}`,
  },
  check: (element, report) => {
    if (!element.native || element.spread || isComponentRoot(element)) return;
    const kind =
      element.name === "img"
        ? "<img>"
        : element.name === "area" && hasHref(element)
          ? "<area href>"
          : element.name === "input" && staticText(element, "type") === "image"
            ? '<input type="image">'
            : null;
    if (!kind) return;
    if (element.attributes.has("alt") || hasNamingAttribute(element) || isAriaHidden(element)) return;
    const role = staticText(element, "role");
    if (kind === "<img>" && (role === "presentation" || role === "none")) return;
    report(`\`${kind}\` has no \`alt\` text — screen readers announce the file name or nothing at all`);
  },
});
