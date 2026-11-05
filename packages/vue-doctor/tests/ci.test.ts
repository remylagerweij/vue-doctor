import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  emitAnnotations,
  extractFindingMarker,
  extractTrackedFindings,
  groupFindings,
  postReviewComments,
  postStickySummary,
  renderStickyComment,
  FINDING_MARKER_PREFIX,
  TRACKED_MARKER_PREFIX,
  type FeedbackOptions,
  type TrackedFinding,
} from "../src/ci/feedback.js";
import type { GitHubClient } from "../src/ci/github-client.js";
import { calculateScoreDelta } from "../src/ci/score-cache.js";
import {
  renderMainWorkflow,
  renderForkCommentWorkflow,
  detectPackageManager,
} from "../src/ci/workflow-generator.js";
import type { Report, ReportFinding } from "../src/report/model.js";

const createFinding = (overrides: Partial<ReportFinding> = {}): ReportFinding =>
  ({
    ruleId: "vue-doctor/security/no-eval",
    category: "security",
    severity: "error",
    confidence: "high",
    fixable: false,
    message: "Avoid using eval()",
    file: "src/App.vue",
    line: 10,
    column: 5,
    fingerprint: "abc123hash",
    codeFrame: "10 | eval(x)",
    help: "Do not use eval()",
    docsUrl: "https://example.com/rules/no-eval",
    ...overrides,
  }) as unknown as ReportFinding;

const createMockReport = (score: number, findings: ReportFinding[] = []): Report =>
  ({
    format: "vue-doctor/report@2",
    scoreVersion: 2,
    tool: { name: "vue-doctor", version: "2.0.0" },
    summary: {
      projects: 1,
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
    },
    projects: [
      {
        name: "test-app",
        root: ".",
        framework: "vite",
        vueVersion: "3.5.0",
        typescript: true,
        sourceFiles: 10,
        scope: { mode: "full" },
        score: { value: score, label: "Good", rawScore: score, cap: null, categories: [], impact: [] },
        summary: {
          errors: findings.filter((f) => f.severity === "error").length,
          warnings: findings.filter((f) => f.severity === "warning").length,
          suppressed: 0,
        },
        skipped: [],
        ruleGroups: [],
        findings,
      },
    ],
  }) as unknown as Report;

describe("CI workflow generator", () => {
  it("renders main workflow with defaults", () => {
    const yaml = renderMainWorkflow();
    expect(yaml).toContain("name: Vue Doctor");
    expect(yaml).toContain("uses: remylagerweij/vue-doctor@v2");
    expect(yaml).toContain("fail-on: error");
    expect(yaml).toContain("agent-prompt: true");
    expect(yaml).not.toContain("security-events: write");
  });

  it("includes security-events permission and sarif input when sarif is enabled", () => {
    const yaml = renderMainWorkflow({ sarif: true });
    expect(yaml).toContain("security-events: write");
    expect(yaml).toContain("sarif: true");
  });

  it("renders fork comment workflow with workflow_run trigger", () => {
    const yaml = renderForkCommentWorkflow();
    expect(yaml).toContain("workflow_run:");
    expect(yaml).toContain('workflows: ["Vue Doctor"]');
    expect(yaml).toContain("feedback-only: true");
    expect(yaml).toContain("report-json: vue-doctor.json");
  });

  it("detects package manager correctly", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pm-test-"));
    try {
      expect(detectPackageManager(temp)).toBe("npm");
      fs.writeFileSync(path.join(temp, "pnpm-lock.yaml"), "");
      expect(detectPackageManager(temp)).toBe("pnpm");
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe("CI PR comment feedback", () => {
  it("extracts finding marker ID from comment text", () => {
    const marker = "abc123_def";
    const comment = `Some comment\n<!-- vue-doctor:finding:${marker} -->\nDetails here`;
    expect(extractFindingMarker(comment)).toBe(marker);
    expect(extractFindingMarker("No marker here")).toBeNull();
  });

  it("groups findings by finding mode (individual)", () => {
    const f1 = createFinding({ line: 10, fingerprint: "fp1" });
    const f2 = createFinding({ line: 20, fingerprint: "fp2" });
    const groups = groupFindings([f1, f2], "finding", true);

    expect(groups).toHaveLength(2);
    expect(groups[0].marker).toContain("fp1");
    expect(groups[0].body).toContain("Avoid using eval");
    expect(groups[0].body).toContain(FINDING_MARKER_PREFIX);
    expect(groups[1].marker).toContain("fp2");
  });

  it("groups findings by rule-per-file", () => {
    const f1 = createFinding({ file: "src/Foo.vue", line: 10, ruleId: "rule-a" });
    const f2 = createFinding({ file: "src/Foo.vue", line: 15, ruleId: "rule-a" });
    const f3 = createFinding({ file: "src/Foo.vue", line: 20, ruleId: "rule-b" });
    const groups = groupFindings([f1, f2, f3], "rule-per-file", true);

    expect(groups).toHaveLength(2);
    const groupA = groups.find((g) => g.ruleId === "rule-a")!;
    expect(groupA.findings).toHaveLength(2);
    expect(groupA.body).toContain("`rule-a` (2 findings)");
  });

  it("groups findings by rule", () => {
    const f1 = createFinding({ file: "src/Foo.vue", line: 10, ruleId: "rule-a" });
    const f2 = createFinding({ file: "src/Bar.vue", line: 25, ruleId: "rule-a" });
    const groups = groupFindings([f1, f2], "rule", false);

    expect(groups).toHaveLength(1);
    expect(groups[0].findings).toHaveLength(2);
    expect(groups[0].body).toContain("`rule-a` (2 findings)");
  });
});

describe("CI feedback paths in a monorepo", () => {
  const withRoot = (root: string, findings: ReportFinding[]): Report => {
    const report = createMockReport(80, findings);
    return { ...report, projects: [{ ...report.projects[0], root }] };
  };

  const reviewPathsFor = async (report: Report, sourceRootPrefix?: string): Promise<string[]> => {
    const createReviewComment = vi.fn().mockResolvedValue(undefined);
    const client = {
      listReviewComments: vi.fn().mockResolvedValue([]),
      createReviewComment,
    } as unknown as GitHubClient;
    const options: FeedbackOptions = {
      feedback: ["findings"],
      grouping: "rule-per-file",
      maxComments: 30,
      agentPrompt: false,
      owner: "o",
      repo: "r",
      pullNumber: 1,
      commitSha: "sha",
      sourceRootPrefix,
    };
    await postReviewComments(client, options, report);
    return createReviewComment.mock.calls.map((call) => call[3].path);
  };

  it("anchors review comments at repository paths when the scan runs in a sub-directory", async () => {
    const report = withRoot(".", [createFinding({ file: "app/components/Nav.vue" })]);
    expect(await reviewPathsFor(report, "apps/web")).toEqual(["apps/web/app/components/Nav.vue"]);
  });

  it("joins workspace project roots to the review comment path", async () => {
    const report = withRoot("packages/ui", [createFinding({ file: "src/Button.vue" })]);
    expect(await reviewPathsFor(report)).toEqual(["packages/ui/src/Button.vue"]);
  });

  it("leaves paths unchanged for a project at the repository root", async () => {
    const report = withRoot(".", [createFinding({ file: "src/App.vue" })]);
    expect(await reviewPathsFor(report, "")).toEqual(["src/App.vue"]);
  });

  it("emits escaped annotations with repository paths", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const report = withRoot(".", [createFinding({ file: "src/App.vue", message: "a\n::add-mask::x" })]);
      emitAnnotations(report, "apps/web");
      const output = write.mock.calls.map((call) => String(call[0])).join("");
      expect(output).toContain("file=apps/web/src/App.vue");
      expect(output).not.toContain("\n::add-mask::");
    } finally {
      write.mockRestore();
    }
  });
});

describe("CI feedback for several scans of one PR", () => {
  const optionsFor = (sourceRootPrefix: string): FeedbackOptions => ({
    feedback: ["summary", "findings"],
    grouping: "rule-per-file",
    maxComments: 30,
    agentPrompt: false,
    owner: "o",
    repo: "r",
    pullNumber: 1,
    commitSha: "sha",
    sourceRootPrefix,
  });

  const summaryReport = (score: number, findings: ReportFinding[] = []): Report => {
    const report = createMockReport(score, findings);
    const project = {
      ...report.projects[0],
      summary: { errors: report.summary.errors, warnings: report.summary.warnings, suppressed: 0 },
      skipped: [],
      ruleGroups: [],
    };
    return { ...report, projects: [project] } as Report;
  };

  const summaryClient = (bodies: string[]) => {
    const client = {
      listIssueComments: vi.fn().mockResolvedValue(bodies.map((body, index) => ({ id: index + 1, body }))),
      createIssueComment: vi.fn().mockResolvedValue(undefined),
      updateIssueComment: vi.fn().mockResolvedValue(undefined),
    };
    return client;
  };

  it("keeps one sticky summary per scanned directory", async () => {
    const report = summaryReport(80, [createFinding()]);
    const web = summaryClient([]);
    await postStickySummary(web as unknown as GitHubClient, optionsFor("apps/web"), report);
    const webBody: string = web.createIssueComment.mock.calls[0][3];
    expect(webBody.startsWith("<!-- vue-doctor:summary:apps/web -->")).toBe(true);
    expect(webBody).toContain("## 🩺 Vue Doctor (`apps/web`)");

    const admin = summaryClient([webBody]);
    await postStickySummary(admin as unknown as GitHubClient, optionsFor("apps/admin"), report);
    expect(admin.updateIssueComment).not.toHaveBeenCalled();
    expect(admin.createIssueComment).toHaveBeenCalledTimes(1);

    const rerun = summaryClient([webBody]);
    await postStickySummary(rerun as unknown as GitHubClient, optionsFor("apps/web"), summaryReport(70));
    expect(rerun.createIssueComment).not.toHaveBeenCalled();
    expect(rerun.updateIssueComment.mock.calls[0][2]).toBe(1);
  });

  it("keeps the unscoped summary marker for a scan of the repository root", async () => {
    const client = summaryClient(["<!-- vue-doctor:summary:apps/web -->\nother project"]);
    await postStickySummary(client as unknown as GitHubClient, optionsFor(""), summaryReport(80));
    expect(client.updateIssueComment).not.toHaveBeenCalled();
    const body: string = client.createIssueComment.mock.calls[0][3];
    expect(body.startsWith("<!-- vue-doctor:summary -->\n")).toBe(true);
  });

  it("only removes stale review comments of its own scan", async () => {
    const other = "<!-- vue-doctor:finding:apps_admin_x -->\nbody\n<!-- vue-doctor:scope:apps/admin -->\n";
    const ownStale = "<!-- vue-doctor:finding:apps_web_gone -->\nbody\n<!-- vue-doctor:scope:apps/web -->\n";
    const rootStale = "<!-- vue-doctor:finding:root_gone -->\nbody\n";
    const client = {
      listReviewComments: vi.fn().mockResolvedValue([
        { id: 1, body: other },
        { id: 2, body: ownStale },
        { id: 3, body: rootStale },
      ]),
      createReviewComment: vi.fn().mockResolvedValue(undefined),
      updateReviewComment: vi.fn().mockResolvedValue(undefined),
      deleteReviewComment: vi.fn().mockResolvedValue(undefined),
    };
    await postReviewComments(client as unknown as GitHubClient, optionsFor("apps/web"), createMockReport(80, [createFinding()]));
    expect(client.deleteReviewComment.mock.calls.map((call) => call[2])).toEqual([2]);
    expect(client.createReviewComment.mock.calls[0][3].body).toContain("<!-- vue-doctor:scope:apps/web -->");
  });
});

describe("Score Delta calculation", () => {
  it("computes score delta and issue counts against base report", () => {
    const f1 = createFinding({ fingerprint: "f1" });
    const f2 = createFinding({ fingerprint: "f2" });
    const f3 = createFinding({ fingerprint: "f3" });

    const currentReport = createMockReport(85, [f1, f2]);
    const baseReport = createMockReport(90, [f1, f3]);

    const delta = calculateScoreDelta(currentReport, baseReport);
    expect(delta.baseScore).toBe(90);
    expect(delta.scoreDelta).toBe(-5);
    expect(delta.newIssuesCount).toBe(1); // f2 is new
    expect(delta.fixedIssuesCount).toBe(1); // f3 is fixed
  });

  it("handles null base report gracefully", () => {
    const currentReport = createMockReport(100, []);
    const delta = calculateScoreDelta(currentReport, null);
    expect(delta.baseScore).toBeNull();
    expect(delta.scoreDelta).toBeNull();
    expect(delta.newIssuesCount).toBe(0);
    expect(delta.fixedIssuesCount).toBe(0);
  });
});

describe("Unified PR comment with grouped issues and tracked fixes", () => {
  const options: FeedbackOptions = {
    feedback: ["summary", "findings"],
    grouping: "rule-per-file",
    maxComments: 30,
    agentPrompt: true,
    owner: "owner",
    repo: "repo",
    pullNumber: 42,
    commitSha: "sha123",
  };

  it("renders a single comment containing summary, all issues grouped, and a single agent prompt", () => {
    const f1 = createFinding({
      fingerprint: "fp1",
      ruleId: "vue-doctor/security/no-eval",
      file: "src/App.vue",
      line: 10,
      message: "Avoid using eval()",
    });
    const f2 = createFinding({
      fingerprint: "fp2",
      ruleId: "vue-doctor/reactivity/no-ref-as-operand",
      category: "reactivity",
      severity: "warning",
      file: "src/Button.vue",
      line: 25,
      message: "Ref used as operand without .value",
    });

    const report = createMockReport(75, [f1, f2]);
    const comment = renderStickyComment(report, options);

    // Score summary header
    expect(comment).toContain("## 🩺 Vue Doctor: 🟡 **75/100**");
    // All issues section
    expect(comment).toContain("### 📋 Issues (2)");
    expect(comment).toContain("`vue-doctor/security/no-eval` (1 finding)");
    expect(comment).toContain("`src/App.vue:10`: Avoid using eval\\(\\)");
    expect(comment).toContain("`vue-doctor/reactivity/no-ref-as-operand` (1 finding)");
    expect(comment).toContain("`src/Button.vue:25`: Ref used as operand without .value");

    // Single agent prompt block for all issues
    expect(comment).toContain("<details>\n<summary>🤖 Fix remaining issues with an AI agent</summary>");
    expect(comment).toContain("Remaining findings: 2");
    expect(comment).toContain("src/App.vue:10");
    expect(comment).toContain("src/Button.vue:25");

    // No fixed earlier findings section on first run
    expect(comment).not.toContain("Fixed earlier findings");

    // Embedded tracked state
    expect(comment).toContain(TRACKED_MARKER_PREFIX);
    const tracked = extractTrackedFindings(comment);
    expect(tracked).toHaveLength(2);
    expect(tracked.every((t) => !t.fixed)).toBe(true);
  });

  it("moves fixed earlier findings to 'Fixed earlier findings' with strikethrough, and updates agent prompt for only remaining findings", () => {
    const f1 = createFinding({
      fingerprint: "fp1",
      ruleId: "vue-doctor/security/no-eval",
      file: "src/App.vue",
      line: 10,
      message: "Avoid using eval()",
    });
    const f2 = createFinding({
      fingerprint: "fp2",
      ruleId: "vue-doctor/reactivity/no-ref-as-operand",
      category: "reactivity",
      severity: "warning",
      file: "src/Button.vue",
      line: 25,
      message: "Ref used as operand without .value",
    });

    // Run 1: initial report has f1 and f2
    const initialReport = createMockReport(75, [f1, f2]);
    const initialComment = renderStickyComment(initialReport, options);
    const previousTracked = extractTrackedFindings(initialComment);

    // Run 2: f1 is fixed! Only f2 remains in the report.
    const updatedReport = createMockReport(90, [f2]);
    const updatedComment = renderStickyComment(updatedReport, options, previousTracked);

    // Remaining issues should only list f2, not active f1
    expect(updatedComment).toContain("### 📋 Remaining issues (1)");
    expect(updatedComment).toContain("`src/Button.vue:25`");
    expect(updatedComment).not.toContain("- **ERROR** `src/App.vue:10`");

    // Fixed earlier findings section exists with f1 crossed through
    expect(updatedComment).toContain("### ✅ Fixed earlier findings (1)");
    expect(updatedComment).toContain("- ~~🔴 **ERROR** `src/App.vue:10`: Avoid using eval\\(\\) (`vue-doctor/security/no-eval`)~~");

    // Single agent prompt ONLY includes remaining finding f2
    const promptMatch = updatedComment.match(/<summary>🤖 Fix remaining issues with an AI agent<\/summary>\s*```text([\s\S]*?)```/);
    expect(promptMatch).not.toBeNull();
    const promptText = promptMatch![1];
    expect(promptText).toContain("src/Button.vue:25");
    expect(promptText).not.toContain("src/App.vue:10");
    expect(promptText).not.toContain("vue-doctor/security/no-eval");

    // Tracked state contains both (f2 active, f1 fixed)
    const newTracked = extractTrackedFindings(updatedComment);
    expect(newTracked).toHaveLength(2);
    const trackedF1 = newTracked.find((t) => t.id === "fp1");
    const trackedF2 = newTracked.find((t) => t.id === "fp2");
    expect(trackedF1?.fixed).toBe(true);
    expect(trackedF2?.fixed).toBe(false);
  });

  it("crosses out all earlier findings when all are fixed, and omits the agent prompt", () => {
    const f1 = createFinding({
      fingerprint: "fp1",
      ruleId: "vue-doctor/security/no-eval",
      file: "src/App.vue",
      line: 10,
      message: "Avoid using eval()",
    });
    const f2 = createFinding({
      fingerprint: "fp2",
      ruleId: "vue-doctor/reactivity/no-ref-as-operand",
      file: "src/Button.vue",
      line: 25,
      message: "Ref used as operand without .value",
    });

    const previousTracked = [
      { id: "fp1", ruleId: f1.ruleId, file: f1.file, line: f1.line, message: f1.message, severity: f1.severity, fixed: false },
      { id: "fp2", ruleId: f2.ruleId, file: f2.file, line: f2.line, message: f2.message, severity: f2.severity, fixed: false },
    ];

    // Current report has 0 findings
    const cleanReport = createMockReport(100, []);
    const comment = renderStickyComment(cleanReport, options, previousTracked as TrackedFinding[]);

    expect(comment).toContain("✅ **No issues found.**");
    expect(comment).not.toContain("### 📋 Issues");
    expect(comment).not.toContain("### 📋 Remaining issues");

    // Fixed findings section shows both crossed through
    expect(comment).toContain("### ✅ Fixed earlier findings (2)");
    expect(comment).toContain("- ~~🔴 **ERROR** `src/App.vue:10`: Avoid using eval\\(\\) (`vue-doctor/security/no-eval`)~~");
    expect(comment).toContain("- ~~🔴 **ERROR** `src/Button.vue:25`: Ref used as operand without .value (`vue-doctor/reactivity/no-ref-as-operand`)~~");

    // Agent prompt is omitted since no remaining issues
    expect(comment).not.toContain("<summary>🤖 Fix remaining issues with an AI agent</summary>");
  });

  it("re-activates a previously fixed finding if it is reintroduced in a subsequent push", () => {
    const f1 = createFinding({
      fingerprint: "fp1",
      ruleId: "vue-doctor/security/no-eval",
      file: "src/App.vue",
      line: 10,
      message: "Avoid using eval()",
    });
    const f2 = createFinding({
      fingerprint: "fp2",
      ruleId: "vue-doctor/reactivity/no-ref-as-operand",
      file: "src/Button.vue",
      line: 25,
      message: "Ref used as operand without .value",
    });

    // Run 1: f1 is active, f2 is fixed from an earlier push
    const previousTracked = [
      { id: "fp1", ruleId: f1.ruleId, file: f1.file, line: f1.line, message: f1.message, severity: f1.severity, fixed: false },
      { id: "fp2", ruleId: f2.ruleId, file: f2.file, line: f2.line, message: f2.message, severity: f2.severity, fixed: true },
    ];

    // Run 2: Developer re-introduces f2! Both f1 and f2 are now present in the scan
    const report = createMockReport(70, [f1, f2]);
    const comment = renderStickyComment(report, options, previousTracked as TrackedFinding[]);

    expect(comment).toContain("### 📋 Issues (2)");
    expect(comment).toContain("`src/Button.vue:25`");
    expect(comment).toContain("`src/App.vue:10`");

    // f2 is no longer in fixed findings!
    expect(comment).not.toContain("### ✅ Fixed earlier findings");

    // Agent prompt includes both
    expect(comment).toContain("<summary>🤖 Fix remaining issues with an AI agent</summary>");
    expect(comment).toContain("src/Button.vue:25");
    expect(comment).toContain("src/App.vue:10");
  });

  it("updates existing PR comment in place across PR pushes via postStickySummary", async () => {
    const f1 = createFinding({ fingerprint: "f1", ruleId: "vue-doctor/security/no-eval", file: "src/App.vue", line: 10 });
    const f2 = createFinding({ fingerprint: "f2", ruleId: "vue-doctor/security/no-eval", file: "src/Button.vue", line: 20 });

    let commentBody = "";
    const client = {
      listIssueComments: vi.fn().mockImplementation(() =>
        Promise.resolve(commentBody ? [{ id: 101, body: commentBody }] : []),
      ),
      createIssueComment: vi.fn().mockImplementation((_owner, _repo, _pr, body) => {
        commentBody = body;
        return Promise.resolve({ id: 101 });
      }),
      updateIssueComment: vi.fn().mockImplementation((_owner, _repo, _id, body) => {
        commentBody = body;
        return Promise.resolve();
      }),
    };

    // Push 1: Both findings present -> creates issue comment
    await postStickySummary(client as unknown as GitHubClient, options, createMockReport(70, [f1, f2]));
    expect(client.createIssueComment).toHaveBeenCalledTimes(1);
    expect(client.updateIssueComment).not.toHaveBeenCalled();
    expect(commentBody).toContain("### 📋 Issues (2)");

    // Push 2: Developer fixed f1 and pushed new commit -> updates existing comment in place
    await postStickySummary(client as unknown as GitHubClient, options, createMockReport(85, [f2]));
    expect(client.createIssueComment).toHaveBeenCalledTimes(1); // not called again!
    expect(client.updateIssueComment).toHaveBeenCalledTimes(1); // updated comment 101
    expect(client.updateIssueComment.mock.calls[0][2]).toBe(101);

    expect(commentBody).toContain("### 📋 Remaining issues (1)");
    expect(commentBody).toContain("`src/Button.vue:20`");
    expect(commentBody).not.toContain("- **ERROR** `src/App.vue:10`");
    expect(commentBody).toContain("### ✅ Fixed earlier findings (1)");
    expect(commentBody).toMatch(/- ~~🔴 \*\*ERROR\*\* `src\/App\.vue:10`/);

    // Agent prompt is updated for only remaining finding f2
    const push2PromptMatch = commentBody.match(/<summary>🤖 Fix remaining issues with an AI agent<\/summary>\s*```text([\s\S]*?)```/);
    expect(push2PromptMatch).not.toBeNull();
    const push2Prompt = push2PromptMatch![1];
    expect(push2Prompt).toContain("src/Button.vue:20");
    expect(push2Prompt).not.toContain("src/App.vue:10");
  });
});
