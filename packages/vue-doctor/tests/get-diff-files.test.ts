import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filterSourceFiles, getDiffInfo } from "../src/utils/get-diff-files.js";

const git = (cwd: string, ...args: string[]): void => {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.autocrlf=false",
      ...args,
    ],
    { cwd, stdio: "pipe" },
  );
};

const writeFile = (root: string, relativePath: string, content: string): void => {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
};

const initRepo = (root: string): void => {
  git(root, "init", "--quiet");
  // Avoid `init -b`, which needs git >= 2.28.
  git(root, "symbolic-ref", "HEAD", "refs/heads/main");
};

const commitAll = (root: string, message: string): void => {
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", message);
};

// Each test spawns many git processes, which is slow on Windows.
describe("getDiffInfo", { timeout: 60_000 }, () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-diff-"));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  describe("single project", () => {
    beforeEach(() => {
      initRepo(repoRoot);
      writeFile(repoRoot, "src/App.vue", "<template><div /></template>\n");
      writeFile(repoRoot, "src/removed.ts", "export const removed = 1;\n");
      writeFile(repoRoot, "src/untouched.ts", "export const untouched = 1;\n");
      commitAll(repoRoot, "base");
      git(repoRoot, "checkout", "--quiet", "-b", "feature");
    });

    it("includes committed, uncommitted and untracked files but not deleted ones", () => {
      writeFile(repoRoot, "src/App.vue", "<template><span /></template>\n");
      commitAll(repoRoot, "modify app");
      writeFile(repoRoot, "src/staged.ts", "export const staged = 1;\n");
      git(repoRoot, "add", "src/staged.ts");
      writeFile(repoRoot, "src/untouched.ts", "export const untouched = 2;\n");
      writeFile(repoRoot, "src/new-untracked.vue", "<template><p /></template>\n");
      fs.rmSync(path.join(repoRoot, "src/removed.ts"));

      const info = getDiffInfo(repoRoot, "main");

      expect(info.status).toBe("ok");
      if (info.status !== "ok") return;
      expect(info.currentBranch).toBe("feature");
      expect(info.baseBranch).toBe("main");
      expect(info.isCurrentChanges).toBe(false);
      expect(info.mergeBase).toMatch(/^[0-9a-f]{40,64}$/);
      expect(info.changedFiles).toEqual([
        "src/App.vue",
        "src/new-untracked.vue",
        "src/staged.ts",
        "src/untouched.ts",
      ]);
      expect(info.changedFiles).not.toContain("src/removed.ts");
    });

    it("detects the default branch when no branch is given", () => {
      writeFile(repoRoot, "src/feature.ts", "export const feature = 1;\n");
      commitAll(repoRoot, "feature");

      const info = getDiffInfo(repoRoot);

      expect(info.status).toBe("ok");
      if (info.status !== "ok") return;
      expect(info.baseBranch).toBe("main");
      expect(info.changedFiles).toEqual(["src/feature.ts"]);
    });

    it("does not list files twice or list ignored files", () => {
      writeFile(repoRoot, ".gitignore", "dist/\n");
      commitAll(repoRoot, "ignore dist");
      writeFile(repoRoot, "dist/bundle.js", "x\n");
      writeFile(repoRoot, "src/App.vue", "<template><b /></template>\n");

      const info = getDiffInfo(repoRoot, "main");

      expect(info.status).toBe("ok");
      if (info.status !== "ok") return;
      expect(info.changedFiles).toEqual([".gitignore", "src/App.vue"]);
    });

    it("compares only the working tree to HEAD when on the base branch", () => {
      git(repoRoot, "checkout", "--quiet", "main");
      writeFile(repoRoot, "src/App.vue", "<template><i /></template>\n");
      writeFile(repoRoot, "src/brand-new.ts", "export const brandNew = 1;\n");

      const info = getDiffInfo(repoRoot);

      expect(info.status).toBe("ok");
      if (info.status !== "ok") return;
      expect(info.isCurrentChanges).toBe(true);
      expect(info.baseBranch).toBe("main");
      expect(info.changedFiles).toEqual(["src/App.vue", "src/brand-new.ts"]);
    });

    it("returns no-changes when nothing differs from the base branch", () => {
      const info = getDiffInfo(repoRoot, "main");

      expect(info.status).toBe("no-changes");
      if (info.status !== "no-changes") return;
      expect(info.baseBranch).toBe("main");
      expect(info.currentBranch).toBe("feature");
    });

    it("returns no-changes on the base branch with a clean working tree", () => {
      git(repoRoot, "checkout", "--quiet", "main");

      const info = getDiffInfo(repoRoot);

      expect(info.status).toBe("no-changes");
      if (info.status !== "no-changes") return;
      expect(info.isCurrentChanges).toBe(true);
    });

    it("rejects a branch argument that starts with a dash", () => {
      expect(() => getDiffInfo(repoRoot, "--output=pwned.txt")).toThrow(/must not start with "-"/);
      expect(() => getDiffInfo(repoRoot, "-h")).toThrow(/must not start with "-"/);
      expect(fs.existsSync(path.join(repoRoot, "pwned.txt"))).toBe(false);
    });

    it("rejects an empty branch argument", () => {
      expect(() => getDiffInfo(repoRoot, "")).toThrow(/must not be empty/);
    });

    it("reports an unknown ref as unavailable", () => {
      const info = getDiffInfo(repoRoot, "does-not-exist");

      expect(info.status).toBe("unavailable");
      if (info.status !== "unavailable") return;
      expect(info.reason).toContain("does-not-exist");
    });

    it("accepts commit-ish refs such as HEAD~1", () => {
      writeFile(repoRoot, "src/feature.ts", "export const feature = 1;\n");
      commitAll(repoRoot, "feature");

      const info = getDiffInfo(repoRoot, "HEAD~1");

      expect(info.status).toBe("ok");
      if (info.status !== "ok") return;
      expect(info.changedFiles).toEqual(["src/feature.ts"]);
    });

    it("handles file names with spaces and non-ASCII characters", () => {
      writeFile(repoRoot, "src/My Component.vue", "<template><div /></template>\n");
      writeFile(repoRoot, "src/café.ts", "export const cafe = 1;\n");

      const info = getDiffInfo(repoRoot, "main");

      expect(info.status).toBe("ok");
      if (info.status !== "ok") return;
      expect(info.changedFiles).toEqual(["src/My Component.vue", "src/café.ts"]);
    });
  });

  describe("monorepo sub-project", () => {
    it("returns paths relative to the project directory and only that package's changes", () => {
      initRepo(repoRoot);
      writeFile(repoRoot, "packages/app/src/App.vue", "<template><div /></template>\n");
      writeFile(repoRoot, "packages/app/src/old.ts", "export const old = 1;\n");
      writeFile(repoRoot, "packages/lib/src/index.ts", "export const lib = 1;\n");
      commitAll(repoRoot, "base");
      git(repoRoot, "checkout", "--quiet", "-b", "feature");

      writeFile(repoRoot, "packages/app/src/App.vue", "<template><span /></template>\n");
      commitAll(repoRoot, "modify app and lib");
      writeFile(repoRoot, "packages/lib/src/index.ts", "export const lib = 2;\n");
      commitAll(repoRoot, "modify lib");
      writeFile(repoRoot, "packages/app/src/new.ts", "export const added = 1;\n");
      writeFile(repoRoot, "packages/lib/src/new.ts", "export const libNew = 1;\n");
      writeFile(repoRoot, "root-level.ts", "export const root = 1;\n");
      fs.rmSync(path.join(repoRoot, "packages/app/src/old.ts"));

      const appDirectory = path.join(repoRoot, "packages", "app");
      const info = getDiffInfo(appDirectory, "main");

      expect(info.status).toBe("ok");
      if (info.status !== "ok") return;
      expect(info.changedFiles).toEqual(["src/App.vue", "src/new.ts"]);
      for (const file of info.changedFiles) {
        expect(path.isAbsolute(file)).toBe(false);
        expect(file).not.toContain("\\");
        expect(fs.existsSync(path.join(appDirectory, file))).toBe(true);
      }
    });

    it("returns no-changes when only other packages changed", () => {
      initRepo(repoRoot);
      writeFile(repoRoot, "packages/app/src/App.vue", "<template><div /></template>\n");
      writeFile(repoRoot, "packages/lib/src/index.ts", "export const lib = 1;\n");
      commitAll(repoRoot, "base");
      git(repoRoot, "checkout", "--quiet", "-b", "feature");
      writeFile(repoRoot, "packages/lib/src/index.ts", "export const lib = 2;\n");
      commitAll(repoRoot, "modify lib");

      const info = getDiffInfo(path.join(repoRoot, "packages", "app"), "main");

      expect(info.status).toBe("no-changes");
    });
  });

  describe("unavailable repositories", () => {
    it("reports a directory outside a git repository as unavailable", () => {
      const info = getDiffInfo(repoRoot);

      expect(info.status).toBe("unavailable");
      if (info.status !== "unavailable") return;
      expect(info.reason).toMatch(/not a git repository/);
    });

    it("reports a repository without commits as unavailable", () => {
      initRepo(repoRoot);

      const info = getDiffInfo(repoRoot);

      expect(info.status).toBe("unavailable");
    });

    it("reports unrelated histories as unavailable", () => {
      initRepo(repoRoot);
      writeFile(repoRoot, "a.ts", "export const a = 1;\n");
      commitAll(repoRoot, "base");
      git(repoRoot, "checkout", "--quiet", "--orphan", "orphan");
      writeFile(repoRoot, "b.ts", "export const b = 1;\n");
      commitAll(repoRoot, "orphan");

      const info = getDiffInfo(repoRoot, "main");

      expect(info.status).toBe("unavailable");
      if (info.status !== "unavailable") return;
      expect(info.reason).toMatch(/merge base/);
    });
  });
});

describe("filterSourceFiles", () => {
  it("keeps only source files", () => {
    expect(filterSourceFiles(["a.vue", "b.ts", "c.md", "d.json", "e.mjs", "f.css"])).toEqual([
      "a.vue",
      "b.ts",
      "e.mjs",
    ]);
  });
});
