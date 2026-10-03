import { describe, expect, it } from "vitest";
import { buildAgentPrompt, buildGroupPrompt, type PromptFinding } from "../src/report/agent-prompt.js";
import { MASK, maskSecrets } from "../src/report/mask-secrets.js";

const DOCS = "https://remylagerweij.github.io/vue-doctor/rules";

const finding = (overrides: Partial<PromptFinding> & Pick<PromptFinding, "ruleId">): PromptFinding => ({
  file: "src/components/Post.vue",
  line: 12,
  message: "A problem",
  help: "",
  docsUrl: `${DOCS}/x`,
  ...overrides,
});

const snapshotPath = (name: string): string => `./snapshots/agent-prompts/${name}.txt`;

// A realistic-looking token, assembled at runtime so no literal secret sits in the repository.
const FAKE_STRIPE_KEY = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");

describe("buildAgentPrompt", () => {
  it("security rule: includes metadata, guidance, constraints and the verify command", async () => {
    const prompt = buildAgentPrompt(
      finding({
        ruleId: "vue-doctor/security/no-eval",
        severity: "error",
        cwe: ["CWE-95"],
        file: "src/utils/run.ts",
        line: 7,
        endLine: 9,
        message: "eval() executes arbitrary code",
        codeFrame: "  6 | const run = (code: string) => {\n> 7 |   return eval(code);\n  8 | };",
      }),
    );
    await expect(prompt).toMatchFileSnapshot(snapshotPath("security-no-eval"));
    expect(prompt).toContain("src/utils/run.ts:7-9");
  });

  it("reactivity rule", async () => {
    const prompt = buildAgentPrompt(
      finding({
        ruleId: "vue-doctor/reactivity/no-fetch-in-watch",
        severity: "warning",
        file: "src/composables/useSearch.ts",
        line: 21,
        message: "fetch() inside a watcher can race; cancel stale requests",
      }),
      { projectRoot: "apps/web" },
    );
    await expect(prompt).toMatchFileSnapshot(snapshotPath("reactivity-no-fetch-in-watch"));
    expect(prompt).toContain("npx @remylagerweij/vue-doctor apps/web --diff --format json");
  });

  it("template vue/* rule", async () => {
    const prompt = buildAgentPrompt(
      finding({
        ruleId: "vue/require-v-for-key",
        severity: "error",
        file: "src/components/List.vue",
        line: 4,
        message: "Elements in iteration expect to have 'v-bind:key' directives.",
      }),
    );
    await expect(prompt).toMatchFileSnapshot(snapshotPath("template-require-v-for-key"));
  });

  it("knip finding: own guidance, whole-project verify", async () => {
    const prompt = buildAgentPrompt(
      finding({
        ruleId: "knip/exports",
        severity: "warning",
        file: "src/utils/format.ts",
        line: 0,
        message: "Unused export: formatDate",
        docsUrl: `${DOCS}/dead-code/knip-exports`,
      }),
    );
    await expect(prompt).toMatchFileSnapshot(snapshotPath("knip-exports"));
    expect(prompt).not.toContain("--diff");
  });

  it("secret finding: no code frame, no secret value, even when the message carries one", async () => {
    const prompt = buildAgentPrompt(
      finding({
        ruleId: "vue-doctor/security/no-hardcoded-secret",
        severity: "error",
        cwe: ["CWE-798"],
        file: "src/config.ts",
        line: 3,
        message: `Potential secret in client code "stripeKey" = "${FAKE_STRIPE_KEY}"`,
        codeFrame: `> 3 | export const stripeKey = "${FAKE_STRIPE_KEY}";`,
      }),
    );
    await expect(prompt).toMatchFileSnapshot(snapshotPath("secret-masked"));
    expect(prompt).not.toContain(FAKE_STRIPE_KEY);
    expect(prompt).not.toContain("Code:");
  });

  it("masks token-like values in the code frame of other rules", () => {
    const prompt = buildAgentPrompt(
      finding({
        ruleId: "vue-doctor/security/no-eval",
        codeFrame: `> 1 | eval("${FAKE_STRIPE_KEY}");`,
      }),
    );
    expect(prompt).toContain("Code:");
    expect(prompt).not.toContain(FAKE_STRIPE_KEY);
    expect(prompt).toContain(MASK);
  });

  it("is deterministic and plain text", () => {
    const input = finding({ ruleId: "vue-doctor/security/no-eval", message: "x" });
    expect(buildAgentPrompt(input)).toBe(buildAgentPrompt({ ...input }));
    expect(buildAgentPrompt(input)).not.toMatch(/```|\*\*|^#/m);
  });

  it("falls back to the finding's help for rules without guidance", () => {
    const prompt = buildAgentPrompt(finding({ ruleId: "other/rule", help: "Do the thing." }));
    expect(prompt).toContain("Guidance: Do the thing.");
  });

  it("quotes a project root with spaces", () => {
    const prompt = buildAgentPrompt(finding({ ruleId: "vue-doctor/security/no-eval" }), { projectRoot: "my app" });
    expect(prompt).toContain('vue-doctor "my app" --diff');
  });
});

describe("buildGroupPrompt", () => {
  const locations = Array.from({ length: 13 }, (_, index) =>
    finding({
      ruleId: "vue/require-v-for-key",
      severity: "error",
      file: `src/components/Item${String(13 - index).padStart(2, "0")}.vue`,
      line: index + 1,
      message: "Elements in iteration expect to have 'v-bind:key' directives.",
    }),
  );

  it("lists sorted locations with a deterministic cap", async () => {
    const prompt = buildGroupPrompt(locations, { projectRoot: "." });
    await expect(prompt).toMatchFileSnapshot(snapshotPath("group-require-v-for-key"));
    expect(prompt).toContain("and 3 more");
    expect(buildGroupPrompt([...locations].reverse())).toBe(prompt);
  });

  it("shows each message when they differ and omits the cap line when everything fits", () => {
    const prompt = buildGroupPrompt([
      finding({ ruleId: "knip/exports", file: "src/b.ts", line: 0, message: "Unused export: b" }),
      finding({ ruleId: "knip/exports", file: "src/a.ts", line: 0, message: "Unused export: a" }),
    ]);
    expect(prompt).toContain("- src/a.ts: Unused export: a\n- src/b.ts: Unused export: b");
    expect(prompt).not.toContain("more");
    expect(prompt).toContain("Findings: 2 in 2 files");
  });

  it("rejects empty input and mixed rules", () => {
    expect(() => buildGroupPrompt([])).toThrow();
    expect(() =>
      buildGroupPrompt([finding({ ruleId: "knip/files" }), finding({ ruleId: "knip/exports" })]),
    ).toThrow(/single rule/);
  });
});

describe("maskSecrets", () => {
  it.each([
    ["Stripe key", `key ${FAKE_STRIPE_KEY} leaked`],
    ["AWS key id", "AKIAIOSFODNN7EXAMPLE"],
    ["GitHub token", `ghp_${"a1B2".repeat(9)}`],
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r"],
    ["bearer header", "Authorization: Bearer abcdef1234567890"],
    ["secret-named assignment", 'const apiSecret = "hunter2hunter2";'],
    ["long random string", "value 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"],
  ])("masks a %s", (_name, text) => {
    const masked = maskSecrets(text);
    expect(masked).toContain(MASK);
    expect(masked).not.toMatch(/FAKE|hunter2|abcdef1234567890|9f86d081|AKIAIOSFODNN7|dBjftJeZ4|4eC39Hq/);
  });

  it("leaves ordinary text, paths and identifiers alone", () => {
    const text = "Unused export: formatDateWithTimezoneAndLocale in src/components/very/long/path/ComponentName.vue:12";
    expect(maskSecrets(text)).toBe(text);
  });

  it("is idempotent", () => {
    const once = maskSecrets(`token = "${FAKE_STRIPE_KEY}"`);
    expect(maskSecrets(once)).toBe(once);
  });
});
