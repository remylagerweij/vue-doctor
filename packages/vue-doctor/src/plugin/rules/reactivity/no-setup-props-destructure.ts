import { isComponentSetup, peel } from "../../composition-api.js";
import { defineRule } from "../../define-rule.js";
import { getFilename, getStaticKeyName, isFunctionNode, walkAst, WALK_SKIP } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

// `initialValue`, `defaultTab`: by name a seed the component copies once on purpose.
const SEED_PROP_NAME = /^(?:initial|default)(?:[A-Z_]|$)/;

/** Whether the pattern picks at least one prop that is not a seed (`initialX`/`defaultX`). */
const picksLiveProp = (pattern: EsTreeNode): boolean =>
  (pattern.properties ?? []).some((property: EsTreeNode) => {
    if (property.type === "RestElement") return true;
    const key = getStaticKeyName(property);
    return key === null || !SEED_PROP_NAME.test(key);
  });

const objectPatternOf = (parameter: EsTreeNode | undefined): EsTreeNode | null => {
  const pattern = parameter?.type === "AssignmentPattern" ? parameter.left : parameter;
  return pattern?.type === "ObjectPattern" ? pattern : null;
};

export default defineRule({
  meta: {
    id: "no-setup-props-destructure",
    category: "Reactivity",
    defaultSeverity: "off",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "2.5.0",
    help: "Keep `props` whole in `setup(props)` and read `props.x` where it is used, or use `toRefs(props)` / `toRef(props, 'x')`",
    agentGuidance:
      "In a `setup(props)` function (Options-style component, `defineComponent({ setup })`) `props` is a reactive object. Destructuring it, in the parameter list (`setup({ title })`) or in the setup body (`const { title } = props`), copies the values once: computed properties, watchers and the template never see later prop changes. Use `props.title` where the value is read, or `const { title } = toRefs(props)` and `title.value`. This is about `setup()`; destructuring `defineProps()` in `<script setup>` is reactive since Vue 3.5 and is not reported. Destructuring inside a nested function (a computed getter, a watcher, a handler) re-reads the props each time and is fine. `initialX` / `defaultX` props, seeds copied once on purpose, are not reported.",
  },
  create: (context: RuleContext) => {
    const filename = getFilename(context);
    const report = (node: EsTreeNode, how: string): void => {
      context.report({
        node,
        message: `Destructuring props ${how} copies their values once; the component stops reacting to prop changes. Read \`props.x\` or use toRefs(props)`,
      });
    };

    const checkSetup = (fn: EsTreeNode): void => {
      if (!isComponentSetup(fn, filename)) return;
      const parameter = fn.params?.[0];
      const pattern = objectPatternOf(parameter);
      if (pattern) {
        if (picksLiveProp(pattern)) report(pattern, "in the setup() parameter list");
        return;
      }
      const propsName = parameter?.type === "Identifier" ? parameter.name : null;
      if (!propsName || fn.body?.type !== "BlockStatement") return;
      walkAst(fn.body, (node) => {
        if (isFunctionNode(node)) return WALK_SKIP;
        if (node.type !== "VariableDeclarator" || node.id?.type !== "ObjectPattern") return undefined;
        const init = peel(node.init);
        if (init?.type === "Identifier" && init.name === propsName && picksLiveProp(node.id)) report(node.id, "in setup()");
        return undefined;
      });
    };

    return {
      FunctionExpression: checkSetup,
      ArrowFunctionExpression: checkSetup,
    };
  },
});
