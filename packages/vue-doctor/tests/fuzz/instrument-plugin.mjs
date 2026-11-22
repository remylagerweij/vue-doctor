// Oxlint JS plugin used only by the rule fuzzing harness (tests/fuzz). It loads the PRODUCTION
// plugin bundle (dist/vue-doctor-plugin.js) and wraps every rule so each (rule, file) pair is
// timed and any exception is attributed to the rule that threw it. Oxlint alone reports a rule
// crash as an anonymous "Error running JS plugin" and drops every other finding of that file.
// The wrapper records the exception and stops calling the throwing rule for that file, so the
// remaining rules still run and their findings can be compared.
//
// Configuration comes from the environment, which the oxlint process inherits:
//   VDOC_FUZZ_PLUGIN  absolute path of the built plugin bundle
//   VDOC_FUZZ_LOG     JSONL file that receives one record per (rule, file) on process exit
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const pluginPath = process.env.VDOC_FUZZ_PLUGIN;
const logPath = process.env.VDOC_FUZZ_LOG;
if (!pluginPath || !logPath) throw new Error("instrument-plugin: VDOC_FUZZ_PLUGIN and VDOC_FUZZ_LOG are required");

const { default: production } = await import(pathToFileURL(pluginPath).href);

/** key `${rule}\u0000${file}` -> { rule, file, ms, error? } */
const records = new Map();

const recordFor = (rule, file) => {
  const key = `${rule}\u0000${file}`;
  let record = records.get(key);
  if (!record) {
    record = { rule, file, ms: 0 };
    records.set(key, record);
  }
  return record;
};

const describeError = (error) =>
  error instanceof Error ? `${error.name}: ${error.message}\n${(error.stack ?? "").split("\n").slice(1, 6).join("\n")}` : String(error);

const timed = (record, fn, self, args) => {
  if (record.error) return undefined;
  const start = performance.now();
  try {
    return fn.apply(self, args);
  } catch (error) {
    record.error = describeError(error);
    return undefined;
  } finally {
    record.ms += performance.now() - start;
  }
};

const wrapRule = (ruleName, rule) => ({
  ...rule,
  create(context) {
    const file = String(context.filename ?? context.physicalFilename ?? "");
    const record = recordFor(ruleName, file);
    const visitors = timed(record, rule.create, rule, [context]);
    const wrapped = {};
    for (const [selector, visitor] of Object.entries(visitors ?? {})) {
      wrapped[selector] = typeof visitor === "function" ? (...args) => timed(record, visitor, undefined, args) : visitor;
    }
    return wrapped;
  },
});

process.on("exit", () => {
  const lines = [...records.values()].map((record) => JSON.stringify(record));
  fs.writeFileSync(logPath, lines.length > 0 ? `${lines.join("\n")}\n` : "");
});

export default {
  meta: production.meta,
  rules: Object.fromEntries(Object.entries(production.rules).map(([name, rule]) => [name, wrapRule(name, rule)])),
};
