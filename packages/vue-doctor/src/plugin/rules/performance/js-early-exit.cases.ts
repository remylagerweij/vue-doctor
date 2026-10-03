import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "flattened with early returns",
      code: `export function save(user) {\n  if (!user) return;\n  if (!user.active) return;\n  if (!user.email) return;\n  send(user.email);\n}\n`,
    },
    {
      name: "three levels of nesting is still readable",
      code: `export function save(user) {\n  if (user) {\n    if (user.active) {\n      if (user.email) {\n        send(user.email);\n      }\n    }\n  }\n}\n`,
    },
    {
      name: "nested ifs that also contain other statements",
      code: `export function save(user) {\n  if (user) {\n    log(user);\n    if (user.active) {\n      log("active");\n      if (user.email) {\n        log("email");\n        if (user.admin) {\n          log("admin");\n        }\n      }\n    }\n  }\n}\n`,
    },
    {
      name: "else-if chain is flat",
      code: `export function kind(x) {\n  if (x === 1) { return "a"; }\n  else if (x === 2) { return "b"; }\n  else if (x === 3) { return "c"; }\n  else if (x === 4) { return "d"; }\n  return "z";\n}\n`,
    },
  ],
  invalid: [
    {
      name: "four nested ifs",
      code: `export function save(user) {\n  if (user) {\n    if (user.active) {\n      if (user.email) {\n        if (user.verified) {\n          send(user.email);\n        }\n      }\n    }\n  }\n}\n`,
    },
    {
      name: "four nested ifs in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nfunction go(a, b, c, d) {\n  if (a) {\n    if (b) {\n      if (c) {\n        if (d) {\n          run();\n        }\n      }\n    }\n  }\n}\n</script>\n`,
    },
    {
      name: "five nested ifs report both deep chains",
      count: 2,
      code: `export function f(a, b, c, d, e) {\n  if (a) {\n    if (b) {\n      if (c) {\n        if (d) {\n          if (e) {\n            run();\n          }\n        }\n      }\n    }\n  }\n}\n`,
    },
  ],
};

export default cases;
