import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "defineEmits next to the emit calls",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst emit = defineEmits(["save"]);\nfunction submit() { emit("save"); }\n</script>\n`,
    },
    {
      name: "emits option lists the emitted event",
      code: `export default { emits: ["go"], methods: { go() { this.$emit("go"); } } };\n`,
    },
    {
      name: "emits object syntax with validator",
      code: `export default { emits: { go: (id) => id > 0 }, methods: { go() { this.$emit("go", 1); } } };\n`,
    },
    {
      name: "dynamic emits option cannot be checked",
      code: `export default { emits: EVENTS, methods: { go() { this.$emit("go"); } } };\n`,
    },
    {
      name: "component that never emits",
      code: `export default { methods: { go() { this.$router.push("/"); } } };\n`,
    },
  ],
  invalid: [
    {
      name: "$emit without any declaration",
      code: `export default { methods: { go() { this.$emit("go"); } } };\n`,
    },
    {
      name: "event missing from the emits option",
      code: `export default { emits: ["go"], methods: { stop() { this.$emit("stop"); } } };\n`,
    },
    {
      name: "every undeclared $emit call is reported",
      count: 2,
      code: `export default { methods: { a() { this.$emit("a"); }, b() { this.$emit("b"); } } };\n`,
    },
  ],
};

export default cases;
