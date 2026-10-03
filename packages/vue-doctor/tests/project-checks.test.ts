import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnose, type ProgressEvent } from "../src/index.js";
import { parseEnvFile } from "../src/plugin/env-file.js";
import { ruleIdOf } from "../src/plugin/rule-ids.js";
import {
  hasCredentialsInUrl,
  isPlaceholderValue,
  looksLikeSecretName,
  matchesSecretValueFormat,
} from "../src/plugin/secret-heuristics.js";
import { listProjectFiles } from "../src/utils/list-project-files.js";

const SECRET_VALUE = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";

describe("secret name heuristics", () => {
  it.each([
    "VITE_STRIPE_SECRET_KEY",
    "NUXT_PUBLIC_ADMIN_TOKEN",
    "VITE_DB_PASSWORD",
    "stripeSecretKey",
    "clientSecret",
    "VITE_OPENAI_API_KEY",
    "VITE_SENDGRID_API_KEY",
    "privateKey",
    "PRIVATE_KEY",
    "VITE_SUPABASE_SERVICE_ROLE_KEY",
    "credentials",
  ])("flags %s", (name) => expect(looksLikeSecretName(name)).toBe(true));

  it.each([
    "VITE_SUPABASE_ANON_KEY",
    "VITE_STRIPE_PUBLISHABLE_KEY",
    "NUXT_PUBLIC_SITE_URL",
    "VITE_RECAPTCHA_SITE_KEY",
    "VITE_GOOGLE_MAPS_API_KEY",
    "firebaseApiKey",
    "VITE_AUTH_TOKEN_URL",
    "tokenExpiry",
    "VITE_MAPBOX_TOKEN",
    "csrfToken",
    "publicKey",
    "author",
    "authUrl",
    "VITE_APP_TITLE",
  ])("does not flag %s", (name) => expect(looksLikeSecretName(name)).toBe(false));

  it("treats a bare API key as a secret only for private variables", () => {
    expect(looksLikeSecretName("API_KEY")).toBe(false);
    expect(looksLikeSecretName("API_KEY", { context: "private" })).toBe(true);
  });
});

describe("secret value heuristics", () => {
  it("matches provider formats and never publishable keys", () => {
    for (const value of [SECRET_VALUE, "ghp_" + "a".repeat(36), "sk-ant-api03-" + "a".repeat(30), "-----BEGIN RSA PRIVATE KEY-----"]) {
      expect(matchesSecretValueFormat(value), value).toBe(true);
    }
    for (const value of ["pk_live_abc123456789", "https://example.com", "AIzaSyA-fake-google-browser-key-0123456789", "hello"]) {
      expect(matchesSecretValueFormat(value), value).toBe(false);
    }
  });

  it("recognises a Supabase service_role JWT but not the anon one", () => {
    const jwt = (role: string): string =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
    expect(matchesSecretValueFormat(jwt("service_role"))).toBe(true);
    expect(matchesSecretValueFormat(jwt("anon"))).toBe(false);
  });

  it("recognises placeholders and URL credentials", () => {
    for (const value of ["", "changeme", "<your-key>", "${OTHER}", "xxxxxx", "your-api-key-here"]) {
      expect(isPlaceholderValue(value), value).toBe(true);
    }
    expect(isPlaceholderValue("abc123def456")).toBe(false);
    expect(hasCredentialsInUrl("postgres://app:hunter2@db/prod")).toBe(true);
    expect(hasCredentialsInUrl("postgres://db/prod")).toBe(false);
    expect(hasCredentialsInUrl("postgres://app:${PASSWORD}@db/prod")).toBe(false);
  });
});

describe("parseEnvFile", () => {
  it("reads names, unquoted values and positions, skipping comments", () => {
    const entries = parseEnvFile('# A=1\nA=1\n  export B="two words" # note\nC=\n\nnot a variable\nD=x # tail\n');
    expect(entries).toEqual([
      { name: "A", value: "1", line: 2, column: 1 },
      { name: "B", value: "two words", line: 3, column: 10 },
      { name: "C", value: "", line: 4, column: 1 },
      { name: "D", value: "x", line: 7, column: 1 },
    ]);
  });
});

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const git = (directory: string, ...args: string[]): void => {
  const result = spawnSync("git", ["-c", "core.autocrlf=false", ...args], { cwd: directory, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
};

interface ProjectOptions {
  files: Record<string, string>;
  /** Initialise a git repository and track these files (default: none, i.e. no repository). */
  tracked?: string[];
  /** Write an (empty) package-lock.json so the supply-chain rule stays quiet. Default: true. */
  lockfile?: boolean;
}

const createProject = ({ files, tracked, lockfile = true }: ProjectOptions): string => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-project-checks-")));
  temporaryDirectories.push(directory);
  const allFiles = {
    "package.json": JSON.stringify({ name: "app", dependencies: { vue: "^3.5.0" } }),
    ...(lockfile ? { "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: {} }) } : {}),
    ...files,
  };
  for (const [relativePath, content] of Object.entries(allFiles)) {
    const target = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  if (tracked) {
    git(directory, "init", "--quiet");
    git(directory, "add", "--", ...tracked);
  }
  return directory;
};

const projectChecksOnly = { lint: false, templateLint: false, deadCode: false, cache: false } as const;

describe("project checks (diagnose)", () => {
  it("reports a tracked .env.local with a secret, points at the line and never includes the value", async () => {
    const directory = createProject({
      files: { ".env.local": `PORT=3000\nSTRIPE_SECRET_KEY=${SECRET_VALUE}\n` },
      tracked: [".env.local", "package.json"],
    });
    const events: ProgressEvent[] = [];
    const result = await diagnose(directory, { ...projectChecksOnly, onProgress: (event) => events.push(event) });

    expect(result.diagnostics.map((d) => [ruleIdOf(d), d.filePath, d.line, d.severity, d.category])).toEqual([
      ["vue-doctor/security/no-committed-env", ".env.local", 2, "warning", "Security"],
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(SECRET_VALUE);
    expect(result.diagnostics[0].fingerprint).toBeTruthy();
    expect(events.map((event) => `${event.type}:${event.analyzer}`)).toEqual(["start:project", "done:project"]);
    expect(result.timings).toHaveProperty("project");
    expect(result.skipped).toEqual([]);
  });

  it("does not treat a project without git as committed, but still reads public variables", async () => {
    const directory = createProject({
      files: { ".env.local": `API_SECRET=abcdef123456\n`, ".env": `VITE_ADMIN_TOKEN=abc\nVITE_SUPABASE_ANON_KEY=abc\n` },
    });
    const result = await diagnose(directory, projectChecksOnly);
    expect(result.diagnostics.map((d) => [ruleIdOf(d), d.filePath, d.line])).toEqual([
      ["vue-doctor/security/no-secret-in-public-env-file", ".env", 1],
    ]);
  });

  it("reads git-ignored env files for public variables but ignores them for the committed check", async () => {
    const directory = createProject({
      files: { ".gitignore": ".env\n", ".env": `VITE_STRIPE_SECRET_KEY=${SECRET_VALUE}\n`, ".env.example": "VITE_API_URL=\n" },
      tracked: [".gitignore", ".env.example", "package.json"],
    });
    const result = await diagnose(directory, projectChecksOnly);
    expect(result.diagnostics.map((d) => ruleIdOf(d))).toEqual(["vue-doctor/security/no-secret-in-public-env-file"]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(SECRET_VALUE);
  });

  it("can be turned off with projectChecks: false", async () => {
    const directory = createProject({ files: { ".env.local": "A=1\n" }, tracked: [".env.local"] });
    const events: ProgressEvent[] = [];
    const result = await diagnose(directory, { ...projectChecksOnly, projectChecks: false, onProgress: (e) => events.push(e) });
    expect(result.diagnostics).toEqual([]);
    expect(events).toEqual([]);
  });

  it("honours rule severities, rule ignores, file ignores and # suppression comments", async () => {
    const directory = createProject({
      files: {
        ".env.local": "A=1\n",
        ".env.production.local": "# vue-doctor-disable-file vue-doctor/security/no-committed-env -- sandbox keys\nB=2\n",
      },
      tracked: [".env.local", ".env.production.local"],
    });
    const rule = "vue-doctor/security/no-committed-env";

    const base = await diagnose(directory, projectChecksOnly);
    expect(base.diagnostics.map((d) => d.filePath)).toEqual([".env.local"]);
    expect(base.suppressed.byRule).toEqual({ [rule]: 1 });

    const asError = await diagnose(directory, { ...projectChecksOnly, config: { rules: { [rule]: "error" } } });
    expect(asError.diagnostics.map((d) => d.severity)).toEqual(["error"]);
    // An error in a Security rule below `critical` caps the score only when confidence is high.
    expect(asError.score).toBeLessThan(100);

    const off = await diagnose(directory, { ...projectChecksOnly, config: { rules: { [rule]: "off" } } });
    expect(off.diagnostics).toEqual([]);
    const group = await diagnose(directory, { ...projectChecksOnly, config: { ignore: { rules: ["vue-doctor/security/*"] } } });
    expect(group.diagnostics).toEqual([]);
    const files = await diagnose(directory, { ...projectChecksOnly, config: { ignore: { files: [".env.local"] } } });
    expect(files.diagnostics).toEqual([]);
  });

  it("limits findings to the changed files in diff mode", async () => {
    const directory = createProject({
      files: { ".env.local": "A=1\n", "src/a.ts": "export {};\n" },
      tracked: [".env.local", "src/a.ts"],
    });
    expect((await diagnose(directory, { ...projectChecksOnly, includePaths: ["src/a.ts"] })).diagnostics).toEqual([]);
    expect(
      (await diagnose(directory, { ...projectChecksOnly, includePaths: [".env.local"] })).diagnostics.map((d) => d.filePath),
    ).toEqual([".env.local"]);
  });

  it("caches by the files it read and the file list", async () => {
    const directory = createProject({
      files: { ".env": "VITE_API_URL=/api\n", "src/a.ts": "export const a = 1;\n" },
      tracked: [".env", "src/a.ts", "package.json"],
    });
    const options = { lint: false, templateLint: false, deadCode: false } as const;

    const cold = await diagnose(directory, options);
    expect([cold.cache?.hits.project, cold.cache?.misses.project]).toEqual([0, 1]);

    // A file the rules did not read changes: still a hit, even though findings are re-derived.
    fs.writeFileSync(path.join(directory, "src/a.ts"), "export const a = 2;\n");
    const unrelated = await diagnose(directory, options);
    expect([unrelated.cache?.hits.project, unrelated.cache?.misses.project]).toEqual([1, 0]);

    // A file the rules read changes: re-run, and the new finding appears.
    fs.writeFileSync(path.join(directory, ".env"), "VITE_API_URL=/api\nVITE_JWT_SECRET=abc\n");
    const edited = await diagnose(directory, options);
    expect([edited.cache?.hits.project, edited.cache?.misses.project]).toEqual([0, 1]);
    // The tracked .env now also holds a secret-looking value, so both rules report line 2.
    expect(edited.diagnostics.map((d) => [ruleIdOf(d), d.line]).sort()).toEqual([
      ["vue-doctor/security/no-committed-env", 2],
      ["vue-doctor/security/no-secret-in-public-env-file", 2],
    ]);

    // The file list changes (a new env file appears): re-run.
    fs.writeFileSync(path.join(directory, ".env.production"), "VITE_API_URL=/prod\n");
    const listed = await diagnose(directory, options);
    expect(listed.cache?.misses.project).toBe(1);

    const warm = await diagnose(directory, options);
    expect(warm.cache?.hits.project).toBe(1);
    expect(warm.diagnostics).toEqual(listed.diagnostics);
  });
});

describe("listProjectFiles", () => {
  it("lists tracked and untracked-but-not-ignored files, with dotfiles, in a git repository", () => {
    const directory = createProject({
      files: { ".gitignore": "ignored.txt\n", "ignored.txt": "x", "untracked.txt": "x", "tracked/.env": "A=1\n" },
      tracked: [".gitignore", "tracked/.env", "package.json"],
      lockfile: false,
    });
    const listing = listProjectFiles(directory);
    expect(listing.isGitRepository).toBe(true);
    expect(listing.trackedFiles).toEqual([".gitignore", "package.json", "tracked/.env"]);
    expect(listing.projectFiles).toEqual([".gitignore", "package.json", "tracked/.env", "untracked.txt"]);
  });

  it("walks the directory outside git and leaves out dependencies and excluded workspaces", () => {
    const directory = createProject({
      files: { ".env": "A=1\n", "node_modules/x/.env": "A=1\n", "packages/web/.env": "A=1\n", "src/a.ts": "" },
      lockfile: false,
    });
    const listing = listProjectFiles(directory, ["packages/web"]);
    expect(listing.isGitRepository).toBe(false);
    expect(listing.trackedFiles).toEqual([".env", "package.json", "src/a.ts"]);
  });
});
