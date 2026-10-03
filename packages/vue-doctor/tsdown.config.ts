import fs from "node:fs";
import { defineConfig, type UserConfig } from "tsdown";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  version: string;
};

const base: UserConfig = {
  // dist/ is cleaned by the prebuild script; parallel configs must not clean each other.
  clean: false,
  target: "node22",
  platform: "node",
  fixedExtension: false,
  deps: { neverBundle: ["oxlint", "knip", "knip/session"] },
  env: {
    NODE_ENV: "production",
    VERSION: process.env.VERSION ?? packageJson.version,
  },
};

export default defineConfig([
  {
    ...base,
    entry: { cli: "./src/cli.ts" },
    dts: true,
    banner: "#!/usr/bin/env node",
  },
  {
    ...base,
    entry: { index: "./src/index.ts" },
    dts: true,
  },
  {
    ...base,
    entry: { "vue-doctor-plugin": "./src/plugin/index.ts" },
    // Published as the "./eslint-plugin" export.
    dts: true,
  },
  {
    ...base,
    entry: { "knip-worker": "./src/utils/knip-worker.ts" },
    // Internal child-process entry: no type declarations.
    dts: false,
  },
]);
