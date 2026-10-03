import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "per-method lodash import",
      code: `import debounce from "lodash/debounce";\nexport const search = debounce(() => {}, 200);\n`,
    },
    {
      name: "tree-shakeable lodash-es",
      code: `import { debounce, groupBy } from "lodash-es";\nexport { debounce, groupBy };\n`,
    },
    {
      name: "side-effect import without bindings",
      code: `import "lodash";\n`,
    },
    {
      name: "package with lodash in its name",
      code: `import { merge } from "lodash.merge";\nexport { merge };\n`,
    },
  ],
  invalid: [
    {
      name: "default import of the whole library",
      code: `import _ from "lodash";\nexport const unique = _.uniq([1, 1]);\n`,
    },
    {
      name: "named import from the main entry",
      code: `import { debounce } from "lodash";\nexport { debounce };\n`,
    },
    {
      name: "namespace import",
      code: `import * as _ from "lodash";\nexport { _ };\n`,
    },
  ],
};

export default cases;
