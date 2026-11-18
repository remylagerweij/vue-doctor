// Pure helpers of the false-positive benchmark (no I/O), kept separate so they can be unit tested.

/** Counts findings per `ruleId` across all projects of a report@2 document, sorted by rule id. */
export const countFindingsByRule = (report) => {
  const counts = {};
  for (const project of report.projects ?? []) {
    for (const finding of project.findings ?? []) {
      counts[finding.ruleId] = (counts[finding.ruleId] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
};

export const sumCounts = (counts) => Object.values(counts).reduce((total, count) => total + count, 0);

const formatSigned = (delta) => (delta > 0 ? `+${delta}` : String(delta));

/**
 * Compares per-rule counts of a run with a previous results document.
 * Returns one row per (repo, rule) whose count changed, plus notes about runs that are not comparable
 * (different pinned SHA, or dead-code analysis toggled).
 */
export const compareResults = (previous, current) => {
  const rows = [];
  const notes = [];
  if (previous.deadCode !== current.deadCode) {
    notes.push(
      `Dead-code analysis was ${previous.deadCode ? "on" : "off"} in the baseline but is ${current.deadCode ? "on" : "off"} now; knip/* rows are not comparable.`,
    );
  }
  for (const [repoId, repo] of Object.entries(current.repos)) {
    const before = previous.repos?.[repoId];
    if (!before) {
      notes.push(`${repoId}: not in the baseline (new repo).`);
    } else if (before.sha !== repo.sha) {
      notes.push(`${repoId}: pinned SHA changed (${before.sha.slice(0, 8)} -> ${repo.sha.slice(0, 8)}); deltas include source changes.`);
    }
    const beforeRules = before?.rules ?? {};
    for (const ruleId of new Set([...Object.keys(beforeRules), ...Object.keys(repo.rules)])) {
      const was = beforeRules[ruleId] ?? 0;
      const now = repo.rules[ruleId] ?? 0;
      if (was !== now) rows.push({ repo: repoId, ruleId, before: was, after: now, delta: now - was });
    }
  }
  for (const repoId of Object.keys(previous.repos ?? {})) {
    if (!current.repos[repoId]) notes.push(`${repoId}: in the baseline but not run now.`);
  }
  rows.sort((left, right) => left.repo.localeCompare(right.repo) || left.ruleId.localeCompare(right.ruleId));
  return { rows, notes };
};

/** Renders a markdown table (usable in a PR comment or GitHub job summary) of the per-repo totals. */
export const renderSummaryTable = (results) => {
  const lines = ["| Repo | Commit | Findings | Rules hit | Time (s) |", "| --- | --- | ---: | ---: | ---: |"];
  for (const [repoId, repo] of Object.entries(results.repos)) {
    lines.push(
      `| ${repoId} | \`${repo.sha.slice(0, 8)}\` | ${repo.totalFindings} | ${Object.keys(repo.rules).length} | ${(repo.durationMs / 1000).toFixed(1)} |`,
    );
  }
  const totalFindings = Object.values(results.repos).reduce((total, repo) => total + repo.totalFindings, 0);
  lines.push(`| **Total** | | **${totalFindings}** | | **${(results.totalDurationMs / 1000).toFixed(1)}** |`);
  return lines.join("\n");
};

/** Renders the per-rule counts of every repo as a markdown table, one column per repo. */
export const renderRuleTable = (results) => {
  const repoIds = Object.keys(results.repos);
  const ruleIds = [...new Set(repoIds.flatMap((repoId) => Object.keys(results.repos[repoId].rules)))].sort();
  const lines = [`| Rule | ${repoIds.join(" | ")} |`, `| --- | ${repoIds.map(() => "---:").join(" | ")} |`];
  for (const ruleId of ruleIds) {
    lines.push(`| \`${ruleId}\` | ${repoIds.map((repoId) => results.repos[repoId].rules[ruleId] ?? 0).join(" | ")} |`);
  }
  return lines.join("\n");
};

/** Renders the comparison as markdown (an empty comparison says so explicitly). */
export const renderComparison = ({ rows, notes }) => {
  const lines = [];
  for (const note of notes) lines.push(`> ${note}`);
  if (lines.length > 0) lines.push("");
  if (rows.length === 0) {
    lines.push("No per-rule count changed compared with the committed results.");
  } else {
    lines.push("| Repo | Rule | Before | After | Delta |", "| --- | --- | ---: | ---: | ---: |");
    for (const row of rows) lines.push(`| ${row.repo} | \`${row.ruleId}\` | ${row.before} | ${row.after} | ${formatSigned(row.delta)} |`);
  }
  return lines.join("\n");
};

/** Default regression tolerance: a rule may rise by this many findings, or by this share of its baseline, whichever is larger. */
export const DEFAULT_TOLERANCE = { absolute: 10, relative: 0.1 };

/**
 * Resolves the directory to scan inside a checkout. `directory` is a repo-relative path from repos.json
 * (monorepos); it must stay inside the checkout.
 */
export const resolveScanDirectory = (checkoutDirectory, directory, pathModule) => {
  if (directory === undefined || directory === "" || directory === ".") return checkoutDirectory;
  if (typeof directory !== "string" || pathModule.isAbsolute(directory)) {
    throw new Error(`Invalid benchmark directory "${directory}": it must be a relative path.`);
  }
  const resolved = pathModule.resolve(checkoutDirectory, directory);
  const relative = pathModule.relative(checkoutDirectory, resolved);
  if (relative === ".." || relative.startsWith(`..${pathModule.sep}`) || pathModule.isAbsolute(relative)) {
    throw new Error(`Invalid benchmark directory "${directory}": it escapes the checkout.`);
  }
  return resolved;
};

/** A rule with at least this many findings in the baseline (over comparable repos) must not drop to zero. */
export const DEAD_RULE_MIN_BASELINE = 20;

/**
 * Regression gate over the repos that are comparable (present in both runs, same pinned SHA and same scanned
 * directory). `knip/*` rules are skipped when dead-code analysis differs between the two runs. Three checks, with
 * `allowed = max(tolerance.absolute, ceil(tolerance.relative * before))`:
 *
 * - `total`: a rule's findings summed over all comparable repos rose by more than `allowed`.
 * - `repo`: a rule rose by more than `allowed` in a single repo (so +60 in one repo cannot hide behind -60 in another).
 * - `dead`: a rule that had at least `DEAD_RULE_MIN_BASELINE` findings in the baseline now has none in any
 *   comparable repo (an analyzer that went silent).
 *
 * A new rule (baseline 0) is allowed up to `tolerance.absolute` findings. Decreases never fail except as `dead`.
 */
export const findRegressions = (previous, current, tolerance = DEFAULT_TOLERANCE) => {
  const totals = new Map();
  const regressions = [];
  const skipKnip = previous.deadCode !== current.deadCode;
  const allowedFor = (before) => Math.max(tolerance.absolute, Math.ceil(tolerance.relative * before));
  for (const [repoId, repo] of Object.entries(current.repos)) {
    const before = previous.repos?.[repoId];
    if (!before || before.sha !== repo.sha || (before.directory ?? "") !== (repo.directory ?? "")) continue;
    for (const ruleId of new Set([...Object.keys(before.rules ?? {}), ...Object.keys(repo.rules ?? {})])) {
      if (skipKnip && ruleId.startsWith("knip/")) continue;
      const was = before.rules?.[ruleId] ?? 0;
      const now = repo.rules?.[ruleId] ?? 0;
      const entry = totals.get(ruleId) ?? { before: 0, after: 0 };
      entry.before += was;
      entry.after += now;
      totals.set(ruleId, entry);
      const allowed = allowedFor(was);
      if (now - was > allowed) {
        regressions.push({ kind: "repo", repo: repoId, ruleId, before: was, after: now, delta: now - was, allowed, isNew: was === 0 });
      }
    }
  }
  for (const [ruleId, { before, after }] of totals) {
    const delta = after - before;
    const allowed = allowedFor(before);
    if (delta > allowed) {
      // A single repo that explains the whole rise is reported once, as the total.
      const duplicate = regressions.findIndex((row) => row.kind === "repo" && row.ruleId === ruleId && row.before === before && row.after === after);
      if (duplicate !== -1) regressions.splice(duplicate, 1);
      regressions.push({ kind: "total", ruleId, before, after, delta, allowed, isNew: before === 0 });
    }
    else if (before >= DEAD_RULE_MIN_BASELINE && after === 0) {
      regressions.push({ kind: "dead", ruleId, before, after, delta, allowed: 0, isNew: false });
    }
  }
  const kindOrder = { total: 0, repo: 1, dead: 2 };
  regressions.sort(
    (left, right) =>
      kindOrder[left.kind] - kindOrder[right.kind] ||
      Math.abs(right.delta) - Math.abs(left.delta) ||
      left.ruleId.localeCompare(right.ruleId) ||
      (left.repo ?? "").localeCompare(right.repo ?? ""),
  );
  return regressions;
};

const GITHUB_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/;

/**
 * Validates the repos of repos.json at load time: `id` is used in a path that is removed recursively, `url` and `sha`
 * go to `git fetch`. Throws a message naming the offending repo.
 */
export const validateRepos = (repos) => {
  if (!Array.isArray(repos) || repos.length === 0) throw new Error("repos.json: `repos` must be a non-empty array.");
  const seen = new Set();
  for (const [index, repo] of repos.entries()) {
    const label = `repos.json: repo #${index + 1}${typeof repo?.id === "string" ? ` ("${repo.id}")` : ""}`;
    if (typeof repo?.id !== "string" || !/^[\w.-]+$/.test(repo.id) || repo.id === "." || repo.id === "..") {
      throw new Error(`${label}: invalid id; it must match ^[\\w.-]+$ and not be "." or "..".`);
    }
    if (seen.has(repo.id)) throw new Error(`${label}: duplicate id.`);
    seen.add(repo.id);
    const segments = typeof repo.url === "string" ? repo.url.split("/").slice(3) : [];
    if (typeof repo.url !== "string" || !GITHUB_URL.test(repo.url) || segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error(`${label}: invalid url "${repo.url}"; it must be an https://github.com/<owner>/<repo>.git URL.`);
    }
    if (typeof repo.sha !== "string" || !/^[0-9a-f]{40}$/.test(repo.sha)) {
      throw new Error(`${label}: invalid sha "${repo.sha}"; it must be 40 lowercase hex characters.`);
    }
  }
  return repos;
};

/** Calls `fn` up to `retries + 1` times, sleeping `delaysMs[attempt]` between attempts; rethrows the last error. */
export const withRetries = async (fn, { retries = 2, delaysMs = [2000, 5000], sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onRetry } = {}) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= retries) throw error;
      onRetry?.(error, attempt + 1);
      await sleep(delaysMs[Math.min(attempt, delaysMs.length - 1)]);
    }
  }
};

/** Renders the gate verdict as markdown. */
export const renderRegressions = (regressions, tolerance = DEFAULT_TOLERANCE) => {
  const rule =
    `Gate: a rule fails when its total, or its count in a single repo, rises by more than max(${tolerance.absolute}, ${Math.round(tolerance.relative * 100)}% of its baseline) findings ` +
    `(a new rule is allowed ${tolerance.absolute}), or when a rule with at least ${DEAD_RULE_MIN_BASELINE} baseline findings drops to zero.`;
  if (regressions.length === 0) return `${rule}\n\nNo regression.`;
  const lines = [rule, "", "| Check | Repo | Rule | Before | After | Delta | Allowed |", "| --- | --- | --- | ---: | ---: | ---: | ---: |"];
  for (const row of regressions) {
    const kind = row.kind ?? "total";
    const delta = row.delta > 0 ? `+${row.delta}` : String(row.delta);
    const allowed = kind === "dead" ? "> 0" : `+${row.allowed}`;
    lines.push(
      `| ${kind === "dead" ? "dropped to zero" : kind === "repo" ? "per repo" : "total"} | ${row.repo ?? "all"} | \`${row.ruleId}\`${row.isNew ? " (new)" : ""} | ${row.before} | ${row.after} | ${delta} | ${allowed} |`,
    );
  }
  return lines.join("\n");
};
