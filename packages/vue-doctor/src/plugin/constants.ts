export const GIANT_COMPONENT_LINE_THRESHOLD = 300;
export const CASCADING_MUTATION_THRESHOLD = 3;
export const RELATED_REF_THRESHOLD = 5;
export const SECRET_MIN_LENGTH_CHARS = 8;
export const SEQUENTIAL_AWAIT_THRESHOLD = 3;

export const LAYOUT_PROPERTIES = new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "borderWidth",
  "fontSize",
  "lineHeight",
  "gap",
]);

export const HEAVY_LIBRARIES = new Set([
  "@monaco-editor/react",
  "monaco-editor",
  "echarts",
  "chart.js",
  "vue-chartjs",
  "@codemirror/view",
  "@codemirror/state",
  "quill",
  "vue-quill-editor",
  "draft-js",
  "tiptap",
  "@tiptap/vue-3",
]);

export const WATCH_FUNCTIONS = new Set(["watch", "watchEffect", "watchPostEffect", "watchSyncEffect"]);
export const REACTIVE_APIS = new Set(["ref", "reactive", "computed", "shallowRef", "shallowReactive", "toRef", "toRefs"]);
export const COMPOSABLE_PATTERN = /^use[A-Z]/;

export const FETCH_CALLEE_NAMES = new Set(["fetch"]);
export const FETCH_MEMBER_OBJECTS = new Set(["axios", "ky", "got"]);
export const INDEX_PARAMETER_NAMES = new Set(["index", "idx", "i"]);
export const BARREL_INDEX_SUFFIXES = [
  "/index",
  "/index.js",
  "/index.ts",
  "/index.vue",
  "/index.mjs",
];
export const PASSIVE_EVENT_NAMES = new Set([
  "scroll",
  "wheel",
  "touchstart",
  "touchmove",
  "touchend",
]);

export const LOOP_TYPES = [
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
];

export const SECRET_PATTERNS = [
  /^sk_live_/,
  /^sk_test_/,
  /^AKIA[0-9A-Z]{16}$/,
  /^ghp_[a-zA-Z0-9]{36}$/,
  /^gho_[a-zA-Z0-9]{36}$/,
  /^github_pat_/,
  /^glpat-/,
  /^xox[bporas]-/,
  /^sk-[a-zA-Z0-9]{32,}$/,
];

export const SECRET_VARIABLE_PATTERN = /(?:api_?key|secret|token|password|credential|auth)/i;

export const SECRET_FALSE_POSITIVE_SUFFIXES = new Set([
  "modal",
  "label",
  "text",
  "title",
  "name",
  "id",
  "key",
  "url",
  "path",
  "route",
  "page",
  "param",
  "field",
  "column",
  "header",
  "placeholder",
  "description",
  "type",
  "icon",
  "class",
  "style",
  "variant",
  "event",
  "action",
  "status",
  "state",
  "mode",
  "flag",
  "option",
  "config",
  "message",
  "error",
  "display",
  "view",
  "component",
  "element",
  "container",
  "wrapper",
  "button",
  "link",
  "input",
  "select",
  "dialog",
  "menu",
  "form",
  "step",
  "index",
  "count",
  "length",
  "role",
  "scope",
  "context",
  "provider",
  "ref",
  "handler",
  "query",
  "schema",
  "constant",
]);

export const UPPERCASE_PATTERN = /^[A-Z]/;

export const LARGE_BLUR_THRESHOLD_PX = 10;
export const BLUR_VALUE_PATTERN = /blur\((\d+(?:\.\d+)?)px\)/;
export const CHAINABLE_ITERATION_METHODS = new Set(["map", "filter", "forEach", "flatMap"]);
export const STORAGE_OBJECTS = new Set(["localStorage", "sessionStorage"]);
export const DUPLICATE_STORAGE_READ_THRESHOLD = 2;
