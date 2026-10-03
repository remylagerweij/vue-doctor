import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "two components defined side by side at module level",
      code: `import { defineComponent, h } from "vue";
const Row = defineComponent({ props: ["item"], render() { return h("li", this.item); } });
export default defineComponent({
  setup() {
    return () => h("ul", [h(Row, { item: 1 })]);
  },
});
`,
    },
    {
      name: "component declared at module level and only used inside setup",
      code: `import { h } from "vue";
const Child = { render() { return h("span"); } };
export default {
  setup() {
    return () => h(Child);
  },
};
`,
    },
    {
      name: "lowercase options object inside setup is not a component",
      code: `export default {
  setup() {
    const options = { render: true, template: "none" };
    return { options };
  },
};
`,
    },
    {
      name: "lazy component via defineAsyncComponent inside setup",
      code: `import { defineAsyncComponent } from "vue";
export default {
  setup() {
    const Chart = defineAsyncComponent(() => import("./Chart.vue"));
    return { Chart };
  },
};
`,
    },
  ],
  invalid: [
    {
      name: "defineComponent called inside setup()",
      code: `import { defineComponent, h } from "vue";
export default defineComponent({
  setup() {
    const Inner = defineComponent({ render: () => null });
    return () => h(Inner);
  },
});
`,
    },
    {
      name: "render-object component created inside setup()",
      code: `import { h } from "vue";
export default {
  setup() {
    const Row = { render() { return h("li"); } };
    return () => h(Row);
  },
};
`,
    },
    {
      name: "template-object component created inside an arrow setup",
      code: `export default {
  setup: () => {
    const Child = { template: "<p>hi</p>" };
    return { Child };
  },
};
`,
    },
  ],
};

export default cases;
