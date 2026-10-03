import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "heavy library loaded lazily",
      code: `import { defineAsyncComponent } from "vue";\nexport const Chart = defineAsyncComponent(() => import("echarts"));\n`,
    },
    {
      name: "small core dependency",
      code: `import { ref } from "vue";\nexport const count = ref(0);\n`,
    },
    {
      name: "modular sub-path entry point",
      code: `import { use } from "echarts/core";\nexport { use };\n`,
    },
    {
      name: "type-only-looking local file with a heavy name",
      code: `import { editor } from "./monaco-editor-config";\nexport { editor };\n`,
    },
  ],
  invalid: [
    {
      name: "static import of echarts",
      code: `import * as echarts from "echarts";\nexport { echarts };\n`,
    },
    {
      name: "static import of monaco-editor",
      code: `import * as monaco from "monaco-editor";\nexport { monaco };\n`,
    },
    {
      name: "static import of the Tiptap Vue 3 bindings",
      code: `import { EditorContent } from "@tiptap/vue-3";\nexport { EditorContent };\n`,
    },
  ],
};

export default cases;
