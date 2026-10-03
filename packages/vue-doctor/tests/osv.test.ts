import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OSV_BATCH_SIZE,
  OSV_CACHE_TTL_MS,
  compareVersions,
  cvss3BaseScore,
  queryAdvisories,
  severityFromScore,
  toAdvisory,
} from "../src/utils/osv.js";
import { createOsvFetch } from "./support/osv-fetch.js";

const temporaryDirectories: string[] = [];
const createCacheDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "osv-cache-"));
  temporaryDirectories.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("CVSS v3 base score", () => {
  it.each([
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8],
    ["CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H", 7.2],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10],
    ["CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1],
    ["CVSS:3.1/AV:L/AC:H/PR:L/UI:R/S:U/C:L/I:N/A:N", 2.2],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N", 0],
  ])("scores %s as %s", (vector, score) => expect(cvss3BaseScore(vector)).toBe(score));

  it("returns undefined for other versions and malformed vectors", () => {
    expect(cvss3BaseScore("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N")).toBeUndefined();
    expect(cvss3BaseScore("AV:N/AC:L/Au:N/C:P/I:P/A:P")).toBeUndefined();
    expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H")).toBeUndefined();
    expect(cvss3BaseScore("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBeUndefined();
  });

  it.each([
    [9.8, "critical"],
    [9, "critical"],
    [7.2, "high"],
    [5, "moderate"],
    [3.9, "low"],
    [0, "unknown"],
  ])("maps %s to %s", (score, severity) => expect(severityFromScore(score)).toBe(severity));
});

describe("toAdvisory", () => {
  it("prefers the CVSS v3 score, then the database severity, and keeps one bounded summary line", () => {
    expect(
      toAdvisory({ id: "GHSA-a", summary: "First line\nsecond", severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }], database_specific: { severity: "LOW" } }),
    ).toMatchObject({ severity: "critical", score: 9.8, summary: "First line" });
    expect(toAdvisory({ id: "GHSA-b", database_specific: { severity: "MODERATE" } })).toMatchObject({ severity: "moderate" });
    expect(toAdvisory({ id: "GHSA-c", details: "x".repeat(500) })?.summary).toHaveLength(200);
    expect(toAdvisory({ id: "GHSA-d" })).toMatchObject({ severity: "unknown", summary: "", aliases: [], affected: [] });
  });

  it("keeps only npm packages and their fixed versions, and rejects records without an id", () => {
    const advisory = toAdvisory({
      id: "GHSA-e",
      affected: [
        { package: { name: "a", ecosystem: "npm" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "1.2.3" }] }] },
        { package: { name: "b", ecosystem: "PyPI" }, ranges: [{ events: [{ fixed: "9.9.9" }] }] },
      ],
    });
    expect(advisory?.affected).toEqual([{ name: "a", fixed: ["1.2.3"] }]);
    expect(toAdvisory({ summary: "no id" })).toBeNull();
  });
});

describe("compareVersions", () => {
  it("compares numerically and ignores pre-release tags", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
  });
});

describe("queryAdvisories", () => {
  const packages = [
    { name: "lodash", version: "4.17.15" },
    { name: "minimist", version: "1.2.5" },
    { name: "vue", version: "3.4.0" },
  ];

  it("joins batch results with advisory details, worst first, with the fix for the installed version", async () => {
    const osv = createOsvFetch();
    const result = await queryAdvisories(packages, { fetch: osv.fetch, cacheDirectory: null });

    expect([...result.keys()]).toEqual(["lodash@4.17.15", "minimist@1.2.5"]);
    const lodash = result.get("lodash@4.17.15")!;
    // Both are high: ordered by severity, then by ID.
    expect(lodash.map((advisory) => advisory.id)).toEqual(["GHSA-35jh-r3h4-6jhm", "GHSA-p6mc-m468-83gw"]);
    expect(lodash[0]).toMatchObject({ severity: "high", score: 7.2, aliases: ["CVE-2021-23337"], fixedVersion: "4.17.21", summary: "Command Injection in lodash" });
    expect(lodash[1].fixedVersion).toBe("4.17.19");
    expect(result.get("minimist@1.2.5")?.[0]).toMatchObject({ severity: "critical", fixedVersion: "1.2.6" });
  });

  it("sends one batch request and one detail request per distinct advisory", async () => {
    const osv = createOsvFetch();
    await queryAdvisories([...packages, { name: "lodash", version: "4.17.20" }], { fetch: osv.fetch, cacheDirectory: null });
    expect(osv.callsTo("/v1/querybatch")).toHaveLength(1);
    expect(osv.callsTo("/v1/querybatch")[0].body).toEqual({
      queries: [
        { package: { name: "lodash", ecosystem: "npm" }, version: "4.17.15" },
        { package: { name: "minimist", ecosystem: "npm" }, version: "1.2.5" },
        { package: { name: "vue", ecosystem: "npm" }, version: "3.4.0" },
        { package: { name: "lodash", ecosystem: "npm" }, version: "4.17.20" },
      ],
    });
    // GHSA-35jh is shared by two lodash versions but fetched once.
    expect(osv.callsTo("/v1/vulns/GHSA-35jh-r3h4-6jhm")).toHaveLength(1);
    expect(osv.calls.filter((call) => call.method === "GET")).toHaveLength(3);
  });

  it("splits large inputs into batches of at most 1000 queries", async () => {
    const osv = createOsvFetch();
    const many = Array.from({ length: OSV_BATCH_SIZE * 2 + 5 }, (_, index) => ({ name: `pkg-${index}`, version: "1.0.0" }));
    const result = await queryAdvisories(many, { fetch: osv.fetch, cacheDirectory: null });
    expect(result.size).toBe(0);
    expect(osv.callsTo("/v1/querybatch").map((call) => (call.body as { queries: unknown[] }).queries.length)).toEqual([1000, 1000, 5]);
  });

  it("falls back to the database severity when only a CVSS v4 vector exists", async () => {
    const result = await queryAdvisories([{ name: "semver", version: "7.0.0" }], { fetch: createOsvFetch().fetch, cacheDirectory: null });
    expect(result.get("semver@7.0.0")?.[0]).toMatchObject({ severity: "moderate", fixedVersion: "7.5.2" });
    expect(result.get("semver@7.0.0")?.[0].score).toBeUndefined();
  });

  it("follows pagination tokens", async () => {
    const osv = createOsvFetch();
    const paged: typeof osv.fetch = async (input, init) => {
      const { pathname } = new URL(String(input));
      if (pathname === "/v1/querybatch") {
        return Response.json({ results: [{ vulns: [{ id: "GHSA-35jh-r3h4-6jhm" }], next_page_token: "page-2" }] });
      }
      if (pathname === "/v1/query") {
        expect(JSON.parse(String(init?.body))).toMatchObject({ page_token: "page-2", version: "4.17.15" });
        return Response.json({ vulns: [{ id: "GHSA-p6mc-m468-83gw" }] });
      }
      return osv.fetch(input, init);
    };
    const result = await queryAdvisories([{ name: "lodash", version: "4.17.15" }], { fetch: paged, cacheDirectory: null });
    expect(result.get("lodash@4.17.15")).toHaveLength(2);
  });

  it("retries a transient failure once", async () => {
    const osv = createOsvFetch({ failFirst: { count: 1, status: 503 } });
    const result = await queryAdvisories(packages, { fetch: osv.fetch, cacheDirectory: null });
    expect(result.size).toBe(2);
    expect(osv.callsTo("/v1/querybatch")).toHaveLength(2);
  });

  it("gives up after the retry with a readable error", async () => {
    const osv = createOsvFetch({ failFirst: { count: 5, status: 500 } });
    await expect(queryAdvisories(packages, { fetch: osv.fetch, cacheDirectory: null })).rejects.toThrow("OSV query failed: HTTP 500");
    expect(osv.calls).toHaveLength(2);
  });

  it("does not retry client errors", async () => {
    const osv = createOsvFetch({ failFirst: { count: 5, status: 400 } });
    await expect(queryAdvisories(packages, { fetch: osv.fetch, cacheDirectory: null })).rejects.toThrow("HTTP 400");
    expect(osv.calls).toHaveLength(1);
  });

  it("reports a network outage with its cause", async () => {
    const osv = createOsvFetch({ networkDown: true });
    await expect(queryAdvisories(packages, { fetch: osv.fetch, cacheDirectory: null })).rejects.toThrow("ENOTFOUND api.osv.dev");
  });

  it("rejects a malformed batch response", async () => {
    const broken = async () => Response.json({ results: [] });
    await expect(queryAdvisories(packages, { fetch: broken, cacheDirectory: null })).rejects.toThrow("unexpected response");
  });

  it("times out requests that hang", async () => {
    const hanging = (_input: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    await expect(queryAdvisories(packages, { fetch: hanging, cacheDirectory: null, timeoutMs: 20 })).rejects.toThrow("request timed out");
  });

  describe("24 hour cache", () => {
    it("answers repeated queries from the cache and persists it", async () => {
      const cacheDirectory = createCacheDirectory();
      const first = createOsvFetch();
      const expected = await queryAdvisories(packages, { fetch: first.fetch, cacheDirectory });
      expect(first.calls.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(cacheDirectory, "osv-cache.json"))).toBe(true);

      const second = createOsvFetch();
      const cached = await queryAdvisories(packages, { fetch: second.fetch, cacheDirectory });
      expect(second.calls).toEqual([]);
      expect(cached).toEqual(expected);
    });

    it("only asks about versions it has not seen", async () => {
      const cacheDirectory = createCacheDirectory();
      await queryAdvisories([packages[0]], { fetch: createOsvFetch().fetch, cacheDirectory });
      const second = createOsvFetch();
      await queryAdvisories(packages, { fetch: second.fetch, cacheDirectory });
      expect(second.callsTo("/v1/querybatch")[0].body).toEqual({
        queries: [
          { package: { name: "minimist", ecosystem: "npm" }, version: "1.2.5" },
          { package: { name: "vue", ecosystem: "npm" }, version: "3.4.0" },
        ],
      });
      // The lodash advisories were cached: only minimist's is fetched.
      expect(second.calls.filter((call) => call.method === "GET").map((call) => call.url)).toEqual([
        "https://api.osv.dev/v1/vulns/GHSA-xvch-5gv4-984h",
      ]);
    });

    it("expires entries after 24 hours", async () => {
      const cacheDirectory = createCacheDirectory();
      let now = 1_000_000;
      await queryAdvisories(packages, { fetch: createOsvFetch().fetch, cacheDirectory, now: () => now });

      now += OSV_CACHE_TTL_MS - 1;
      const fresh = createOsvFetch();
      await queryAdvisories(packages, { fetch: fresh.fetch, cacheDirectory, now: () => now });
      expect(fresh.calls).toEqual([]);

      now += 2;
      const stale = createOsvFetch();
      await queryAdvisories(packages, { fetch: stale.fetch, cacheDirectory, now: () => now });
      expect(stale.callsTo("/v1/querybatch")).toHaveLength(1);
    });

    it("ignores a corrupt cache file and never fails because of the cache", async () => {
      const cacheDirectory = createCacheDirectory();
      fs.writeFileSync(path.join(cacheDirectory, "osv-cache.json"), "{ not json");
      const result = await queryAdvisories(packages, { fetch: createOsvFetch().fetch, cacheDirectory });
      expect(result.size).toBe(2);

      // A cache directory that cannot be created (a file is in the way) is silently skipped.
      const blocked = path.join(cacheDirectory, "blocked");
      fs.writeFileSync(blocked, "");
      await expect(queryAdvisories(packages, { fetch: createOsvFetch().fetch, cacheDirectory: path.join(blocked, "inner") })).resolves.toBeDefined();
    });
  });
});
