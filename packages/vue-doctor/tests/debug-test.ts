import { runOxlint } from "../src/utils/run-oxlint.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.resolve(__dirname, "fixtures/basic-vue");

async function main() {
  const files = [
    "vue-specific-issues.vue",
    "security-issues.vue",
    "performance-issues.vue",
    "correctness-issues.vue"
  ];
  for (const file of files) {
    console.log(`\n--- Diagnostics for ${file} ---`);
    const diagnostics = await runOxlint(testDir, true, "nuxt", [file]);
    console.log(JSON.stringify(diagnostics.map(d => ({ rule: d.rule, line: d.line })), null, 2));
  }
}

main().catch(console.error);
