import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverProject,
  formatFrameworkName,
} from "../src/utils/discover-project.js";

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "fixtures");
const VALID_FRAMEWORKS = ["nuxt", "vite", "quasar", "vuecli", "unknown"];

describe("discoverProject", () => {
  it("detects Vue version from package.json", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-vue"));
    expect(projectInfo.vueVersion).toBe("^3.5.0");
  });

  it("returns a valid framework", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-vue"));
    expect(VALID_FRAMEWORKS).toContain(projectInfo.framework);
  });

  it("detects Vite framework from devDependencies", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-vue"));
    expect(projectInfo.framework).toBe("vite");
  });

  it("detects TypeScript when tsconfig.json exists", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-vue"));
    expect(projectInfo.hasTypeScript).toBe(true);
  });

  it("detects Nuxt framework", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "nuxt-app"));
    expect(projectInfo.framework).toBe("nuxt");
  });

  it("detects Vue version from nuxt project", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "nuxt-app"));
    expect(projectInfo.vueVersion).toBe("^3.5.0");
  });

  it("throws when package.json is missing", () => {
    expect(() => discoverProject("/nonexistent/path")).toThrow("No package.json found");
  });

  it("returns project name from package.json", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-vue"));
    expect(projectInfo.projectName).toBe("basic-vue-fixture");
  });

  it("returns sourceFileCount as a number", () => {
    const projectInfo = discoverProject(path.join(FIXTURES_DIRECTORY, "basic-vue"));
    expect(typeof projectInfo.sourceFileCount).toBe("number");
  });
});

describe("formatFrameworkName", () => {
  it("formats known frameworks", () => {
    expect(formatFrameworkName("nuxt")).toBe("Nuxt");
    expect(formatFrameworkName("vite")).toBe("Vite");
    expect(formatFrameworkName("quasar")).toBe("Quasar");
    expect(formatFrameworkName("vuecli")).toBe("Vue CLI");
  });

  it("formats unknown framework as Vue", () => {
    expect(formatFrameworkName("unknown")).toBe("Vue");
  });
});
