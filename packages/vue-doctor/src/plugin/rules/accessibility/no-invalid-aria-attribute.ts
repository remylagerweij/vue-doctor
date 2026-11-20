import { ARIA_ATTRIBUTES } from "../../aria.js";
import { defineAccessibilityRule } from "./helpers.js";

/** Edit distance, for "did you mean" suggestions on misspelled names. */
const distance = (left: string, right: string): number => {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
};

const suggestionFor = (name: string): string | undefined => {
  if (name === "aria-role") return "role";
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of ARIA_ATTRIBUTES) {
    const candidateDistance = distance(name, candidate);
    if (candidateDistance < bestDistance) [best, bestDistance] = [candidate, candidateDistance];
  }
  return best;
};

export default defineAccessibilityRule({
  meta: {
    id: "no-invalid-aria-attribute",
    defaultSeverity: "off",
    confidence: "high",
    since: "2.5.0",
    help: "Use only `aria-*` attributes defined by WAI-ARIA; fix the spelling (`aria-labelledby`, not `aria-labeledby`)",
    agentGuidance:
      "Rename the attribute to the WAI-ARIA state or property that was meant — the finding suggests the closest one (common " +
      "slips: `aria-labeledby` → `aria-labelledby`, `aria-describeby` → `aria-describedby`, `aria-role` → `role`). Browsers " +
      "ignore unknown `aria-*` attributes, so the element currently has no label, description or state. If the attribute is " +
      "not ARIA at all, use a `data-*` attribute instead. Native HTML and SVG elements are checked, static and bound (`:aria-x`).",
  },
  check: (element, report) => {
    if (!element.native && !element.svg) return;
    for (const name of element.attributes.keys()) {
      if (!name.startsWith("aria-") || ARIA_ATTRIBUTES.has(name)) continue;
      const suggestion = suggestionFor(name);
      report(
        `\`${name}\` is not a WAI-ARIA attribute, so browsers ignore it${suggestion ? ` — did you mean \`${suggestion}\`?` : ""}`,
      );
    }
  },
});
