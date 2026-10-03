import { DOCS_BASE_URL } from "../constants.js";

// Joins a docs path onto the docs base URL: tolerates leading/trailing/duplicate slashes,
// keeps `?query` and `#hash` suffixes, and never lets `..` segments escape the docs root.
export const docsUrl = (docsPath = "", baseUrl: string = DOCS_BASE_URL): string => {
  const base = baseUrl.replace(/\/+$/, "");
  const suffixStart = docsPath.search(/[?#]/);
  const pathname = suffixStart === -1 ? docsPath : docsPath.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : docsPath.slice(suffixStart);

  const segments: string[] = [];
  for (const segment of pathname.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }

  const hasTrailingSlash = pathname.endsWith("/") && segments.length > 0;
  const joined = segments.length > 0 ? `/${segments.join("/")}${hasTrailingSlash ? "/" : ""}` : "";
  return `${base}${joined}${suffix}`;
};
