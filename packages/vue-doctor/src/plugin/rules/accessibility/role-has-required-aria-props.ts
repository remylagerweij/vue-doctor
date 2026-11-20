import { defineAccessibilityRule, isComponentRoot, ROOT_ELEMENT_NOTE, staticText } from "./helpers.js";

/**
 * States a role cannot work without and that have no implicit default (WAI-ARIA 1.2 "required
 * states and properties"). Roles whose required value has a usable default (`heading` →
 * `aria-level` 2, `option`, `scrollbar`) are left out.
 */
const REQUIRED_PROPS: Readonly<Record<string, readonly string[]>> = {
  checkbox: ["aria-checked"],
  radio: ["aria-checked"],
  switch: ["aria-checked"],
  menuitemcheckbox: ["aria-checked"],
  menuitemradio: ["aria-checked"],
  slider: ["aria-valuenow"],
  combobox: ["aria-expanded"],
};

/** Native elements that already expose the state the role needs (`<input type="checkbox" role="switch">`). */
const providesStateNatively = (name: string, type: string | undefined, role: string): boolean => {
  if (name === "select") return true;
  if (name !== "input") return false;
  if (type === "checkbox" || type === "radio") return role !== "slider" && role !== "combobox";
  if (type === "range") return role === "slider";
  return false;
};

export default defineAccessibilityRule({
  meta: {
    id: "role-has-required-aria-props",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: "Add the state the role requires: `aria-checked` for checkbox/radio/switch, `aria-valuenow` for slider, `aria-expanded` for combobox",
    agentGuidance:
      "A custom widget must expose its state, or assistive technology cannot tell whether it is checked, expanded or at what " +
      "value. Bind the required attribute to the component state: `role=\"checkbox\" :aria-checked=\"checked\"`, " +
      "`role=\"switch\" :aria-checked=\"enabled\"`, `role=\"slider\" :aria-valuenow=\"value\"` (with `aria-valuemin` / " +
      "`aria-valuemax`), `role=\"combobox\" :aria-expanded=\"open\"`. Better still, use the native control " +
      "(`<input type=\"checkbox\">`, `<input type=\"range\">`), which has the state built in. Only literal roles on native " +
      "elements without `v-bind=\"obj\"` are checked." +
      ` ${ROOT_ELEMENT_NOTE}`,
  },
  check: (element, report) => {
    if (!element.native || element.spread || isComponentRoot(element)) return;
    const role = staticText(element, "role")?.split(/\s+/)[0];
    const required = role ? REQUIRED_PROPS[role] : undefined;
    if (!role || !required) return;
    if (providesStateNatively(element.name, staticText(element, "type"), role)) return;
    const missing = required.filter((name) => !element.attributes.has(name));
    if (missing.length === 0) return;
    report(`\`role="${role}"\` without ${missing.map((name) => `\`${name}\``).join(" and ")} — assistive technology cannot announce its state`);
  },
});
