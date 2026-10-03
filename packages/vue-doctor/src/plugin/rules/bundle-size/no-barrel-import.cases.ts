import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "import straight from the component file",
      code: `import Button from "./components/Button.vue";\nexport { Button };\n`,
    },
    {
      name: "package import that happens to be an entry point",
      code: `import { createPinia } from "pinia";\nimport { ref } from "vue";\nexport { createPinia, ref };\n`,
    },
    {
      name: "relative file whose name only contains 'index'",
      code: `import { reindex } from "./reindex";\nimport { indexes } from "./stores/index-helpers";\nexport { reindex, indexes };\n`,
    },
    {
      name: "dynamic import of an index file is not a static barrel import",
      code: `export const load = () => import("./components/index");\n`,
    },
  ],
  invalid: [
    {
      name: "explicit /index specifier",
      code: `import { Button } from "./components/index";\nexport { Button };\n`,
    },
    {
      name: "directory import with trailing slash",
      code: `import { formatDate } from "../utils/";\nexport { formatDate };\n`,
    },
    {
      name: "index file with extension",
      code: `import { useAuth } from "./composables/index.ts";\nexport { useAuth };\n`,
    },
  ],
};

export default cases;
