import type { RuleCases } from "./rule-cases.js";

/**
 * Cases for the eslint-plugin-vue template rules, keyed by rule id (`vue/<rule>`). The rules are
 * upstream implementations, so each gets one invalid snippet that must be reported and one valid
 * near-miss that must stay silent. Every snippet is a complete `.vue` file.
 */
const vue = (script: string, template: string): string =>
  `${script ? `<script setup>\n${script}\n</script>\n` : ""}<template>\n${template}\n</template>\n`;

const optionsApi = (options: string): string => `<script>\nexport default {\n${options}\n};\n</script>\n<template><div /></template>\n`;

const FILENAME = "src/Comp.vue";

const cases: Record<string, RuleCases> = {
  "vue/require-v-for-key": {
    valid: [{ name: "keyed v-for", filename: FILENAME, code: vue("", `<ul><li v-for="item in items" :key="item.id">{{ item.name }}</li></ul>`) }],
    invalid: [{ name: "v-for without key", filename: FILENAME, code: vue("", `<ul><li v-for="item in items">{{ item.name }}</li></ul>`) }],
  },
  "vue/no-use-v-if-with-v-for": {
    valid: [{ name: "v-if on a child of the v-for element", filename: FILENAME, code: vue("", `<template v-for="item in items" :key="item.id"><li v-if="item.ok">{{ item.name }}</li></template>`) }],
    invalid: [{ name: "v-if using the iteration variable on the v-for element", filename: FILENAME, code: vue("", `<ul><li v-for="item in items" v-if="item.ok" :key="item.id">{{ item.name }}</li></ul>`) }],
  },
  "vue/no-template-shadow": {
    valid: [{ name: "iteration variable with a fresh name", filename: FILENAME, code: vue("const users = []", `<ul><li v-for="person in users" :key="person.id">{{ person.name }}</li></ul>`) }],
    invalid: [{ name: "iteration variable shadows a script binding", filename: FILENAME, code: vue("const user = {}\nconst users = []", `<ul><li v-for="user in users" :key="user.id">{{ user.name }}</li></ul>`) }],
  },
  "vue/valid-v-slot": {
    valid: [{ name: "v-slot on a component", filename: FILENAME, code: vue("", `<MyList v-slot="props">{{ props.item }}</MyList>`) }],
    invalid: [{ name: "v-slot on a plain element", filename: FILENAME, code: vue("", `<div v-slot="props">{{ props }}</div>`) }],
  },
  "vue/require-explicit-emits": {
    valid: [{ name: "event declared with defineEmits", filename: FILENAME, code: vue("defineEmits(['save'])", `<button @click="$emit('save')">Save</button>`) }],
    invalid: [{ name: "emit of an undeclared event", filename: FILENAME, code: vue("defineProps(['label'])", `<button @click="$emit('save')">Save</button>`) }],
  },
  "vue/component-name-in-template-casing": {
    valid: [{ name: "PascalCase component tag", filename: FILENAME, code: vue("import MyButton from './MyButton.vue'", `<MyButton />`) }],
    invalid: [{ name: "kebab-case component tag", filename: FILENAME, code: vue("import MyButton from './MyButton.vue'", `<my-button />`) }],
  },
  "vue/no-unused-vars": {
    valid: [{ name: "iteration variable used", filename: FILENAME, code: vue("", `<ul><li v-for="item in items" :key="item.id">{{ item.name }}</li></ul>`) }],
    invalid: [{ name: "iteration variable never used", filename: FILENAME, code: vue("", `<ul><li v-for="item in items" :key="1">row</li></ul>`) }],
  },
  "vue/no-mutating-props": {
    valid: [{ name: "child asks the parent to change the value", filename: FILENAME, code: vue("defineProps(['count'])\ndefineEmits(['inc'])", `<button @click="$emit('inc')">{{ count }}</button>`) }],
    invalid: [{ name: "template assigns to a prop", filename: FILENAME, code: vue("defineProps(['count'])", `<button @click="count++">{{ count }}</button>`) }],
  },
  "vue/no-computed-properties-in-data": {
    valid: [{ name: "data independent of computed properties", filename: FILENAME, code: optionsApi(`  data() { return { a: 1 }; },\n  computed: { b() { return this.a + 1; } },`) }],
    invalid: [{ name: "data reads a computed property", filename: FILENAME, code: optionsApi(`  computed: { b() { return 1; } },\n  data() { return { a: this.b }; },`) }],
  },
  "vue/no-side-effects-in-computed-properties": {
    valid: [{ name: "pure computed getter", filename: FILENAME, code: optionsApi(`  data() { return { a: 1 }; },\n  computed: { b() { return this.a + 1; } },`) }],
    invalid: [{ name: "computed getter assigns to this", filename: FILENAME, code: optionsApi(`  data() { return { a: 1 }; },\n  computed: { b() { this.a = 2; return this.a; } },`) }],
  },
  "vue/no-async-in-computed-properties": {
    valid: [{ name: "synchronous computed getter", filename: FILENAME, code: optionsApi(`  computed: { b() { return 1; } },`) }],
    invalid: [{ name: "async computed getter", filename: FILENAME, code: optionsApi(`  computed: { async b() { return await load(); } },`) }],
  },
  "vue/return-in-computed-property": {
    valid: [{ name: "computed getter returns", filename: FILENAME, code: optionsApi(`  computed: { b() { return 1; } },`) }],
    invalid: [{ name: "computed getter without return", filename: FILENAME, code: optionsApi(`  computed: { b() { console.log(1); } },`) }],
  },
  "vue/no-ref-as-operand": {
    valid: [{ name: "ref accessed through .value", filename: FILENAME, code: vue("import { ref } from 'vue'\nconst n = ref(0)\nn.value++", `<p>{{ n }}</p>`) }],
    invalid: [{ name: "ref incremented directly", filename: FILENAME, code: vue("import { ref } from 'vue'\nconst n = ref(0)\nn++", `<p>{{ n }}</p>`) }],
  },
  "vue/valid-v-bind": {
    valid: [{ name: "v-bind with a value", filename: FILENAME, code: vue("", `<div :id="uid"></div>`) }],
    invalid: [{ name: "v-bind without a value", filename: FILENAME, code: vue("", `<div v-bind></div>`) }],
  },
  "vue/valid-v-on": {
    valid: [{ name: "v-on with a handler", filename: FILENAME, code: vue("const go = () => {}", `<button @click="go">Go</button>`) }],
    invalid: [{ name: "v-on without a handler", filename: FILENAME, code: vue("", `<button @click>Go</button>`) }],
  },
  "vue/valid-v-model": {
    valid: [{ name: "v-model on an input", filename: FILENAME, code: vue("import { ref } from 'vue'\nconst name = ref('')", `<input v-model="name">`) }],
    invalid: [{ name: "v-model on a div", filename: FILENAME, code: vue("import { ref } from 'vue'\nconst name = ref('')", `<div v-model="name"></div>`) }],
  },
  "vue/no-dupe-keys": {
    valid: [{ name: "props and data with different names", filename: FILENAME, code: optionsApi(`  props: ['a'],\n  data() { return { b: 1 }; },`) }],
    invalid: [{ name: "data key repeats a prop", filename: FILENAME, code: optionsApi(`  props: ['a'],\n  data() { return { a: 1 }; },`) }],
  },
  "vue/no-duplicate-attributes": {
    valid: [{ name: "class and :class may coexist", filename: FILENAME, code: vue("", `<div class="a" :class="b"></div>`) }],
    invalid: [{ name: "id given twice", filename: FILENAME, code: vue("", `<div id="a" id="b"></div>`) }],
  },
  "vue/no-template-target-blank": {
    valid: [{ name: "target blank with rel noopener", filename: FILENAME, code: vue("", `<a href="https://example.com" target="_blank" rel="noopener noreferrer">Docs</a>`) }],
    invalid: [{ name: "target blank without rel", filename: FILENAME, code: vue("", `<a href="https://example.com" target="_blank">Docs</a>`) }],
  },
};

export default cases;
