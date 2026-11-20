import {
  type A11yElement,
  ancestors,
  defineAccessibilityRule,
  hasNamingAttribute,
  isComponentRoot,
  isVisuallyRemoved,
  staticText,
} from "./helpers.js";

/** Input types that are not labelled through `<label>`: hidden, or named by their value / alt. */
const UNLABELLED_INPUT_TYPES: ReadonlySet<string> = new Set(["hidden", "submit", "reset", "button", "image"]);

/** Components that wrap a field and usually render its label (`<el-form-item label>`, `<UFormField>`). */
const FIELD_WRAPPER_NAME = /(?:form-?item|form-?field|form-?group|form-?control|field|label|input-?group)$/i;

/** Whether an `<input>` is labelled through `<label>`; a bound `:type` may be `hidden`, so it is not checked. */
const inputNeedsLabel = (element: A11yElement): boolean => {
  const type = element.attributes.get("type");
  if (!type) return true;
  if (type.kind === "dynamic") return false;
  return typeof type.value !== "string" || !UNLABELLED_INPUT_TYPES.has(type.value.trim().toLowerCase());
};

/** Whether the tree under `node` shows any text (or a `<slot>`) outside `control`. */
const hasTextOutside = (node: A11yElement, control: A11yElement): boolean =>
  node.children().some((child) => {
    if (child.type === "text") return child.text.trim() !== "";
    if (child.type === "expression") return true;
    if (child.element === control) return false;
    return child.element.name === "slot" || hasTextOutside(child.element, control);
  });

/**
 * A component that only wraps the control (`Checkbox.vue`: an `<input>` and a check icon): it shows no
 * text of its own, so its callers label it (`<label><Checkbox v-model="x" /> Remember me</label>`).
 */
const isControlWrapperComponent = (element: A11yElement): boolean => {
  let root = element;
  for (const ancestor of ancestors(element)) root = ancestor;
  return !hasTextOutside(root, element);
};

export default defineAccessibilityRule({
  meta: {
    id: "require-form-control-label",
    defaultSeverity: "off",
    confidence: "medium",
    since: "2.5.0",
    help: "Associate a `<label>` with the form control, or give it an `aria-label`",
    agentGuidance:
      "Give the control a visible label: wrap it (`<label>Email <input v-model=\"email\"></label>`) or point a label at its " +
      "id (`<label for=\"email\">Email</label><input id=\"email\">`). Text next to the control is not a label, and neither " +
      "is a `<label for>` whose id does not exist. When there is no room for visible text, add `aria-label` (or " +
      "`aria-labelledby` pointing at existing text). Without a label, screen readers announce only \"edit text\" or " +
      "\"combo box\". Not reported: controls with an `id` (a `<label for>` may point at it, also from another component), " +
      "a `placeholder` or `title`, controls inside a `<label>` or a field component (`<el-form-item>`, `<UFormField>`, any " +
      "component with a `label`), controls at the root of their component or in a component that shows no text of its own " +
      "(the caller labels it), hidden controls (`hidden`, `v-show=\"false\"`, `display: none`), file inputs with a `ref` " +
      "(opened by an upload button), a bound `:type`, and `v-bind=\"obj\"`.",
  },
  check: (element, report) => {
    if (!element.native || element.spread) return;
    if (element.name !== "select" && element.name !== "textarea" && !(element.name === "input" && inputNeedsLabel(element))) return;
    if (hasNamingAttribute(element) || element.attributes.has("placeholder") || isVisuallyRemoved(element)) return;
    // With an id, a `<label for>` may point at the control from this template or from another component.
    if (element.attributes.has("id")) return;
    // `<input ref="file" type="file">` is the hidden input behind an upload button that calls `file.click()`.
    if (staticText(element, "type") === "file" && element.attributes.has("ref")) return;
    if (isComponentRoot(element) || isControlWrapperComponent(element)) return;
    for (const ancestor of ancestors(element)) {
      if (ancestor.native && ancestor.name === "label") return;
      if (!ancestor.native && (ancestor.attributes.has("label") || FIELD_WRAPPER_NAME.test(ancestor.name))) return;
    }
    report(`\`<${element.name}>\` has no associated \`<label>\` or \`aria-label\` — screen readers cannot say what to enter`);
  },
});
