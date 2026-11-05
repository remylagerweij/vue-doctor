import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolvePnpmCatalogVersion } from "../src/utils/pnpm-catalog.js";

describe("resolvePnpmCatalogVersion", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pnpm-catalog-test-"));
    const yaml = `packages:
  - apps/*
  - packages/*

catalog:
  vue: ^3.5.40
  '@vueuse/core': ^14.4.0
  unquoted: 1.2.3

catalogs:
  legacy:
    vue: ~2.7.16
  modern:
    vue: ^4.0.0-beta.1
`;
    fs.writeFileSync(path.join(tempDir, "pnpm-workspace.yaml"), yaml, "utf-8");
    fs.mkdirSync(path.join(tempDir, "apps", "web"), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves default catalog from workspace root", () => {
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:", "vue")).toBe("^3.5.40");
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:default", "vue")).toBe("^3.5.40");
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:", "@vueuse/core")).toBe("^14.4.0");
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:", "unquoted")).toBe("1.2.3");
  });

  it("resolves default catalog from nested workspace directory", () => {
    const webDir = path.join(tempDir, "apps", "web");
    expect(resolvePnpmCatalogVersion(webDir, "catalog:", "vue")).toBe("^3.5.40");
  });

  it("resolves named catalogs", () => {
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:legacy", "vue")).toBe("~2.7.16");
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:modern", "vue")).toBe("^4.0.0-beta.1");
  });

  it("returns null for nonexistent packages or catalogs", () => {
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:", "react")).toBeNull();
    expect(resolvePnpmCatalogVersion(tempDir, "catalog:nonexistent", "vue")).toBeNull();
  });

  it("returns raw string if not starting with catalog:", () => {
    expect(resolvePnpmCatalogVersion(tempDir, "^3.5.0", "vue")).toBe("^3.5.0");
  });
});

