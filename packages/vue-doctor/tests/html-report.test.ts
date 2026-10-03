import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Window } from "happy-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/index.js";
import { buildReport } from "../src/report/build-report.js";
import { formatHtml, jsonForScript } from "../src/report/format-html.js";
import { formatReport } from "../src/report/format-report.js";
import type { Report, ReportFinding } from "../src/report/model.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const FIXTURES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const DOCS_ORIGIN = "https://remylagerweij.github.io";

const fixtureNames = fs
  .readdirSync(FIXTURES_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(FIXTURES_DIRECTORY, entry.name, "package.json")))
  .map((entry) => entry.name);

const reports = new Map<string, Report>();
beforeAll(async () => {
  for (const name of fixtureNames) {
    const directory = path.join(FIXTURES_DIRECTORY, name);
    const result = await diagnose(directory, { force: true, deadCode: false });
    reports.set(name, buildReport([{ directory, result }], { version: "2.0.0-test", generatedAt: null, scanDirectory: directory }));
  }
});

interface Rendered {
  window: Window;
  document: Document;
}

/** Loads the page in happy-dom, which runs its inline script (CSP is not enforced there; see the CSP test). */
const render = async (html: string): Promise<Rendered> => {
  const window = new Window({ url: "https://report.test/", settings: { enableJavaScriptEvaluation: true } });
  window.document.write(html);
  await window.happyDOM.waitUntilComplete();
  return { window, document: window.document as unknown as Document };
};

const embeddedData = (html: string) => {
  const match = /<script type="application\/json" id="vd-data">(.*?)<\/script>/s.exec(html);
  if (!match) throw new Error("no data block");
  return JSON.parse(match[1]) as { projects: Array<{ name: string }>; rules: Array<{ id: string; docs: string }>; findings: Array<Record<string, any>> };
};

const hash = (content: string): string => `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;

const findingCards = (document: Document): Element[] => [...document.querySelectorAll("#vd-list > li.vd-finding")];

const withFindings = (report: Report, count: number): Report => {
  const clone = structuredClone(report);
  const [project] = clone.projects;
  const template = project.findings[0];
  project.findings = Array.from({ length: count }, (_, index): ReportFinding => ({
    ...template,
    file: `src/generated/file-${String(index % 400).padStart(3, "0")}.vue`,
    line: (index % 90) + 1,
    message: `Generated finding ${index}: something is wrong here`,
    severity: index % 7 === 0 ? "error" : "warning",
    ruleId: index % 3 === 0 ? template.ruleId : `vue-doctor/performance/generated-${index % 20}`,
    status: index % 2 === 0 ? "new" : "baseline",
  }));
  return clone;
};

describe("--format html: every fixture", () => {
  it.each(fixtureNames)("renders %s as a self-contained page with its findings", (name) => {
    const report = reports.get(name) as Report;
    const html = formatReport(report, "html");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(`<title>Vue Doctor report - ${report.projects[0].name}</title>`);

    const data = embeddedData(html);
    expect(data.projects.map((project) => project.name)).toEqual(report.projects.map((project) => project.name));
    expect(data.findings).toHaveLength(report.projects[0].findings.length);
    const ruleIds = new Set(data.rules.map((rule) => rule.id));
    for (const finding of report.projects[0].findings) expect(ruleIds.has(finding.ruleId)).toBe(true);
    for (const finding of report.projects[0].findings.slice(0, 5)) expect(html).toContain(JSON.stringify(finding.file).slice(1, -1));

    // Self-contained: no external resource of any kind.
    expect(html).not.toMatch(/<link\b|<img\b|<iframe\b|<object\b|<embed\b|@import|url\(/i);
    expect(html).not.toMatch(/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i);
  });

  it("lists every finding in the DOM, in pages, with code frames and file:line", async () => {
    const report = reports.get("basic-vue") as Report;
    const { document } = await render(formatHtml(report));
    const total = report.projects[0].findings.length;
    expect(total).toBeGreaterThan(5);
    expect(document.querySelector("#vd-count")?.textContent).toBe(`${total} findings`);
    expect(findingCards(document).length).toBe(Math.min(100, total));
    const withFrame = report.projects[0].findings.find((finding) => finding.codeFrame && finding.category !== "Security") as ReportFinding;
    const text = document.querySelector("#vd-list")?.textContent ?? "";
    expect(text).toContain(`${withFrame.file}:${withFrame.line}`);
    expect(document.querySelectorAll("pre.vd-code").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("pre.vd-code span.vd-hl").length).toBeGreaterThan(0);
  });

  it("renders a clean project without findings", async () => {
    const report = reports.get("clean-vue") as Report;
    const { document } = await render(formatHtml(report));
    expect(document.querySelector("#vd-list")?.textContent).toContain("No findings");
  });
});

describe("--format html: security", () => {
  const hostile = [
    "<img src=x onerror=alert(1)>",
    "</script><script>alert(1)</script>",
    "<!-- -->",
    "\u2028\u2029 line separators",
    "<svg/onload=alert(1)>",
    "&amp; &lt;b&gt;",
  ];

  const hostileReport = (): Report => {
    const report = structuredClone(reports.get("basic-vue") as Report);
    const [project] = report.projects;
    project.name = hostile[0];
    project.root = hostile[1];
    project.baseline = { path: hostile[2], matched: 1, new: 1, fixed: 0 };
    project.skipped = [{ tool: hostile[4], reason: hostile[1] }];
    project.findings = hostile.map((text, index) => ({
      ...project.findings[0],
      file: `src/${text}.vue`,
      message: text,
      help: text,
      ruleId: `vue-doctor/performance/${text}`,
      category: text,
      docsUrl: index === 0 ? "https://evil.example/steal" : index === 1 ? "javascript:alert(1)" : `${DOCS_ORIGIN}/vue-doctor/rules/x`,
      codeFrame: `> 1 | ${text}`,
      agentPrompt: `fix ${text}\nCode:\n> 1 | ${text}`,
      line: index + 1,
    }));
    return report;
  };

  it("keeps hostile strings out of the markup", () => {
    const html = formatHtml(hostileReport());
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).not.toContain("<!--");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toMatch(/[\u2028\u2029]/);
    expect(html).toContain("&#60;img src=x onerror=alert(1)&#62;");
  });

  it("keeps hostile strings inert in the DOM and round-trips them as text", async () => {
    const report = hostileReport();
    const html = formatHtml(report);
    const { window, document } = await render(html);
    expect(document.querySelectorAll("script")).toHaveLength(2);
    expect(document.querySelectorAll("img, svg, iframe, object, embed")).toHaveLength(0);
    expect(document.querySelectorAll("[onerror], [onload]")).toHaveLength(0);
    expect(document.querySelectorAll("style")).toHaveLength(1);

    expect(embeddedData(html).findings.map((finding) => finding.m)).toEqual(hostile);
    const text = document.querySelector("#vd-list")?.textContent ?? "";
    for (const entry of hostile) expect(text).toContain(entry);
    expect(document.querySelector("h3")?.textContent).toBe(hostile[0]);
    expect(document.title).toBe(`Vue Doctor report - ${hostile[0]}`);
    expect((window as unknown as { alert?: unknown }).alert).toBeUndefined();
  });

  it("links documentation only on the trusted origin", async () => {
    const { document } = await render(formatHtml(hostileReport()));
    const hrefs = [...document.querySelectorAll("a[href]")].map((link) => link.getAttribute("href") ?? "");
    const external = hrefs.filter((href) => !href.startsWith("#"));
    // The two findings with a hostile docsUrl get no link; the other four point at the docs origin.
    expect(external).toHaveLength(4);
    for (const href of external) expect(href).toBe(`${DOCS_ORIGIN}/vue-doctor/rules/x`);
    for (const link of document.querySelectorAll("a[target=_blank]")) expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("allows only its own two inline blocks in the Content-Security-Policy", () => {
    const html = formatHtml(hostileReport());
    const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
    const style = /<style>(.*?)<\/style>/s.exec(html)?.[1] ?? "";
    const script = /<script>(.*?)<\/script>/s.exec(html)?.[1] ?? "";
    expect(policy).toContain(`style-src ${hash(style)}`);
    expect(policy).toContain(`script-src ${hash(script)}`);
    expect(script).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|setAttribute\("style"/);
  });

  it("serializes JSON so it cannot leave the script block", () => {
    const json = jsonForScript({ value: "</script><!--\u2028\u2029&" });
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(json).value).toBe("</script><!--\u2028\u2029&");
  });

  it("never shows source for Security findings (frame, prompt) and masks nothing else away", () => {
    const secret = "sk_live_0123456789abcdefghijkl";
    const report = structuredClone(reports.get("basic-vue") as Report);
    const [project] = report.projects;
    const base = project.findings[0];
    project.findings = [
      {
        ...base,
        category: "Security",
        ruleId: "vue-doctor/security/no-secrets-in-client-code",
        message: "Hardcoded secret",
        codeFrame: `> 3 | const key = "${secret}"`,
        agentPrompt: `Fix it\nCode:\n> 3 | const key = "${secret}"\nDocs: x`,
      },
      { ...base, category: "Performance", codeFrame: "> 1 | const visible = 1", agentPrompt: "Fix\nCode:\n> 1 | const visible = 1" },
    ];
    const html = formatHtml(report);
    expect(html).not.toContain(secret);
    expect(html).toContain("const visible = 1");
    const data = embeddedData(html);
    expect(data.findings[0].cf).toBeUndefined();
    // The prompt of the non-secret finding carries a placeholder instead of repeating its frame.
    expect(data.findings[1].ap).toContain("\u0001");
  });
});

describe("--format html: interaction", () => {
  const change = (document: Document, selector: string, value: string): void => {
    const select = document.querySelector(selector) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new (document.defaultView as unknown as Window)["Event"]("change", { bubbles: true }) as unknown as Event);
  };

  it("filters by severity, category, rule and text, and pages through the rest", async () => {
    const report = withFindings(reports.get("basic-vue") as Report, 250);
    const { document, window } = await render(formatHtml(report));
    expect(findingCards(document)).toHaveLength(100);
    const more = document.querySelector("#vd-more button") as HTMLButtonElement;
    expect(more.textContent).toContain("150");
    more.click();
    expect(findingCards(document)).toHaveLength(200);
    (document.querySelector("#vd-more button") as HTMLButtonElement).click();
    expect(findingCards(document)).toHaveLength(250);
    expect(document.querySelector("#vd-more button")).toBeNull();

    const errors = report.projects[0].findings.filter((finding) => finding.severity === "error").length;
    change(document, "#vd-f-severity", "error");
    expect(document.querySelector("#vd-count")?.textContent).toBe(`${errors} of 250 findings match the filters`);

    change(document, "#vd-f-severity", "");
    const ruleId = "vue-doctor/performance/generated-1";
    change(document, "#vd-f-rule", ruleId);
    const expectedRule = report.projects[0].findings.filter((finding) => finding.ruleId === ruleId).length;
    expect(findingCards(document)).toHaveLength(Math.min(100, expectedRule));

    change(document, "#vd-f-rule", "");
    const search = document.querySelector("#vd-f-query") as HTMLInputElement;
    search.value = "file-007.vue";
    search.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const expectedSearch = report.projects[0].findings.filter((finding) => finding.file.includes("file-007.vue")).length;
    expect(document.querySelector("#vd-count")?.textContent).toBe(`${expectedSearch} of 250 findings match the filters`);
  });

  it("offers a new-only filter only when findings have a baseline status", async () => {
    const report = reports.get("basic-vue") as Report;
    const plain = await render(formatHtml(report));
    expect((plain.document.querySelector("#vd-f-new-label") as HTMLElement).hidden).toBe(true);

    const withStatus = withFindings(report, 20);
    const { document, window } = await render(formatHtml(withStatus));
    expect((document.querySelector("#vd-f-new-label") as HTMLElement).hidden).toBe(false);
    const checkbox = document.querySelector("#vd-f-new") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event);
    expect(findingCards(document)).toHaveLength(10);
  });

  it("collapses the AI prompt until opened and fills it with the finding's own frame", async () => {
    const report = reports.get("basic-vue") as Report;
    const { document, window } = await render(formatHtml(report));
    const details = document.querySelector("#vd-list details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("pre")).toBeNull();
    details.open = true;
    details.dispatchEvent(new window.Event("toggle") as unknown as Event);
    const prompt = details.querySelector("pre.vd-prompt")?.textContent ?? "";
    expect(prompt).toContain("You are fixing a Vue Doctor finding");
    expect(prompt).not.toContain("\u0001");
  });

  it("toggles the theme and survives unavailable storage", async () => {
    const report = reports.get("basic-vue") as Report;
    const { document, window } = await render(formatHtml(report));
    const root = document.documentElement;
    const before = root.getAttribute("data-theme");
    expect(["light", "dark"]).toContain(before);
    (document.querySelector("#vd-theme") as HTMLButtonElement).click();
    expect(root.getAttribute("data-theme")).toBe(before === "dark" ? "light" : "dark");

    const blocked = new Window({ url: "https://report.test/", settings: { enableJavaScriptEvaluation: true } });
    Object.defineProperty(blocked, "localStorage", { get: () => { throw new Error("blocked"); } });
    blocked.document.write(formatHtml(report));
    await blocked.happyDOM.waitUntilComplete();
    expect(blocked.document.documentElement.getAttribute("data-theme")).toBeTruthy();
    expect(window).toBeDefined();
  });

  it("is accessible by structure: headings, labelled controls, live regions", async () => {
    const { document } = await render(formatHtml(reports.get("basic-vue") as Report));
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("main h2")).not.toBeNull();
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    for (const control of document.querySelectorAll("#vd-filter-form input, #vd-filter-form select")) {
      expect(control.closest("label")).not.toBeNull();
    }
    expect(document.querySelector("[role=status]")).not.toBeNull();
    for (const button of document.querySelectorAll("button")) expect((button.textContent ?? "").trim() || button.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("--format html: large reports", () => {
  it("handles 5,000 findings in reasonable size and time", async () => {
    const report = withFindings(reports.get("basic-vue") as Report, 5000);
    const started = performance.now();
    const html = formatHtml(report);
    const formatMs = performance.now() - started;
    const megabytes = Buffer.byteLength(html) / 1024 / 1024;
    expect(embeddedData(html).findings).toHaveLength(5000);
    expect(formatMs).toBeLessThan(3000);
    expect(megabytes).toBeLessThan(8);

    const { document } = await render(html);
    // Only the first page is in the DOM; the rest is reachable through "show more" and the filters.
    expect(findingCards(document)).toHaveLength(100);
    expect(document.querySelector("#vd-count")?.textContent).toBe("5000 findings");
  });
});

describe("--format html (CLI)", () => {
  const env = { ...process.env, NO_COLOR: "1", CI: "1" };
  const copyFixture = (): string => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-html-"));
    fs.cpSync(path.join(FIXTURES_DIRECTORY, "basic-vue"), target, { recursive: true });
    return target;
  };
  const listFiles = (directory: string): string[] =>
    fs.readdirSync(directory, { recursive: true, withFileTypes: true }).map((entry) => path.join(entry.parentPath, entry.name)).sort();

  it("prints HTML on stdout by default and writes nothing into the project", () => {
    const project = copyFixture();
    const before = listFiles(project);
    const run = spawnSync(process.execPath, [CLI_PATH, project, "--format", "html", "--no-dead-code", "--no-timestamp", "--no-cache"], {
      encoding: "utf-8",
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(run.status).toBe(0);
    expect(run.stdout.startsWith("<!doctype html>")).toBe(true);
    expect(run.stdout).toContain('id="vd-data"');
    expect(listFiles(project)).toEqual(before);
  });

  it("writes --output and creates its directory", () => {
    const project = copyFixture();
    const before = listFiles(project);
    const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-html-out-")), "nested", "report.html");
    const run = spawnSync(process.execPath, [CLI_PATH, project, "--format", "html", "--output", outputFile, "--no-dead-code"], {
      encoding: "utf-8",
      env,
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
    expect(fs.readFileSync(outputFile, "utf-8")).toContain("<title>Vue Doctor report");
    expect(listFiles(project)).toEqual(before);
  });

  it("keeps --report as a deprecated alias that writes to a temp directory, never the project", () => {
    const project = copyFixture();
    const before = listFiles(project);
    const run = spawnSync(process.execPath, [CLI_PATH, project, "--report", "--no-dead-code"], { encoding: "utf-8", env });
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("--report is deprecated");
    const written = /HTML report written to (.+\.html)/.exec(run.stderr)?.[1]?.trim() ?? "";
    expect(written).not.toBe("");
    expect(path.resolve(written).startsWith(path.resolve(project))).toBe(false);
    expect(path.resolve(written).startsWith(path.resolve(os.tmpdir()))).toBe(true);
    expect(fs.readFileSync(written, "utf-8")).toContain('id="vd-data"');
    // The text report is still printed.
    expect(run.stdout).toContain("Score");
    expect(listFiles(project)).toEqual(before);
    fs.rmSync(path.dirname(written), { recursive: true, force: true });
  });
});
