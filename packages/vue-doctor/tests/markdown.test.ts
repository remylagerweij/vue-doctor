import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/index.js";
import { buildReport } from "../src/report/build-report.js";
import { formatReport } from "../src/report/format-report.js";
import {
  GITHUB_COMMENT_LIMIT,
  renderMarkdown,
  renderMarkdownFinding,
  renderMarkdownSummary,
} from "../src/report/format-markdown.js";
import { escapeMarkdown, markdownCode, markdownFence } from "../src/report/markdown-escape.js";
import type { Report, ReportFinding } from "../src/report/model.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const FIXTURES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const ZWSP = "​";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let basicReport: Report;
beforeAll(async () => {
  const directory = path.join(FIXTURES_DIRECTORY, "basic-vue");
  const result = await diagnose(directory, { force: true, deadCode: false });
  basicReport = buildReport([{ directory, result }], { version: "2.0.0-test", generatedAt: null, scanDirectory: directory });
});

const HOSTILE_STRINGS = [
  "<img src=x onerror=alert(1)>",
  "<!-- hidden -->",
  "[link](javascript:alert(1))",
  "@org/team and @octocat",
  "see #1 and org/repo#22",
  "```\n```\n# heading",
  "a | b | c",
  "line one\nline two\r\n\r\n- list",
  "&amp; &lt;script&gt; &#60;",
  "https://evil.example/x www.evil.example mail@evil.example",
];

const hostileFinding = (overrides: Partial<ReportFinding> = {}): ReportFinding => ({
  ...structuredClone(basicReport.projects[0].findings[0]),
  ...overrides,
});

const hostileReport = (): Report => {
  const report = structuredClone(basicReport);
  const [project] = report.projects;
  project.name = "<b>name</b> @org/team | #7";
  project.score.categories[0].category = "Cat | <i>egory</i>\nbreak";
  project.skipped = [{ tool: "knip", reason: "<script>alert(1)</script> [x](javascript:alert(1)) @someone" }];
  project.findings = HOSTILE_STRINGS.map((text, index) =>
    hostileFinding({
      message: text,
      help: text,
      file: `src/${text}.vue`,
      line: index + 1,
      fingerprint: `fp-${index} --> <script>`,
      codeFrame: undefined,
    }),
  );
  return report;
};

/** Output with every code span and fence removed: what is left is rendered as Markdown/HTML text. */
const withoutCode = (markdown: string): string =>
  markdown.replace(/^(`{3,}).*?^\1$/gms, "").replace(/(`+)(?:(?!\1).)+?\1/g, "");

describe("escaping primitives", () => {
  it("escapes HTML and Markdown control characters and keeps one line", () => {
    const escaped = escapeMarkdown("<b>*x*</b>\n_y_ [a](b) `c` | d");
    expect(escaped).toBe("&lt;b&gt;\\*x\\*&lt;/b&gt; \\_y\\_ \\[a\\]\\(b\\) \\`c\\` \\| d");
    expect(escaped).not.toContain("\n");
  });

  it("neutralises mentions, issue references and autolinks without changing the visible text", () => {
    expect(escapeMarkdown("@org/team")).toBe(`@${ZWSP}org/team`);
    expect(escapeMarkdown("#12")).toBe(`\\#${ZWSP}12`);
    expect(escapeMarkdown("https://x.dev")).toBe(`https:/${ZWSP}/x.dev`);
    expect(escapeMarkdown("www.x.dev")).toBe(`www${ZWSP}.x.dev`);
    expect(escapeMarkdown("a@b.dev")).toBe(`a@${ZWSP}b.dev`);
    expect(escapeMarkdown("&amp;")).toBe("&amp;amp;");
  });

  it("strips control and bidirectional override characters", () => {
    expect(escapeMarkdown("a\u0000b‮c\u0007")).toBe("abc");
  });

  it("uses a code fence longer than any backtick run inside", () => {
    expect(markdownCode("a ``` b")).toBe("````a ``` b````");
    expect(markdownCode("`edge`")).toBe("`` `edge` ``");
    expect(markdownCode("x | y", { inTable: true })).toBe("`x \\| y`");
    expect(markdownCode("a\nb")).toBe("`a b`");
    expect(markdownFence("```\nboom\n```")).toBe("````text\n```\nboom\n```\n````");
  });
});

describe("injection safety", () => {
  let markdown = "";
  let prose = "";
  beforeAll(() => {
    markdown = renderMarkdown(hostileReport(), { stickyMarker: true, agentPrompts: false });
    prose = withoutCode(markdown);
  });

  it("renders no raw HTML from user text", () => {
    expect(prose).not.toMatch(/<(img|b|i|script)\b/i);
    expect(markdown).toContain("&lt;img src=x onerror=alert\\(1\\)&gt;");
    // Only the formatter's own marker comment and tags remain.
    expect([...prose.matchAll(/<!--(.*?)-->/g)].map((match) => match[1].trim())).toEqual(["vue-doctor:summary"]);
    expect(prose).not.toContain("<!-- hidden -->");
  });

  it("makes links inert", () => {
    expect(prose).not.toContain("](javascript");
    expect(prose).toContain("\\[link\\]\\(javascript:alert\\(1\\)\\)");
    expect(prose).not.toMatch(/https?:\/\/(?!remylagerweij\.github\.io)/);
    expect(prose).not.toMatch(/\bwww\./);
    expect(prose).not.toMatch(/\w@(?!​)/);
  });

  it("neutralises @mentions and issue references", () => {
    expect(prose).not.toMatch(/@(?!​)/);
    expect(prose).not.toMatch(/#\d/);
    expect(markdown).toContain(`@${ZWSP}org/team`);
    expect(markdown).toContain(`\\#${ZWSP}1`);
  });

  it("keeps entities literal", () => {
    expect(markdown).toContain(`&amp;amp; &amp;lt;script&amp;gt; &amp;\\#${ZWSP}60;`);
  });

  it("cannot break out of code spans or inject headings through backticks and newlines", () => {
    // The path contains ``` and a newline; the span fence is longer and stays on one line.
    expect(markdown).toContain("````");
    for (const line of markdown.split("\n")) {
      expect(line).not.toMatch(/^# heading/);
      expect(line).not.toMatch(/^- list/);
    }
    expect(markdown).not.toContain("\r");
  });

  it("keeps table rows intact with pipes and line breaks in cell text", () => {
    const rows = markdown.split("\n").filter((line) => line.startsWith("|"));
    // header + separator + one row per category, every row with 4 unescaped cells
    expect(rows).toHaveLength(2 + hostileReport().projects[0].score.categories.length);
    for (const row of rows) expect(row.replace(/\\\|/g, "").split("|")).toHaveLength(6);
    expect(markdown).toContain("Cat \\| &lt;i&gt;egory&lt;/i&gt; break");
  });

  it("escapes the project name, skipped reasons and marker ids", () => {
    const report = hostileReport();
    report.projects.push({ ...structuredClone(report.projects[0]), name: "second", root: "packages/second" });
    report.summary.projects = 2;
    const multi = renderMarkdown(report);
    expect(multi).toContain(`### &lt;b&gt;name&lt;/b&gt; @${ZWSP}org/team \\| \\#${ZWSP}7`);
    expect(multi).toContain("&lt;script&gt;alert\\(1\\)&lt;/script&gt;");
    const finding = renderMarkdownFinding(hostileFinding({ fingerprint: "ab:12 --> <script>" }), { marker: true });
    expect(finding.split("\n")[0]).toBe("<!-- vue-doctor:finding:ab:12script -->");
  });

  it("only links trusted docs URLs", () => {
    const evil = renderMarkdownFinding(hostileFinding({ docsUrl: "javascript:alert(1)" }));
    expect(evil).not.toContain("javascript:");
    expect(evil).not.toContain("](");
    const foreign = renderMarkdownFinding(hostileFinding({ docsUrl: "https://evil.example/rules/x" }));
    expect(foreign).not.toContain("evil.example");
    const ok = renderMarkdownFinding(hostileFinding());
    expect(ok).toContain("[Documentation](https://remylagerweij.github.io/vue-doctor/");
    const tricky = renderMarkdownFinding(hostileFinding({ docsUrl: "https://remylagerweij.github.io/vue-doctor/a)b c" }));
    expect(tricky).toContain("a%29b%20c");
  });

  it("renders hostile single findings with a collapsed prompt in a fence that cannot be closed", () => {
    const text = renderMarkdownFinding(hostileFinding({ message: "<img src=x onerror=alert(1)>", agentPrompt: "fix\n```\n</details>\n```" }));
    expect(text).toContain("<details>");
    expect(text).toContain("````text\nfix\n```\n</details>\n```\n````");
    expect(text).not.toContain("<img");
  });
});

describe("secrets", () => {
  const SECRET_FRAME = '  4 | const apiKey = "sk-live-0123456789abcdef"\n> 5 | const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWX"';
  const secretFinding = (): ReportFinding =>
    hostileFinding({
      ruleId: "vue-doctor/security/no-hardcoded-secret",
      category: "Security",
      message: 'Potential secret in client code "apiKey"',
      codeFrame: SECRET_FRAME,
      agentPrompt: `Fix it.\nCode:\n${SECRET_FRAME}\nDone.`,
    });

  it("never prints the code frame of a Security finding, not even through the agent prompt", () => {
    const single = renderMarkdownFinding(secretFinding());
    expect(single).not.toContain("sk-live");
    expect(single).not.toContain("ghp_");
    expect(single).toContain("[code omitted for security findings]");

    const report = structuredClone(basicReport);
    report.projects[0].findings = [secretFinding()];
    const full = renderMarkdown(report, { agentPrompts: true });
    expect(full).not.toContain("sk-live");
    expect(full).not.toContain("ghp_");
  });

  it("shows code frames of other categories", () => {
    const single = renderMarkdownFinding(hostileFinding({ category: "Performance", codeFrame: "> 1 | const a = 1" }));
    expect(single).toContain("> 1 | const a = 1");
  });
});

describe("summary content", () => {
  it("shows the score, cap note, category table, impact hints and counts", () => {
    const report = structuredClone(basicReport);
    const [project] = report.projects;
    project.score.cap = { value: 50, reason: "security-error", ruleId: "vue-doctor/security/no-eval" };
    project.score.rawScore = 77;
    project.score.impact = [{ ruleId: "vue-doctor/security/no-eval", gain: 9 }];
    const summary = renderMarkdownSummary(report);
    expect(summary).toContain(`**${project.score.value}/100**`);
    expect(summary).toContain("**Score capped at 50** (77 before the cap) because of a high-confidence security error in `vue-doctor/security/no-eval`.");
    expect(summary).toContain("| Category | Score | Errors | Warnings |");
    expect(summary).toContain("Fixing [`vue-doctor/security/no-eval`](https://remylagerweij.github.io/vue-doctor/rules/security/no-eval)");
    expect(summary).toContain("**+9**");
    expect(summary).toMatch(/\d+ errors? · \d+ warnings?/);
  });

  it("shows baseline counts, skipped analyzers and the sticky marker", () => {
    const report = structuredClone(basicReport);
    report.projects[0].baseline = { path: ".vue-doctor/baseline.json", matched: 5, new: 2, fixed: 1 };
    report.projects[0].skipped = [{ tool: "knip", reason: "timed out" }];
    const summary = renderMarkdownSummary(report, { stickyMarker: true });
    expect(summary.startsWith("<!-- vue-doctor:summary -->\n")).toBe(true);
    expect(summary).toContain("Baseline `.vue-doctor/baseline.json`: 2 new, 1 fixed, 5 known.");
    expect(summary).toContain("> [!WARNING]\n> knip did not run: timed out. The score is incomplete.");
  });

  it("has a section per project in a monorepo", () => {
    const report = structuredClone(basicReport);
    report.projects.push({ ...structuredClone(report.projects[0]), name: "second", root: "packages/second" });
    report.summary.projects = 2;
    const summary = renderMarkdownSummary(report);
    expect(summary).toContain("## 🩺 Vue Doctor: 2 projects");
    expect(summary).toContain(`### ${report.projects[0].name}:`);
    expect(summary).toContain("### second:");
  });

  it("reports a clean project", () => {
    const report = structuredClone(basicReport);
    report.projects[0].findings = [];
    report.projects[0].score.categories = [];
    expect(renderMarkdown(report)).toContain("✅ **No issues found.**");
  });

  it("lists only new findings with newOnly", () => {
    const report = structuredClone(basicReport);
    const { findings } = report.projects[0];
    findings.forEach((finding) => (finding.status = "baseline"));
    findings[0].status = "new";
    const text = renderMarkdown(report, { newOnly: true });
    expect(text.match(/^- `/gm)).toHaveLength(1);
    expect(text).toContain("**new**");
  });
});

describe("size budget", () => {
  const bigReport = (count: number): Report => {
    const report = structuredClone(basicReport);
    const template = report.projects[0].findings[0];
    report.projects[0].findings = Array.from({ length: count }, (_, index) => ({
      ...template,
      ruleId: `vue-doctor/performance/rule-${index % 40}`,
      severity: index % 7 === 0 ? ("error" as const) : ("warning" as const),
      file: `src/components/File${index}.vue`,
      line: index + 1,
      message: "x".repeat(300),
      agentPrompt: "p".repeat(2000),
    }));
    return report;
  };

  it("caps the number of findings and says how many are not shown", () => {
    const text = renderMarkdown(bigReport(500), { maxFindings: 20, maxFindingsPerRule: 3 });
    expect(text.match(/^- `/gm)?.length).toBeLessThanOrEqual(20);
    expect(text).toMatch(/… and 4\d\d more findings not shown/);
  });

  it("stays within the GitHub limit, never leaves open blocks, and is deterministic", () => {
    const options = { maxFindings: 5000, maxFindingsPerRule: 5000, agentPrompts: true, collapseFindings: true };
    const text = renderMarkdown(bigReport(400), options);
    expect(text.length).toBeLessThanOrEqual(GITHUB_COMMENT_LIMIT);
    expect(text).toMatch(/not shown/);
    expect(text.match(/<details>/g)?.length).toBe(text.match(/<\/details>/g)?.length);
    const fences = text.split("\n").filter((line) => /^\s*`{3,}/.test(line));
    expect(fences.length % 2).toBe(0);
    expect(renderMarkdown(bigReport(400), options)).toBe(text);
    // Errors are listed before warnings when the list is cut.
    expect(text).toContain("rule-0");
  });

  it("honours a small maxLength", () => {
    const text = renderMarkdown(bigReport(100), { maxLength: 3000 });
    expect(text.length).toBeLessThanOrEqual(3000);
    expect(renderMarkdown(bigReport(100), { maxLength: 300 }).length).toBeLessThanOrEqual(300);
  });
});

describe("basic-vue summary", () => {
  it("matches the reviewed snapshot", async () => {
    await expect(renderMarkdown(basicReport)).toMatchFileSnapshot("./__snapshots__/markdown-basic-vue.md");
  });

  it("is selectable through formatReport", () => {
    expect(formatReport(basicReport, "markdown")).toBe(renderMarkdown(basicReport));
  });
});

describe("--format markdown (CLI)", () => {
  const env = { ...process.env, NO_COLOR: "1", CI: "1" };
  const basic = path.join(FIXTURES_DIRECTORY, "basic-vue");

  it("prints Markdown on stdout, supports --output and writes the step summary", () => {
    const stdoutRun = spawnSync(process.execPath, [CLI_PATH, basic, "--format", "markdown", "--no-dead-code", "--no-timestamp"], {
      encoding: "utf-8",
      env,
      cwd: FIXTURES_DIRECTORY,
    });
    expect(stdoutRun.status).toBe(0);
    expect(stdoutRun.stdout).toContain("## 🩺 Vue Doctor:");

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-markdown-"));
    const outputFile = path.join(directory, "out", "report.md");
    const summaryFile = path.join(directory, "summary.md");
    const fileRun = spawnSync(
      process.execPath,
      [CLI_PATH, basic, "--format", "markdown", "--no-dead-code", "--no-timestamp", "--output", outputFile, "--github-summary"],
      { encoding: "utf-8", env: { ...env, GITHUB_STEP_SUMMARY: summaryFile }, cwd: FIXTURES_DIRECTORY },
    );
    expect(fileRun.status).toBe(0);
    expect(fileRun.stdout).toBe("");
    expect(fs.readFileSync(outputFile, "utf-8")).toBe(stdoutRun.stdout);
    const summary = fs.readFileSync(summaryFile, "utf-8");
    expect(summary).toContain("## 🩺 Vue Doctor:");
    expect(summary).toContain("<details>");
  });
});
