import { describe, expect, it } from "vitest";
import {
  isSupportedNodeVersion,
  resolveNodeForOxlint,
} from "../src/utils/resolve-compatible-node.js";

describe("isSupportedNodeVersion", () => {
  const supported = ["22.12.0", "22.12.5", "22.20.1", "24.0.0", "24.19.0", "26.1.0", "100.0.0"];
  const unsupported = ["18.20.4", "20.11.0", "20.19.0", "21.7.3", "22.0.0", "22.11.0", "22.11.99", "23.0.0", "23.11.1"];

  for (const version of supported) {
    it(`accepts ${version} with and without a leading "v"`, () => {
      expect(isSupportedNodeVersion(version)).toBe(true);
      expect(isSupportedNodeVersion(`v${version}`)).toBe(true);
    });
  }

  for (const version of unsupported) {
    it(`rejects ${version} with and without a leading "v"`, () => {
      expect(isSupportedNodeVersion(version)).toBe(false);
      expect(isSupportedNodeVersion(`v${version}`)).toBe(false);
    });
  }

  it("accepts prerelease and build suffixes of supported versions", () => {
    expect(isSupportedNodeVersion("v24.0.0-nightly2025")).toBe(true);
    expect(isSupportedNodeVersion("22.12.0+build.1")).toBe(true);
  });

  it("does not treat minor versions of unrelated majors as satisfying the 22.x minor floor", () => {
    expect(isSupportedNodeVersion("23.5.0")).toBe(false);
    expect(isSupportedNodeVersion("21.12.0")).toBe(false);
  });

  it("rejects malformed strings", () => {
    for (const version of ["", "v", "node", "22", "22.12", "v22.12", "22.x.0", "a.b.c", "22.12.0.1", "-22.12.0", "vv22.12.0", " 22 "]) {
      expect(isSupportedNodeVersion(version)).toBe(false);
    }
  });
});

describe("resolveNodeForOxlint", () => {
  it("returns process.execPath when the current Node is supported, otherwise null", () => {
    const result = resolveNodeForOxlint();
    if (isSupportedNodeVersion(process.version)) {
      expect(result).toBe(process.execPath);
    } else {
      expect(result).toBeNull();
    }
  });
});
