import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  emitAnnotations,
  extractFindingMarker,
  groupFindings,
  postReviewComments,
  FINDING_MARKER_PREFIX,
  type FeedbackOptions,
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
        root: "/app",
        framework: "vite",
        vueVersion: "3.5.0",
        typescript: true,
        sourceFiles: 10,
        scope: { mode: "full" },
        score: { value: score, label: "Good", rawScore: score, cap: null, categories: [], impact: [] },
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
