import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "this in Options API methods",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { methods: { go() { this.$router.push("/"); } } };\n</script>\n`,
    },
    {
      name: "this in a computed getter and data()",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { data() { return { a: 1 }; }, computed: { b() { return this.a + 1; } } };\n</script>\n`,
    },
    {
      name: "legacy constructor function inside script setup binds its own this",
      filename: "src/Comp.vue",
      code: `<script setup>\nfunction Point(x) { this.x = x; }\nconst point = new Point(1);\n</script>\n`,
    },
    {
      name: "class method in a plain module",
      code: `export class Counter { count = 0; increment() { this.count += 1; } }\n`,
    },
  ],
  invalid: [
    {
      name: "this at the top level of script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst router = this.$router;\n</script>\n`,
    },
    {
      name: "this inside setup()",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { setup() { this.count = 1; } };\n</script>\n`,
    },
    {
      name: "this inside an arrow function nested in setup()",
      code: `export default { setup() { const go = () => this.router; return { go }; } };\n`,
    },
  ],
};

export default cases;
