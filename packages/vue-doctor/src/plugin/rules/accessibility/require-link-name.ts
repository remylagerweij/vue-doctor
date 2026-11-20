import {
  contentName,
  defineAccessibilityRule,
  hasHiddenAttribute,
  hasHref,
  hasNamingAttribute,
  isAriaHidden,
  isComponentRoot,
  isLinkComponent,
  ROOT_ELEMENT_NOTE,
} from "./helpers.js";

export default defineAccessibilityRule({
  meta: {
    id: "require-link-name",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: "Give the link text, or an `aria-label` when it only shows an icon or image",
    agentGuidance:
      "Screen readers announce a link by its text. For an icon-only or image-only link add an `aria-label` that says where it " +
      "goes (`aria-label=\"Open settings\"`), give the image a meaningful `alt`, or add visually hidden text " +
      "(`<span class=\"sr-only\">Settings</span>`). Mark the icon itself `aria-hidden=\"true\"`. Reported for `<a href>`, " +
      "`<RouterLink>` and `<NuxtLink>` (without `custom`) whose content has no text: text, `{{ }}`, components, slots, " +
      "`v-html`/`v-text`, an `<img>` with `alt` and an `<svg>` with a `<title>` all count as a name." +
      ` ${ROOT_ELEMENT_NOTE}`,
  },
  check: (element, report) => {
    const isLink = element.native ? element.name === "a" && hasHref(element) : isLinkComponent(element);
    if (!isLink || element.spread || element.contentBinding || isComponentRoot(element)) return;
    if (hasNamingAttribute(element) || isAriaHidden(element) || hasHiddenAttribute(element)) return;
    if (contentName(element) === "present") return;
    report(`\`<${element.name}>\` has no text or \`aria-label\` — screen readers announce only "link" or the URL`);
  },
});
