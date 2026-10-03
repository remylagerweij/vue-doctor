import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "safe Object.assign into empty literal",
      filename: "server/api/update.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const safeCopy = Object.assign({}, body);
  return safeCopy;
});
`,
    },
    {
      name: "static safe property assignment",
      filename: "src/utils/store.ts",
      code: `export const save = (obj, id, val) => {
  obj["safe_prefix_" + id] = val;
};
`,
    },
    {
      name: "Map set instead of object index",
      filename: "server/utils/cache.ts",
      code: `const map = new Map();
export const setItem = (key, val) => {
  map.set(key, val);
};
`,
    },
    {
      name: "defu into empty object",
      filename: "server/api/config.ts",
      code: `export const mergeConfig = (defaults, userOverrides) => {
  return defu({}, defaults);
};
`,
    },
  ],
  invalid: [
    {
      name: "direct assignment to __proto__",
      filename: "src/utils/hack.ts",
      code: `export const pollute = (obj, val) => {
  obj["__proto__"] = val;
};
`,
    },
    {
      name: "assignment to computed property with request input key",
      filename: "server/api/patch.ts",
      code: `export default defineEventHandler(async (event) => {
  const { key, val } = await readBody(event);
  const target = {};
  target[key] = val;
});
`,
    },
    {
      name: "Object.assign into existing object with request input",
      filename: "server/api/profile.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const user = getUser();
  Object.assign(user, body);
});
`,
    },
    {
      name: "defu into existing object with request input",
      filename: "server/api/settings.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const state = getState();
  return defu(state, body);
});
`,
    },
  ],
};

export default cases;
