import type { FsRuleCases } from "../../fs-rule-cases.js";

const pkg = (dependencies: Record<string, string>, section = "dependencies"): string =>
  JSON.stringify({ name: "app", [section]: dependencies }, null, 2);

const SHA = "0123456789abcdef0123456789abcdef01234567";

const cases: FsRuleCases = {
  valid: [
    {
      name: "registry versions, ranges, tags and aliases",
      files: {
        "package.json": pkg({
          vue: "^3.5.0",
          pinia: "~3.0.1",
          lodash: "latest",
          ms: "2.1.3",
          vite: "npm:rolldown-vite@^7.0.0",
          x: "*",
        }),
      },
    },
    {
      name: "local and workspace specs",
      files: { "package.json": pkg({ ui: "workspace:*", lib: "file:../lib", tool: "link:../tool", cfg: "catalog:" }) },
    },
    {
      name: "git dependency pinned to a full commit hash",
      files: {
        "package.json": pkg({
          fork: `github:acme/fork#${SHA}`,
          other: `git+https://github.com/acme/other.git#${SHA}`,
        }),
      },
    },
    {
      name: "scoped package names are not repository shorthands",
      files: { "package.json": pkg({ "@vue/test-utils": "^2.4.0" }) },
    },
    { name: "no package.json", files: { "README.md": "# app\n" } },
  ],
  invalid: [
    {
      name: "GitHub shorthand on a branch",
      files: { "package.json": pkg({ vue: "^3.5.0", fork: "acme/fork#main" }) },
      findings: [{ file: "package.json", line: 5 }],
    },
    {
      name: "git+https and git+ssh URLs without a commit",
      files: {
        "package.json": pkg({
          a: "git+https://github.com/acme/a.git",
          b: "git+ssh://git@github.com/acme/b.git#v1.2.0",
        }),
      },
      findings: [
        { file: "package.json", line: 4 },
        { file: "package.json", line: 5 },
      ],
    },
    {
      name: "a plain http:// tarball in devDependencies",
      files: { "package.json": pkg({ tool: "http://downloads.example.com/tool-1.0.0.tgz" }, "devDependencies") },
      findings: [{ file: "package.json", line: 4 }],
    },
    {
      name: "an https tarball URL",
      files: { "package.json": pkg({ tool: "https://downloads.example.com/tool-1.0.0.tgz" }, "optionalDependencies") },
      findings: [{ file: "package.json", line: 4 }],
    },
    {
      name: "github:, gitlab: and a short commit hash",
      files: { "package.json": pkg({ a: "github:acme/a", b: "gitlab:acme/b#abc1234" }) },
      findings: [
        { file: "package.json", line: 4 },
        { file: "package.json", line: 5 },
      ],
    },
  ],
};

export default cases;
