import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "static path",
      code: `router.push("/login");\n`,
    },
    {
      name: "route object with params",
      code: `router.push({ name: "user", params: { id } });\n`,
    },
    {
      name: "template literal without interpolation",
      code: "router.replace(`/dashboard`);\n",
    },
    {
      name: "push on an unrelated array-like object",
      code: "history.push(`/user/${id}`);\nitems.push(\"/a/\" + b);\n",
    },
    {
      name: "relative navigation",
      code: `router.go(-1);\n`,
    },
  ],
  invalid: [
    {
      name: "template literal path",
      code: "router.push(`/user/${id}`);\n",
    },
    {
      name: "string concatenation in replace",
      code: `router.replace("/user/" + id);\n`,
    },
    {
      name: "this.$router with interpolated path",
      code: "export default { methods: { open(id) { this.$router.push(`/posts/${id}/edit`); } } };\n",
    },
  ],
};

export default cases;
