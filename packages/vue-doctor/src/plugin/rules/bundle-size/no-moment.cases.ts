import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "dayjs",
      code: `import dayjs from "dayjs";\nexport const today = dayjs().format("YYYY-MM-DD");\n`,
    },
    {
      name: "tree-shakeable date-fns",
      code: `import { format } from "date-fns";\nexport const today = format(new Date(), "yyyy-MM-dd");\n`,
    },
    {
      name: "local module that merely contains the word moment",
      code: `import { moment } from "./moment-utils";\nexport { moment };\n`,
    },
    {
      name: "lightweight moment-compatible package",
      code: `import moment from "moment-mini";\nexport { moment };\n`,
    },
  ],
  invalid: [
    {
      name: "default import of moment",
      code: `import moment from "moment";\nexport const today = moment().format();\n`,
    },
    {
      name: "moment-timezone",
      code: `import moment from "moment-timezone";\nexport const now = moment.tz("Europe/Amsterdam");\n`,
    },
    {
      name: "named import from moment-timezone",
      code: `import { tz } from "moment-timezone";\nexport { tz };\n`,
    },
  ],
};

export default cases;
