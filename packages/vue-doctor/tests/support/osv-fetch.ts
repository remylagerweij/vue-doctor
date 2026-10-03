import fs from "node:fs";
import path from "node:path";
import type { FetchImplementation } from "../../src/utils/osv.js";

const OSV_FIXTURES = path.resolve(import.meta.dirname, "..", "fixtures", "osv");

export interface RecordedCall {
  method: string;
  url: string;
  body?: unknown;
}

interface OsvFetchOptions {
  /** Answer the first N requests with this status (e.g. 503) before behaving normally. */
  failFirst?: { count: number; status: number };
  /** Reject every request, like a network outage. */
  networkDown?: boolean;
}

/**
 * An OSV API stand-in that answers from the recorded responses in tests/fixtures/osv: `index.json`
 * maps `name@version` to advisory IDs (what `/v1/querybatch` returns) and `vulns/<id>.json` holds
 * the advisory records (`/v1/vulns/<id>`). Tests never reach the real API.
 */
export const createOsvFetch = (options: OsvFetchOptions = {}) => {
  const index = JSON.parse(fs.readFileSync(path.join(OSV_FIXTURES, "index.json"), "utf-8")) as Record<string, string[]>;
  const calls: RecordedCall[] = [];
  let failuresLeft = options.failFirst?.count ?? 0;

  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

  const implementation: FetchImplementation = async (input, init) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, url: String(input), body });
    if (options.networkDown) throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND api.osv.dev") });
    if (failuresLeft > 0) {
      failuresLeft--;
      return json({ error: "unavailable" }, options.failFirst!.status);
    }

    const { pathname } = new URL(String(input));
    if (method === "POST" && pathname === "/v1/querybatch") {
      const { queries } = body as { queries: Array<{ package: { name: string; ecosystem: string }; version: string }> };
      return json({
        results: queries.map((query) => {
          const ids = index[`${query.package.name}@${query.version}`] ?? [];
          return ids.length > 0 ? { vulns: ids.map((id) => ({ id, modified: "2024-05-01T00:00:00Z" })) } : {};
        }),
      });
    }
    const vulnMatch = /^\/v1\/vulns\/(.+)$/.exec(pathname);
    if (method === "GET" && vulnMatch) {
      const file = path.join(OSV_FIXTURES, "vulns", `${decodeURIComponent(vulnMatch[1])}.json`);
      return fs.existsSync(file) ? json(JSON.parse(fs.readFileSync(file, "utf-8"))) : json({ code: 5, message: "Bug not found." }, 404);
    }
    return json({ error: "not found" }, 404);
  };

  return {
    fetch: implementation,
    calls,
    /** Calls to one endpoint, e.g. `callsTo("/v1/querybatch")`. */
    callsTo: (pathname: string): RecordedCall[] => calls.filter((call) => new URL(call.url).pathname === pathname),
  };
};
