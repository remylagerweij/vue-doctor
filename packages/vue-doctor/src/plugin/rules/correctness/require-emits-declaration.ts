import { getStaticKeyName } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const EMIT_DECLARING_MACROS = new Set(["defineEmits", "defineModel"]);

// Statically readable event names of an `emits` option, or null when the option is dynamic.
const readEmitsOption = (value: EsTreeNode | undefined): Set<string> | null => {
  if (value?.type === "ArrayExpression") {
    const names = new Set<string>();
    for (const element of value.elements ?? []) {
      if (element?.type !== "Literal" || typeof element.value !== "string") return null;
      names.add(element.value);
    }
    return names;
  }
  if (value?.type === "ObjectExpression") {
    const names = new Set<string>();
    for (const property of value.properties ?? []) {
      const name = property.type === "Property" ? getStaticKeyName(property) : null;
      if (name === null) return null;
      names.add(name);
    }
    return names;
  }
  return null;
};

export default defineRule({
  meta: {
    id: "require-emits-declaration",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Declare events with `const emit = defineEmits<{ change: [value: string] }>()` and call `emit('change', value)` instead of `$emit`",
    agentGuidance: "Declare events with `const emit = defineEmits<{ change: [value: string] }>()` and call `emit('change', value)` instead of `$emit`.",
  },
  create: (context: RuleContext) => {
    const emitCalls: EsTreeNode[] = [];
    let hasEmitMacro = false;
    let hasDynamicEmitsOption = false;
    let declaredEvents: Set<string> | null = null;

    return {
      CallExpression(node: EsTreeNode) {
        if (node.callee?.type === "Identifier" && EMIT_DECLARING_MACROS.has(node.callee.name)) {
          hasEmitMacro = true;
          return;
        }
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.property?.type === "Identifier" &&
          node.callee.property.name === "$emit"
        ) {
          emitCalls.push(node);
        }
      },
      // Options API `emits: [...]` / `emits: { ... }`.
      Property(node: EsTreeNode) {
        if (getStaticKeyName(node) !== "emits") return;
        const events = readEmitsOption(node.value);
        if (events === null) {
          hasDynamicEmitsOption = true;
          return;
        }
        declaredEvents = new Set([...(declaredEvents ?? []), ...events]);
      },
      "Program:exit"() {
        if (hasEmitMacro || hasDynamicEmitsOption) return;
        for (const call of emitCalls) {
          const eventArgument = call.arguments?.[0];
          const isEventKnown =
            declaredEvents !== null &&
            eventArgument?.type === "Literal" &&
            typeof eventArgument.value === "string";
          // With a static `emits` option only events missing from it are a problem; a dynamic
          // event name cannot be checked, so it is not reported.
          if (declaredEvents !== null && (!isEventKnown || declaredEvents.has(eventArgument.value))) continue;

          context.report({
            node: call,
            message:
              declaredEvents === null
                ? "$emit() without defineEmits() — declare emits with defineEmits() for better documentation and type checking"
                : `$emit('${eventArgument.value}') is not listed in the emits option — declare every emitted event`,
          });
        }
      },
    };
  },
});
